-- Sección 5G: Reportes y Excel con ¿Dónde se hizo? (por_lugar, por_taller y las
-- columnas del Excel). Corre con 20261110151818_reporte_donde_se_hizo aplicada.
begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
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
  d date := date '2001-06-10';
  u uuid := (select v from x where k = 'caja');
  t uuid; g jsonb; rep jsonb; e jsonb; ok boolean; suma numeric;
begin
  insert into public.talleres (nombre, created_by) values ('[PRUEBA] Taller Reporte', auth.uid()) returning id into t;

  g := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '100.00'));
  perform public.registrar_servicio(p_unidad_id => u, p_fecha => d, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba', p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio',
    p_lugar => 'taller_propio');
  g := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '20.00'));
  perform public.registrar_servicio(p_unidad_id => u, p_fecha => d, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba', p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio',
    p_lugar => 'taller_externo', p_taller_id => t);
  g := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '3.00'));
  perform public.registrar_servicio(p_unidad_id => u, p_fecha => d, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba', p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio',
    p_lugar => 'en_camino', p_taller_id => t);
  g := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '0.40'));
  perform public.registrar_servicio(p_unidad_id => u, p_fecha => d, p_kilometraje => null, p_proveedor_id => null,
    p_descripcion => 'Prueba', p_gastos => g, p_motivo_sin_entrada => 'Reparación en camino', p_tipo => 'servicio');

  rep := public.reporte_gastos(date '2001-06-01', date '2001-06-30');
  select bool_and(case e2 ->> 'lugar'
                    when 'taller_propio' then (e2 ->> 'total')::numeric = 100
                    when 'taller_externo' then (e2 ->> 'total')::numeric = 20
                    when 'en_camino' then (e2 ->> 'total')::numeric = 3
                    else e2 ->> 'lugar' is null and (e2 ->> 'total')::numeric = 0.40 end)
         and count(*) = 4
  into ok from jsonb_array_elements(rep -> 'por_lugar') e2;
  insert into r(caso, ok, detalle) values ('Por lugar: Realso, fuera, en camino y sin dato', ok, (rep -> 'por_lugar')::text);

  select e2 into e from jsonb_array_elements(rep -> 'por_taller') e2 where (e2 ->> 'id')::uuid = t;
  insert into r(caso, ok, detalle) values ('Por taller: fuera y en camino juntos',
    (e ->> 'total')::numeric = 23 and (e ->> 'servicios')::int = 2 and (e ->> 'en_camino')::int = 1, e::text);

  -- En el último año: los lugares suman el total.
  rep := public.reporte_gastos(hoy - 365, hoy);
  select coalesce(sum((e2 ->> 'total')::numeric), 0) into suma from jsonb_array_elements(rep -> 'por_lugar') e2;
  insert into r(caso, ok, detalle) values ('Por lugar suma el total', suma = (rep ->> 'total')::numeric, suma || ' / ' || (rep ->> 'total'));

  insert into r(caso, ok, detalle)
  select 'Excel: lugar y taller', count(*) filter (where lugar = 'en_camino' and taller = '[PRUEBA] Taller Reporte') = 1
         and count(*) filter (where lugar is null) = 1, count(*)::text
  from public.exportar_gastos(date '2001-06-01', date '2001-06-30');
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve por lugar y por taller', jsonb_array_length(rep -> 'por_lugar') = 4 and jsonb_array_length(rep -> 'por_taller') = 1,
       (rep -> 'por_taller')::text
from (select public.reporte_gastos(date '2001-06-01', date '2001-06-30') as rep) q;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
