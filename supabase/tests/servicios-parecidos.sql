-- Sección 5H: aviso de posible servicio duplicado (servicios_parecidos).
-- Mismo día o misma estancia en taller; el capturista ve también los de otros
-- (solo lo necesario); el gerente y el anónimo no pueden llamarla.
begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
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
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and not public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Admin: entrada a taller hace 3 días y un servicio hoy (ligado a la estancia) y otro hace 10 días.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '4500.00'));
  v_s uuid;
begin
  perform public.registrar_entrada_taller((select v from x where k = 'ua'), hoy - 3, 'Prueba parecidos');
  v_s := public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'), p_fecha => hoy - 1, p_kilometraje => null,
    p_proveedor_id => null, p_descripcion => 'Frenos traseros', p_gastos => g, p_tipo => 'servicio');
  insert into x values ('s_estancia', v_s);
  v_s := public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'), p_fecha => hoy - 10, p_kilometraje => null,
    p_proveedor_id => null, p_descripcion => 'De antes', p_gastos => g, p_tipo => 'servicio', p_motivo_sin_entrada => 'Reparación en camino');
  insert into x values ('s_viejo', v_s);
end $$;
reset role;

-- Capturista: ve el del admin en la misma estancia (aunque por RLS no lo vería), no el viejo.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Capturista: el del admin en la misma estancia', count(*) = 1 and bool_and(id = (select v from x where k = 's_estancia') and misma_estancia and total = 4500 and autor_nombre is not null),
       count(*)::text
from public.servicios_parecidos((select v from x where k = 'ua'), (now() at time zone 'America/Tijuana')::date);
insert into r(caso, ok, detalle)
select 'Mismo día sin estancia: el de hace 10 días', count(*) = 1 and bool_and(id = (select v from x where k = 's_viejo') and not misma_estancia), count(*)::text
from public.servicios_parecidos((select v from x where k = 'ua'), (now() at time zone 'America/Tijuana')::date - 10);
insert into r(caso, ok, detalle)
select 'Trae las categorías', bool_and(categorias is not null), string_agg(categorias, ' | ')
from public.servicios_parecidos((select v from x where k = 'ua'), (now() at time zone 'America/Tijuana')::date);
reset role;

-- Gerente y anónimo: no.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform * from public.servicios_parecidos((select v from x where k = 'ua'), (now() at time zone 'America/Tijuana')::date);
  insert into r(caso, ok, detalle) values ('Gerente no la usa', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Gerente no la usa', sqlstate = '42501', sqlerrm);
end $$;
reset role;
set local role anon;
do $$
begin
  perform * from public.servicios_parecidos((select v from x where k = 'ua'), (now() at time zone 'America/Tijuana')::date);
  insert into r(caso, ok, detalle) values ('Anónimo no la usa', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no la usa', sqlstate = '42501', sqlerrm);
end $$;
reset role;

select caso, ok, detalle from r order by n;
rollback;
