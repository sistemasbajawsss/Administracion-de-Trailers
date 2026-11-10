-- =============================================================================
-- Sección 5F — Agregar un mantenimiento a varias unidades a la vez (2026-11-10)
--
-- En el modal de "Agregar" de la ficha, el admin puede aplicar el mismo
-- mantenimiento a otras unidades (algunas o todas). Reemplaza en la pantalla a
-- "Copiar de otra unidad" (copiar_mantenimientos se queda en la BD, sin uso).
--
-- agregar_mantenimiento: todo en una transacción.
--   - En la unidad de la ficha cuenta desde la fecha y el km que se escribieron.
--   - En las otras cuenta desde hoy y su kilometraje actual.
--   - Si una ya tiene uno activo con el mismo nombre, se salta.
--   - A una caja, o a una unidad sin kilometraje, solo pasa la parte por meses;
--     si el mantenimiento es solo por km, se salta.
--   - Las de baja o vendidas se saltan.
-- Regresa una fila por unidad con lo que pasó, para avisarle al admin.
--
-- Solo agrega: no cambia tablas ni funciones existentes.
-- =============================================================================

create or replace function public.agregar_mantenimiento(
  p_unidad_id uuid,
  p_nombre text,
  p_cada_km integer,
  p_cada_meses smallint,
  p_desde_fecha date,
  p_desde_km integer,
  p_otras uuid[] default '{}'
)
returns table (unidad_id uuid, numero_economico text, resultado text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Tijuana')::date;
  v_nombre text := trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_cada_km integer;
  v_km integer;
  u record;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar los mantenimientos' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_otras, '{}')) > 200 then
    raise exception 'Demasiadas unidades a la vez' using errcode = '23514';
  end if;

  -- La unidad de la ficha: como siempre (el trigger y las reglas de la tabla validan).
  select x.id, x.numero_economico, x.estatus into u from public.unidades x where x.id = p_unidad_id;
  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  if u.estatus in ('baja', 'vendida') then
    raise exception 'La unidad está de baja o vendida: ya no se le programan mantenimientos' using errcode = '23514';
  end if;
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  values (p_unidad_id, v_nombre, p_cada_km, p_cada_meses, p_desde_fecha, p_desde_km);
  unidad_id := u.id; numero_economico := u.numero_economico; resultado := 'agregado';
  return next;

  -- Las otras, en el orden de la lista de unidades.
  for u in
    select x.id, x.numero_economico, x.tipo, x.estatus
    from public.unidades x
    where x.id = any (coalesce(p_otras, '{}')) and x.id <> p_unidad_id
    order by x.tipo, x.numero_orden, x.numero_economico
  loop
    unidad_id := u.id; numero_economico := u.numero_economico;

    if u.estatus in ('baja', 'vendida') then
      resultado := 'retirada'; return next; continue;
    end if;
    if exists (
      select 1 from public.mantenimientos_unidad d
      where d.unidad_id = u.id and d.activo and lower(d.nombre) = lower(v_nombre)
    ) then
      resultado := 'ya_tiene'; return next; continue;
    end if;

    v_cada_km := p_cada_km;
    v_km := null;
    if v_cada_km is not null then
      if u.tipo = 'caja' then
        v_cada_km := null;
      else
        select k.kilometraje into v_km from public.kilometraje_unidades(u.id) k;
        if v_km is null then v_cada_km := null; end if;
      end if;
    end if;

    if v_cada_km is null and p_cada_meses is null then
      resultado := case when u.tipo = 'caja' then 'caja_solo_km' else 'sin_kilometraje' end;
      return next; continue;
    end if;

    insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
    values (u.id, v_nombre, v_cada_km, p_cada_meses, v_hoy, v_km);
    resultado := case when v_cada_km is distinct from p_cada_km then 'solo_meses' else 'agregado' end;
    return next;
  end loop;
end;
$$;

revoke execute on function public.agregar_mantenimiento(uuid, text, integer, smallint, date, integer, uuid[]) from public, anon;
grant execute on function public.agregar_mantenimiento(uuid, text, integer, smallint, date, integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
