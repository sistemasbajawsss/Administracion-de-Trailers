-- 5I, Etapa 1: ediciones simultáneas.
-- Si dos personas abren el mismo servicio y las dos guardan, la segunda ya no
-- sobrescribe sin saberlo: actualizar_servicio() recibe la versión (updated_at)
-- con que se abrió el formulario y, si cambió, rechaza con quién y cuándo lo guardó.
--
-- p_version va al final y con default null: la app publicada (que no lo manda)
-- sigue funcionando igual. El cuerpo es el de producción al 2026-11-13
-- (20261110150813_donde_se_hizo.sql); solo se agrega la revisión del inicio.

drop function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[], public.lugar_servicio, uuid);

create function public.actualizar_servicio(
  p_servicio_id uuid,
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_proveedor_id uuid,
  p_descripcion text,
  p_gastos jsonb,
  p_motivo text,
  p_salida_taller boolean default false,
  p_motivo_sin_entrada text default null,
  p_tipo public.tipo_servicio default null,
  p_mantenimientos uuid[] default null,
  p_lugar public.lugar_servicio default null,
  p_taller_id uuid default null,
  p_version timestamptz default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_entrada uuid;
  v_actual timestamptz;
  v_por uuid;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo del cambio' using errcode = '23514';
  end if;
  if jsonb_typeof(p_gastos) is distinct from 'array' or jsonb_array_length(p_gastos) = 0 then
    raise exception 'Agrega al menos un gasto' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_motivo_sin_entrada, ''))) > 300 then
    raise exception 'El motivo puede tener hasta 300 caracteres' using errcode = '23514';
  end if;

  -- Ediciones simultáneas (5I): se bloquea el renglón y se compara la versión con
  -- que se abrió el formulario. PT409 = conflicto (PostgREST responde 409).
  if p_version is not null then
    select s.updated_at, s.updated_by into v_actual, v_por
    from public.servicios s
    where s.id = p_servicio_id
    for update;
    if found and v_actual is distinct from p_version then
      raise exception 'Otra persona guardó este servicio mientras lo editabas'
        using errcode = 'PT409',
              detail = json_build_object('por', public.nombre_usuario(v_por), 'a', v_actual)::text;
    end if;
  end if;

  perform set_config('app.motivo', trim(p_motivo), true);

  update public.servicios
  set unidad_id = p_unidad_id,
      fecha = p_fecha,
      kilometraje = p_kilometraje,
      proveedor_id = p_proveedor_id,
      descripcion = p_descripcion,
      -- Sin motivo nuevo se conserva el que tenía (preparar_servicio lo borra si queda ligado).
      motivo_sin_entrada = coalesce(nullif(trim(p_motivo_sin_entrada), ''), motivo_sin_entrada),
      -- Sin tipo (app de antes), se conserva el que tenía.
      tipo = coalesce(p_tipo, tipo),
      -- Sin lista (app de antes), se conserva la que tenía.
      mantenimientos = coalesce(p_mantenimientos, mantenimientos),
      -- Sin lugar (app de antes), se conservan el lugar y el taller que tenía.
      lugar = coalesce(p_lugar, lugar),
      taller_id = case when p_lugar is null then taller_id else p_taller_id end
  where id = p_servicio_id
  returning entrada_taller_id into v_entrada;

  if not found then
    raise exception 'No se encontró el servicio' using errcode = 'P0002';
  end if;

  -- Un renglón con id debe ser de este servicio (si no, se borraban todos los reales).
  if exists (
    select 1
    from jsonb_array_elements(p_gastos) as x
    where nullif(x ->> 'id', '') is not null
      and not exists (
        select 1 from public.gastos g
        where g.id = (x ->> 'id')::uuid and g.servicio_id = p_servicio_id
      )
  ) then
    raise exception 'Un gasto no pertenece a este servicio' using errcode = '23514';
  end if;

  -- Renglones que ya no vienen: se quitan.
  delete from public.gastos g
  where g.servicio_id = p_servicio_id
    and g.id not in (
      select (x ->> 'id')::uuid
      from jsonb_array_elements(p_gastos) as x
      where nullif(x ->> 'id', '') is not null
    );

  -- Renglones existentes: se actualizan (si no cambió nada, el historial no los registra).
  -- En dólares, preparar_gasto() recalcula el monto en pesos.
  update public.gastos g
  set categoria_id = (x ->> 'categoria_id')::uuid,
      concepto = x ->> 'concepto',
      moneda = coalesce((x ->> 'moneda')::public.moneda, 'MXN'),
      monto = coalesce((x ->> 'monto')::numeric, g.monto),
      monto_usd = (x ->> 'monto_usd')::numeric,
      tipo_cambio = (x ->> 'tipo_cambio')::numeric
  from jsonb_array_elements(p_gastos) as x
  where nullif(x ->> 'id', '') is not null
    and g.id = (x ->> 'id')::uuid
    and g.servicio_id = p_servicio_id;

  -- Renglones nuevos.
  insert into public.gastos (servicio_id, categoria_id, concepto, moneda, monto, monto_usd, tipo_cambio)
  select
    p_servicio_id,
    (x ->> 'categoria_id')::uuid,
    x ->> 'concepto',
    coalesce((x ->> 'moneda')::public.moneda, 'MXN'),
    (x ->> 'monto')::numeric,
    (x ->> 'monto_usd')::numeric,
    (x ->> 'tipo_cambio')::numeric
  from jsonb_array_elements(p_gastos) as x
  where nullif(x ->> 'id', '') is null;

  -- Casilla "sale de taller": solo si su estancia sigue abierta.
  if coalesce(p_salida_taller, false) and v_entrada is not null
     and exists (select 1 from public.entradas_taller e where e.id = v_entrada and e.fecha_salida is null) then
    perform public.dar_salida_taller(v_entrada, p_fecha, 'Salió con el servicio del ' || to_char(p_fecha, 'DD/MM/YYYY'), p_servicio_id);
  end if;
end;
$$;

revoke execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[], public.lugar_servicio, uuid, timestamptz) from public, anon;
grant execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[], public.lugar_servicio, uuid, timestamptz) to authenticated;
