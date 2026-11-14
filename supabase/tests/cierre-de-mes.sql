-- Sección 5I, Etapa 3: cierre de mes (D17).
-- El mes de hace dos meses siempre está cerrado (su día de cierre ya pasó); el
-- anterior depende del día: se prueba cambiando el día de cierre.
begin;
set local lock_timeout = '5s';
update public.tickets_taller set estatus = 'cancelado', cancelado_at = now() where estatus = 'pendiente';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;
create temp table d (k text primary key, v date);
grant all on d to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and not public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));
insert into d values
  ('hoy', public.hoy_tijuana()),
  ('m2', (date_trunc('month', public.hoy_tijuana()) - interval '2 months')::date),
  ('m1', (date_trunc('month', public.hoy_tijuana()) - interval '1 month')::date);

insert into r(caso, ok, detalle)
select 'El mes en curso está abierto', not public.mes_cerrado((select v from d where k = 'hoy')), '';
insert into r(caso, ok, detalle)
select 'Hace dos meses está cerrado (solo)', public.mes_cerrado((select v from d where k = 'm2') + 9), '';
insert into r(caso, ok, detalle)
select 'Nombre del mes', public.nombre_mes(date '2026-10-15') = 'octubre de 2026', public.nombre_mes(date '2026-10-15');

-- Día de cierre: con 1, el anterior ya cerró; con 28, depende de si hoy es 28 o más.
update public.ajustes_cierre set dia_cierre = 1;
insert into r(caso, ok, detalle)
select 'Día 1: el mes anterior ya está cerrado', public.mes_cerrado((select v from d where k = 'm1')), '';
update public.ajustes_cierre set dia_cierre = 28;
insert into r(caso, ok, detalle)
select 'Día 28: el mes anterior cierra hasta el 28',
       public.mes_cerrado((select v from d where k = 'm1')) = (extract(day from (select v from d where k = 'hoy')) >= 28), '';
update public.ajustes_cierre set dia_cierre = 5;

-- Capturista: no registra en un mes cerrado; sí en el mes en curso.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'), p_fecha => (select v from d where k = 'm2') + 9,
    p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Prueba 5I cierre', p_tipo => 'servicio',
    p_lugar => 'taller_propio', p_motivo_sin_entrada => 'Reparación en camino',
    p_gastos => jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '100.00')));
  insert into r(caso, ok, detalle) values ('Capturista no registra en mes cerrado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no registra en mes cerrado',
    sqlstate = '23514' and sqlerrm like 'El mes de % ya está cerrado%', sqlerrm);
