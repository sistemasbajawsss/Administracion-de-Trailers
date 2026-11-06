-- Sección 5E, Etapa 2 — Unidades vendidas: permisos, candados, taller y totales.
-- Corre con las migraciones 20261106203640_estatus_vendida y
-- 20261106203645_ventas_unidades ya aplicadas.
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated;
create temp table m (k text primary key, v text);
grant all on m to authenticated;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1));
-- u: la unidad activa con más servicios del capturista (sirve para ver que sus servicios siguen visibles).
insert into x values ('u', (
  select s.unidad_id from public.servicios s join public.unidades un on un.id = s.unidad_id
  where s.created_by = (select v from x where k = 'capt') and un.estatus = 'activo'
  group by s.unidad_id order by count(*) desc limit 1));
insert into x values
  ('u2', (select id from public.unidades where estatus = 'activo' and id <> (select v from x where k = 'u') order by numero_orden limit 1)),
  ('u3', (select id from public.unidades where estatus = 'activo' and id <> (select v from x where k = 'u') order by numero_orden limit 1 offset 1)),
  ('u4', (select id from public.unidades where estatus = 'activo' and id <> (select v from x where k = 'u') order by numero_orden limit 1 offset 2)),
  ('c', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));
update public.unidades set estatus = 'baja' where id = (select v from x where k = 'u4');
insert into public.unidades (numero_economico, tipo, operacion) values ('T-99997', 'trailer', 'local');
insert into x values ('temp', (select id from public.unidades where numero_economico = 'T-99997'));

