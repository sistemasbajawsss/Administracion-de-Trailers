-- Eliminar para siempre un servicio que ya está eliminado (solo admin, con la
-- confirmación escrita "ELIMINAR REGISTRO"). Borra su copia y toda su línea de
-- cambios; deja una nota en la bitácora de eliminaciones.

-- ---------------------------------------------------------------------------
-- La bitácora ahora registra unidades y servicios.
-- ---------------------------------------------------------------------------
alter table public.bitacora_eliminaciones
  add column tipo_registro text not null default 'unidad'
    check (tipo_registro in ('unidad', 'servicio')),
  add column servicio_id uuid,
  add column fecha_servicio date,
  add constraint bitacora_servicio_completo
    check (tipo_registro = 'unidad' or (servicio_id is not null and fecha_servicio is not null));

comment on table public.bitacora_eliminaciones is
  'Unidades y servicios eliminados para siempre: qué eran, cuánto tenían registrado, quién y cuándo.';

-- ---------------------------------------------------------------------------
-- eliminar_servicio_definitivo
-- security definer: borra historial, que nadie más puede borrar. Revisa adentro
-- el rol, la confirmación y que el servicio siga eliminado (no restaurado).
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_servicio_definitivo(p_historial_id bigint, p_confirmacion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datos jsonb;
  v_servicio_id uuid;
  v_numero text;
  v_tipo public.tipo_unidad;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede eliminar servicios para siempre' using errcode = '42501';
  end if;

  if p_confirmacion is distinct from 'ELIMINAR REGISTRO' then
    raise exception 'Escribe ELIMINAR REGISTRO para confirmar' using errcode = '23514';
  end if;

  select h.datos_anteriores, h.servicio_id into v_datos, v_servicio_id
  from public.historial_cambios h
  where h.id = p_historial_id and h.tabla = 'servicios' and h.accion = 'delete';

  if v_datos is null then
    raise exception 'No se encontró el servicio eliminado' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.servicios s where s.id = v_servicio_id) then
    raise exception 'Ese servicio está activo: elimínalo primero' using errcode = '23514';
  end if;

  select u.numero_economico, u.tipo into v_numero, v_tipo
  from public.unidades u
  where u.id = (v_datos ->> 'unidad_id')::uuid;

  -- Si la unidad se hubiera eliminado, su historial (y esta copia) ya no existiría.
  if v_numero is null then
    raise exception 'La unidad de ese servicio ya no existe' using errcode = 'P0002';
  end if;

  insert into public.bitacora_eliminaciones (
    tipo_registro, unidad_id, numero_economico, tipo, servicio_id, fecha_servicio,
    num_servicios, num_gastos, total, created_by, autor_nombre
  )
  values (
    'servicio',
    (v_datos ->> 'unidad_id')::uuid,
    v_numero,
    v_tipo,
    v_servicio_id,
    (v_datos ->> 'fecha')::date,
    1,
    coalesce(jsonb_array_length(v_datos -> 'gastos'), 0),
    (select coalesce(sum((g ->> 'monto')::numeric), 0)
     from jsonb_array_elements(coalesce(v_datos -> 'gastos', '[]'::jsonb)) as g),
    auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  );

  delete from public.historial_cambios where servicio_id = v_servicio_id;
end;
$$;

revoke execute on function public.eliminar_servicio_definitivo(bigint, text) from public, anon;
grant execute on function public.eliminar_servicio_definitivo(bigint, text) to authenticated;
