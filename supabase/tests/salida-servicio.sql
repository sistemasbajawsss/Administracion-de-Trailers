-- Ajuste de la 5E: servicio que dio la salida y total de cada estancia.
-- Corre con la migración 20261106233851_salida_con_servicio ya aplicada.
begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
-- 5H: los tickets pendientes de verdad bloquean la entrada directa; en esta prueba no cuentan (se deshace al final).
update public.tickets_taller set estatus = 'cancelado', cancelado_at = now() where estatus = 'pendiente';
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1 offset 1)),
  ('uc', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1 offset 2)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  g jsonb := jsonb_build_array(
    jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '100.25'),
    jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '50.00'));
  v_e uuid; v_s1 uuid; v_s2 uuid; v_e2 uuid; v_s3 uuid;
begin
  v_e := public.registrar_entrada_taller((select v from x where k = 'ua'), hoy - 3, 'Prueba');
  v_s1 := public.registrar_servicio((select v from x where k = 'ua'), hoy - 2, null, null, 'S1', g, false);
  v_s2 := public.registrar_servicio((select v from x where k = 'ua'), hoy - 1, null, null, 'S2', g, true);
  insert into x values ('e', v_e), ('s2', v_s2);

  -- Llamada a dar_salida como la app (con nombres, sin servicio) sigue igual.
  v_e2 := public.registrar_entrada_taller((select v from x where k = 'ub'), hoy - 2, 'Prueba 2');
  v_s3 := public.registrar_servicio((select v from x where k = 'ub'), hoy - 1, null, null, 'S3', g, false);
  begin
    perform public.dar_salida_taller(p_entrada_id => v_e2, p_fecha => hoy, p_nota => 'Manual', p_servicio_id => v_s1);
    insert into r(caso, ok, detalle) values ('Servicio de otra estancia rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Servicio de otra estancia rechazado', true, sqlerrm);
  end;
  perform public.dar_salida_taller(p_entrada_id => v_e2, p_fecha => hoy, p_nota => 'Manual');
  insert into x values ('e2', v_e2);

  -- Estancia sin servicios: "Dar salida" exige motivo; con motivo, sale.
  v_e2 := public.registrar_entrada_taller((select v from x where k = 'uc'), hoy - 1, 'Sin servicios');
  begin
    perform public.dar_salida_taller(p_entrada_id => v_e2, p_fecha => hoy, p_nota => '   ');
    insert into r(caso, ok, detalle) values ('Salida sin servicios y sin motivo rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Salida sin servicios y sin motivo rechazada', sqlstate = '23514', sqlerrm);
  end;
  perform public.dar_salida_taller(p_entrada_id => v_e2, p_fecha => hoy, p_nota => 'Se revisó y no tenía nada');
  insert into r(caso, ok, detalle) values ('Salida sin servicios con motivo', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque capturista', false, sqlerrm);
end $$;
reset role;

insert into r(caso, ok, detalle)
select 'Casilla: la estancia guarda el servicio que la sacó', servicio_salida_id = (select v from x where k = 's2'),
       coalesce(servicio_salida_id::text, 'sin servicio')
from public.entradas_taller where id = (select v from x where k = 'e');
insert into r(caso, ok, detalle)
select 'Dar salida manual: sin servicio', servicio_salida_id is null and nota_salida = 'Manual', coalesce(servicio_salida_id::text, 'null')
from public.entradas_taller where id = (select v from x where k = 'e2');
insert into r(caso, ok, detalle)
select 'Vista: total y servicios de la estancia', num_servicios = 2 and total = 300.50, num_servicios || ' / ' || total
from public.entradas_taller_resumen where id = (select v from x where k = 'e');
insert into r(caso, ok, detalle)
select 'Vista: total cuadra con la suma directa',
       v.total = (select coalesce(sum(g.monto), 0) from public.gastos g join public.servicios s on s.id = g.servicio_id where s.entrada_taller_id = v.id),
       v.total::text
from public.entradas_taller_resumen v where v.id = (select v from x where k = 'e');

-- Gerente ve la vista; anon no.
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.perfiles where rol = 'gerente' and activo limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve el resumen de estancias', count(*) >= 2, count(*)::text from public.entradas_taller_resumen;
reset role;
set local role anon;
do $$
begin
  perform count(*) from public.entradas_taller_resumen;
  insert into r(caso, ok, detalle) values ('anon no lee el resumen', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('anon no lee el resumen', true, sqlerrm);
end $$;
reset role;

select caso, ok, left(detalle, 90) detalle from r order by n;
rollback;
