-- =============================================================================
-- Sección 5F, Etapa 4 — Un correctivo cumple mantenimientos programados (2026-11-09)
--
-- Un servicio "correctivo" puede marcarse como el cambio de aceite (u otro
-- mantenimiento) programado de su unidad: ese mantenimiento vuelve a contar
-- desde la fecha y el kilometraje del servicio. Un "servicio" o "preventivo"
-- con los mismos gastos no lo reinicia.
--
-- Diseño: la lista va en el propio servicio (servicios.mantenimientos, ids de
-- mantenimientos_unidad) y no en una tabla aparte, para que:
--   - el historial de cambios del servicio registre quién la cambió y por qué
--     (registrar_historial ya guarda la fila completa);
--   - al eliminar un servicio la copia la incluya y restaurar_servicio la regrese;
--   - fecha, kilometraje, unidad y tipo salgan siempre del servicio (no hay
--     copias que se desfasen al editarlo).
-- El cálculo (mantenimientos_pendientes) toma el correctivo más reciente que lo
-- cumplió; si no hay, cuenta desde la "última vez" capturada en el mantenimiento.
-- Es security definer para que los tres roles vean lo mismo (el capturista solo
-- ve sus propios servicios por RLS).
--
-- Compatibilidad con la app publicada: registrar_servicio y actualizar_servicio
-- reciben p_mantenimientos opcional al final (sin él, al editar se conserva).
--
-- Versiones anteriores (para regresar): registrar_servicio, actualizar_servicio
-- y restaurar_servicio en 20261109201501_tipo_servicio.sql; mantenimientos_pendientes
-- en 20261109205535_mantenimientos_unidad.sql; servicios_resumen en
-- 20261109201501_tipo_servicio.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columna e índice
-- ---------------------------------------------------------------------------
alter table public.servicios
  add column mantenimientos uuid[] not null default '{}',
  add constraint servicios_mantenimientos_max check (cardinality(mantenimientos) <= 20);

comment on column public.servicios.mantenimientos is
  'Mantenimientos programados (mantenimientos_unidad) que cumplió este correctivo (5F). Reinician su contador.';

-- El cálculo busca, por unidad, el correctivo más reciente que cumplió cada mantenimiento.
create index servicios_mantenimientos_idx on public.servicios (unidad_id, fecha desc)
  where cardinality(mantenimientos) > 0;

-- ---------------------------------------------------------------------------
-- 2. Validación (corre después de servicios_preparar, por orden de nombre)
-- ---------------------------------------------------------------------------
create or replace function public.validar_mantenimientos_servicio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurando boolean := tg_op = 'INSERT'
    and current_setting('app.servicio_restaurado', true) = new.id::text;
  v_anteriores uuid[] := case when tg_op = 'UPDATE' then old.mantenimientos else '{}'::uuid[] end;
  m record;
begin
  -- Sin repetidos ni vacíos.
  new.mantenimientos = coalesce(
    array(select distinct x from unnest(new.mantenimientos) as x where x is not null),
    '{}'::uuid[]
  );

  -- Al restaurar, se quedan solo los que siguen existiendo y son de la unidad.
  if v_restaurando then
    if new.tipo is distinct from 'correctivo' then
      new.mantenimientos = '{}';
    else
      new.mantenimientos = coalesce(
        array(
          select mu.id from public.mantenimientos_unidad mu
          where mu.id = any (new.mantenimientos) and mu.unidad_id = new.unidad_id
        ),
        '{}'::uuid[]
      );
    end if;
    return new;
  end if;

  if cardinality(new.mantenimientos) = 0 then
    return new;
  end if;

  if new.tipo is distinct from 'correctivo' then
    raise exception 'Solo un correctivo puede contar como un mantenimiento programado' using errcode = '23514';
  end if;

  for m in
    select x.id, mu.id as encontrado, mu.unidad_id, mu.nombre, mu.activo, mu.cada_km, mu.desde_fecha
    from unnest(new.mantenimientos) as x(id)
    left join public.mantenimientos_unidad mu on mu.id = x.id
  loop
    if m.encontrado is null then
      raise exception 'No se encontró el mantenimiento programado' using errcode = 'P0002';
    end if;
    if m.unidad_id <> new.unidad_id then
      raise exception 'El servicio cuenta como "%", que es de otra unidad', m.nombre using errcode = '23514';
    end if;
    -- Lo que ya estaba marcado se respeta aunque después se haya quitado o cambiado.
    if not (m.id = any (v_anteriores)) then
      if not m.activo then
        raise exception '"%" ya no está programado para esta unidad', m.nombre using errcode = '23514';
      end if;
      if new.fecha < m.desde_fecha then
        raise exception '"%" cuenta desde el %; este servicio es anterior', m.nombre, to_char(m.desde_fecha, 'DD/MM/YYYY')
          using errcode = '23514';
      end if;
    end if;
    if m.cada_km is not null and new.kilometraje is null then
      raise exception 'Escribe el kilometraje: "%" va por kilometraje', m.nombre using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.validar_mantenimientos_servicio() from public, anon, authenticated;

