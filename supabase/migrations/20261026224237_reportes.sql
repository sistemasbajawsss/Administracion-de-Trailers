-- =============================================================================
-- Sección 4 — Reportes (admin y gerente, D4)
-- Todo se suma en Postgres con numeric; los montos salen como texto para que la
-- app nunca los convierta a float. security invoker: RLS aplica, y además las
-- funciones exigen poder ver todo (el capturista no tiene reportes).
-- =============================================================================

-- Gastos con todo lo que los reportes agrupan o filtran. La usan las funciones de
-- abajo; es security invoker, así que si alguien la llamara directo, RLS solo le
-- deja ver lo suyo.
create or replace function public.gastos_para_reporte(
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
  monto numeric(12, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    g.id,
    s.id,
    s.fecha,
    u.id,
    u.numero_economico,
    u.numero_orden,
    u.tipo,
    case when u.tipo = 'camioneta' then 'camionetas' else u.operacion::text end,
    c.id,
    c.nombre,
    g.concepto,
    p.id,
    p.nombre,
    s.descripcion,
    g.monto
  from public.gastos g
  join public.servicios s on s.id = g.servicio_id
  join public.unidades u on u.id = s.unidad_id
  left join public.categorias c on c.id = g.categoria_id
  left join public.proveedores p on p.id = s.proveedor_id
  where s.fecha between p_desde and p_hasta
    and (p_grupo is null or (case when u.tipo = 'camioneta' then 'camionetas' else u.operacion::text end) = p_grupo)
    and (p_tipo is null or u.tipo = p_tipo)
$$;

revoke execute on function public.gastos_para_reporte(date, date, text, public.tipo_unidad) from public, anon;
grant execute on function public.gastos_para_reporte(date, date, text, public.tipo_unidad) to authenticated;

-- Revisa permiso y rango. Máximo 5 años por consulta.
create or replace function public.validar_reporte(p_desde date, p_hasta date, p_grupo text)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.puede_ver_todo() then
    raise exception 'Solo administradores y gerentes ven reportes' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Revisa el rango de fechas' using errcode = '23514';
  end if;
  if p_hasta - p_desde > 366 * 5 then
    raise exception 'El periodo máximo es de 5 años' using errcode = '23514';
  end if;
  if p_grupo is not null and p_grupo not in ('local', 'foraneo', 'camionetas') then
    raise exception 'Grupo no válido' using errcode = '23514';
  end if;
end;
$$;

revoke execute on function public.validar_reporte(date, date, text) from public, anon;
grant execute on function public.validar_reporte(date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- reporte_gastos: todos los agrupados del dashboard en una sola consulta.
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
    select to_char(m, 'YYYY-MM') as mes
    from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') as m
  ),
  por_mes as (
    select meses.mes, coalesce(sum(g.monto), 0) as total, count(distinct g.servicio_id) as servicios
    from meses
    left join g on to_char(g.fecha, 'YYYY-MM') = meses.mes
    group by meses.mes
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
        from por_proveedor order by total desc limit v_limite) as x)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------
-- exportar_gastos: detalle para el Excel (máximo 50,000 renglones).
-- ---------------------------------------------------------------------------
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
  monto text
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
         coalesce(g.proveedor, 'Sin proveedor'), g.descripcion, g.monto::text
  from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo) as g
  order by g.fecha desc, g.numero_orden, g.servicio_id, g.gasto_id
  limit 50000;
end;
$$;

revoke execute on function public.reporte_gastos(date, date, text, public.tipo_unidad, integer) from public, anon;
revoke execute on function public.exportar_gastos(date, date, text, public.tipo_unidad) from public, anon;
grant execute on function public.reporte_gastos(date, date, text, public.tipo_unidad, integer) to authenticated;
grant execute on function public.exportar_gastos(date, date, text, public.tipo_unidad) to authenticated;
