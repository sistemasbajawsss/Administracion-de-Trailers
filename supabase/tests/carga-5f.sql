-- Prueba de carga de la Sección 5F (Etapa 5). Todo en una transacción que se
-- deshace: ~35 mil servicios con su tipo y kilometraje, ~70 mil gastos, 5
-- mantenimientos programados por unidad y miles de correctivos que los
-- cumplen. Mide Mantenimientos, Inicio, la ficha, el formulario y guardar, con
-- los tres roles. Tarda unos minutos; no guarda nada.
begin;
set local statement_timeout = '290s';
create temp table t (n serial, rol text, consulta text, ms numeric, filas bigint);
grant all on t to authenticated; grant all on t_n_seq to authenticated;

create temp table quien as
select (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1) admin_id,
       (select id from public.perfiles where rol = 'capturista' and activo limit 1) capt_id,
       (select id from public.perfiles where rol = 'gerente' and activo limit 1) ger_id;
grant select on quien to authenticated;

-- ---------- Servicios y gastos (mitad admin, mitad capturista) ----------
-- Sin triggers solo para meter el volumen de prueba: el kilometraje sube con la
-- fecha (300 km por día) para que las lecturas cuadren entre sí.
do $$
declare v_t0 timestamptz := clock_timestamp(); q record;
begin
  select * into q from quien;
  set constraints all immediate;
  alter table public.servicios disable trigger user;
  alter table public.gastos disable trigger user;

  insert into public.servicios (unidad_id, fecha, kilometraje, proveedor_id, descripcion, motivo_sin_entrada,
                                sin_entrada_taller, tipo, created_by)
  select u.id, d.fecha,
         case when u.tipo = 'caja' then null else 1000000 + (d.fecha - date '2020-01-01') * 300 end,
         (select id from public.proveedores where activo order by random() limit 1),
         '[CARGA] servicio ' || g,
         'Mantenimiento en patio', true,
         (array['servicio', 'preventivo', 'correctivo'])[1 + (random() * 2.999)::int]::public.tipo_servicio,
         case when g % 2 = 0 then q.admin_id else q.capt_id end
  from public.unidades u
  cross join generate_series(1, 1000) g
  cross join lateral (select (now() at time zone 'America/Tijuana')::date - 1 - ((random() * 1095)::int) as fecha) d
  where u.estatus not in ('baja', 'vendida');

  insert into public.gastos (servicio_id, categoria_id, concepto, moneda, monto, created_by)
  select s.id, c.id, case when c.requiere_concepto then 'concepto de carga' end, 'MXN',
         round((random() * 20000 + 50)::numeric, 2), s.created_by
  from public.servicios s
  cross join lateral (select id, requiere_concepto from public.categorias where activo order by random() + (s.id::text < '8')::int limit 2) c
  where s.descripcion like '[CARGA]%';

  alter table public.gastos enable trigger user;
  alter table public.servicios enable trigger user;
  set constraints all deferred;
  insert into t(rol, consulta, ms, filas) values ('-', 'CARGA servicios y gastos', round(extract(epoch from clock_timestamp() - v_t0) * 1000), (select count(*) from public.servicios));
end $$;

-- ---------- 5 mantenimientos por unidad (cajas: solo por meses) ----------
do $$
declare v_t0 timestamptz := clock_timestamp();
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select admin_id from quien), 'role', 'authenticated')::text, true);
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  select u.id, '[CARGA] ' || p.nombre,
         case when u.tipo = 'caja' then null else p.cada_km end,
         case when u.tipo = 'caja' then coalesce(p.cada_meses, 6) else p.cada_meses end,
         (now() at time zone 'America/Tijuana')::date - 1100,
         case when u.tipo = 'caja' or p.cada_km is null then null
              else 1000000 + (((now() at time zone 'America/Tijuana')::date - 1100) - date '2020-01-01') * 300 end
  from public.unidades u
  cross join (values ('Aceite', 15000, null), ('Filtros', 30000, null), ('Engrasado', null, 3),
                     ('Revisión de frenos', null, 12), ('Anticongelante', 60000, null)) p(nombre, cada_km, cada_meses)
  where u.estatus not in ('baja', 'vendida');
  insert into t(rol, consulta, ms, filas) values ('-', 'CARGA mantenimientos', round(extract(epoch from clock_timestamp() - v_t0) * 1000), (select count(*) from public.mantenimientos_unidad where activo));
end $$;

