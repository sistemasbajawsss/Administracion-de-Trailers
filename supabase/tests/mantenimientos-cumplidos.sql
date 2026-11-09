-- Sección 5F, Etapa 4: un correctivo cumple mantenimientos programados y
-- reinicia su contador (validaciones, edición, historial, eliminar y restaurar,
-- mismo cálculo para los tres roles).
-- Corre con la migración 20261109221717_mantenimientos_cumplidos aplicada.
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
  ('ua', (select id from public.unidades where estatus = 'activo' and tipo <> 'caja' order by numero_orden limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and tipo <> 'caja' order by numero_orden limit 1 offset 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Kilometraje conocido: ua y ub sin lecturas de antes.
select set_config('app.motivo', 'Prueba de mantenimientos cumplidos', true);
update public.servicios set kilometraje = null where unidad_id in (select v from x where k in ('ua', 'ub'));
select set_config('app.motivo', '', true);

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ua uuid := (select v from x where k = 'ua');
  ub uuid := (select v from x where k = 'ub');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  aceite uuid; filtro uuid; viejo uuid; otra uuid; s uuid; s2 uuid; p record; lista uuid[];
begin
  -- Lectura de 100,000 hace 5 días.
  perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy - 5, p_kilometraje => 100000, p_proveedor_id => null,
    p_descripcion => 'Lectura', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');

  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  values (ua, 'Cambio de aceite', 15000, 6, hoy - 60, 90000) returning id into aceite;
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha)
  values (ua, 'Filtro de cabina', 12, hoy - 30) returning id into filtro;
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha, activo)
  values (ua, 'Ya no se hace', 12, hoy - 30, false) returning id into viejo;
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha)
  values (ub, 'De otra unidad', 12, hoy - 30) returning id into otra;
  insert into x values ('aceite', aceite), ('filtro', filtro);

  select * into p from public.mantenimientos_pendientes(ua) where id = aceite;
  insert into r(caso, ok, detalle) values ('Sin cumplir: cuenta desde la última vez capturada',
    p.proximo_km = 105000 and p.ultima_fecha = hoy - 60 and p.ultimo_servicio_id is null,
    p.proximo_km || ' ' || p.ultima_fecha);

  -- Un correctivo hoy a 101,000 km cumple el cambio de aceite (repetido a propósito).
  s = public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101000, p_proveedor_id => null,
    p_descripcion => 'Cambio de aceite', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
    p_tipo => 'correctivo', p_mantenimientos => array[aceite, aceite]);
  insert into x values ('s', s);
  select mantenimientos into lista from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Sin repetidos', lista = array[aceite], lista::text);

  select * into p from public.mantenimientos_pendientes(ua) where id = aceite;
  insert into r(caso, ok, detalle) values ('El correctivo reinicia el contador',
    p.ultimo_servicio_id = s and p.ultima_fecha = hoy and p.ultimo_km = 101000 and p.proximo_km = 116000
      and p.faltan_km = 15000 and p.proxima_fecha = (hoy + interval '6 months')::date,
    p.ultimo_km || ' ' || p.proximo_km || ' ' || p.faltan_km || ' ' || p.proxima_fecha);
  select * into p from public.mantenimientos_pendientes(ua) where id = filtro;
  insert into r(caso, ok, detalle) values ('Los demás no cambian', p.ultimo_servicio_id is null, coalesce(p.ultimo_servicio_id::text, 'null'));

  -- Un "servicio" con los mismos gastos no lo reinicia.
  s2 = public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101200, p_proveedor_id => null,
    p_descripcion => 'Aceite en reparación de motor', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
    p_tipo => 'servicio');
  insert into x values ('s2', s2);
  select * into p from public.mantenimientos_pendientes(ua) where id = aceite;
  insert into r(caso, ok, detalle) values ('Un servicio no lo reinicia', p.ultimo_servicio_id = s and p.ultimo_km = 101000, p.ultimo_km::text);

  -- Validaciones.
  begin
    perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101300, p_proveedor_id => null,
      p_descripcion => 'x', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
      p_tipo => 'servicio', p_mantenimientos => array[aceite]);
    insert into r(caso, ok, detalle) values ('Servicio no puede cumplir', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Servicio no puede cumplir', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101300, p_proveedor_id => null,
      p_descripcion => 'x', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
      p_tipo => 'preventivo', p_mantenimientos => array[aceite]);
    insert into r(caso, ok, detalle) values ('Preventivo no puede cumplir', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Preventivo no puede cumplir', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101300, p_proveedor_id => null,
      p_descripcion => 'x', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
      p_tipo => 'correctivo', p_mantenimientos => array[otra]);
    insert into r(caso, ok, detalle) values ('De otra unidad: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('De otra unidad: rechazado', sqlstate = '23514' and sqlerrm like '%otra unidad%', sqlerrm);
  end;
  begin
    perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101300, p_proveedor_id => null,
      p_descripcion => 'x', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
      p_tipo => 'correctivo', p_mantenimientos => array[viejo]);
    insert into r(caso, ok, detalle) values ('Quitado: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Quitado: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy - 61, p_kilometraje => 89000, p_proveedor_id => null,
      p_descripcion => 'x', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
      p_tipo => 'correctivo', p_mantenimientos => array[aceite]);
    insert into r(caso, ok, detalle) values ('Anterior a la última vez: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Anterior a la última vez: rechazado', sqlstate = '23514' and sqlerrm like '%anterior%', sqlerrm);
  end;
  begin
    perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null,
      p_descripcion => 'x', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
      p_tipo => 'correctivo', p_mantenimientos => array[aceite]);
    insert into r(caso, ok, detalle) values ('Por km sin kilometraje: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Por km sin kilometraje: rechazado', sqlstate = '23514' and sqlerrm like '%kilometraje%', sqlerrm);
  end;
  begin
    perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101300, p_proveedor_id => null,
      p_descripcion => 'x', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio',
      p_tipo => 'correctivo', p_mantenimientos => array[gen_random_uuid()]);
    insert into r(caso, ok, detalle) values ('Inexistente: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Inexistente: rechazado', sqlstate = 'P0002', sqlerrm);
  end;
  -- Por API directa también.
  begin
    update public.servicios set mantenimientos = array[aceite] where id = s2;
    insert into r(caso, ok, detalle) values ('API directa: un servicio no cumple', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('API directa: un servicio no cumple', sqlstate = '23514', sqlerrm);
  end;

  -- Editar con la app de antes (sin lista) conserva lo marcado.
  perform public.actualizar_servicio(p_servicio_id => s, p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101000,
    p_proveedor_id => null, p_descripcion => 'Cambio de aceite y filtro', p_gastos => g, p_motivo => 'Agrego detalle');
  select mantenimientos into lista from public.servicios where id = s;
  insert into r(caso, ok, detalle) values ('Editar sin lista la conserva', lista = array[aceite], lista::text);

  -- Marcar dos.
  perform public.actualizar_servicio(p_servicio_id => s, p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101000,
    p_proveedor_id => null, p_descripcion => 'Cambio de aceite y filtro', p_gastos => g, p_motivo => 'También el filtro',
    p_tipo => 'correctivo', p_mantenimientos => array[aceite, filtro]);
  select * into p from public.mantenimientos_pendientes(ua) where id = filtro;
  insert into r(caso, ok, detalle) values ('Un correctivo cumple dos',
    p.ultimo_servicio_id = s and p.proxima_fecha = (hoy + interval '12 months')::date, coalesce(p.proxima_fecha::text, 'null'));
  insert into r(caso, ok, detalle)
  select 'El historial registra el cambio', count(*) = 1, count(*)::text
  from public.historial_cambios h
  where h.servicio_id = s and h.accion = 'update' and h.motivo = 'También el filtro'
    and h.datos_anteriores -> 'mantenimientos' <> h.datos_nuevos -> 'mantenimientos';

  -- Cambiarlo a "servicio" lo desmarca y el contador regresa.
  perform public.actualizar_servicio(p_servicio_id => s, p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101000,
    p_proveedor_id => null, p_descripcion => 'Cambio de aceite y filtro', p_gastos => g, p_motivo => 'Era reparación',
    p_tipo => 'servicio', p_mantenimientos => '{}');
  select * into p from public.mantenimientos_pendientes(ua) where id = aceite;
  insert into r(caso, ok, detalle) values ('Desmarcar regresa el contador', p.ultimo_servicio_id is null and p.proximo_km = 105000, p.proximo_km::text);

  perform public.actualizar_servicio(p_servicio_id => s, p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101000,
    p_proveedor_id => null, p_descripcion => 'Cambio de aceite y filtro', p_gastos => g, p_motivo => 'Sí era correctivo',
    p_tipo => 'correctivo', p_mantenimientos => array[aceite]);

  -- Si después se quita el mantenimiento, editar el servicio sigue funcionando.
  update public.mantenimientos_unidad set activo = false where id = filtro;
  perform public.actualizar_servicio(p_servicio_id => s, p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 101000,
    p_proveedor_id => null, p_descripcion => 'Cambio de aceite', p_gastos => g, p_motivo => 'Corrijo descripción',
    p_tipo => 'correctivo', p_mantenimientos => array[aceite]);
  update public.mantenimientos_unidad set activo = true where id = filtro;
  insert into r(caso, ok, detalle) values ('Editar con otro mantenimiento quitado', true, 'ok');

  -- Cambiar la unidad con la marca puesta: rechazado (es de otra unidad).
  begin
    perform public.actualizar_servicio(p_servicio_id => s, p_unidad_id => ub, p_fecha => hoy, p_kilometraje => 101000,
      p_proveedor_id => null, p_descripcion => 'x', p_gastos => g, p_motivo => 'Cambio de unidad');
    insert into r(caso, ok, detalle) values ('Cambiar de unidad con la marca: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Cambiar de unidad con la marca: rechazado', sqlstate = '23514', sqlerrm);
  end;
end $$;
reset role;

-- El capturista ve el mismo contador aunque no vea el servicio del admin.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Capturista no ve el servicio del admin', count(*) = 0, count(*)::text
from public.servicios where id = (select v from x where k = 's');
insert into r(caso, ok, detalle)
select 'Capturista ve el mismo contador', p.ultimo_servicio_id = (select v from x where k = 's') and p.proximo_km = 116000,
  coalesce(p.proximo_km::text, 'null')
from public.mantenimientos_pendientes((select v from x where k = 'ua')) p
where p.id = (select v from x where k = 'aceite');
do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  s uuid; p record;
begin
  s = public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'), p_fecha => hoy, p_kilometraje => 101500,
    p_proveedor_id => null, p_descripcion => 'Aceite (capturista)', p_gastos => g,
    p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'correctivo',
    p_mantenimientos => array[(select v from x where k = 'aceite')]);
  select * into p from public.mantenimientos_pendientes((select v from x where k = 'ua')) where id = (select v from x where k = 'aceite');
  insert into r(caso, ok, detalle) values ('Capturista registra un correctivo que cumple', p.ultimo_servicio_id = s and p.ultimo_km = 101500, p.ultimo_km::text);
  insert into x values ('s_capt', s);
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve el mismo contador', p.ultimo_km = 101500, coalesce(p.ultimo_km::text, 'null')
from public.mantenimientos_pendientes((select v from x where k = 'ua')) p
where p.id = (select v from x where k = 'aceite');
reset role;