create trigger servicios_validar_mantenimientos
  before insert or update on public.servicios
  for each row execute function public.validar_mantenimientos_servicio();

-- ---------------------------------------------------------------------------
-- 3. servicios_resumen: la lista al final (create or replace view lo permite)
-- Copia de 20261109201501_tipo_servicio.sql + mantenimientos.
-- ---------------------------------------------------------------------------
create or replace view public.servicios_resumen
with (security_invoker = true)
as
select
  s.id,
  s.unidad_id,
  s.fecha,
  s.kilometraje,
  s.proveedor_id,
  s.descripcion,
  s.created_at,
  s.updated_at,
  s.created_by,
  s.updated_by,
  coalesce(g.total, 0)::numeric(12, 2) as total,
  coalesce(g.num_gastos, 0)::integer as num_gastos,
  exists (
    select 1 from public.historial_cambios h
    where h.servicio_id = s.id and h.motivo is not null
  ) as editado,
  (select count(*) from public.comprobantes c where c.servicio_id = s.id)::integer as num_comprobantes,
  public.nombre_usuario(s.created_by) as autor_nombre,
  s.entrada_taller_id,
  s.sin_entrada_taller,
  s.motivo_sin_entrada,
  s.tipo,
  s.mantenimientos
from public.servicios s
left join lateral (
  select sum(x.monto) as total, count(*) as num_gastos
  from public.gastos x
  where x.servicio_id = s.id
) g on true;

-- ---------------------------------------------------------------------------
-- 4. registrar_servicio: mantenimientos que cumple (opcional)
-- Copia de 20261109201501_tipo_servicio.sql + p_mantenimientos.
-- ---------------------------------------------------------------------------
drop function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio);

create function public.registrar_servicio(
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_proveedor_id uuid,
  p_descripcion text,
  p_gastos jsonb,
  p_salida_taller boolean default false,
  p_motivo_sin_entrada text default null,
  p_entrada_fecha date default null,
  p_entrada_falla text default null,
  p_tipo public.tipo_servicio default null,
  p_mantenimientos uuid[] default null
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
    perform public.registrar_entrada_taller(p_unidad_id, p_entrada_fecha, p_entrada_falla, p_kilometraje);
  end if;

  insert into public.servicios (
    unidad_id, fecha, kilometraje, proveedor_id, descripcion, motivo_sin_entrada, tipo, mantenimientos
  )
  values (
    p_unidad_id, p_fecha, p_kilometraje, p_proveedor_id, p_descripcion, p_motivo_sin_entrada, p_tipo,
    coalesce(p_mantenimientos, '{}')
  )
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

-- ---------------------------------------------------------------------------
-- 5. actualizar_servicio: mantenimientos (sin la lista, se conserva la que tenía)
-- Copia de 20261109201501_tipo_servicio.sql + p_mantenimientos.
-- ---------------------------------------------------------------------------
drop function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio);

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
  p_mantenimientos uuid[] default null
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
      motivo_sin_entrada = coalesce(nullif(trim(p_motivo_sin_entrada), ''), motivo_sin_entrada),
      -- Sin tipo (app de antes), se conserva el que tenía.
      tipo = coalesce(p_tipo, tipo),
      -- Sin lista (app de antes), se conserva la que tenía.
      mantenimientos = coalesce(p_mantenimientos, mantenimientos)
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

revoke execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio, uuid[]) from public, anon;
revoke execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[]) from public, anon;
grant execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio, uuid[]) to authenticated;
grant execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. restaurar_servicio: también regresa los mantenimientos que cumplía
-- Copia de 20261109201501_tipo_servicio.sql + mantenimientos (las copias de
-- antes no los traen: queda vacío). El trigger quita los que ya no existen.
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
    id, unidad_id, fecha, kilometraje, proveedor_id, descripcion, created_at, created_by,
    entrada_taller_id, sin_entrada_taller, motivo_sin_entrada, tipo, mantenimientos
  )
  values (
    v_id,
    (v_datos ->> 'unidad_id')::uuid,
    (v_datos ->> 'fecha')::date,
    (v_datos ->> 'kilometraje')::integer,
    (v_datos ->> 'proveedor_id')::uuid,
    v_datos ->> 'descripcion',
    (v_datos ->> 'created_at')::timestamptz,
    (v_datos ->> 'created_by')::uuid,
    (v_datos ->> 'entrada_taller_id')::uuid,
    (v_datos ->> 'sin_entrada_taller')::boolean,
    v_datos ->> 'motivo_sin_entrada',
    (v_datos ->> 'tipo')::public.tipo_servicio,
    coalesce(
      array(select x::uuid from jsonb_array_elements_text(coalesce(v_datos -> 'mantenimientos', '[]'::jsonb)) as x),
      '{}'::uuid[]
    )
  );

  insert into public.gastos (
    id, servicio_id, categoria_id, concepto, moneda, monto, monto_usd, tipo_cambio, created_at, created_by
  )
  select
    (g ->> 'id')::uuid,
    v_id,
    (g ->> 'categoria_id')::uuid,
    g ->> 'concepto',
    coalesce((g ->> 'moneda')::public.moneda, 'MXN'),
    (g ->> 'monto')::numeric,
    (g ->> 'monto_usd')::numeric,
    (g ->> 'tipo_cambio')::numeric,
    (g ->> 'created_at')::timestamptz,
    (g ->> 'created_by')::uuid
  from jsonb_array_elements(coalesce(v_datos -> 'gastos', '[]'::jsonb)) as g;

  insert into public.comprobantes (
    id, servicio_id, ruta_archivo, tipo_mime, tamano_bytes, hash_sha256, nombre_archivo, created_at, created_by
  )
  select
    (c ->> 'id')::uuid,
    v_id,
    c ->> 'ruta_archivo',
    c ->> 'tipo_mime',
    (c ->> 'tamano_bytes')::integer,
    c ->> 'hash_sha256',
    c ->> 'nombre_archivo',
    (c ->> 'created_at')::timestamptz,
    (c ->> 'created_by')::uuid
  from jsonb_array_elements(coalesce(v_datos -> 'comprobantes', '[]'::jsonb)) as c;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. mantenimientos_pendientes: cuenta desde el último correctivo que lo cumplió
