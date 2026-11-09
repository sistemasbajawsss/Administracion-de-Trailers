-- =============================================================================
-- Ajuste de la 5E (2026-11-06): cada estancia en taller sabe qué servicio le dio
-- la salida, y una vista da el total y el número de servicios de cada estancia
-- (ficha de la unidad). Solo agrega: servicios, gastos y totales no cambian.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Servicio que dio la salida (null: salida con "Dar salida", por venta, o el
--    servicio se eliminó).
-- ---------------------------------------------------------------------------
alter table public.entradas_taller
  add column servicio_salida_id uuid references public.servicios (id) on delete set null;

create index entradas_taller_servicio_salida_idx on public.entradas_taller (servicio_salida_id)
  where servicio_salida_id is not null;

-- ---------------------------------------------------------------------------
-- 2. dar_salida_taller: recibe el servicio (opcional). Se reemplaza la versión de
--    3 argumentos para que la API no tenga dos; llamada como antes, igual.
--    Copia de 20261106201328_entradas_taller.sql + el servicio.
-- ---------------------------------------------------------------------------
drop function public.dar_salida_taller(uuid, date, text);

create function public.dar_salida_taller(
  p_entrada_id uuid,
  p_fecha date,
  p_nota text default null,
  p_servicio_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(trim(p_nota), '');
  v_unidad_id uuid;
  v_entrada date;
  v_salida date;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para dar salida de taller' using errcode = '42501';
  end if;
  if v_nota is not null and length(v_nota) > 1000 then
    raise exception 'La nota puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;

  select e.unidad_id, e.fecha_entrada, e.fecha_salida into v_unidad_id, v_entrada, v_salida
  from public.entradas_taller e
  where e.id = p_entrada_id
  for update;

  if not found then
    raise exception 'La entrada a taller no existe' using errcode = 'P0002';
  end if;
  if v_salida is not null then
    raise exception 'Esta unidad ya salió de taller' using errcode = '23514';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha de salida no puede ser futura' using errcode = '23514';
  end if;
  if p_fecha < v_entrada then
    raise exception 'La salida no puede ser antes de la entrada (%)', to_char(v_entrada, 'DD/MM/YYYY') using errcode = '23514';
  end if;
  -- El servicio tiene que ser de esta misma estancia.
  if p_servicio_id is not null and not exists (
    select 1 from public.servicios s where s.id = p_servicio_id and s.entrada_taller_id = p_entrada_id
  ) then
    raise exception 'Ese servicio no es de esta estancia en taller' using errcode = '23514';
  end if;

  update public.entradas_taller
  set fecha_salida = p_fecha,
      nota_salida = v_nota,
      salida_by = auth.uid(),
      salida_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid()),
      servicio_salida_id = p_servicio_id
  where id = p_entrada_id;

  perform set_config('app.cambio_taller', v_unidad_id::text, true);
  update public.unidades set estatus = 'activo' where id = v_unidad_id;
  perform set_config('app.cambio_taller', '', true);
end;
$$;

