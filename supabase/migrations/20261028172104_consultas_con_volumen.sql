-- =============================================================================
-- Sección 5C — Consultas rápidas con volumen
-- Prueba de carga (~35 mil servicios, ~71 mil gastos):
-- 1. listar_gastos / resumen_gastos / gastos_para_reporte usaban filtros
--    opcionales "(p is null or ...)": Postgres hacía un plan genérico que no usa
--    el índice por fecha y recorría todos los gastos (1.1 s contra 33 ms de la
--    misma consulta escrita directo). Ahora arman solo los filtros que vienen.
-- 2. Lectura de gastos y comprobantes: quien ve todo (admin, gerente) ya no
--    revisa el servicio de cada renglón; el resultado es el mismo.
-- 3. reporte_gastos: el gasto por mes se agrupa primero y luego se cruza con
--    los meses (antes comparaba el texto del mes renglón por renglón); la cifra
--    en dólares y el Excel ya no vuelven a cruzar gastos; más memoria para
--    ordenar solo dentro de reporte_gastos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2. Políticas de lectura
-- ---------------------------------------------------------------------------
drop policy "gastos: leer" on public.gastos;
create policy "gastos: leer"
  on public.gastos for select to authenticated
  using (
    (select public.puede_ver_todo())
    or exists (select 1 from public.servicios s where s.id = servicio_id)
  );

drop policy "comprobantes: leer" on public.comprobantes;
create policy "comprobantes: leer"
  on public.comprobantes for select to authenticated
  using (
    (select public.puede_ver_todo())
    or exists (select 1 from public.servicios s where s.id = servicio_id)
  );

-- ---------------------------------------------------------------------------
-- 1. Filtros armados según lo que viene (mismos argumentos y resultado)
-- ---------------------------------------------------------------------------
create or replace function public.filtro_gastos(
  p_unidad_id uuid,
  p_numero text,
  p_busqueda text,
  p_desde date,
  p_hasta date
)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Los valores van como parámetros ($1..$5) en el execute; aquí solo se elige qué condiciones van.
  select concat_ws(' and ',
    'true',
    case when p_unidad_id is not null then 'd.unidad_id = $1' end,
    case when public.patron_busqueda(p_numero) is not null then 'd.numero_economico ilike $2' end,
    case when public.patron_busqueda(p_busqueda) is not null then '(d.categoria ilike $3 or d.concepto ilike $3)' end,
    case when p_desde is not null then 'd.fecha >= $4' end,
    case when p_hasta is not null then 'd.fecha <= $5' end
  )
$$;

revoke execute on function public.filtro_gastos(uuid, text, text, date, date) from public, anon;
grant execute on function public.filtro_gastos(uuid, text, text, date, date) to authenticated;

create or replace function public.listar_gastos(
  p_unidad_id uuid default null,
  p_numero text default null,
  p_busqueda text default null,
  p_desde date default null,
  p_hasta date default null,
  p_limite integer default 25,
  p_desde_renglon integer default 0
)
returns setof public.gastos_detalle
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query execute
    'select d.* from public.gastos_detalle d where '
    || public.filtro_gastos(p_unidad_id, p_numero, p_busqueda, p_desde, p_hasta)
    -- Mismo servicio juntos, sus gastos en el orden en que se capturaron; id desempata.
    || ' order by d.fecha desc, d.servicio_creado desc, d.servicio_id, d.created_at, d.id'
    || ' limit $6 offset $7'
  using p_unidad_id, public.patron_busqueda(p_numero), public.patron_busqueda(p_busqueda), p_desde, p_hasta,
        least(greatest(p_limite, 1), 100), greatest(p_desde_renglon, 0);
end;
$$;

