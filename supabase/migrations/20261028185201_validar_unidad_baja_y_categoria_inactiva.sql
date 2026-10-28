-- =============================================================================
-- Corrección (encontrada en las pruebas de capturista, 2026-10-28)
-- 1. preparar_servicio: fuera de una restauración, app.servicio_restaurado no
--    existe y current_setting(..., true) regresa NULL; "NULL = id" daba NULL y
--    la validación de unidad dada de baja nunca se cumplía (para ningún rol).
--    Ahora se compara contra '' cuando no existe.
-- 2. preparar_gasto: la BD no impedía usar una categoría desactivada. Ahora se
--    rechaza al agregar un gasto o al cambiarle la categoría; editar otra cosa
--    de un gasto viejo con esa categoría sigue funcionando, y restaurar un
--    servicio eliminado también (es historial).
-- =============================================================================

create or replace function public.preparar_servicio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_tipo public.tipo_unidad;
  v_estatus public.estatus_unidad;
  v_restaurando boolean := false;
  v_validar_unidad boolean := tg_op = 'INSERT';
begin
  new.descripcion = nullif(trim(new.descripcion), '');

  if tg_op = 'INSERT' then
    -- coalesce: sin restauración en curso el ajuste no existe (NULL).
    v_restaurando = coalesce(current_setting('app.servicio_restaurado', true), '') = new.id::text;
    if not v_restaurando then
      new.created_by = auth.uid();
    end if;
    -- Restaurar a una unidad que hoy está de baja es válido: es historial.
    v_validar_unidad = not v_restaurando;
  else
    -- Campos que no se pueden cambiar al editar.
    new.created_by = old.created_by;
    new.created_at = old.created_at;
    new.updated_by = auth.uid();
    v_validar_unidad = new.unidad_id is distinct from old.unidad_id;
  end if;

  select u.numero_economico, u.tipo, u.estatus
    into v_numero, v_tipo, v_estatus
  from public.unidades u
  where u.id = new.unidad_id;

  if v_validar_unidad and v_estatus = 'baja' then
    raise exception 'La unidad % está dada de baja', v_numero using errcode = '23514';
  end if;

  -- Las cajas no tienen odómetro.
  if v_tipo = 'caja' then
    new.kilometraje = null;
  end if;

  if new.fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha del servicio no puede ser futura' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.preparar_gasto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_activa boolean;
  v_restaurando boolean := tg_op = 'INSERT'
    and coalesce(current_setting('app.servicio_restaurado', true), '') = new.servicio_id::text;
begin
  new.concepto = nullif(trim(new.concepto), '');

  if tg_op = 'INSERT' then
    if not v_restaurando then
      new.created_by = auth.uid();
    end if;
  else
    new.servicio_id = old.servicio_id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;

  -- Categoría desactivada: no se usa en gastos nuevos ni al cambiar la categoría.
  if not v_restaurando and (tg_op = 'INSERT' or new.categoria_id is distinct from old.categoria_id) then
    select c.nombre, c.activo into v_categoria, v_activa
    from public.categorias c
    where c.id = new.categoria_id;

    if found and not v_activa then
      raise exception 'La categoría "%" está desactivada', v_categoria using errcode = '23514';
    end if;
  end if;

  if new.moneda = 'USD' then
    if new.monto_usd is null or new.monto_usd <= 0 or new.tipo_cambio is null or new.tipo_cambio <= 0 then
      raise exception 'Escribe la cantidad en dólares y el tipo de cambio' using errcode = '23514';
    end if;
    new.monto = round(new.monto_usd * new.tipo_cambio, 2);
  else
    new.monto_usd = null;
    new.tipo_cambio = null;
  end if;

  if new.concepto is null then
    select c.nombre into v_categoria
    from public.categorias c
    where c.id = new.categoria_id and c.requiere_concepto;

    if found then
      raise exception 'Escribe qué fue el gasto de "%"', v_categoria using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
