-- Prueba de carga de la Sección 5E (Etapa 5). Todo en una transacción que se
-- deshace: ~35 mil servicios, ~70 mil gastos, ~1,000 estancias cerradas en
-- taller con servicios ligados, 8 unidades en taller ahora y miles de servicios
-- "sin entrada a taller". Mide las pantallas de siempre y las nuevas.
-- Tarda unos minutos; no guarda nada.
begin;
-- 5H: los tickets pendientes de verdad bloquean la entrada directa; en esta prueba no cuentan (se deshace al final).
update public.tickets_taller set estatus = 'cancelado', cancelado_at = now() where estatus = 'pendiente';
set local statement_timeout = '290s';
create temp table t (n serial, rol text, consulta text, ms numeric, filas bigint);
grant all on t to authenticated; grant all on t_n_seq to authenticated;

create temp table quien as
select (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1) admin_id,
       (select id from public.perfiles where rol = 'capturista' and activo limit 1) capt_id;
grant select on quien to authenticated;

-- ---------- Estancias cerradas: ~30 por unidad en 3 años ----------
do $$
declare v_t0 timestamptz := clock_timestamp();
begin
  insert into public.entradas_taller (unidad_id, fecha_entrada, falla, reporta_nombre, fecha_salida, nota_salida, salida_nombre, created_by)
  select u.id, d.entrada, '[CARGA] falla ' || g, 'Carga', d.entrada + (random() * 10)::int, 'Salió', 'Carga',
         (select admin_id from quien)
  from public.unidades u
  cross join generate_series(1, 30) g
  cross join lateral (select ((now() at time zone 'America/Tijuana')::date - 40 - g * 35 - (random() * 20)::int) as entrada) d
  where u.estatus not in ('baja', 'vendida', 'en_taller');
  insert into t(rol, consulta, ms, filas) values ('-', 'CARGA estancias cerradas', round(extract(epoch from clock_timestamp() - v_t0) * 1000), (select count(*) from public.entradas_taller));
end $$;

-- ---------- 8 unidades en taller ahora (con la función, como en la app) ----------
do $$
declare r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select admin_id from quien), 'role', 'authenticated')::text, true);
  for r in select id from public.unidades where estatus = 'activo' order by numero_orden limit 8 loop
    perform public.registrar_entrada_taller(r.id, (now() at time zone 'America/Tijuana')::date - 20, '[CARGA] en taller');
  end loop;
end $$;

-- ---------- Servicios y gastos (mitad admin, mitad capturista) ----------
do $$
declare v_t0 timestamptz := clock_timestamp(); q record; v_quien uuid; v_mitad int;
begin
  select * into q from quien;
  for v_mitad in 0..1 loop
    v_quien := case v_mitad when 0 then q.admin_id else q.capt_id end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_quien, 'role', 'authenticated')::text, true);

    insert into public.servicios (unidad_id, fecha, kilometraje, proveedor_id, descripcion, motivo_sin_entrada)
    select u.id,
           (now() at time zone 'America/Tijuana')::date - ((random() * 1095)::int),
           (random() * 900000)::int,
           (select id from public.proveedores where activo order by random() limit 1),
           '[CARGA] servicio ' || g,
           case when random() < 0.5 then 'Reparación en camino' else 'Mantenimiento en patio' end
    from public.unidades u, generate_series(1, 500) g
    where u.estatus not in ('baja', 'vendida');

    -- Desde la 5D, agregar gastos a un servicio ya guardado pide motivo (historial).
    perform set_config('app.motivo', 'Carga de prueba', true);

    insert into public.gastos (servicio_id, categoria_id, concepto, moneda, monto, monto_usd, tipo_cambio)
    select s.id, c.id,
           case when c.requiere_concepto then 'concepto de carga' else (case when random() < 0.3 then 'aceite y filtro' end) end,
           case when random() < 0.1 then 'USD'::public.moneda else 'MXN' end,
           round((random() * 20000 + 50)::numeric, 2),
           round((random() * 1000 + 5)::numeric, 2),
           18.5
    from public.servicios s
    cross join lateral (select id, requiere_concepto from public.categorias where activo order by random() + (s.id::text < '8')::int limit 2) c
    where s.descripcion like '[CARGA]%' and s.created_by = v_quien;
  end loop;
  insert into t(rol, consulta, ms, filas) values ('-', 'CARGA servicios y gastos', round(extract(epoch from clock_timestamp() - v_t0) * 1000), (select count(*) from public.servicios));
end $$;

-- Servicios dentro de una estancia cerrada: se ligan a ella (como si se hubieran
-- capturado a tiempo). Sin triggers solo para este ajuste de datos de prueba.
do $$
declare v_t0 timestamptz := clock_timestamp();
begin
  -- Las revisiones diferidas (servicio con gastos) corren ya; si no, no se puede alterar la tabla.
  set constraints all immediate;
  alter table public.servicios disable trigger user;
  update public.servicios s
  set entrada_taller_id = e.id, sin_entrada_taller = false, motivo_sin_entrada = null
  from public.entradas_taller e
  where s.descripcion like '[CARGA]%' and e.unidad_id = s.unidad_id and e.fecha_salida is not null
    and s.fecha between e.fecha_entrada and e.fecha_salida;
  alter table public.servicios enable trigger user;
  set constraints all deferred;
  insert into t(rol, consulta, ms, filas) values ('-', 'CARGA servicios ligados a estancias', round(extract(epoch from clock_timestamp() - v_t0) * 1000), (select count(*) from public.servicios where entrada_taller_id is not null));