-- ---------- La mitad de los correctivos cumple uno de su unidad ----------
do $$
declare v_t0 timestamptz := clock_timestamp();
begin
  set constraints all immediate;
  alter table public.servicios disable trigger user;
  update public.servicios s
  set mantenimientos = array[(
    select mu.id from public.mantenimientos_unidad mu
    where mu.unidad_id = s.unidad_id and mu.activo and mu.nombre like '[CARGA]%'
    order by md5(s.id::text || mu.id::text) limit 1
  )]
  where s.descripcion like '[CARGA]%' and s.tipo = 'correctivo' and random() < 0.5;
  alter table public.servicios enable trigger user;
  set constraints all deferred;
  insert into t(rol, consulta, ms, filas) values ('-', 'CARGA correctivos que cumplen', round(extract(epoch from clock_timestamp() - v_t0) * 1000), (select count(*) from public.servicios where cardinality(mantenimientos) > 0));
end $$;

analyze public.servicios; analyze public.gastos; analyze public.mantenimientos_unidad;
insert into t(rol, consulta, ms, filas) select '-', 'gastos totales', 0, count(*) from public.gastos;
insert into t(rol, consulta, ms, filas) select '-', 'preventivos', 0, count(*) from public.servicios where tipo = 'preventivo';

-- ---------- Mediciones (mediana de 3) ----------
create temp table quien_rol as
select admin_id id, 'admin' rol from quien union all select capt_id, 'capturista' from quien union all select ger_id, 'gerente' from quien;
grant select on quien_rol to authenticated;
create temp table m (rol text, consulta text, ms numeric, filas bigint);
grant all on m to authenticated;

do $$
declare
  r record; i int; v_t0 timestamptz; v_n bigint; v_u uuid; v_plan uuid;
  hoy date := (now() at time zone 'America/Tijuana')::date;
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select id from public.categorias where activo and not requiere_concepto limit 1), 'monto', '100.00'));
begin
  select u.id into v_u from public.unidades u
  where u.estatus = 'activo' and u.public.tipo_lleva_kilometraje(tipo) order by u.numero_orden desc limit 1;
  select id into v_plan from public.mantenimientos_unidad where unidad_id = v_u and activo and nombre = '[CARGA] Aceite';

  for r in select * from quien_rol loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    for i in 1..3 loop
      -- Página Mantenimientos (Correctivos), aviso de Inicio y formulario: lo pendiente de todas.
      v_t0 := clock_timestamp();
      select count(*) into v_n from public.mantenimientos_pendientes();
      perform count(*) from public.unidades;
      insert into m values (r.rol, 'Mantenimientos / Inicio: lo pendiente de todas', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

      -- Pestaña Preventivos: primera tanda y total.
      v_t0 := clock_timestamp();
      select count(*) into v_n from (
        select id from public.servicios_resumen where tipo = 'preventivo'
        order by fecha desc, created_at desc, id limit 25) x;
      perform count(*) from public.servicios_resumen where tipo = 'preventivo';
      insert into m values (r.rol, 'Mantenimientos: preventivos (25 y total)', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

      -- Inicio de siempre.
      v_t0 := clock_timestamp();
      select count(*) into v_n from (select id from public.servicios_resumen where num_comprobantes = 0 order by fecha desc, created_at desc limit 50) x;
      perform count(*) from public.servicios_resumen where num_comprobantes = 0;
      insert into m values (r.rol, 'Inicio: sin factura', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

      if r.rol <> 'capturista' then
        v_t0 := clock_timestamp();
        select count(*) into v_n from public.mantenimientos_pendientes(v_u);
        perform count(*) from public.kilometraje_unidades(v_u);
        insert into m values (r.rol, 'Ficha: mantenimientos y kilometraje', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);
      end if;

      if r.rol <> 'gerente' then
        v_t0 := clock_timestamp();
        perform public.registrar_servicio(p_unidad_id => v_u, p_fecha => hoy, p_kilometraje => 9000000 + i,
          p_proveedor_id => null, p_descripcion => '[CARGA] medición', p_gastos => g,
          p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'correctivo', p_mantenimientos => array[v_plan]);
        insert into m values (r.rol, 'Guardar correctivo que cumple', extract(epoch from clock_timestamp() - v_t0) * 1000, null);
      end if;
    end loop;
    execute 'reset role';
  end loop;
end $$;

insert into t(rol, consulta, ms, filas)
select rol, consulta, round(percentile_cont(0.5) within group (order by ms)::numeric, 1), max(filas)
from m group by rol, consulta;

select rol, consulta, ms, filas from t order by n;
rollback;
