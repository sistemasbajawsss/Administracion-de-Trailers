-- =============================================================================
-- Sección 3B — Lista de gastos (un renglón por gasto) para la ficha de la unidad
-- y la pantalla Servicios: buscar por categoría o concepto, filtrar por fechas,
-- total de lo filtrado y carga por tandas (scroll infinito).
-- Todo security invoker: RLS decide qué ve cada rol (el capturista, lo suyo).
-- =============================================================================

create view public.gastos_detalle
with (security_invoker = true)
as
select
  g.id,
  g.servicio_id,
  s.unidad_id,
  u.numero_economico,
  u.tipo as tipo_unidad,
  s.fecha,
  s.created_at as servicio_creado,
  s.created_by,
  g.categoria_id,
  c.nombre as categoria,
  g.concepto,
  g.monto,
  (select count(*) from public.comprobantes x where x.servicio_id = s.id)::integer as num_comprobantes,
  g.created_at
from public.gastos g
join public.servicios s on s.id = g.servicio_id
-- left join: una unidad de baja o una categoría inactiva que RLS oculte no
-- debe esconder el gasto.
left join public.unidades u on u.id = s.unidad_id
left join public.categorias c on c.id = g.categoria_id;

revoke all on public.gastos_detalle from anon;

-- Texto de búsqueda como patrón de ilike, sin comodines del usuario (% y _).
create or replace function public.patron_busqueda(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(trim(p_texto), '') is null then null
    else '%' || replace(replace(replace(trim(p_texto), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end
$$;

revoke execute on function public.patron_busqueda(text) from public, anon;
grant execute on function public.patron_busqueda(text) to authenticated;

-- Gastos filtrados, del más reciente al más viejo, en tandas.
-- p_numero: número económico (pantalla Servicios); p_busqueda: categoría o concepto.
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
language sql
stable
security invoker
set search_path = ''
as $$
  select d.*
  from public.gastos_detalle d
  where (p_unidad_id is null or d.unidad_id = p_unidad_id)
    and (public.patron_busqueda(p_numero) is null or d.numero_economico ilike public.patron_busqueda(p_numero))
    and (
      public.patron_busqueda(p_busqueda) is null
      or d.categoria ilike public.patron_busqueda(p_busqueda)
      or d.concepto ilike public.patron_busqueda(p_busqueda)
    )
    and (p_desde is null or d.fecha >= p_desde)
    and (p_hasta is null or d.fecha <= p_hasta)
  -- Mismo servicio juntos, sus gastos en el orden en que se capturaron; id desempata.
  order by d.fecha desc, d.servicio_creado desc, d.servicio_id, d.created_at, d.id
  limit least(greatest(p_limite, 1), 100)
  offset greatest(p_desde_renglon, 0)
$$;

-- Total y número de gastos con los mismos filtros (se suma en la BD, no en JS).
create or replace function public.resumen_gastos(
  p_unidad_id uuid default null,
  p_numero text default null,
  p_busqueda text default null,
  p_desde date default null,
  p_hasta date default null
)
returns table (total numeric(12, 2), num_gastos integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(d.monto), 0)::numeric(12, 2), count(*)::integer
  from public.gastos_detalle d
  where (p_unidad_id is null or d.unidad_id = p_unidad_id)
    and (public.patron_busqueda(p_numero) is null or d.numero_economico ilike public.patron_busqueda(p_numero))
    and (
      public.patron_busqueda(p_busqueda) is null
      or d.categoria ilike public.patron_busqueda(p_busqueda)
      or d.concepto ilike public.patron_busqueda(p_busqueda)
    )
    and (p_desde is null or d.fecha >= p_desde)
    and (p_hasta is null or d.fecha <= p_hasta)
$$;

revoke execute on function public.listar_gastos(uuid, text, text, date, date, integer, integer) from public, anon;
revoke execute on function public.resumen_gastos(uuid, text, text, date, date) from public, anon;
grant execute on function public.listar_gastos(uuid, text, text, date, date, integer, integer) to authenticated;
grant execute on function public.resumen_gastos(uuid, text, text, date, date) to authenticated;
