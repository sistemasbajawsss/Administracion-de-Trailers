-- Sección 5F: agregar un mantenimiento a varias unidades a la vez
-- (agregar_mantenimiento). Corre con la migración
-- 20261110003905_agregar_mantenimiento_a_varias aplicada.
begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1 offset 1)),
  ('uc', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1 offset 2)),
  ('caja', (select id from public.unidades where estatus = 'activo' and tipo = 'caja' order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Kilometraje conocido: ua y ub con una lectura hoy, uc sin lecturas.
select set_config('app.motivo', 'Prueba de mantenimientos a varias', true);
update public.servicios set kilometraje = null, mantenimientos = '{}' where unidad_id in (select v from x where k in ('ua', 'ub', 'uc'));
update public.entradas_taller set kilometraje = null where unidad_id in (select v from x where k in ('ua', 'ub', 'uc'));
delete from public.correcciones_kilometraje where unidad_id in (select v from x where k in ('ua', 'ub', 'uc'));
select set_config('app.motivo', '', true);

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ua uuid := (select v from x where k = 'ua');
  ub uuid := (select v from x where k = 'ub');
  uc uuid := (select v from x where k = 'uc');
  caja uuid := (select v from x where k = 'caja');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  p record; n integer; t text;
begin
  perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 100000, p_proveedor_id => null,
    p_descripcion => 'Lectura', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');
  perform public.registrar_servicio(p_unidad_id => ub, p_fecha => hoy, p_kilometraje => 250000, p_proveedor_id => null,
    p_descripcion => 'Lectura', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');

  -- Solo en la unidad de la ficha.
  select string_agg(resultado, ',') into t
  from public.agregar_mantenimiento(ua, '  Revisión   general ', null, 12::smallint, hoy - 30, null);
  insert into r(caso, ok, detalle) values ('Solo la unidad de la ficha', t = 'agregado', t);
  select count(*) into n from public.mantenimientos_unidad where unidad_id = ua and activo and nombre = 'Revisión general' and desde_fecha = hoy - 30;
  insert into r(caso, ok, detalle) values ('Nombre limpio y su fecha', n = 1, n::text);

  -- Aceite (solo km: una sola forma, 5H) a la ficha y a ub, uc, la caja y la misma ficha repetida.
  create temp table res on commit drop as
  select * from public.agregar_mantenimiento(ua, 'Cambio de aceite', 15000, null, hoy - 60, 90000,
                                             array[ub, uc, caja, ua, ub]);
  select count(*) into n from res;
  insert into r(caso, ok, detalle) values ('Una fila por unidad (sin repetir la ficha)', n = 4, n::text);
  select resultado into t from res where unidad_id = ua;
  insert into r(caso, ok, detalle) values ('Ficha: agregado', t = 'agregado', t);
  select * into p from public.mantenimientos_unidad where unidad_id = ua and activo and nombre = 'Cambio de aceite';
  insert into r(caso, ok, detalle) values ('Ficha: cuenta desde lo que se escribió', p.desde_fecha = hoy - 60 and p.desde_km = 90000, p.desde_fecha || ' / ' || p.desde_km);

  select resultado into t from res where unidad_id = ub;
  insert into r(caso, ok, detalle) values ('Otra con km: agregado', t = 'agregado', t);
  select * into p from public.mantenimientos_unidad where unidad_id = ub and activo and nombre = 'Cambio de aceite';
  insert into r(caso, ok, detalle) values ('Otra: desde hoy y su km actual', p.desde_fecha = hoy and p.desde_km = 250000 and p.cada_km = 15000 and p.cada_meses is null,
    p.desde_fecha || ' / ' || p.desde_km);

  select resultado into t from res where unidad_id = uc;
  insert into r(caso, ok, detalle) values ('Sin kilometraje: se salta', t = 'sin_kilometraje', t);
  select count(*) into n from public.mantenimientos_unidad where unidad_id = uc and activo and nombre = 'Cambio de aceite';
  insert into r(caso, ok, detalle) values ('Sin kilometraje: no se guardó', n = 0, n::text);

  select resultado into t from res where unidad_id = caja;
  insert into r(caso, ok, detalle) values ('Caja: se salta (sin odómetro)', t = 'caja_solo_km', t);

  -- Otra vez: las que ya lo tienen se saltan; la ficha repetida falla todo.
  begin
    perform public.agregar_mantenimiento(ua, 'cambio de aceite', 15000, null, hoy, 100000, array[ub]);
    insert into r(caso, ok, detalle) values ('Ficha con nombre repetido: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Ficha con nombre repetido: rechazado', sqlstate = '23505', sqlerrm);
  end;
  select string_agg(resultado, ',' order by resultado) into t
  from public.agregar_mantenimiento(uc, 'Engrasado', 10000, null, hoy, 0, array[ua, ub]);
  insert into r(caso, ok, detalle) values ('Solo km: se agrega en las que tienen km', t = 'agregado,agregado,agregado', t);
  select string_agg(resultado, ',' order by resultado) into t
  from public.agregar_mantenimiento(ub, 'Engrase de quinta', 10000, null, hoy, 250000, array[caja, uc]);
  insert into r(caso, ok, detalle) values ('Solo km: caja y sin km se saltan', t = 'agregado,caja_solo_km,sin_kilometraje', t);
  select count(*) into n from public.mantenimientos_unidad where nombre = 'Engrase de quinta' and activo;
  insert into r(caso, ok, detalle) values ('Solo km: no se guardó en las saltadas', n = 1, n::text);
  select string_agg(resultado, ',' order by resultado) into t
  from public.agregar_mantenimiento(caja, 'Lavado', null, 1::smallint, hoy, null, array[ua, ub]);
  select count(*) into n from public.mantenimientos_unidad where nombre = 'Lavado' and activo;
  insert into r(caso, ok, detalle) values ('Desde una caja a las demás', t = 'agregado,agregado,agregado' and n = 3, t);
  select string_agg(resultado, ',' order by resultado) into t
  from public.agregar_mantenimiento(uc, 'Revisión general', null, 12::smallint, hoy, null, array[ua]);
  insert into r(caso, ok, detalle) values ('Ya lo tiene: se salta', t = 'agregado,ya_tiene', t);

  -- Si la ficha falla, no se agrega en ninguna.
  begin
    perform public.agregar_mantenimiento(ua, 'Futuro', null, 3::smallint, hoy + 1, null, array[ub]);
    insert into r(caso, ok, detalle) values ('Fecha futura: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Fecha futura: rechazado', sqlstate = '23514', sqlerrm);
  end;
  select count(*) into n from public.mantenimientos_unidad where nombre = 'Futuro';
  insert into r(caso, ok, detalle) values ('Fecha futura: nada en las otras', n = 0, n::text);

  -- Caja con km en la ficha: rechazado.
  begin
    perform public.agregar_mantenimiento(caja, 'Caja km', 5000, null, hoy, 0, array[ua]);
    insert into r(caso, ok, detalle) values ('Caja por km en la ficha: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Caja por km en la ficha: rechazado', sqlstate = '23514', sqlerrm);
  end;

  -- Lo pendiente de las otras sale bien.
  select * into p from public.mantenimientos_pendientes(ub) where nombre = 'Cambio de aceite';
  insert into r(caso, ok, detalle) values ('Pendiente de otra: al corriente, faltan 15,000', p.estado = 'al_corriente' and p.faltan_km = 15000, p.estado || ' ' || p.faltan_km);
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

-- Unidad vendida o de baja: en la ficha se rechaza, en las otras se salta.
do $$
declare v uuid; t text;
begin
  select id into v from public.unidades where estatus in ('baja', 'vendida') limit 1;
  if v is null then
    insert into r(caso, ok, detalle) values ('Retirada: se salta (no hay unidades retiradas)', true, 'sin datos');
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', (select x.v from x where k = 'admin'), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select string_agg(resultado, ',' order by resultado) into t
  from public.agregar_mantenimiento((select x.v from x where k = 'ua'), 'Retirada prueba', null, 6::smallint,
                                    (now() at time zone 'America/Tijuana')::date, null, array[v]);
  insert into r(caso, ok, detalle) values ('Retirada en las otras: se salta', t = 'agregado,retirada', t);
  execute 'reset role';
end $$;

-- Capturista: no puede.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.agregar_mantenimiento((select v from x where k = 'ua'), 'Capturista', null, 6::smallint,
                                       (now() at time zone 'America/Tijuana')::date, null, array[(select v from x where k = 'ub')]);
  insert into r(caso, ok, detalle) values ('Capturista no agrega', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no agrega', sqlstate = '42501', sqlerrm);
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.agregar_mantenimiento((select v from x where k = 'ua'), 'Anon', null, 6::smallint, current_date, null);
  insert into r(caso, ok, detalle) values ('Anónimo no agrega', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no agrega', true, sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
