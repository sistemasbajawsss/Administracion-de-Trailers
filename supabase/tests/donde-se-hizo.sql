-- Sección 5G: ¿Dónde se hizo? (Taller Realso, taller de fuera, en camino) y el
-- catálogo de talleres. Alta, edición, validaciones, restaurar, permisos.
-- Corre con la migración 20261110150813_donde_se_hizo aplicada.
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
  ('u', (select id from public.unidades where estatus = 'activo' and tipo = 'caja' order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- ---------------------------------------------------------------------------
-- Capturista: talleres y servicios
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  u uuid := (select v from x where k = 'u');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  t1 uuid; t2 uuid; s uuid; l public.lugar_servicio; tid uuid; n int;
begin
  insert into public.talleres (nombre, created_by) values ('[PRUEBA] Taller Pérez', auth.uid()) returning id into t1;
  insert into public.talleres (nombre, created_by) values ('[PRUEBA] Llantera km 40', auth.uid()) returning id into t2;
  insert into x values ('t1', t1), ('t2', t2);
  insert into r(caso, ok, detalle) values ('Capturista da de alta talleres', true, '');

  begin
    insert into public.talleres (nombre, created_by) values ('[prueba] taller pérez ', auth.uid());
    insert into r(caso, ok, detalle) values ('Nombre repetido (otra forma) se rechaza', false, 'pudo');
  exception when unique_violation then
    insert into r(caso, ok, detalle) values ('Nombre repetido (otra forma) se rechaza', true, sqlerrm);
  end;

  update public.talleres set activo = false where id = t1;
  get diagnostics n = row_count;
  insert into r(caso, ok, detalle) values ('Capturista no desactiva talleres', n = 0, n::text);

  -- Taller Realso: sin taller, aunque se mande uno.
  s := public.registrar_servicio(
    p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Prueba',
    p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio',
    p_lugar => 'taller_propio', p_taller_id => t1);
  select lugar, taller_id into l, tid from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Taller Realso queda sin taller', l = 'taller_propio' and tid is null, l || ' ' || coalesce(tid::text, 'null'));

  -- En camino sin taller: se rechaza.
  begin
    perform public.registrar_servicio(
      p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Prueba',
      p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio', p_lugar => 'en_camino');
    insert into r(caso, ok, detalle) values ('En camino sin taller se rechaza', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('En camino sin taller se rechaza', sqlerrm = 'Elige qué taller hizo el servicio', sqlerrm);
  end;

  -- Taller que no existe: se rechaza.
  begin
    perform public.registrar_servicio(
      p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Prueba',
      p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio',
      p_lugar => 'taller_externo', p_taller_id => gen_random_uuid());
    insert into r(caso, ok, detalle) values ('Taller inexistente se rechaza', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Taller inexistente se rechaza', true, sqlerrm);
  end;

  -- Taller de fuera, con taller.
  s := public.registrar_servicio(
    p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Prueba fuera',
    p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio',
    p_lugar => 'taller_externo', p_taller_id => t1);
  insert into x values ('s', s);
  select lugar, taller_id into l, tid from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Taller de fuera con su taller', l = 'taller_externo' and tid = t1, l || ' ' || coalesce(tid::text, 'null'));

  -- Como la app de antes (sin lugar): se guarda sin dato; editar sin lugar lo conserva.
  perform public.actualizar_servicio(s, u, hoy, null, null, 'Prueba fuera editada', g, 'Cambio de descripción');
  select lugar, taller_id into l, tid from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Editar sin lugar lo conserva', l = 'taller_externo' and tid = t1, l || ' ' || coalesce(tid::text, 'null'));

  -- Cambiar a en camino con otro taller.
  perform public.actualizar_servicio(
    p_servicio_id => s, p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba fuera editada', p_gastos => g, p_motivo => 'Fue en camino', p_lugar => 'en_camino', p_taller_id => t2);
  select lugar, taller_id into l, tid from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Editar: en camino con otro taller', l = 'en_camino' and tid = t2, l || ' ' || coalesce(tid::text, 'null'));
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque capturista', false, sqlerrm);
end $$;

insert into r(caso, ok, detalle)
select 'Vista servicios_resumen trae lugar y taller', lugar = 'en_camino' and taller_id = (select v from x where k = 't2'), coalesce(lugar::text, 'null')
from public.servicios_resumen where id = (select v from x where k = 's');
reset role;

insert into r(caso, ok, detalle)
select 'Línea de cambios registra lugar y taller',
       datos_anteriores ->> 'lugar' = 'taller_externo' and datos_nuevos ->> 'lugar' = 'en_camino'
       and datos_nuevos ->> 'taller_id' = (select v from x where k = 't2')::text, motivo
from public.historial_cambios
where tabla = 'servicios' and registro_id = (select v from x where k = 's') and motivo = 'Fue en camino';

-- ---------------------------------------------------------------------------
-- Admin: desactivar taller, editar con taller desactivado, restaurar
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  u uuid := (select v from x where k = 'u');
  s uuid := (select v from x where k = 's');
  t1 uuid := (select v from x where k = 't1');
  t2 uuid := (select v from x where k = 't2');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  h bigint; l public.lugar_servicio; tid uuid; n int;
begin
  update public.talleres set activo = false where id in (t1, t2);
  get diagnostics n = row_count;
  insert into r(caso, ok, detalle) values ('Admin desactiva talleres', n = 2, n::text);

  -- Editar sin tocar el taller (ya desactivado): se puede.
  perform public.actualizar_servicio(
    p_servicio_id => s, p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Otra descripción', p_gastos => g, p_motivo => 'Solo descripción', p_lugar => 'en_camino', p_taller_id => t2);
  insert into r(caso, ok, detalle) values ('Editar con su taller desactivado (sin cambiarlo)', true, '');

  -- Cambiar a un taller desactivado: se rechaza.
  begin
    perform public.actualizar_servicio(
      p_servicio_id => s, p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null,
      p_descripcion => 'Otra descripción', p_gastos => g, p_motivo => 'Otro taller', p_lugar => 'taller_externo', p_taller_id => t1);
    insert into r(caso, ok, detalle) values ('Cambiar a taller desactivado se rechaza', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Cambiar a taller desactivado se rechaza', sqlerrm like 'El taller %desactivado', sqlerrm);
  end;

  -- Cambiar a Taller Realso quita el taller.
  perform public.actualizar_servicio(
    p_servicio_id => s, p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Otra descripción', p_gastos => g, p_motivo => 'Fue en Realso', p_lugar => 'taller_propio');
  select lugar, taller_id into l, tid from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Cambiar a Taller Realso quita el taller', l = 'taller_propio' and tid is null, l || ' ' || coalesce(tid::text, 'null'));

  -- Regresa a en camino (taller desactivado no se puede elegir): se reactiva t2 y se vuelve a desactivar.
  update public.talleres set activo = true where id = t2;
  perform public.actualizar_servicio(
    p_servicio_id => s, p_unidad_id => u, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Otra descripción', p_gastos => g, p_motivo => 'Era en camino', p_lugar => 'en_camino', p_taller_id => t2);
  update public.talleres set activo = false where id = t2;

  -- Eliminar y restaurar: regresa con su lugar y su taller aunque esté desactivado.
  perform public.eliminar_servicio(s, 'Prueba de restaurar');
  select id into h from public.historial_cambios
  where tabla = 'servicios' and accion = 'delete' and registro_id = s;
  perform public.restaurar_servicio(h, 'Prueba de restaurar');
  select lugar, taller_id into l, tid from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Restaurar conserva lugar y taller', l = 'en_camino' and tid = t2, coalesce(l::text, 'null') || ' ' || coalesce(tid::text, 'null'));

  begin
    delete from public.talleres where id = t1;
    get diagnostics n = row_count;
    insert into r(caso, ok, detalle) values ('Nadie borra talleres', n = 0, n::text);
  exception when others then
    insert into r(caso, ok, detalle) values ('Nadie borra talleres', true, sqlerrm);
  end;
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

-- El capturista ya no ve los talleres desactivados; el gerente sí, pero no da de alta.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Capturista no ve talleres desactivados', count(*) = 0, count(*)::text
from public.talleres where id in (select v from x where k in ('t1', 't2'));
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve los desactivados', count(*) = 2, count(*)::text
from public.talleres where id in (select v from x where k in ('t1', 't2'));
do $$
begin
  insert into public.talleres (nombre, created_by) values ('[PRUEBA] Del gerente', auth.uid());
  insert into r(caso, ok, detalle) values ('Gerente no da de alta talleres', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Gerente no da de alta talleres', sqlstate = '42501', sqlerrm);
end $$;
reset role;

set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.talleres;
  insert into r(caso, ok, detalle) values ('Anónimo no lee talleres', false, n::text);
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no lee talleres', sqlstate = '42501', sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