revoke execute on function public.dar_salida_taller(uuid, date, text, uuid) from public, anon;
grant execute on function public.dar_salida_taller(uuid, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. registrar_servicio / actualizar_servicio: pasan su servicio al dar la salida.
--    Copias de 20261106205646_servicios_taller.sql; solo cambia esa llamada.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_servicio(
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_proveedor_id uuid,
  p_descripcion text,
  p_gastos jsonb,
  p_salida_taller boolean default false,
  p_motivo_sin_entrada text default null,
  p_entrada_fecha date default null,
  p_entrada_falla text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_entrada uuid;
begin
  if jsonb_typeof(p_gastos) is distinct from 'array' or jsonb_array_length(p_gastos) = 0 then
    raise exception 'Agrega al menos un gasto' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_motivo_sin_entrada, ''))) > 300 then
    raise exception 'El motivo puede tener hasta 300 caracteres' using errcode = '23514';
  end if;

  -- "Se olvidó la entrada": primero la entrada, para que el servicio se ligue a ella.
  if p_entrada_fecha is not null then
    if p_entrada_fecha > p_fecha then
      raise exception 'La entrada a taller no puede ser después del servicio' using errcode = '23514';
    end if;
    perform public.registrar_entrada_taller(p_unidad_id, p_entrada_fecha, p_entrada_falla);
  end if;

  insert into public.servicios (unidad_id, fecha, kilometraje, proveedor_id, descripcion, motivo_sin_entrada)
  values (p_unidad_id, p_fecha, p_kilometraje, p_proveedor_id, p_descripcion, p_motivo_sin_entrada)
  returning id, entrada_taller_id into v_id, v_entrada;

  perform set_config('app.servicio_nuevo', v_id::text, true);

  insert into public.gastos (servicio_id, categoria_id, concepto, moneda, monto, monto_usd, tipo_cambio)
  select
    v_id,
    (x ->> 'categoria_id')::uuid,
    x ->> 'concepto',
    coalesce((x ->> 'moneda')::public.moneda, 'MXN'),
    (x ->> 'monto')::numeric,
    (x ->> 'monto_usd')::numeric,
    (x ->> 'tipo_cambio')::numeric
  from jsonb_array_elements(p_gastos) as x;

  -- Casilla "sale de taller con este servicio": la salida es la fecha del servicio.
  if coalesce(p_salida_taller, false) and v_entrada is not null then
    perform public.dar_salida_taller(v_entrada, p_fecha, 'Salió con el servicio del ' || to_char(p_fecha, 'DD/MM/YYYY'), v_id);
  end if;

  return v_id;
end;
$$;

create or replace function public.actualizar_servicio(
  p_servicio_id uuid,
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_proveedor_id uuid,
  p_descripcion text,
  p_gastos jsonb,
  p_motivo text,
  p_salida_taller boolean default false,
  p_motivo_sin_entrada text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entrada uuid;
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

  perform set_config('app.motivo', trim(p_motivo), true);

  update public.servicios
  set unidad_id = p_unidad_id,
      fecha = p_fecha,
      kilometraje = p_kilometraje,
      proveedor_id = p_proveedor_id,
      descripcion = p_descripcion,
      -- Sin motivo nuevo se conserva el que tenía (preparar_servicio lo borra si queda ligado).
      motivo_sin_entrada = coalesce(nullif(trim(p_motivo_sin_entrada), ''), motivo_sin_entrada)
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

-- ---------------------------------------------------------------------------
-- 4. Total y número de servicios de cada estancia (sumados en la BD).
--    security_invoker: cada quien ve lo que su RLS le deja ver.
-- ---------------------------------------------------------------------------
create view public.entradas_taller_resumen
with (security_invoker = true)
as
select
  e.id,
  e.unidad_id,
  e.fecha_entrada,
  e.fecha_salida,
  e.falla,
  e.reporta_nombre,
  e.nota_salida,
  e.salida_nombre,
  e.servicio_salida_id,
  e.created_at,
  coalesce(x.num_servicios, 0)::integer as num_servicios,
  coalesce(x.total, 0)::numeric(12, 2) as total
from public.entradas_taller e
left join lateral (
  select count(distinct s.id) as num_servicios, sum(g.monto) as total
  from public.servicios s
  left join public.gastos g on g.servicio_id = s.id
  where s.entrada_taller_id = e.id
) x on true;

revoke all on public.entradas_taller_resumen from anon;
grant select on public.entradas_taller_resumen to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Salidas de antes de esta migración que se dieron con un servicio: se liga
--    el servicio de esa estancia con la fecha de salida (el más reciente).
-- ---------------------------------------------------------------------------
update public.entradas_taller e
set servicio_salida_id = (
  select s.id from public.servicios s
  where s.entrada_taller_id = e.id and s.fecha = e.fecha_salida
  order by s.created_at desc limit 1
)
where e.fecha_salida is not null
  and e.servicio_salida_id is null
  and e.nota_salida like 'Salió con el servicio del %';

notify pgrst, 'reload schema';