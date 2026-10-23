-- Restaurar un servicio eliminado (solo admin) a partir de la copia que guardó
-- el historial al eliminarlo. Regresa idéntico: mismo id, capturista, fecha de
-- captura y gastos. La restauración queda en la línea de cambios con su motivo.

-- ---------------------------------------------------------------------------
-- Los triggers de preparación conservan al capturista original solo cuando el
-- alta viene de restaurar_servicio (marca de transacción app.servicio_restaurado,
-- que únicamente esa función pone). En cualquier otra alta, created_by = auth.uid().
-- ---------------------------------------------------------------------------
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
    v_restaurando = current_setting('app.servicio_restaurado', true) = new.id::text;
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
begin
  new.concepto = nullif(trim(new.concepto), '');

  if tg_op = 'INSERT' then
    if current_setting('app.servicio_restaurado', true) is distinct from new.servicio_id::text then
      new.created_by = auth.uid();
    end if;
  else
    new.servicio_id = old.servicio_id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
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

-- ---------------------------------------------------------------------------
-- restaurar_servicio
-- security definer: inserta con el capturista original (RLS lo impediría).
-- Por eso revisa adentro que sea admin.
-- ---------------------------------------------------------------------------
create or replace function public.restaurar_servicio(p_historial_id bigint, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datos jsonb;
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede restaurar servicios' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la restauración' using errcode = '23514';
  end if;

  select h.datos_anteriores into v_datos
  from public.historial_cambios h
  where h.id = p_historial_id and h.tabla = 'servicios' and h.accion = 'delete';

  if v_datos is null then
    raise exception 'No se encontró el servicio eliminado' using errcode = 'P0002';
  end if;

  v_id = (v_datos ->> 'id')::uuid;

  if exists (select 1 from public.servicios s where s.id = v_id) then
    raise exception 'Ese servicio ya fue restaurado' using errcode = '23514';
  end if;
  if not exists (select 1 from public.unidades u where u.id = (v_datos ->> 'unidad_id')::uuid) then
    raise exception 'La unidad de ese servicio ya no existe' using errcode = '23514';
  end if;

  perform set_config('app.motivo', trim(p_motivo), true);
  perform set_config('app.servicio_restaurado', v_id::text, true);

  insert into public.servicios (
    id, unidad_id, fecha, kilometraje, proveedor_id, descripcion, created_at, created_by
  )
  values (
    v_id,
    (v_datos ->> 'unidad_id')::uuid,
    (v_datos ->> 'fecha')::date,
    (v_datos ->> 'kilometraje')::integer,
    (v_datos ->> 'proveedor_id')::uuid,
    v_datos ->> 'descripcion',
    (v_datos ->> 'created_at')::timestamptz,
    (v_datos ->> 'created_by')::uuid
  );

  insert into public.gastos (id, servicio_id, categoria_id, concepto, monto, created_at, created_by)
  select
    (g ->> 'id')::uuid,
    v_id,
    (g ->> 'categoria_id')::uuid,
    g ->> 'concepto',
    (g ->> 'monto')::numeric,
    (g ->> 'created_at')::timestamptz,
    (g ->> 'created_by')::uuid
  from jsonb_array_elements(coalesce(v_datos -> 'gastos', '[]'::jsonb)) as g;

  return v_id;
end;
$$;

revoke execute on function public.restaurar_servicio(bigint, text) from public, anon;
grant execute on function public.restaurar_servicio(bigint, text) to authenticated;
