-- =============================================================================
-- Sección 5D — Cerrar las sesiones abiertas de un usuario (solo admin).
-- Se usa al restablecer su contraseña (si se filtró, el atacante ya no puede
-- renovar su sesión) y al desactivarlo. Borra sus sesiones de Auth; los tokens
-- de refresco se van en cascada. El token de acceso que ya tenga vive hasta que
-- caduca (máximo la duración configurada en Auth).
-- =============================================================================

create or replace function public.cerrar_sesiones_usuario(p_usuario uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cerradas integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cerrar sesiones de otros usuarios' using errcode = '42501';
  end if;

  delete from auth.sessions where user_id = p_usuario;
  get diagnostics v_cerradas = row_count;
  -- Tokens viejos sin sesión ligada.
  delete from auth.refresh_tokens where user_id = p_usuario::text;

  return v_cerradas;
end;
$$;

revoke execute on function public.cerrar_sesiones_usuario(uuid) from public, anon;
grant execute on function public.cerrar_sesiones_usuario(uuid) to authenticated;