-- Cambia lo que regresa (ultima_fecha, ultimo_km, ultimo_servicio_id al final):
-- se borra y se vuelve a crear. Security definer: el capturista no ve los
-- servicios de otros, pero el contador debe ser el mismo para todos.
-- ---------------------------------------------------------------------------
drop function public.mantenimientos_pendientes(uuid);

create function public.mantenimientos_pendientes(p_unidad_id uuid default null)
returns table (
  id uuid,
  unidad_id uuid,
  nombre text,
  cada_km integer,
  cada_meses smallint,
  desde_fecha date,
  desde_km integer,
  km_actual integer,
  proximo_km integer,
  proxima_fecha date,
  faltan_km integer,
  faltan_dias integer,
  estado text,
  ultima_fecha date,
  ultimo_km integer,
  ultimo_servicio_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  hoy as (select (now() at time zone 'America/Tijuana')::date as d),
  km as (select k.unidad_id, k.kilometraje from public.kilometraje_unidades(p_unidad_id) k),
  ultima as (
    select
      m.id, m.unidad_id, m.nombre, m.cada_km, m.cada_meses, m.desde_fecha, m.desde_km,
      f.id as f_id, f.fecha as f_fecha, f.kilometraje as f_km
    from public.mantenimientos_unidad m
    left join lateral (
      -- El correctivo más reciente que lo cumplió (desde la última vez capturada).
      select s.id, s.fecha, s.kilometraje
      from public.servicios s
      where s.unidad_id = m.unidad_id
        and cardinality(s.mantenimientos) > 0
        and m.id = any (s.mantenimientos)
        and s.tipo = 'correctivo'
        and s.fecha >= m.desde_fecha
      order by s.fecha desc, s.kilometraje desc nulls last, s.created_at desc
      limit 1
    ) f on true
    where m.activo
      and (p_unidad_id is null or m.unidad_id = p_unidad_id)
      -- Solo usuarios con perfil (security definer salta RLS).
      and public.rol_actual() is not null
  ),
  base as (
    select
      u.id, u.unidad_id, u.nombre, u.cada_km, u.cada_meses, u.desde_fecha, u.desde_km,
      coalesce(u.f_fecha, u.desde_fecha) as ultima_fecha,
      case when u.f_id is not null then coalesce(u.f_km, u.desde_km) else u.desde_km end as ultimo_km,
      u.f_id as ultimo_servicio_id,
      km.kilometraje as km_actual
    from ultima u
    left join km on km.unidad_id = u.unidad_id
  ),
  proximo as (
    select
      b.*,
      case when b.cada_km is not null then b.ultimo_km + b.cada_km end as proximo_km,
      case when b.cada_meses is not null then (b.ultima_fecha + make_interval(months => b.cada_meses))::date end as proxima_fecha
    from base b
  ),
  calc as (
    select
      p.*,
      case when p.proximo_km is not null and p.km_actual is not null then p.proximo_km - p.km_actual end as faltan_km,
      case when p.proxima_fecha is not null then p.proxima_fecha - (select d from hoy) end as faltan_dias
    from proximo p
  )
  select
    c.id, c.unidad_id, c.nombre, c.cada_km, c.cada_meses, c.desde_fecha, c.desde_km,
    c.km_actual, c.proximo_km, c.proxima_fecha, c.faltan_km, c.faltan_dias,
    case
      when c.faltan_km <= 0 or c.faltan_dias < 0 then 'vencido'
      when c.faltan_km <= 1000 or c.faltan_dias <= 15 then 'por_vencer'
      when c.faltan_km is null and c.faltan_dias is null then 'sin_kilometraje'
      else 'al_corriente'
    end,
    c.ultima_fecha, c.ultimo_km, c.ultimo_servicio_id
  from calc c;
$$;

revoke execute on function public.mantenimientos_pendientes(uuid) from public, anon;
grant execute on function public.mantenimientos_pendientes(uuid) to authenticated;

notify pgrst, 'reload schema';
