-- Sección 5E, Etapa 3 — Servicios ligados al taller: liga, casilla de salida,
-- motivo, "se olvidó la entrada", edición, eliminar / restaurar y compatibilidad.
-- Corre con la migración 20261106205646_servicios_taller ya aplicada.
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated;
create temp table h (k text primary key, v bigint);
grant all on h to authenticated;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and tipo <> 'caja' order by numero_orden limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and tipo <> 'caja' order by numero_orden limit 1 offset 1)),
  ('uc', (select id from public.unidades where estatus = 'activo' and tipo <> 'caja' order by numero_orden limit 1 offset 2)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));
-- Un servicio de antes de la 5E del capturista (para editarlo).
insert into x values ('viejo', (
  select s.id from public.servicios s join public.unidades u on u.id = s.unidad_id
  where s.created_by = (select v from x where k = 'capt') and u.estatus = 'activo'
  order by s.created_at desc limit 1));

insert into r(caso, ok, detalle)
-- Los capturados antes de la migración de la Etapa 3 (aplicada 2026-11-06 20:56 UTC).
select 'Servicios de antes de la 5E quedan sin liga ni marca', count(*) = 0, count(*)::text || ' marcados'
from public.servicios
where created_at < '2026-11-06 20:56:00+00'
  and (sin_entrada_taller is not null or entrada_taller_id is not null or motivo_sin_entrada is not null);

-- ---------------------------------------------------------------------------
-- Capturista
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '100.00'));
  v_ua uuid := (select v from x where k = 'ua');
  v_ub uuid := (select v from x where k = 'ub');
  v_uc uuid := (select v from x where k = 'uc');
  v_s uuid;
  v_e uuid;
