-- Eliminación completa de una unidad (D5): borra la unidad, sus servicios, sus
-- gastos y su línea de cambios. Solo admin y con la confirmación escrita
-- "ELIMINAR REGISTRO". Es la única vía para borrar historial.
-- Deja un renglón en la bitácora de eliminaciones (quién, cuándo y qué tenía).

-- ---------------------------------------------------------------------------
-- Bitácora de eliminaciones (solo la escribe eliminar_unidad; nadie la edita ni borra)
-- ---------------------------------------------------------------------------
create table public.bitacora_eliminaciones (
  id bigint generated always as identity primary key,
  unidad_id uuid not null,
  numero_economico text not null,
  tipo public.tipo_unidad not null,
  num_servicios integer not null,
  num_gastos integer not null,
  total numeric(12, 2) not null,
  created_by uuid references auth.users (id) on delete set null,
  autor_nombre text,
  created_at timestamptz not null default now()
);

comment on table public.bitacora_eliminaciones is 'Unidades eliminadas por completo: qué eran, cuánto tenían registrado, quién y cuándo.';

create index bitacora_eliminaciones_fecha_idx on public.bitacora_eliminaciones (created_at desc);

alter table public.bitacora_eliminaciones enable row level security;
revoke all on public.bitacora_eliminaciones from anon;
revoke insert, update, delete, truncate on public.bitacora_eliminaciones from authenticated;

create policy "bitacora eliminaciones: admin lee"
  on public.bitacora_eliminaciones for select to authenticated
  using ((select public.es_admin()));

-- ---------------------------------------------------------------------------
-- eliminar_unidad
-- security definer: borra historial (que nadie más puede borrar) y unidades
-- (que no tienen política de delete). Por eso revisa el rol y la confirmación
-- adentro, aunque la app ya lo haya hecho.
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_unidad(p_unidad_id uuid, p_confirmacion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_tipo public.tipo_unidad;
  v_servicios uuid[];
  v_servicio_id uuid;
  v_num_gastos integer;
  v_total numeric(12, 2);
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede eliminar unidades' using errcode = '42501';
  end if;

  if p_confirmacion is distinct from 'ELIMINAR REGISTRO' then
    raise exception 'Escribe ELIMINAR REGISTRO para confirmar' using errcode = '23514';
  end if;

  select u.numero_economico, u.tipo into v_numero, v_tipo
  from public.unidades u
  where u.id = p_unidad_id
  for update;

  if not found then
    raise exception 'No se encontró la unidad' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(s.id), '{}') into v_servicios
  from public.servicios s
  where s.unidad_id = p_unidad_id;

  select count(*), coalesce(sum(g.monto), 0) into v_num_gastos, v_total
  from public.gastos g
  where g.servicio_id = any (v_servicios);

  insert into public.bitacora_eliminaciones (
    unidad_id, numero_economico, tipo, num_servicios, num_gastos, total, created_by, autor_nombre
  )
  values (
    p_unidad_id,
    v_numero,
    v_tipo,
    coalesce(array_length(v_servicios, 1), 0),
    v_num_gastos,
    v_total,
    auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  );

  -- Los triggers de historial exigen motivo al borrar servicios; después se borra
  -- todo el historial de esos servicios, incluidos los renglones recién creados.
  -- Un delete por servicio: el trigger marca qué servicio se elimina para omitir
  -- sus gastos borrados en cascada, y esa marca es de uno a la vez.
  perform set_config('app.motivo', 'Eliminación completa de la unidad ' || v_numero, true);
  foreach v_servicio_id in array v_servicios loop
    delete from public.servicios where id = v_servicio_id;
  end loop;
  delete from public.historial_cambios where servicio_id = any (v_servicios);
  delete from public.unidades where id = p_unidad_id;
end;
$$;

revoke execute on function public.eliminar_unidad(uuid, text) from public, anon;
grant execute on function public.eliminar_unidad(uuid, text) to authenticated;