end $$;
do $$
begin
  insert into x values ('s_hoy', public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (select v from d where k = 'hoy'), p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba 5I cierre hoy', p_tipo => 'servicio', p_lugar => 'taller_propio',
    p_motivo_sin_entrada => 'Reparación en camino',
    p_gastos => jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '100.00'))));
  insert into r(caso, ok, detalle) values ('Capturista registra en el mes en curso', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista registra en el mes en curso', false, sqlerrm);
end $$;
-- Ni cierra ni reabre ni cambia el día; no ve el estado.
do $$
begin
  perform public.cerrar_mes((select v from d where k = 'm1'));
  insert into r(caso, ok, detalle) values ('Capturista no cierra', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no cierra', sqlstate = '42501', sqlerrm);
end $$;
do $$
begin
  perform public.cambiar_dia_cierre(10::smallint);
  insert into r(caso, ok, detalle) values ('Capturista no cambia el día', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no cambia el día', sqlstate = '42501', sqlerrm);
end $$;
do $$
begin
  perform * from public.meses_cierre(12);
  insert into r(caso, ok, detalle) values ('Capturista no ve el estado de los meses', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no ve el estado de los meses', sqlstate = '42501', sqlerrm);
end $$;
insert into r(caso, ok, detalle)
select 'Capturista sí sabe qué meses pasados siguen abiertos', true, coalesce(string_agg(m::text, ', '), 'ninguno')
from public.meses_abiertos() m;
reset role;

-- Admin: reabre hace dos meses (con motivo) para que el capturista registre ahí.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.reabrir_mes((select v from d where k = 'm2'), 'no');
  insert into r(caso, ok, detalle) values ('Reabrir sin motivo rechazado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Reabrir sin motivo rechazado', sqlstate = '23514', sqlerrm);
end $$;
select public.reabrir_mes((select v from d where k = 'm2'), 'Faltó un ticket');
insert into r(caso, ok, detalle)
select 'Reabierto: queda abierto', not public.mes_cerrado((select v from d where k = 'm2')), '';
insert into r(caso, ok, detalle)
select 'Reabierto: sale en meses_abiertos', (select v from d where k = 'm2') in (select * from public.meses_abiertos()), '';
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into x values ('s_viejo', public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (select v from d where k = 'm2') + 9, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba 5I cierre viejo', p_tipo => 'servicio', p_lugar => 'taller_propio',
    p_motivo_sin_entrada => 'Reparación en camino',
    p_gastos => jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '100.00'))));
  insert into r(caso, ok, detalle) values ('Mes reabierto: el capturista registra', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Mes reabierto: el capturista registra', false, sqlerrm);
end $$;
reset role;

-- Admin lo vuelve a cerrar.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.cerrar_mes((select v from d where k = 'm2'));
insert into r(caso, ok, detalle)
select 'Cerrado otra vez por el admin', public.mes_cerrado((select v from d where k = 'm2')), '';
do $$
begin
  perform public.cerrar_mes((select v from d where k = 'm2'));
  insert into r(caso, ok, detalle) values ('No cierra uno ya cerrado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('No cierra uno ya cerrado', sqlstate = '23514', sqlerrm);
end $$;
do $$
begin
  perform public.cerrar_mes((select v from d where k = 'hoy'));
  insert into r(caso, ok, detalle) values ('No cierra el mes en curso', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('No cierra el mes en curso', sqlstate = '23514', sqlerrm);
end $$;
do $$
begin
  perform public.reabrir_mes((select v from d where k = 'hoy'), 'Prueba mes en curso');
  insert into r(caso, ok, detalle) values ('No reabre uno abierto', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('No reabre uno abierto', sqlstate = '23514', sqlerrm);
end $$;
do $$
begin
  perform public.cambiar_dia_cierre(29::smallint);
  insert into r(caso, ok, detalle) values ('Día 29 rechazado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Día 29 rechazado', sqlstate = '23514', sqlerrm);
end $$;
select public.cambiar_dia_cierre(7::smallint);
insert into r(caso, ok, detalle) select 'Admin cambia el día', public.dia_cierre() = 7, public.dia_cierre()::text;
select public.cambiar_dia_cierre(5::smallint);
insert into r(caso, ok, detalle)
select 'Estado de 12 meses, el primero en curso', count(*) = 12 and bool_or(en_curso and not cerrado), count(*)::text
from public.meses_cierre(12);
insert into r(caso, ok, detalle)
select 'El estado dice quién lo cerró', ultima_accion = 'cerrar' and por is not null, coalesce(por, 'sin nombre')
from public.meses_cierre(12) where mes = (select v from d where k = 'm2');
reset role;

-- Capturista con el mes cerrado: no edita, no mueve, no cambia gastos, no quita facturas.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.actualizar_servicio(p_servicio_id => (select v from x where k = 's_viejo'), p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (select v from d where k = 'm2') + 9, p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Cambio',
    p_gastos => (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '150.00')) from public.gastos where servicio_id = (select v from x where k = 's_viejo')),
    p_motivo => 'Prueba cierre');
  insert into r(caso, ok, detalle) values ('Capturista no edita en mes cerrado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no edita en mes cerrado', sqlstate = '23514', sqlerrm);
end $$;
do $$
begin
  perform public.actualizar_servicio(p_servicio_id => (select v from x where k = 's_hoy'), p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (select v from d where k = 'm2') + 9, p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Mover',
    p_gastos => (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '100.00')) from public.gastos where servicio_id = (select v from x where k = 's_hoy')),
    p_motivo => 'Prueba mover');
  insert into r(caso, ok, detalle) values ('Capturista no mueve un servicio a un mes cerrado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no mueve un servicio a un mes cerrado', sqlstate = '23514', sqlerrm);
end $$;
do $$
begin
  update public.gastos set monto = 999 where servicio_id = (select v from x where k = 's_viejo');
  insert into r(caso, ok, detalle) values ('Capturista no cambia gastos directo',
    (select sum(monto) from public.gastos where servicio_id = (select v from x where k = 's_viejo')) = 100, 'sin error, sin cambio');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no cambia gastos directo', true, sqlstate || ' ' || sqlerrm);
end $$;
do $$
declare
  v_comp uuid;
begin
  select c.id into v_comp
  from public.comprobantes c join public.servicios s on s.id = c.servicio_id
  where s.created_by = (select v from x where k = 'capt') and public.mes_cerrado(s.fecha)
  limit 1;
  if v_comp is null then
    insert into r(caso, ok, detalle) values ('Capturista no quita facturas de mes cerrado', true, 'sin comprobantes para probar');
  else
    perform public.quitar_comprobante(v_comp, 'Prueba cierre comprobante');
    insert into r(caso, ok, detalle) values ('Capturista no quita facturas de mes cerrado', false, 'pudo');
  end if;
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no quita facturas de mes cerrado', sqlstate = '23514', sqlerrm);
end $$;
reset role;

-- Admin: sí edita en mes cerrado (con motivo).
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.actualizar_servicio(p_servicio_id => (select v from x where k = 's_viejo'), p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (select v from d where k = 'm2') + 9, p_kilometraje => null, p_proveedor_id => null, p_descripcion => 'Admin corrige',
    p_gastos => (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '150.00')) from public.gastos where servicio_id = (select v from x where k = 's_viejo')),
    p_motivo => 'Prueba admin cierre');
  insert into r(caso, ok, detalle) values ('Admin edita en mes cerrado', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Admin edita en mes cerrado', false, sqlerrm);
end $$;
reset role;

-- Gerente ve el estado y no cierra.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle) select 'Gerente ve el estado', count(*) = 12, count(*)::text from public.meses_cierre(12);
do $$
begin
  perform public.reabrir_mes((select v from d where k = 'm2'), 'Prueba gerente');
  insert into r(caso, ok, detalle) values ('Gerente no reabre', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Gerente no reabre', sqlstate = '42501', sqlerrm);
end $$;
reset role;

-- Sin usuario (SQL del sistema): no se frena.
select set_config('request.jwt.claims', '', true);
do $$
begin
  perform set_config('app.motivo', 'Prueba sistema', true);
  update public.servicios set descripcion = 'Sistema' where id = (select v from x where k = 's_viejo');
  insert into r(caso, ok, detalle) values ('Sin usuario no se frena', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Sin usuario no se frena', false, sqlerrm);
end $$;

select caso, ok, detalle from r order by n;
rollback;
