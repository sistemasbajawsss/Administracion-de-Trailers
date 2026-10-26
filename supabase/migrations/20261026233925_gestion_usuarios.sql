-- =============================================================================
-- Sección 5A — Gestión de usuarios
-- El alta y el cambio de contraseña los hace el servidor con la service_role
-- (Auth Admin API). Aquí: la lista para el admin y las protecciones de admins.
-- =============================================================================

-- Lista de usuarios con su correo y último acceso (viven en auth.users, que no
-- se expone por la API). security definer: lee auth.users; por eso revisa adentro
-- que sea admin.
create or replace function public.listar_usuarios()
returns table (
  id uuid,
  nombre text,
  correo text,
  rol public.rol_usuario,
  activo boolean,
  created_at timestamptz,
  ultimo_acceso timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede ver los usuarios' using errcode = '42501';
  end if;

  return query
  select p.id, p.nombre, u.email::text, p.rol, p.activo, p.created_at, u.last_sign_in_at
  from public.perfiles p
  join auth.users u on u.id = p.id
  order by p.activo desc, p.nombre;
end;
$$;

revoke execute on function public.listar_usuarios() from public, anon;
grant execute on function public.listar_usuarios() to authenticated;

-- ---------------------------------------------------------------------------
-- Protección de admins (también si se intenta por la API directa):
-- - nadie se quita a sí mismo el rol de admin ni se desactiva;
-- - siempre queda al menos un admin activo.
-- id, fecha de alta y autor no cambian.
-- ---------------------------------------------------------------------------
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id = old.id;
  new.created_at = old.created_at;
  new.created_by = old.created_by;
  new.nombre = trim(new.nombre);

  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo) then
    if old.id = auth.uid() then
      raise exception 'No puedes quitarte tu propio acceso de administrador' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.perfiles p
      where p.rol = 'admin' and p.activo and p.id <> old.id
    ) then
      raise exception 'Debe quedar al menos un administrador activo' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.proteger_perfil() from public, anon, authenticated;

create trigger perfiles_proteger
  before update on public.perfiles
  for each row execute function public.proteger_perfil();
