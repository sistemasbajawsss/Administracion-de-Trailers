-- =============================================================================
-- Sección 2.5 — Verificación en dos pasos (D6)
-- admin y gerente solo tienen su rol si la sesión pasó el segundo paso
-- (aal2 en el JWT). Con solo la contraseña (aal1), rol_actual() regresa null
-- y todas las políticas y funciones que dependen de él (es_admin,
-- puede_ver_todo, puede_capturar) los tratan como si no tuvieran rol.
-- El capturista no cambia: entra solo con contraseña.
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
    and (
      p.rol = 'capturista'
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
$$;

-- create or replace conserva los permisos; se repiten para dejarlo explícito.
revoke execute on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;

-- ---------------------------------------------------------------------------
-- Catálogos: leer exige tener rol. Antes bastaba con tener sesión, así que un
-- admin sin segundo paso o un usuario desactivado con token vigente todavía
-- veía las unidades y catálogos activos.
-- ---------------------------------------------------------------------------
drop policy "choferes: leer" on public.choferes;
create policy "choferes: leer"
  on public.choferes for select to authenticated
  using ((select public.rol_actual()) is not null and (activo or (select public.puede_ver_todo())));

drop policy "unidades: leer" on public.unidades;
create policy "unidades: leer"
  on public.unidades for select to authenticated
  using ((select public.rol_actual()) is not null and (estatus <> 'baja' or (select public.puede_ver_todo())));

drop policy "categorias: leer" on public.categorias;
create policy "categorias: leer"
  on public.categorias for select to authenticated
  using ((select public.rol_actual()) is not null and (activo or (select public.puede_ver_todo())));

drop policy "proveedores: leer" on public.proveedores;
create policy "proveedores: leer"
  on public.proveedores for select to authenticated
  using ((select public.rol_actual()) is not null and (activo or (select public.puede_ver_todo())));