end $$;

analyze public.servicios; analyze public.gastos; analyze public.historial_cambios; analyze public.entradas_taller;
insert into t(rol, consulta, ms, filas) select '-', 'gastos totales', 0, count(*) from public.gastos;
insert into t(rol, consulta, ms, filas) select '-', 'servicios sin entrada a taller', 0, count(*) from public.servicios where sin_entrada_taller;

-- ---------- Mediciones (mediana de 3) ----------
create temp table quien_rol as select admin_id id, 'admin' rol from quien union all select capt_id, 'capturista' from quien;
grant select on quien_rol to authenticated;
create temp table m (rol text, consulta text, ms numeric, filas bigint);
grant all on m to authenticated;

do $$
declare
  r record; i int; v_t0 timestamptz; v_n bigint; v_u uuid; v_taller uuid;
  hoy date := (now() at time zone 'America/Tijuana')::date;
  v_desde date := (date_trunc('month', (now() at time zone 'America/Tijuana')::date) - interval '11 months')::date;
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select id from public.categorias where activo and not requiere_concepto limit 1), 'monto', '100.00'));
begin
  for r in select * from quien_rol loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select id into v_u from public.unidades where estatus = 'activo' order by numero_orden desc limit 1;
    select unidad_id into v_taller from public.entradas_taller where fecha_salida is null limit 1;

    for i in 1..3 loop
      v_t0 := clock_timestamp(); select count(*) into v_n from public.listar_gastos();
      insert into m values (r.rol, 'Servicios: 1a tanda (25)', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);
      v_t0 := clock_timestamp(); select count(*) into v_n from public.resumen_gastos();
      insert into m values (r.rol, 'Servicios: total', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);
      v_t0 := clock_timestamp(); select count(*) into v_n from public.listar_gastos(p_busqueda => 'aceite');
      insert into m values (r.rol, 'Servicios: buscar "aceite"', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

      v_t0 := clock_timestamp();
      select count(*) into v_n from (select id from public.servicios_resumen where num_comprobantes = 0 order by fecha desc, created_at desc limit 50) x;
      perform count(*) from public.servicios_resumen where num_comprobantes = 0;
      insert into m values (r.rol, 'Inicio: sin factura', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

      -- 5E
      v_t0 := clock_timestamp();
      select count(*) into v_n from (
        select e.id from public.entradas_taller e join public.unidades u on u.id = e.unidad_id
        where e.fecha_salida is null order by e.fecha_entrada) x;
      insert into m values (r.rol, 'Taller / Inicio: unidades en taller', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

      v_t0 := clock_timestamp();
      select count(*) into v_n from (
        select e.id, e.fecha_entrada, e.falla from public.entradas_taller e where e.fecha_salida is null) x;
      perform count(*) from public.unidades where estatus not in ('baja', 'vendida');
      insert into m values (r.rol, 'Formulario: unidades con su estancia', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

      v_t0 := clock_timestamp();
      perform public.registrar_servicio(v_taller, hoy, null, null, '[CARGA] medición', g, false);
      insert into m values (r.rol, 'Guardar servicio (unidad en taller)', extract(epoch from clock_timestamp() - v_t0) * 1000, null);

      v_t0 := clock_timestamp();
      perform public.registrar_servicio(v_u, hoy, null, null, '[CARGA] medición', g, false, 'Reparación en camino');
      insert into m values (r.rol, 'Guardar servicio (sin entrada)', extract(epoch from clock_timestamp() - v_t0) * 1000, null);

      if r.rol = 'admin' then
        v_t0 := clock_timestamp();
        select count(*) into v_n from (
          select id from public.servicios_resumen where sin_entrada_taller and fecha >= hoy - 30
          order by fecha desc, created_at desc limit 50) x;
        perform count(*) from public.servicios_resumen where sin_entrada_taller and fecha >= hoy - 30;
        insert into m values (r.rol, 'Inicio: sin entrada a taller (30 días)', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

        v_t0 := clock_timestamp();
        select count(*) into v_n from (
          select e.id, (select count(*) from public.servicios s where s.entrada_taller_id = e.id) n
          from public.entradas_taller e where e.unidad_id = v_u order by e.fecha_entrada desc limit 20) x;
        perform count(*) from public.entradas_taller where unidad_id = v_u;
        insert into m values (r.rol, 'Ficha: estancias en taller (20)', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

        v_t0 := clock_timestamp(); select count(*) into v_n from public.listar_gastos(p_unidad_id => v_u);
        perform public.resumen_gastos(p_unidad_id => v_u);
        insert into m values (r.rol, 'Ficha: gastos y total', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);

        v_t0 := clock_timestamp(); perform public.reporte_gastos(v_desde, hoy);
        insert into m values (r.rol, 'Reportes: 12 meses', extract(epoch from clock_timestamp() - v_t0) * 1000, null);
        v_t0 := clock_timestamp(); select count(*) into v_n from public.exportar_gastos(v_desde, hoy);
        insert into m values (r.rol, 'Excel: 12 meses', extract(epoch from clock_timestamp() - v_t0) * 1000, v_n);
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
