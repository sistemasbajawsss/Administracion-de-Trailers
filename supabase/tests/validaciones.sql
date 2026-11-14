begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;
create temp table x (k text primary key, v uuid); grant all on x to authenticated;
create temp table h (k text primary key, v bigint); grant all on h to authenticated;
insert into x values
  ('capt', (select id from public.perfiles where rol='capturista' and activo limit 1)),
  ('admin', (select id from public.perfiles where rol='admin' and activo order by created_at limit 1)),
  ('u', (select id from public.unidades where estatus <> 'baja' order by numero_orden desc limit 1)),
  ('u_ok', (select id from public.unidades where estatus <> 'baja' order by numero_orden limit 1)),
  ('c', (select id from public.categorias where activo and not requiere_concepto order by nombre desc limit 1)),
  ('c_ok', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Antes de desactivar: un servicio del capturista y uno del admin que se elimina
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='capt'), 'role','authenticated')::text, true);
set local role authenticated;
insert into x select 's_viejo', public.registrar_servicio((select v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST viejo]',
  jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k='c'), 'monto', '100.00')));
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='admin'), 'role','authenticated')::text, true);
set local role authenticated;
insert into x select 's_borrado', public.registrar_servicio((select v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST borrado]',
  jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k='c'), 'monto', '200.00')));
select public.eliminar_servicio((select v from x where k='s_borrado'), 'Prueba de restaurar');
reset role;
insert into h select 'hist_borrado', id from public.historial_cambios
where tabla='servicios' and accion='delete' and registro_id = (select v from x where k='s_borrado') order by id desc limit 1;

-- Se da de baja la unidad y se desactiva la categoría
update public.unidades set estatus = 'baja' where id = (select v from x where k='u');
update public.categorias set activo = false where id = (select v from x where k='c');
-- =============================================================================
-- Corrección (encontrada en las pruebas de capturista, 2026-10-28)
-- 1. preparar_servicio: fuera de una restauración, app.servicio_restaurado no
--    existe y current_setting(..., true) regresa NULL; "NULL = id" daba NULL y
--    la validación de unidad dada de baja nunca se cumplía (para ningún rol).
--    Ahora se compara contra '' cuando no existe.
-- 2. preparar_gasto: la BD no impedía usar una categoría desactivada. Ahora se
--    rechaza al agregar un gasto o al cambiarle la categoría; editar otra cosa
--    de un gasto viejo con esa categoría sigue funcionando, y restaurar un
--    servicio eliminado también (es historial).
-- =============================================================================

-- (Etapa 0: se quitaron las definiciones viejas de preparar_servicio / preparar_gasto; se prueban las de produccion)
-- Capturista y admin: lo nuevo con unidad de baja o categoría desactivada se rechaza
do $$ declare rol text; v uuid; begin
  foreach rol in array array['capt','admin'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', (select x.v from x where k=rol), 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    begin v := public.registrar_servicio((select x.v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, 'x', jsonb_build_array(jsonb_build_object('categoria_id', (select x.v from x where k='c_ok'), 'monto', '1')));
      insert into r(caso, ok, detalle) values (rol || ': no registra en unidad de baja', false, 'pudo');
    exception when others then insert into r(caso, ok, detalle) values (rol || ': no registra en unidad de baja', true, sqlerrm); end;
    begin v := public.registrar_servicio((select x.v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, null, 'x', jsonb_build_array(jsonb_build_object('categoria_id', (select x.v from x where k='c'), 'monto', '1')));
      insert into r(caso, ok, detalle) values (rol || ': no usa categoría desactivada', false, 'pudo');
    exception when others then insert into r(caso, ok, detalle) values (rol || ': no usa categoría desactivada', true, sqlerrm); end;
    v := public.registrar_servicio((select x.v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST normal]', jsonb_build_array(jsonb_build_object('categoria_id', (select x.v from x where k='c_ok'), 'monto', '1')));
    insert into r(caso, ok, detalle) select rol || ': registro normal funciona y guarda su autor', created_by = (select x.v from x where k=rol), '' from public.servicios where id = v;
    execute 'reset role';
  end loop;
end $$;

-- Capturista edita su servicio viejo (unidad de baja, categoría desactivada)
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='capt'), 'role','authenticated')::text, true);
set local role authenticated;
do $$
declare
  s uuid := (select v from x where k='s_viejo');
  otro uuid := (select id from public.servicios where created_by = (select v from x where k='capt') and unidad_id <> (select v from x where k='u') limit 1);
begin
  perform public.actualizar_servicio(s, (select v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST viejo] nota',
    (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '120.00')) from public.gastos where servicio_id = s), 'Corrijo monto');
  insert into r(caso, ok, detalle) select 'Edita servicio viejo (unidad de baja, categoría desactivada)', monto = 120, monto::text from public.gastos where servicio_id = s;

  begin
    perform public.actualizar_servicio(s, (select v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST viejo] nota',
      (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '120.00')) from public.gastos where servicio_id = s)
        || jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k='c'), 'monto', '5')), 'Agrego renglón');
    insert into r(caso, ok, detalle) values ('No agrega renglón con categoría desactivada', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('No agrega renglón con categoría desactivada', true, sqlerrm); end;

  perform public.actualizar_servicio(s, (select v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST viejo] nota',
    (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', (select v from x where k='c_ok'), 'monto', '120.00')) from public.gastos where servicio_id = s), 'Cambio a categoría activa');
  insert into r(caso, ok, detalle) select 'Cambia a categoría activa', categoria_id = (select v from x where k='c_ok'), '' from public.gastos where servicio_id = s;

  begin
    perform public.actualizar_servicio(s, (select v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST viejo] nota',
      (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', (select v from x where k='c'), 'monto', '120.00')) from public.gastos where servicio_id = s), 'Regreso a desactivada');
    insert into r(caso, ok, detalle) values ('No cambia a categoría desactivada', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('No cambia a categoría desactivada', true, sqlerrm); end;

  begin
    perform public.actualizar_servicio(otro, (select v from x where k='u'), ((now() at time zone 'America/Tijuana')::date), null, null, 'x',
      (select jsonb_agg(jsonb_build_object('id', g.id, 'categoria_id', g.categoria_id, 'monto', g.monto::text)) from public.gastos g where g.servicio_id = otro),
      'Muevo a unidad de baja');
    insert into r(caso, ok, detalle) values ('No mueve un servicio a unidad de baja', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('No mueve un servicio a unidad de baja', true, sqlerrm); end;
end $$;
reset role;

-- Admin restaura el servicio eliminado (unidad de baja, categoría desactivada)
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='admin'), 'role','authenticated')::text, true);
set local role authenticated;
do $$ declare s uuid; begin
  s := public.restaurar_servicio((select v from h where k='hist_borrado'), 'Prueba de restaurar');
  insert into r(caso, ok, detalle) select 'Restaura servicio eliminado (historial)', count(*) = 1, count(*) || ' gasto(s)' from public.gastos g where g.servicio_id = s;
  insert into r(caso, ok, detalle) select 'Restaurado conserva autor', created_by = (select v from x where k='admin'), '' from public.servicios where id = s;
exception when others then insert into r(caso, ok, detalle) values ('Restaura servicio eliminado (historial)', false, sqlerrm); end $$;
reset role;

select caso, ok, left(detalle, 80) detalle from r order by n;
rollback;
