-- Sección 5F, Etapa 2: tipo de servicio (alta, edición, restaurar, vista,
-- Reportes y Excel). Corre con la migración 20261109201501_tipo_servicio aplicada.
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1 offset 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Las unidades de prueba empiezan sin lecturas de km (los [PRUEBA] traen km al azar).
select set_config('app.motivo', 'Prueba de tipo de servicio', true);
update public.servicios set kilometraje = null, mantenimientos = '{}' where unidad_id in (select v from x where k in ('ua', 'ub'));
select set_config('app.motivo', '', true);

-- ---------------------------------------------------------------------------
-- Capturista: alta y edición
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ua uuid := (select v from x where k = 'ua');
  ub uuid := (select v from x where k = 'ub');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '25.50'));
  s uuid; s2 uuid; t public.tipo_servicio;
begin
  s := public.registrar_servicio(
    p_unidad_id => ua, p_fecha => hoy - 3, p_kilometraje => 1000, p_proveedor_id => null,
    p_descripcion => 'Cambio de aceite', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
    p_tipo => 'correctivo');
  select tipo into t from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Alta con tipo', t = 'correctivo', coalesce(t::text, 'null'));
  insert into x values ('s', s);

  -- Como la app de antes (sin tipo): se guarda sin tipo.
  s2 := public.registrar_servicio(ub, hoy, null, null, 'Sin tipo', g, false, 'Reparación en camino');
  select tipo into t from public.servicios where id = s2;
  insert into r(caso, ok, detalle) values ('Alta sin tipo (app de antes)', t is null, coalesce(t::text, 'null'));

  -- Editar sin tipo conserva el que tenía.
  perform public.actualizar_servicio(s, ua, hoy - 3, 1000, null, 'Cambio de aceite y filtro', g, 'Se agregó el filtro');
  select tipo into t from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Editar sin tipo lo conserva', t = 'correctivo', coalesce(t::text, 'null'));

  -- Editar con tipo lo cambia y queda en la línea de cambios.
  perform public.actualizar_servicio(
    p_servicio_id => s, p_unidad_id => ua, p_fecha => hoy - 3, p_kilometraje => 1000, p_proveedor_id => null,
    p_descripcion => 'Cambio de aceite y filtro', p_gastos => g, p_motivo => 'Era preventivo', p_tipo => 'preventivo');
  select tipo into t from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Editar con tipo lo cambia', t = 'preventivo', coalesce(t::text, 'null'));

  -- "Se olvidó la entrada": la entrada queda con el km del servicio.
  s2 := public.registrar_servicio(
    p_unidad_id => ub, p_fecha => hoy, p_kilometraje => 5000, p_proveedor_id => null, p_descripcion => 'Olvidada',
    p_gastos => g, p_salida_taller => true, p_entrada_fecha => hoy - 1, p_entrada_falla => 'Frenos', p_tipo => 'servicio');
  insert into x values ('s2', s2);
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque capturista', false, sqlerrm);
end $$;

insert into r(caso, ok, detalle)
select 'Vista servicios_resumen trae el tipo', tipo = 'preventivo', coalesce(tipo::text, 'null')
from public.servicios_resumen where id = (select v from x where k = 's');
reset role;

insert into r(caso, ok, detalle)
select 'Línea de cambios registra el tipo',
       datos_anteriores ->> 'tipo' = 'correctivo' and datos_nuevos ->> 'tipo' = 'preventivo', motivo
from public.historial_cambios
where tabla = 'servicios' and registro_id = (select v from x where k = 's') and motivo = 'Era preventivo';

-- La estancia ya salió: el capturista no la ve (RLS); se revisa sin rol.
insert into r(caso, ok, detalle)
select 'Se olvidó la entrada: la entrada lleva el km del servicio', e.kilometraje = 5000, coalesce(e.kilometraje::text, 'null')
from public.servicios sv join public.entradas_taller e on e.id = sv.entrada_taller_id where sv.id = (select v from x where k = 's2');

-- ---------------------------------------------------------------------------
-- Admin: eliminar y restaurar conserva el tipo; Reportes y Excel
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  h bigint; t public.tipo_servicio; rep jsonb; suma numeric; directo numeric;
begin
  perform public.eliminar_servicio((select v from x where k = 's'), 'Prueba de restaurar');
  select id into h from public.historial_cambios
  where tabla = 'servicios' and accion = 'delete' and registro_id = (select v from x where k = 's');
  perform public.restaurar_servicio(h, 'Prueba de restaurar');
  select tipo into t from public.servicios where id = (select v from x where k = 's');
  insert into r(caso, ok, detalle) values ('Restaurar conserva el tipo', t = 'preventivo', coalesce(t::text, 'null'));

  rep := public.reporte_gastos(hoy - 30, hoy);
  select coalesce(sum((e ->> 'total')::numeric), 0) into suma from jsonb_array_elements(rep -> 'por_tipo_servicio') e;
  insert into r(caso, ok, detalle) values ('Reporte: por tipo de servicio suma el total',
    suma = (rep ->> 'total')::numeric, suma || ' / ' || (rep ->> 'total'));

  select coalesce(sum(g.monto), 0) into directo
  from public.gastos g join public.servicios s on s.id = g.servicio_id
  where s.fecha between hoy - 30 and hoy;
  insert into r(caso, ok, detalle) values ('Reporte: total igual a la suma directa',
    directo = (rep ->> 'total')::numeric, directo || ' / ' || (rep ->> 'total'));

  insert into r(caso, ok, detalle)
  select 'Reporte: trae el preventivo de prueba', count(*) = 1, count(*)::text
  from jsonb_array_elements(rep -> 'por_tipo_servicio') e where e ->> 'tipo' = 'preventivo';

  insert into r(caso, ok, detalle)
  select 'Excel: columna tipo de servicio', count(*) filter (where tipo_servicio = 'preventivo') >= 1, count(*)::text
  from public.exportar_gastos(hoy - 30, hoy);
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

-- Gerente ve el reporte; capturista no.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve por tipo de servicio', jsonb_typeof(rep -> 'por_tipo_servicio') = 'array', jsonb_typeof(rep -> 'por_tipo_servicio')
from (select public.reporte_gastos((now() at time zone 'America/Tijuana')::date - 30, (now() at time zone 'America/Tijuana')::date) as rep) q;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.exportar_gastos((now() at time zone 'America/Tijuana')::date - 30, (now() at time zone 'America/Tijuana')::date);
  insert into r(caso, ok, detalle) values ('Capturista no exporta', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no exporta', sqlstate = '42501', sqlerrm);
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.registrar_servicio(gen_random_uuid(), current_date, null, null, 'x', '[]'::jsonb);
  insert into r(caso, ok, detalle) values ('Anónimo no registra', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no registra', true, sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
