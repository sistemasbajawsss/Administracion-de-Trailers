-- =============================================================================
-- Sección 5E, Etapa 4 — Avisos de taller (2026-11-06)
-- servicios_resumen: las tres columnas de taller al final (create or replace view
-- lo permite; las consultas que ya existen no cambian). Índice para el aviso de
-- Inicio del admin (servicios nuevos sin entrada a taller, los más recientes).
-- Copia de la vista de 20261026232829_servicios_resumen_pendientes.sql.
-- =============================================================================
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
  public.nombre_usuario(s.created_by) as autor_nombre,
  s.entrada_taller_id,
  s.sin_entrada_taller,
  s.motivo_sin_entrada
from public.servicios s
left join lateral (
  select sum(x.monto) as total, count(*) as num_gastos
  from public.gastos x
  where x.servicio_id = s.id
) g on true;

create index servicios_sin_entrada_idx on public.servicios (fecha desc, created_at desc) where sin_entrada_taller;