create or replace function public.resumen_gastos(
  p_unidad_id uuid default null,
  p_numero text default null,
  p_busqueda text default null,
  p_desde date default null,
  p_hasta date default null
)
returns table (total numeric(12, 2), num_gastos integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query execute
    'select coalesce(sum(d.monto), 0)::numeric(12, 2), count(*)::integer from public.gastos_detalle d where '
    || public.filtro_gastos(p_unidad_id, p_numero, p_busqueda, p_desde, p_hasta)
  using p_unidad_id, public.patron_busqueda(p_numero), public.patron_busqueda(p_busqueda), p_desde, p_hasta;
end;
$$;

-- Agrega moneda, monto_usd y tipo_cambio al final (cambia el tipo de retorno:
-- se vuelve a crear). Así Reportes y Excel no vuelven a cruzar gastos.
drop function public.gastos_para_reporte(date, date, text, public.tipo_unidad);

create function public.gastos_para_reporte(
  p_desde date,
  p_hasta date,
  p_grupo text,
  p_tipo public.tipo_unidad
)
returns table (
  gasto_id uuid,
  servicio_id uuid,
  fecha date,
  unidad_id uuid,
  numero_economico text,
  numero_orden integer,
  tipo public.tipo_unidad,
  grupo text,
  categoria_id uuid,
  categoria text,
  concepto text,
  proveedor_id uuid,
  proveedor text,
  descripcion text,
  monto numeric(12, 2),
  moneda public.moneda,
  monto_usd numeric(12, 2),
  tipo_cambio numeric(10, 4)
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query execute
    'select g.id, s.id, s.fecha, u.id, u.numero_economico, u.numero_orden, u.tipo,
            case when u.tipo = ''camioneta'' then ''camionetas'' else u.operacion::text end,
            c.id, c.nombre, g.concepto, p.id, p.nombre, s.descripcion, g.monto,
            g.moneda, g.monto_usd, g.tipo_cambio
     from public.gastos g
     join public.servicios s on s.id = g.servicio_id
     join public.unidades u on u.id = s.unidad_id
     left join public.categorias c on c.id = g.categoria_id
     left join public.proveedores p on p.id = s.proveedor_id
     where s.fecha between $1 and $2'
    || case when p_grupo is not null
         then ' and (case when u.tipo = ''camioneta'' then ''camionetas'' else u.operacion::text end) = $3' else '' end
    || case when p_tipo is not null then ' and u.tipo = $4' else '' end
  using p_desde, p_hasta, p_grupo, p_tipo;
end;
$$;

revoke execute on function public.gastos_para_reporte(date, date, text, public.tipo_unidad) from public, anon;
grant execute on function public.gastos_para_reporte(date, date, text, public.tipo_unidad) to authenticated;

-- exportar_gastos: mismas columnas; moneda, USD y tipo de cambio ya vienen en la base.
create or replace function public.exportar_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo public.tipo_unidad default null
)
returns table (
  fecha date,
  numero_economico text,
  tipo public.tipo_unidad,
  grupo text,
  categoria text,
  concepto text,
  proveedor text,
  descripcion text,
  monto text,
  moneda public.moneda,
  monto_usd text,
  tipo_cambio text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.validar_reporte(p_desde, p_hasta, p_grupo);

  return query
  select g.fecha, g.numero_economico, g.tipo, g.grupo, coalesce(g.categoria, 'Categoría'), g.concepto,
         coalesce(g.proveedor, 'Sin proveedor'), g.descripcion, g.monto::text,
         g.moneda, g.monto_usd::text, g.tipo_cambio::text
  from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo) as g
  order by g.fecha desc, g.numero_orden, g.servicio_id, g.gasto_id
  limit 50000;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. reporte_gastos: por mes se agrupa primero (por fecha, el texto del mes
-- solo para los meses del periodo); la cifra en dólares sale de la misma base
-- sin volver a cruzar gastos; más memoria para ordenar sin ir a disco (solo
-- dentro de esta función). Resto igual que en 20261028162451_reporte_dolares.sql.
-- ---------------------------------------------------------------------------
create or replace function public.reporte_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo public.tipo_unidad default null,
  p_limite_ranking integer default 10
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set work_mem = '32MB'
as $$
declare
  v_dias integer := p_hasta - p_desde + 1;
  v_limite integer := least(greatest(coalesce(p_limite_ranking, 10), 1), 50);
  v_resultado jsonb;
begin
  perform public.validar_reporte(p_desde, p_hasta, p_grupo);

  with
  g as (
    select * from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo)
  ),
  anterior as (
    select coalesce(sum(monto), 0) as total
    from public.gastos_para_reporte(p_desde - v_dias, p_desde - 1, p_grupo, p_tipo)
  ),
  meses as (
    select m, to_char(m, 'YYYY-MM') as mes
    from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') as m
  ),
  g_mes as (
    select date_trunc('month', fecha) as m, sum(monto) as total, count(distinct servicio_id) as servicios
    from g group by 1
  ),
  por_mes as (
    select meses.mes, coalesce(g_mes.total, 0) as total, coalesce(g_mes.servicios, 0) as servicios
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
    'servicios', (select count(distinct servicio_id) from g),
    'gastos', (select count(*) from g),
    'unidades', (select count(distinct unidad_id) from g),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'total', total::text, 'servicios', servicios) order by mes), '[]') from por_mes),
    'por_categoria', (select coalesce(jsonb_agg(jsonb_build_object('id', categoria_id, 'nombre', nombre, 'total', total::text, 'gastos', gastos) order by total desc), '[]') from por_categoria),
    'por_unidad', (select coalesce(jsonb_agg(x.obj order by x.total desc, x.numero_orden), '[]') from (
        select jsonb_build_object('id', unidad_id, 'numero', numero_economico, 'tipo', tipo, 'grupo', grupo,
                                  'total', total::text, 'servicios', servicios) as obj, total, numero_orden
        from por_unidad order by total desc, numero_orden limit v_limite) as x),
    'por_grupo', (select coalesce(jsonb_agg(jsonb_build_object('grupo', grupo, 'total', total::text) order by total desc), '[]') from por_grupo),
    'por_tipo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'total', total::text) order by total desc), '[]') from por_tipo),
    'por_proveedor', (select coalesce(jsonb_agg(x.obj order by x.total desc), '[]') from (
        select jsonb_build_object('id', proveedor_id, 'nombre', nombre, 'total', total::text, 'servicios', servicios) as obj, total
        from por_proveedor order by total desc limit v_limite) as x),
    'dolares', (select jsonb_build_object('usd', usd::text, 'mxn', mxn::text, 'gastos', gastos) from dolares)
  )
  into v_resultado;

  return v_resultado;
end;
$$;
