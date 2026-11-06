-- =============================================================================
-- Sección 5E, Etapa 2 — Estatus "vendida" (2026-11-06)
-- Va sola: un valor nuevo de enum no se puede usar en la misma transacción en
-- que se crea. Las reglas que lo usan están en la migración siguiente
-- (20261106203645_ventas_unidades). Mientras tanto ninguna unidad lo tiene.
-- =============================================================================
alter type public.estatus_unidad add value if not exists 'vendida';