-- Eliminar el correctivo regresa el contador; restaurarlo lo vuelve a contar.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  ua uuid := (select v from x where k = 'ua');
  aceite uuid := (select v from x where k = 'aceite');
  sc uuid := (select v from x where k = 's_capt');
  h bigint; p record;
begin
  perform public.eliminar_servicio(sc, 'Prueba de eliminar');
  select * into p from public.mantenimientos_pendientes(ua) where id = aceite;
  insert into r(caso, ok, detalle) values ('Eliminar regresa al correctivo anterior',
    p.ultimo_servicio_id = (select v from x where k = 's') and p.ultimo_km = 101000, p.ultimo_km::text);

  select id into h from public.historial_cambios
  where tabla = 'servicios' and accion = 'delete' and registro_id = sc order by id desc limit 1;
  insert into r(caso, ok, detalle) values ('La copia guarda la marca',
    (select datos_anteriores -> 'mantenimientos' from public.historial_cambios where id = h) = jsonb_build_array(aceite),
    (select (datos_anteriores -> 'mantenimientos')::text from public.historial_cambios where id = h));

  perform public.restaurar_servicio(h, 'Prueba de restaurar');
  select * into p from public.mantenimientos_pendientes(ua) where id = aceite;
  insert into r(caso, ok, detalle) values ('Restaurar lo vuelve a contar', p.ultimo_servicio_id = sc and p.ultimo_km = 101500, p.ultimo_km::text);
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.mantenimientos_pendientes();
  insert into r(caso, ok, detalle) values ('Anónimo no ve', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no ve', true, sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
