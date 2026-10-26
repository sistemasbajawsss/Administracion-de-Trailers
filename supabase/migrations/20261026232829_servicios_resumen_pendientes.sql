-- =============================================================================
-- Inicio con pendientes: servicios sin factura y quién los capturó.
-- =============================================================================

-- Nombre de un usuario para mostrarlo junto a lo que capturó. security definer:
-- el gerente no puede leer perfiles ajenos (RLS), pero sí debe ver quién capturó.
-- Solo regresa el nombre, nada más del perfil.
create or replace function public.nombre_usuario(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.nombre from public.perfiles p where p.id = p_id
$$;

revoke execute on function public.nombre_usuario(uuid) from public, anon;
grant execute on function public.nombre_usuario(uuid) to authenticated;

-- servicios_resumen: dos columnas nuevas al final (create or replace view lo permite).
create or replace view public.servicios_resumen
with (security_invoker = true)
as
select
  s.id,
  s.unidad_id,
  s.fecha,
  s.kilometraje,
  s.proveedor_id,
  s.descripcion,
  s.created_at,
  s.updated_at,
  s.created_by,
  s.updated_by,
  coalesce(g.total, 0)::numeric(12, 2) as total,
  coalesce(g.num_gastos, 0)::integer as num_gastos,
  exists (
    select 1 from public.historial_cambios h
    where h.servicio_id = s.id and h.motivo is not null
  ) as editado,
  (select count(*) from public.comprobantes c where c.servicio_id = s.id)::integer as num_comprobantes,
  public.nombre_usuario(s.created_by) as autor_nombre
from public.servicios s
left join lateral (
  select sum(x.monto) as total, count(*) as num_gastos
  from public.gastos x
  where x.servicio_id = s.id
) g on true;
