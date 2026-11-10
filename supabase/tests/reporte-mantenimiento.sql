-- Sección 5F: Reportes, Mantenimiento vs Reparaciones. Cada mes de por_mes
-- trae lo de cada tipo de servicio y cuadra con el total y con por_tipo_servicio.
-- Corre con la migración 20261110005952_reporte_mantenimiento aplicada.
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('caja', (select id from public.unidades where estatus = 'activo' and tipo = 'caja' order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  -- Un periodo de 2001 que no tiene datos: solo cuenta lo de esta prueba.
  d1 date := date '2001-03-10';
  d2 date := date '2001-04-10';
  u uuid := (select v from x where k = 'caja');
  g jsonb;
  rep jsonb; m jsonb; ok boolean := true; det text := '';
begin
  g := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '1000.10'));
  perform public.registrar_servicio(p_unidad_id => u, p_fecha => d1, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'correctivo');
  g := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '200.20'));
  perform public.registrar_servicio(p_unidad_id => u, p_fecha => d1, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'preventivo');
  g := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '30.30'));
  perform public.registrar_servicio(p_unidad_id => u, p_fecha => d2, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');

  rep := public.reporte_gastos(date '2001-03-01', date '2001-05-31');
  select e into m from jsonb_array_elements(rep -> 'por_mes') e where e ->> 'mes' = '2001-03';
  insert into r(caso, ok, detalle) values ('Marzo: correctivo y preventivo',
    (m ->> 'correctivo')::numeric = 1000.10 and (m ->> 'preventivo')::numeric = 200.20 and (m ->> 'servicio')::numeric = 0
    and (m ->> 'sin_tipo')::numeric = 0, m::text);
  select e into m from jsonb_array_elements(rep -> 'por_mes') e where e ->> 'mes' = '2001-04';
  insert into r(caso, ok, detalle) values ('Abril: reparaciones', (m ->> 'servicio')::numeric = 30.30 and (m ->> 'correctivo')::numeric = 0, m::text);
  select e into m from jsonb_array_elements(rep -> 'por_mes') e where e ->> 'mes' = '2001-05';
  insert into r(caso, ok, detalle) values ('Mayo sin gastos: todo en cero',
    (m ->> 'total')::numeric = 0 and (m ->> 'correctivo')::numeric = 0 and (m ->> 'sin_tipo')::numeric = 0, m::text);

  -- Cada mes: la suma de los tipos es el total (en el último año con datos reales).
  rep := public.reporte_gastos(hoy - 365, hoy);
  for m in select e from jsonb_array_elements(rep -> 'por_mes') e loop
    if (m ->> 'correctivo')::numeric + (m ->> 'preventivo')::numeric + (m ->> 'servicio')::numeric + (m ->> 'sin_tipo')::numeric
       <> (m ->> 'total')::numeric then
      ok := false; det := det || (m ->> 'mes') || ' ';
    end if;
  end loop;
  insert into r(caso, ok, detalle) values ('Cada mes: tipos suman el total', ok, det);

  -- Lo de cada tipo en el año cuadra con por_tipo_servicio.
  select bool_and(coalesce((select sum((e ->> t.campo)::numeric) from jsonb_array_elements(rep -> 'por_mes') e), 0)
                  = coalesce((select (p ->> 'total')::numeric from jsonb_array_elements(rep -> 'por_tipo_servicio') p
                              where p ->> 'tipo' is not distinct from t.tipo), 0))
  into ok
  from (values ('correctivo', 'correctivo'), ('preventivo', 'preventivo'), ('servicio', 'servicio'), ('sin_tipo', null)) t(campo, tipo);
  insert into r(caso, ok, detalle) values ('Por mes cuadra con por tipo de servicio', ok, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve los tipos por mes', (rep -> 'por_mes' -> 0) ? 'correctivo', (rep -> 'por_mes' -> 0)::text
from (select public.reporte_gastos(date '2001-03-01', date '2001-04-30') as rep) q;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
