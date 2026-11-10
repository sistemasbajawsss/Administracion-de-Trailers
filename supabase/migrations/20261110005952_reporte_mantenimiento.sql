-- =============================================================================
-- Sección 5F — Reportes: Mantenimiento vs Reparaciones (2026-11-10)
--
-- reporte_gastos: cada mes de por_mes trae además lo de cada tipo de servicio
-- (correctivo, preventivo, servicio y sin tipo) para la gráfica "Gasto por mes
-- por tipo". Solo agrega campos; lo demás queda igual. Copia de
-- 20261109201501_tipo_servicio.sql con g_mes y por_mes cambiados.
-- =============================================================================

create or replace function public.reporte_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo public.tipo_unidad default null,
  p_limite_ranking integer default 10,
  p_anterior_desde date default null,
  p_anterior_hasta date default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
set work_mem = '32MB'
as $$
declare
  v_dias integer := p_hasta - p_desde + 1;
  v_limite integer := least(greatest(coalesce(p_limite_ranking, 10), 1), 50);
  v_ant_desde date := coalesce(p_anterior_desde, p_desde - v_dias);
  v_ant_hasta date := coalesce(p_anterior_hasta, p_desde - 1);
  v_resultado jsonb;
begin
  perform public.validar_reporte(p_desde, p_hasta, p_grupo);
  if v_ant_desde > v_ant_hasta or v_ant_hasta >= p_desde then
    raise exception 'Revisa el periodo anterior' using errcode = '23514';
  end if;

  with
  g as (
    select * from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo)
  ),
  anterior as (
    select coalesce(sum(monto), 0) as total
    from public.gastos_para_reporte(v_ant_desde, v_ant_hasta, p_grupo, p_tipo)
  ),
  meses as (
    select m, to_char(m, 'YYYY-MM') as mes
    from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') as m
  ),
  g_mes as (
    select date_trunc('month', fecha) as m, sum(monto) as total, count(distinct servicio_id) as servicios,
           coalesce(sum(monto) filter (where tipo_servicio = 'correctivo'), 0) as correctivo,
           coalesce(sum(monto) filter (where tipo_servicio = 'preventivo'), 0) as preventivo,
           coalesce(sum(monto) filter (where tipo_servicio = 'servicio'), 0) as servicio,
           coalesce(sum(monto) filter (where tipo_servicio is null), 0) as sin_tipo
    from g group by 1
  ),
  por_mes as (
    select meses.mes, coalesce(g_mes.total, 0) as total, coalesce(g_mes.servicios, 0) as servicios,
           coalesce(g_mes.correctivo, 0) as correctivo, coalesce(g_mes.preventivo, 0) as preventivo,
           coalesce(g_mes.servicio, 0) as servicio, coalesce(g_mes.sin_tipo, 0) as sin_tipo
    from meses
    left join g_mes on g_mes.m = meses.m
  ),
  por_categoria as (
    select categoria_id, coalesce(categoria, 'Categoría') as nombre, sum(monto) as total, count(*) as gastos
    from g group by categoria_id, categoria
  ),
  por_unidad as (
    select unidad_id, numero_economico, numero_orden, tipo, grupo,
           sum(monto) as total, count(distinct servicio_id) as servicios
    from g group by unidad_id, numero_economico, numero_orden, tipo, grupo
  ),
  por_grupo as (
    select grupo, sum(monto) as total from g group by grupo
  ),
  por_tipo as (
    select tipo, sum(monto) as total from g group by tipo
  ),
  por_tipo_servicio as (
    select tipo_servicio, sum(monto) as total, count(distinct servicio_id) as servicios
    from g group by tipo_servicio
  ),
  por_proveedor as (
    select proveedor_id, coalesce(proveedor, 'Sin proveedor') as nombre, sum(monto) as total,
           count(distinct servicio_id) as servicios
    from g group by proveedor_id, proveedor
  ),
  dolares as (
    select coalesce(sum(monto_usd), 0) as usd, coalesce(sum(monto), 0) as mxn, count(*) as gastos
    from g
    where moneda = 'USD'
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(monto), 0)::text from g),
    'total_anterior', (select total::text from anterior),
    'anterior_desde', v_ant_desde,
    'anterior_hasta', v_ant_hasta,
    'servicios', (select count(distinct servicio_id) from g),
    'gastos', (select count(*) from g),
    'unidades', (select count(distinct unidad_id) from g),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'total', total::text, 'servicios', servicios,
        'correctivo', correctivo::text, 'preventivo', preventivo::text, 'servicio', servicio::text, 'sin_tipo', sin_tipo::text) order by mes), '[]') from por_mes),
    'por_categoria', (select coalesce(jsonb_agg(jsonb_build_object('id', categoria_id, 'nombre', nombre, 'total', total::text, 'gastos', gastos) order by total desc), '[]') from por_categoria),
    'por_unidad', (select coalesce(jsonb_agg(x.obj order by x.total desc, x.numero_orden), '[]') from (
        select jsonb_build_object('id', unidad_id, 'numero', numero_economico, 'tipo', tipo, 'grupo', grupo,
                                  'total', total::text, 'servicios', servicios) as obj, total, numero_orden
        from por_unidad order by total desc, numero_orden limit v_limite) as x),
    'por_grupo', (select coalesce(jsonb_agg(jsonb_build_object('grupo', grupo, 'total', total::text) order by total desc), '[]') from por_grupo),
    'por_tipo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'total', total::text) order by total desc), '[]') from por_tipo),
    'por_tipo_servicio', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo_servicio, 'total', total::text, 'servicios', servicios) order by total desc), '[]') from por_tipo_servicio),
    'por_proveedor', (select coalesce(jsonb_agg(x.obj order by x.total desc), '[]') from (
        select jsonb_build_object('id', proveedor_id, 'nombre', nombre, 'total', total::text, 'servicios', servicios) as obj, total
        from por_proveedor order by total desc limit v_limite) as x),
    'dolares', (select jsonb_build_object('usd', usd::text, 'mxn', mxn::text, 'gastos', gastos) from dolares)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

notify pgrst, 'reload schema';
