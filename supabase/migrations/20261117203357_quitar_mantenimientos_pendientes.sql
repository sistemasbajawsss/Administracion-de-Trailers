-- =============================================================================
-- Sección 5J — Quitar el cálculo viejo de mantenimientos (2026-11-17)
--
-- La app publicada ya usa mantenimientos_estado() (20261117193935, tres niveles
-- con aviso de km). mantenimientos_pendientes() (20261109221717) se dejó solo
-- mientras la versión anterior seguía publicada; ya nadie la llama.
-- =============================================================================

drop function public.mantenimientos_pendientes(uuid);

notify pgrst, 'reload schema';
