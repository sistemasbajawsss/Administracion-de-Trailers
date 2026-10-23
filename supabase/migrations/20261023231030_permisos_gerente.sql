-- Permisos del rol gerente: ve todo (unidades, catálogos, servicios, gastos e
-- historial) y no escribe nada. Cierra también las escrituras que antes solo
-- pedían sesión, para que exijan rol admin o capturista.

-- ---------------------------------------------------------------------------
-- Funciones de apoyo para RLS
-- ---------------------------------------------------------------------------
create or replace function public.puede_ver_todo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('admin', 'gerente'), false)
$$;

create or replace function public.puede_capturar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('admin', 'capturista'), false)
$$;

revoke execute on function public.puede_ver_todo() from public, anon;
revoke execute on function public.puede_capturar() from public, anon;
grant execute on function public.puede_ver_todo() to authenticated;
grant execute on function public.puede_capturar() to authenticated;

-- El rol al crear un usuario también acepta 'gerente' (sigue viniendo solo de raw_app_meta_data).
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
      when new.raw_app_meta_data ->> 'rol' in ('admin', 'capturista', 'gerente')
        then (new.raw_app_meta_data ->> 'rol')::public.rol_usuario
      else 'capturista'
    end,
    auth.uid()
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogos: el gerente también ve inactivos y unidades de baja (para el historial).
-- ---------------------------------------------------------------------------
drop policy "choferes: leer" on public.choferes;
create policy "choferes: leer"
  on public.choferes for select to authenticated
  using (activo or (select public.puede_ver_todo()));

drop policy "unidades: leer" on public.unidades;
create policy "unidades: leer"
  on public.unidades for select to authenticated
  using (estatus <> 'baja' or (select public.puede_ver_todo()));

drop policy "categorias: leer" on public.categorias;
create policy "categorias: leer"
  on public.categorias for select to authenticated
  using (activo or (select public.puede_ver_todo()));

drop policy "proveedores: leer" on public.proveedores;
create policy "proveedores: leer"
  on public.proveedores for select to authenticated
  using (activo or (select public.puede_ver_todo()));

-- Alta rápida de proveedor: solo quien captura (ya no cualquier sesión).
drop policy "proveedores: crear" on public.proveedores;
create policy "proveedores: crear"
  on public.proveedores for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.puede_capturar())
    and (activo or (select public.es_admin()))
  );

-- ---------------------------------------------------------------------------
-- Servicios
-- ---------------------------------------------------------------------------
drop policy "servicios: leer" on public.servicios;
create policy "servicios: leer"
  on public.servicios for select to authenticated
  using (
    (select public.puede_ver_todo())
    or (created_by = (select auth.uid()) and (select public.puede_capturar()))
  );

drop policy "servicios: crear" on public.servicios;
create policy "servicios: crear"
  on public.servicios for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.puede_capturar()));

drop policy "servicios: editar" on public.servicios;
create policy "servicios: editar"
  on public.servicios for update to authenticated
  using (
    (select public.es_admin())
    or (created_by = (select auth.uid()) and (select public.puede_capturar()))
  )
  with check (
    (select public.es_admin())
    or (created_by = (select auth.uid()) and (select public.puede_capturar()))
  );

-- ---------------------------------------------------------------------------
-- Gastos: se leen junto con su servicio; se escriben solo si el servicio es editable
-- por quien escribe (el gerente ve servicios ajenos, pero no los puede tocar).
-- ---------------------------------------------------------------------------
drop policy "gastos: crear" on public.gastos;
drop policy "gastos: editar" on public.gastos;
drop policy "gastos: quitar" on public.gastos;

create policy "gastos: crear"
  on public.gastos for insert to authenticated
  with check (exists (
    select 1 from public.servicios s
    where s.id = servicio_id
      and ((select public.es_admin())
           or (s.created_by = (select auth.uid()) and (select public.puede_capturar())))
  ));

create policy "gastos: editar"
  on public.gastos for update to authenticated
  using (exists (
    select 1 from public.servicios s
    where s.id = servicio_id
      and ((select public.es_admin())
           or (s.created_by = (select auth.uid()) and (select public.puede_capturar())))
  ))
  with check (exists (
    select 1 from public.servicios s
    where s.id = servicio_id
      and ((select public.es_admin())
           or (s.created_by = (select auth.uid()) and (select public.puede_capturar())))
  ));

create policy "gastos: quitar"
  on public.gastos for delete to authenticated
  using (exists (
    select 1 from public.servicios s
    where s.id = servicio_id
      and ((select public.es_admin())
           or (s.created_by = (select auth.uid()) and (select public.puede_capturar())))
  ));

-- ---------------------------------------------------------------------------
-- Historial
-- ---------------------------------------------------------------------------
drop policy "historial: leer" on public.historial_cambios;
create policy "historial: leer"
  on public.historial_cambios for select to authenticated
  using (
    (select public.puede_ver_todo())
    or (dueno_id = (select auth.uid()) and (select public.puede_capturar()))
  );