-- Antes: totales y lo que ve el capturista.
insert into m values
  ('total_gastos', (select sum(monto)::text from public.gastos)),
  ('total_u', (select total::text from public.totales_por_unidad where unidad_id = (select v from x where k = 'u')));

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into m values ('reporte_antes', (select public.reporte_gastos(((now() at time zone 'America/Tijuana')::date - 365), (now() at time zone 'America/Tijuana')::date) ->> 'total'));
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into m values ('capt_servicios', (select count(*)::text from public.servicios));
do $$
begin
  begin
    perform public.marcar_unidad_vendida((select v from x where k = 'u'), (now() at time zone 'America/Tijuana')::date, null);
    insert into r(caso, ok, detalle) values ('Capturista no vende', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no vende', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.marcar_unidad_vendida((select v from x where k = 'u'), (now() at time zone 'America/Tijuana')::date, null);
    insert into r(caso, ok, detalle) values ('Gerente no vende', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no vende', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  v_u uuid := (select v from x where k = 'u');
begin
  begin
    update public.unidades set estatus = 'vendida' where id = v_u;
    insert into r(caso, ok, detalle) values ('Admin no pone Vendida a mano', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no pone Vendida a mano', true, sqlerrm);
  end;

  begin
    insert into public.unidades (numero_economico, tipo, operacion, estatus) values ('T-99996', 'trailer', 'local', 'vendida');
    insert into r(caso, ok, detalle) values ('Admin no crea una unidad Vendida', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no crea una unidad Vendida', true, sqlerrm);
  end;

  begin
    perform public.marcar_unidad_vendida(v_u, hoy + 1, null);
    insert into r(caso, ok, detalle) values ('Venta con fecha futura rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Venta con fecha futura rechazada', true, sqlerrm);
  end;

  perform public.marcar_unidad_vendida(v_u, hoy, '  Vendida a prueba  ');
  insert into r(caso, ok, detalle)
  select 'Admin vende: unidad queda Vendida', estatus = 'vendida', estatus::text from public.unidades where id = v_u;
  insert into r(caso, ok, detalle)
  select 'Venta guarda fecha, nota limpia, autor y nombre',
         fecha_venta = hoy and nota = 'Vendida a prueba' and created_by = (select v from x where k = 'admin') and vendida_nombre is not null,
         coalesce(nota, '(sin nota)')
  from public.ventas_unidades where unidad_id = v_u and deshecha_at is null;

  begin
    perform public.marcar_unidad_vendida(v_u, hoy, null);
    insert into r(caso, ok, detalle) values ('Vender dos veces rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Vender dos veces rechazado', sqlstate = '23505', sqlerrm);
  end;

  insert into r(caso, ok, detalle)
  select 'Reporte 12 meses: mismo total después de vender',
         (public.reporte_gastos(hoy - 365, hoy) ->> 'total') = (select v from m where k = 'reporte_antes'),
         (public.reporte_gastos(hoy - 365, hoy) ->> 'total');

  begin
    update public.unidades set estatus = 'activo' where id = v_u;
    insert into r(caso, ok, detalle) values ('Admin no quita Vendida a mano', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no quita Vendida a mano', true, sqlerrm);
  end;

  begin
    update public.unidades set notas = 'Prueba 5E', estatus = 'vendida' where id = v_u;
    insert into r(caso, ok, detalle) values ('Admin edita otros datos de una vendida', true, '');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin edita otros datos de una vendida', false, sqlerrm);
  end;

  begin
    insert into public.servicios (unidad_id, fecha) values (v_u, hoy);
    insert into r(caso, ok, detalle) values ('Servicio nuevo a unidad vendida rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Servicio nuevo a unidad vendida rechazado', sqlerrm like '%vendida%', sqlerrm);
  end;

  begin
    perform public.registrar_entrada_taller(v_u, hoy, 'Falla');
    insert into r(caso, ok, detalle) values ('Entrada a taller de unidad vendida rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada a taller de unidad vendida rechazada', sqlerrm like '%vendida%', sqlerrm);
  end;

  -- Vender una unidad en taller cierra su entrada.
  perform public.registrar_entrada_taller((select v from x where k = 'u2'), hoy - 2, 'Prueba venta en taller');
  perform public.marcar_unidad_vendida((select v from x where k = 'u2'), hoy, null);
  insert into r(caso, ok, detalle)
  select 'Vender en taller: la entrada se cierra con la fecha de venta',
         fecha_salida = hoy and nota_salida = 'Unidad vendida', coalesce(fecha_salida::text, 'abierta')
  from public.entradas_taller where unidad_id = (select v from x where k = 'u2') order by created_at desc limit 1;
  insert into r(caso, ok, detalle)
  select 'Vender en taller: ya no está en la lista de Taller', count(*) = 0, count(*)::text
  from public.entradas_taller where unidad_id = (select v from x where k = 'u2') and fecha_salida is null;

  perform public.registrar_entrada_taller((select v from x where k = 'u3'), hoy - 2, 'Prueba fecha');
  begin
    perform public.marcar_unidad_vendida((select v from x where k = 'u3'), hoy - 5, null);
    insert into r(caso, ok, detalle) values ('Venta antes de su entrada a taller rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Venta antes de su entrada a taller rechazada', true, sqlerrm);
  end;
end $$;
reset role;

insert into r(caso, ok, detalle)
select 'Total de gastos de la unidad vendida sin cambios',
       (select total::text from public.totales_por_unidad where unidad_id = (select v from x where k = 'u')) = (select v from m where k = 'total_u'),
       (select v from m where k = 'total_u');

-- ---------------------------------------------------------------------------
-- Qué ve cada rol
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Capturista no ve la unidad vendida', count(*) = 0, count(*)::text from public.unidades where id = (select v from x where k = 'u');
insert into r(caso, ok, detalle)
select 'Capturista no ve ventas', count(*) = 0, count(*)::text from public.ventas_unidades;
insert into r(caso, ok, detalle)
select 'Capturista sigue viendo sus servicios', count(*)::text = (select v from m where k = 'capt_servicios'), count(*)::text from public.servicios;
do $$
begin
  begin
    perform public.deshacer_venta((select v from x where k = 'u'), 'Intento');
    insert into r(caso, ok, detalle) values ('Capturista no deshace ventas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no deshace ventas', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve la unidad vendida', count(*) = 1, count(*)::text from public.unidades where id = (select v from x where k = 'u');
insert into r(caso, ok, detalle)
select 'Gerente ve la venta', count(*) = 1, count(*)::text from public.ventas_unidades where unidad_id = (select v from x where k = 'u');
do $$
begin
  begin
    perform public.deshacer_venta((select v from x where k = 'u'), 'Intento');
    insert into r(caso, ok, detalle) values ('Gerente no deshace ventas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no deshace ventas', sqlstate = '42501', sqlerrm);
  end;
  begin
    update public.ventas_unidades set nota = 'x';
    insert into r(caso, ok, detalle) values ('Nadie edita ventas directo', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Nadie edita ventas directo', true, sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Deshacer
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  v_u uuid := (select v from x where k = 'u');
begin
  begin
    perform public.deshacer_venta(v_u, '   ');
    insert into r(caso, ok, detalle) values ('Deshacer sin motivo rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Deshacer sin motivo rechazado', true, sqlerrm);
  end;

  perform public.deshacer_venta(v_u, '  Se capturó por error  ');
  insert into r(caso, ok, detalle)
  select 'Deshacer: unidad regresa a Activo', estatus = 'activo', estatus::text from public.unidades where id = v_u;
  insert into r(caso, ok, detalle)
  select 'Deshacer guarda quién, cuándo y motivo',
         deshecha_at is not null and deshecha_by = (select v from x where k = 'admin') and motivo_deshacer = 'Se capturó por error',
         coalesce(motivo_deshacer, '(sin motivo)')
  from public.ventas_unidades where unidad_id = v_u order by created_at desc limit 1;

  begin
    perform public.deshacer_venta(v_u, 'Otra vez');
    insert into r(caso, ok, detalle) values ('Deshacer una unidad no vendida rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Deshacer una unidad no vendida rechazado', true, sqlerrm);
  end;

  perform public.marcar_unidad_vendida(v_u, hoy, null);
  insert into r(caso, ok, detalle)
  select 'Se puede volver a vender (queda la venta deshecha en el historial)', count(*) = 2, count(*)::text
  from public.ventas_unidades where unidad_id = v_u;

  -- Una unidad de baja también se puede vender.
  perform public.marcar_unidad_vendida((select v from x where k = 'u4'), hoy, null);
  insert into r(caso, ok, detalle)
  select 'Unidad de baja se puede vender', estatus = 'vendida', estatus::text from public.unidades where id = (select v from x where k = 'u4');

  -- Eliminar por completo una unidad vendida borra sus ventas.
  perform public.marcar_unidad_vendida((select v from x where k = 'temp'), hoy, null);
  perform public.eliminar_unidad((select v from x where k = 'temp'), 'ELIMINAR REGISTRO');
  insert into r(caso, ok, detalle) values ('Eliminar por completo una unidad vendida', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Deshacer / volver a vender (bloque)', false, sqlerrm);
end $$;
reset role;

insert into r(caso, ok, detalle)
select 'Sus ventas se borraron con ella', count(*) = 0, count(*)::text
from public.ventas_unidades where unidad_id = (select v from x where k = 'temp');
insert into r(caso, ok, detalle)
select 'Suma total de gastos sin cambios', (select sum(monto)::text from public.gastos) = (select v from m where k = 'total_gastos'),
       (select v from m where k = 'total_gastos');

set local role anon;
do $$
begin
  begin
    perform count(*) from public.ventas_unidades;
    insert into r(caso, ok, detalle) values ('anon no lee ventas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('anon no lee ventas', true, sqlerrm);
  end;
  begin
    perform public.marcar_unidad_vendida(gen_random_uuid(), current_date, null);
    insert into r(caso, ok, detalle) values ('anon no vende', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('anon no vende', true, sqlerrm);
  end;
end $$;
reset role;

select caso, ok, left(detalle, 90) detalle from r order by n;
rollback;
