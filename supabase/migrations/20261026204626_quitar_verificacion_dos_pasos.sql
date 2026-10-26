-- =============================================================================
-- Sección 2.5 — Se quita la verificación en dos pasos (decisión del usuario,
-- 2026-10-26). rol_actual() vuelve a no revisar aal2: todos los roles entran
-- solo con contraseña. Las políticas de lectura de catálogos de la migración
-- anterior se quedan: siguen exigiendo tener rol (bloquean a desactivados).
-- =============================================================================

create or replace function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol
  from public.perfiles p
  where p.id = auth.uid()
    and p.activo
$$;

revoke execute on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;
