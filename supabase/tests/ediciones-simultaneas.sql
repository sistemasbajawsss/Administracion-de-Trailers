-- Sección 5I, Etapa 1: ediciones simultáneas (actualizar_servicio con p_version).
-- Dentro de una transacción now() no cambia, así que "otra persona guardó" se
-- simula mandando una versión distinta de la actual (la que tenía el formulario).
begin;
set local lock_timeout = '5s';
-- 5H: los tickets pendientes de verdad bloquean la entrada directa; en esta prueba no cuentan (se deshace al final).
update public.tickets_taller set estatus = 'cancelado', cancelado_at = now() where estatus = 'pendiente';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and not public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Capturista: registra un servicio propio.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_s uuid;
begin
  v_s := public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (now() at time zone 'America/Tijuana')::date - 1, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba 5I', p_tipo => 'servicio', p_lugar => 'taller_propio',
    p_motivo_sin_entrada => 'Reparación en camino',
    p_gastos => jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '1000.00')));
  insert into x values ('s', v_s);
end $$;
reset role;

create temp table g (k text primary key, v jsonb);
grant all on g to authenticated, anon;
insert into g values ('gastos', (
  select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'moneda', 'MXN', 'monto', '1200.00'))
  from public.gastos where servicio_id = (select v from x where k = 's')));

-- 1. Con la versión vigente, guarda.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.actualizar_servicio(
    p_servicio_id => (select v from x where k = 's'), p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (now() at time zone 'America/Tijuana')::date - 1, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba 5I editada', p_gastos => (select v from g where k = 'gastos'), p_motivo => 'Prueba de versión vigente',
    p_version => (select updated_at from public.servicios where id = (select v from x where k = 's')));
  insert into r(caso, ok, detalle) values ('Versión vigente: guarda', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Versión vigente: guarda', false, sqlstate || ' ' || sqlerrm);
end $$;
insert into r(caso, ok, detalle)
select 'Se guardó el cambio', descripcion = 'Prueba 5I editada', descripcion from public.servicios where id = (select v from x where k = 's');

-- 2. Con una versión vieja (otra persona guardó después de abrir el formulario): PT409 con quién y cuándo.
do $$
declare
  v_detalle text;
begin
  perform public.actualizar_servicio(
    p_servicio_id => (select v from x where k = 's'), p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (now() at time zone 'America/Tijuana')::date - 1, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'No debe quedar', p_gastos => (select v from g where k = 'gastos'), p_motivo => 'Prueba de versión vieja',
    p_version => (select updated_at - interval '1 second' from public.servicios where id = (select v from x where k = 's')));
  insert into r(caso, ok, detalle) values ('Versión vieja: rechaza', false, 'guardó');
exception when others then
  get stacked diagnostics v_detalle = pg_exception_detail;
  insert into r(caso, ok, detalle) values ('Versión vieja: rechaza con PT409', sqlstate = 'PT409', sqlstate || ' ' || sqlerrm);
  insert into r(caso, ok, detalle) values ('Dice quién y cuándo',
    (v_detalle::json ->> 'por') is not null and (v_detalle::json ->> 'a') is not null, v_detalle);
end $$;
insert into r(caso, ok, detalle)
select 'No se sobrescribió', descripcion = 'Prueba 5I editada', descripcion from public.servicios where id = (select v from x where k = 's');

-- 3. Sin versión (app publicada antes de la 5I): guarda como antes.
do $$
begin
  perform public.actualizar_servicio(
    p_servicio_id => (select v from x where k = 's'), p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (now() at time zone 'America/Tijuana')::date - 1, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Sin versión', p_gastos => (select v from g where k = 'gastos'), p_motivo => 'Prueba sin versión');
  insert into r(caso, ok, detalle) values ('Sin versión: guarda como antes', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Sin versión: guarda como antes', false, sqlstate || ' ' || sqlerrm);
end $$;
reset role;

-- 4. Admin con versión vieja: también rechaza.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.actualizar_servicio(
    p_servicio_id => (select v from x where k = 's'), p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (now() at time zone 'America/Tijuana')::date - 1, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Admin vieja', p_gastos => (select v from g where k = 'gastos'), p_motivo => 'Prueba admin versión vieja',
    p_version => '2000-01-01 00:00:00+00');
  insert into r(caso, ok, detalle) values ('Admin con versión vieja: rechaza', false, 'guardó');
exception when others then
  insert into r(caso, ok, detalle) values ('Admin con versión vieja: rechaza', sqlstate = 'PT409', sqlstate || ' ' || sqlerrm);
end $$;
reset role;

-- 5. El historial no registra el intento rechazado.
insert into r(caso, ok, detalle)
select 'Historial sin el intento rechazado', count(*) = 0, count(*)::text
from public.historial_cambios where motivo in ('Prueba de versión vieja', 'Prueba admin versión vieja');

select caso, ok, detalle from r order by n;
rollback;