begin
  -- B: unidad sin entrada → marcado con su motivo.
  v_s := public.registrar_servicio(v_ua, hoy - 6, null, null, 'B', g, false, '  Reparación en camino  ');
  insert into r(caso, ok, detalle)
  select 'Sin entrada: queda marcado con su motivo', sin_entrada_taller and entrada_taller_id is null and motivo_sin_entrada = 'Reparación en camino',
         coalesce(motivo_sin_entrada, '(sin motivo)') from public.servicios where id = v_s;

  -- A: entrada de ua y servicio sin la casilla → ligado, la unidad sigue en taller.
  v_e := public.registrar_entrada_taller(v_ua, hoy - 3, 'Prueba 5E');
  insert into x values ('e_ua', v_e);
  v_s := public.registrar_servicio(v_ua, hoy - 1, null, null, 'A1', g, false, 'no debe quedar');
  insert into x values ('s_a1', v_s);
  insert into r(caso, ok, detalle)
  select 'En taller: se liga a su estancia y no guarda motivo', entrada_taller_id = v_e and sin_entrada_taller = false and motivo_sin_entrada is null,
         coalesce(entrada_taller_id::text, 'sin liga') from public.servicios where id = v_s;
  insert into r(caso, ok, detalle)
  select 'Casilla desmarcada: la unidad sigue en taller', estatus = 'en_taller', estatus::text from public.unidades where id = v_ua;

  -- A: segundo servicio con la casilla → misma estancia y salida con la fecha del servicio.
  v_s := public.registrar_servicio(v_ua, hoy, null, null, 'A2', g, true);
  insert into x values ('s_a2', v_s);
  insert into r(caso, ok, detalle)
  select 'Dos servicios en la misma estancia', count(*) = 2, count(*)::text from public.servicios where entrada_taller_id = v_e;
  insert into r(caso, ok, detalle)
  select 'Casilla marcada: la unidad regresa a Activo', estatus = 'activo', estatus::text from public.unidades where id = v_ua;

  -- C: ub en taller desde hace 2 días; servicio de hace 5 → no pertenece a la estancia.
  v_e := public.registrar_entrada_taller(v_ub, hoy - 2, 'Prueba 5E');
  insert into x values ('e_ub', v_e);
  v_s := public.registrar_servicio(v_ub, hoy - 5, null, null, 'C', g, true, 'Mantenimiento en patio');
  insert into x values ('s_c', v_s);
  insert into r(caso, ok, detalle)
  select 'Fecha antes de la entrada: no se liga y queda marcado', entrada_taller_id is null and sin_entrada_taller,
         coalesce(motivo_sin_entrada, '(sin motivo)') from public.servicios where id = v_s;
  insert into r(caso, ok, detalle)
  select 'Fecha antes de la entrada: la casilla no saca a la unidad', estatus = 'en_taller', estatus::text from public.unidades where id = v_ub;

  -- Llamada como la app de hoy (sin parámetros nuevos): se liga y no da salida.
  v_s := public.registrar_servicio(
    p_unidad_id => v_ub, p_fecha => hoy, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Compatibilidad', p_gastos => g);
  insert into x values ('s_compat', v_s);
  insert into r(caso, ok, detalle)
  select 'Llamada a la antigua: guarda, se liga y no da salida',
         s.entrada_taller_id = v_e and u.estatus = 'en_taller', u.estatus::text
  from public.servicios s join public.unidades u on u.id = s.unidad_id where s.id = v_s;

  -- Se olvidó la entrada (uc no está en taller): entrada creada, ligada y cerrada.
  -- Se revisa abajo, fuera del rol: ya cerrada, el capturista no ve la estancia (RLS).
  v_s := public.registrar_servicio(v_uc, hoy - 1, null, null, 'Olvidada', g, true, null, hoy - 4, 'Frenos (olvidada)');
  insert into x values ('s_olv', v_s);

  begin
    perform public.registrar_servicio(v_uc, hoy - 3, null, null, 'x', g, false, null, hoy - 1, 'Después');
    insert into r(caso, ok, detalle) values ('Entrada olvidada después del servicio rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada olvidada después del servicio rechazada', true, sqlerrm);
  end;

  begin
    perform public.registrar_servicio(v_ub, hoy, null, null, 'x', g, false, null, hoy - 1, 'Otra');
    insert into r(caso, ok, detalle) values ('Entrada olvidada de una unidad ya en taller rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada olvidada de una unidad ya en taller rechazada', true, sqlerrm);
  end;

  -- ---- Edición ----
  -- C movido a una fecha dentro de la estancia de ub → se liga y se borra el motivo.
  v_s := (select v from x where k = 's_c');
  perform public.actualizar_servicio(v_s, v_ub, hoy - 1, null, null, 'C', jsonb_build_array(jsonb_build_object(
    'id', (select gg.id from public.gastos gg where gg.servicio_id = v_s limit 1), 'categoria_id', (select v from x where k = 'cat'), 'monto', '100.00')),
    'Fecha corregida');
  insert into r(caso, ok, detalle)
  select 'Editar fecha dentro de la estancia: se liga y pierde el motivo',
         entrada_taller_id = (select v from x where k = 'e_ub') and sin_entrada_taller = false and motivo_sin_entrada is null,
         coalesce(entrada_taller_id::text, 'sin liga') from public.servicios where id = v_s;

  -- El mismo, ahora con fecha antes de la entrada → se desliga y guarda el motivo nuevo.
  perform public.actualizar_servicio(v_s, v_ub, hoy - 5, null, null, 'C', jsonb_build_array(jsonb_build_object(
    'id', (select gg.id from public.gastos gg where gg.servicio_id = v_s limit 1), 'categoria_id', (select v from x where k = 'cat'), 'monto', '100.00')),
    'Fecha corregida otra vez', false, 'Mantenimiento en patio');
  insert into r(caso, ok, detalle)
  select 'Editar fecha antes de la entrada: se desliga con su motivo',
         entrada_taller_id is null and sin_entrada_taller and motivo_sin_entrada = 'Mantenimiento en patio',
         coalesce(motivo_sin_entrada, '(sin motivo)') from public.servicios where id = v_s;

  -- Cambiar de unidad un servicio ligado (ub → uc, que no está en taller) → se desliga.
  v_s := (select v from x where k = 's_compat');
  perform public.actualizar_servicio(v_s, v_uc, hoy, null, null, 'Compatibilidad', jsonb_build_array(jsonb_build_object(
    'id', (select gg.id from public.gastos gg where gg.servicio_id = v_s limit 1), 'categoria_id', (select v from x where k = 'cat'), 'monto', '100.00')),
    'Unidad equivocada', false, 'Reparación en camino');
  insert into r(caso, ok, detalle)
  select 'Editar la unidad: se desliga de la estancia anterior', entrada_taller_id is null and sin_entrada_taller,
         coalesce(entrada_taller_id::text, 'sin liga') from public.servicios where id = v_s;

  -- Y de regreso a ub con la casilla → se liga otra vez y da la salida.
  perform public.actualizar_servicio(v_s, v_ub, hoy, null, null, 'Compatibilidad', jsonb_build_array(jsonb_build_object(
    'id', (select gg.id from public.gastos gg where gg.servicio_id = v_s limit 1), 'categoria_id', (select v from x where k = 'cat'), 'monto', '100.00')),
    'Era la unidad correcta', true);
  insert into r(caso, ok, detalle)
  select 'Editar con la casilla: se liga y la unidad sale de taller',
         s.entrada_taller_id = (select v from x where k = 'e_ub') and u.estatus = 'activo', u.estatus::text
  from public.servicios s join public.unidades u on u.id = s.unidad_id where s.id = v_s;
exception when others then
  -- Si algo falla, el bloque se deshace completo: este renglón dice dónde.
  insert into r(caso, ok, detalle) values ('Bloque capturista', false, sqlerrm);
end $$;
reset role;

insert into r(caso, ok, detalle)
select 'Se olvidó la entrada: se crea y el servicio se liga',
       s.entrada_taller_id = e.id and e.fecha_entrada = (now() at time zone 'America/Tijuana')::date - 4 and e.falla = 'Frenos (olvidada)',
       coalesce(e.fecha_entrada::text, 'sin entrada')
from public.servicios s left join public.entradas_taller e on e.id = s.entrada_taller_id where s.id = (select v from x where k = 's_olv');
insert into r(caso, ok, detalle)
select 'Se olvidó la entrada + casilla: queda cerrada y la unidad en Activo',
       e.fecha_salida = (now() at time zone 'America/Tijuana')::date - 1 and u.estatus = 'activo', u.estatus::text
from public.servicios s join public.entradas_taller e on e.id = s.entrada_taller_id join public.unidades u on u.id = s.unidad_id
where s.id = (select v from x where k = 's_olv');

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_s uuid := (select v from x where k = 'viejo');
begin
  perform set_config('app.motivo', 'Prueba 5E', true);
  update public.servicios set descripcion = coalesce(descripcion, '') || ' (5E)', unidad_id = unidad_id where id = v_s;
  insert into r(caso, ok, detalle)
  select 'Servicio de antes de la 5E: editarlo no lo liga ni lo marca',
         entrada_taller_id is null and sin_entrada_taller is null, coalesce(sin_entrada_taller::text, 'null')
  from public.servicios where id = v_s;

  -- Nadie fuerza la liga por API: la BD la vuelve a calcular.
  v_s := (select s.id from public.servicios s where s.sin_entrada_taller and s.created_by = auth.uid() limit 1);
  update public.servicios set entrada_taller_id = (select v from x where k = 'e_ua'), sin_entrada_taller = false where id = v_s;
  insert into r(caso, ok, detalle)
  select 'Liga forzada por API ignorada', entrada_taller_id is null and sin_entrada_taller, coalesce(entrada_taller_id::text, 'sin liga')
  from public.servicios where id = v_s;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Admin: eliminar un servicio que dio la salida y restaurarlo
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_s uuid := (select v from x where k = 's_a2');
  v_h bigint;
begin
  perform public.eliminar_servicio(v_s, 'Prueba 5E eliminar');
  insert into r(caso, ok, detalle)
  select 'Eliminar el servicio que dio la salida: la unidad no regresa a taller', estatus = 'activo', estatus::text
  from public.unidades where id = (select v from x where k = 'ua');

  select h2.id into v_h from public.historial_cambios h2
  where h2.tabla = 'servicios' and h2.accion = 'delete' and h2.registro_id = v_s order by h2.id desc limit 1;
  perform public.restaurar_servicio(v_h, 'Prueba 5E restaurar');
  insert into r(caso, ok, detalle)
  select 'Restaurar: vuelve ligado a su estancia', entrada_taller_id = (select v from x where k = 'e_ua') and sin_entrada_taller = false,
         coalesce(entrada_taller_id::text, 'sin liga') from public.servicios where id = v_s;
exception when others then
  insert into r(caso, ok, detalle) values ('Eliminar / restaurar (bloque)', false, sqlerrm);
end $$;
reset role;

-- Al final de la transacción todo servicio debe tener al menos un gasto.
do $$
begin
  set constraints all immediate;
  insert into r(caso, ok, detalle) values ('Revisión diferida al final: todo cuadra', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Revisión diferida al final: todo cuadra', false, sqlerrm);
end $$;

select caso, ok, left(detalle, 90) detalle from r order by n;
rollback;
