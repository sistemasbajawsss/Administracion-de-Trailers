-- =============================================================================
-- Sección 5G — Reportes y Excel: ¿Dónde se hizo? (2026-11-10)
--
-- reporte_gastos agrega "por_lugar" (Taller Realso, taller de fuera, en camino,
-- sin dato) y "por_taller" (talleres de fuera, los que más se llevaron, con
-- cuántos servicios fueron en camino). El Excel agrega lugar y taller. Los
-- totales no cambian.
--
-- gastos_para_reporte y exportar_gastos cambian lo que regresan: se borran y se
-- vuelven a crear (reporte_gastos los llama dentro de PL/pgSQL, no depende de
-- ellos). Versiones anteriores (para regresar): las tres en
-- 20261110011123_tipos_de_unidad_catalogo.sql.
-- =============================================================================

drop function public.exportar_gastos(date, date, text, text);
drop function public.gastos_para_reporte(date, date, text, text);

create function public.gastos_para_reporte(p_desde date, p_hasta date, p_grupo text, p_tipo text)
returns table(gasto_id uuid, servicio_id uuid, fecha date, unidad_id uuid, numero_economico text, numero_orden integer,
              tipo text, grupo text, categoria_id uuid, categoria text, concepto text, proveedor_id uuid, proveedor text,
              descripcion text, monto numeric, moneda public.moneda, monto_usd numeric, tipo_cambio numeric,
              tipo_servicio public.tipo_servicio, lugar public.lugar_servicio, taller_id uuid, taller text)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.puede_ver_todo() then
    raise exception 'Solo administradores y gerentes ven reportes' using errcode = '42501';
  end if;

  -- Sin operación = grupo Camionetas (lo garantiza validar_tipo_de_unidad).
  return query execute
    'select g.id, s.id, s.fecha, u.id, u.numero_economico, u.numero_orden, u.tipo,
            coalesce(u.operacion::text, ''camionetas''),
            c.id, c.nombre, g.concepto, p.id, p.nombre, s.descripcion, g.monto,
            g.moneda, g.monto_usd, g.tipo_cambio, s.tipo, s.lugar, t.id, t.nombre
     from public.gastos g
     join public.servicios s on s.id = g.servicio_id
     join public.unidades u on u.id = s.unidad_id
     left join public.categorias c on c.id = g.categoria_id
     left join public.proveedores p on p.id = s.proveedor_id
     left join public.talleres t on t.id = s.taller_id
     where s.fecha between $1 and $2'
    || case when p_grupo is not null
         then ' and coalesce(u.operacion::text, ''camionetas'') = $3' else '' end
    || case when p_tipo is not null then ' and u.tipo = $4' else '' end
  using p_desde, p_hasta, p_grupo, p_tipo;
end;
$$;

revoke execute on function public.gastos_para_reporte(date, date, text, text) from public, anon;
grant execute on function public.gastos_para_reporte(date, date, text, text) to authenticated;

create function public.exportar_gastos(p_desde date, p_hasta date, p_grupo text default null, p_tipo text default null)
returns table(fecha date, numero_economico text, tipo text, grupo text, categoria text, concepto text, proveedor text,
              descripcion text, monto text, moneda public.moneda, monto_usd text, tipo_cambio text,
              tipo_servicio public.tipo_servicio, lugar public.lugar_servicio, taller text)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.validar_reporte(p_desde, p_hasta, p_grupo);

  return query
  select g.fecha, g.numero_economico, g.tipo, g.grupo, coalesce(g.categoria, 'Categoría'), g.concepto,
         coalesce(g.proveedor, 'Sin proveedor'), g.descripcion, g.monto::text,
         g.moneda, g.monto_usd::text, g.tipo_cambio::text, g.tipo_servicio, g.lugar, g.taller
  from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo) as g
  order by g.fecha desc, g.numero_orden, g.servicio_id, g.gasto_id
  limit 50000;
end;
$$;

revoke execute on function public.exportar_gastos(date, date, text, text) from public, anon;
grant execute on function public.exportar_gastos(date, date, text, text) to authenticated;

create or replace function public.reporte_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo text default null,
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
  -- ¿Dónde se hizo? (5G): Taller Realso, fuera, en camino y sin dato (los de antes).
  por_lugar as (
    select lugar, sum(monto) as total, count(distinct servicio_id) as servicios
    from g group by lugar
  ),
  -- Talleres de fuera y en camino (los que más se llevaron).
  por_taller as (
    select taller_id, coalesce(taller, 'Taller') as nombre, sum(monto) as total,
           count(distinct servicio_id) as servicios,
           count(distinct servicio_id) filter (where lugar = 'en_camino') as en_camino
    from g where taller_id is not null group by taller_id, taller
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
    'por_lugar', (select coalesce(jsonb_agg(jsonb_build_object('lugar', lugar, 'total', total::text, 'servicios', servicios) order by total desc), '[]') from por_lugar),
    'por_taller', (select coalesce(jsonb_agg(x.obj order by x.total desc), '[]') from (
        select jsonb_build_object('id', taller_id, 'nombre', nombre, 'total', total::text, 'servicios', servicios,
                                  'en_camino', en_camino) as obj, total
        from por_taller order by total desc limit v_limite) as x),
    'dolares', (select jsonb_build_object('usd', usd::text, 'mxn', mxn::text, 'gastos', gastos) from dolares)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function public.reporte_gastos(date, date, text, text, integer, date, date) from public, anon;
grant execute on function public.reporte_gastos(date, date, text, text, integer, date, date) to authenticated;
