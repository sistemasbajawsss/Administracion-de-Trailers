-- Sección 0: roles, perfiles de usuario y funciones de apoyo para RLS.

-- ---------------------------------------------------------------------------
-- Enum de roles
-- ---------------------------------------------------------------------------
create type public.rol_usuario as enum ('admin', 'capturista');

-- ---------------------------------------------------------------------------
-- Función genérica para mantener updated_at
-- ---------------------------------------------------------------------------
create or replace function public.actualizar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabla perfiles (1 a 1 con auth.users)
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  rol public.rol_usuario not null default 'capturista',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

comment on table public.perfiles is 'Datos y rol de cada usuario. Se crea automáticamente al crear un usuario en auth.users.';

create trigger perfiles_actualizar_updated_at
  before update on public.perfiles
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- Funciones de apoyo para RLS
-- security definer para leer perfiles sin disparar RLS recursivamente.
-- ---------------------------------------------------------------------------
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

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() = 'admin', false)
$$;

revoke execute on function public.rol_actual() from public, anon;
revoke execute on function public.es_admin() from public, anon;
grant execute on function public.rol_actual() to authenticated;
grant execute on function public.es_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: crear el perfil al crear un usuario
-- El rol solo se toma de raw_app_meta_data (que el usuario no puede modificar);
-- si no viene o no es válido, se asigna 'capturista'.
-- ---------------------------------------------------------------------------
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, rol, created_by)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      split_part(new.email, '@', 1)
    ),
    case
      when new.raw_app_meta_data ->> 'rol' in ('admin', 'capturista')
        then (new.raw_app_meta_data ->> 'rol')::public.rol_usuario
      else 'capturista'
    end,
    auth.uid()
  );
  return new;
end;
$$;

revoke execute on function public.crear_perfil_nuevo_usuario() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ---------------------------------------------------------------------------
-- RLS
-- Sin políticas de insert ni delete: los perfiles solo los crea el trigger y
-- se eliminan en cascada al borrar el usuario de auth.users.
-- ---------------------------------------------------------------------------
alter table public.perfiles enable row level security;

create policy "perfiles: cada usuario lee el suyo"
  on public.perfiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy "perfiles: admin lee todos"
  on public.perfiles
  for select
  to authenticated
  using ((select public.es_admin()));

create policy "perfiles: admin actualiza"
  on public.perfiles
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));
