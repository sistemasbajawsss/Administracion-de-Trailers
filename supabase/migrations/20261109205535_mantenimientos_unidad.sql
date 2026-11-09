-- =============================================================================
-- Sección 5F, Etapa 3 — Mantenimientos por unidad (2026-11-09)
--
-- Cada unidad tiene sus propios mantenimientos programados (D14), que el admin
-- captura en la ficha: nombre, cada cuántos km y/o cada cuántos meses (lo que
-- pase primero) y desde cuándo cuenta (la última vez que se hizo: fecha y km).
-- Las cajas solo por tiempo (no tienen odómetro). Quitar uno lo desactiva
-- (activo = false), no lo borra.
--
-- mantenimientos_pendientes calcula, con el kilometraje actual (Etapa 1), el
-- próximo km / fecha, cuánto falta y el estado. En la Etapa 4, un correctivo
-- marcado como cumplimiento moverá el "desde".
--
-- Solo agrega: no cambia servicios, gastos, reportes ni funciones existentes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------------
create table public.mantenimientos_unidad (
  id uuid primary key default gen_random_uuid(),
  -- Eliminar una unidad por completo (D5) borra también sus mantenimientos.
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  nombre text not null,
  cada_km integer,
  cada_meses smallint,
  -- Desde cuándo cuenta: la última vez que se hizo.
  desde_fecha date not null,
  desde_km integer,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint mantenimientos_unidad_nombre_valido check (length(trim(nombre)) between 1 and 100),
  constraint mantenimientos_unidad_con_intervalo check (cada_km is not null or cada_meses is not null),
  constraint mantenimientos_unidad_cada_km_valido check (cada_km is null or cada_km between 100 and 1000000),
  constraint mantenimientos_unidad_cada_meses_valido check (cada_meses is null or cada_meses between 1 and 120),
  constraint mantenimientos_unidad_desde_km_valido check (desde_km is null or desde_km between 0 and 9999999),
  -- Por kilometraje necesita saber desde qué km cuenta.
  constraint mantenimientos_unidad_km_con_desde check (cada_km is null or desde_km is not null)
);

comment on table public.mantenimientos_unidad is 'Mantenimientos programados de cada unidad (5F): cada N km y/o N meses, desde la última vez que se hizo.';

-- Los de una unidad (ficha) y los activos de todas (página Mantenimientos).
create index mantenimientos_unidad_unidad_idx on public.mantenimientos_unidad (unidad_id) where activo;
-- Dos activos con el mismo nombre en la misma unidad confunden: no se permiten.
create unique index mantenimientos_unidad_nombre_unico
  on public.mantenimientos_unidad (unidad_id, lower(trim(nombre))) where activo;

-- ---------------------------------------------------------------------------
-- 2. preparar_mantenimiento: limpia y valida (cajas solo por tiempo, fecha no
-- futura, auditoría). Para todo el que escriba, también por API.
-- ---------------------------------------------------------------------------
create or replace function public.preparar_mantenimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.tipo_unidad;
begin
  new.nombre = trim(regexp_replace(new.nombre, '\s+', ' ', 'g'));

  if tg_op = 'INSERT' then
    new.id = gen_random_uuid();
    new.created_by = auth.uid();
    new.created_at = now();
    new.updated_at = now();
    new.updated_by = null;
  else
    new.id = old.id;
    new.unidad_id = old.unidad_id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
    new.updated_by = auth.uid();
  end if;

  select u.tipo into v_tipo from public.unidades u where u.id = new.unidad_id;
  if v_tipo = 'caja' and new.cada_km is not null then
    raise exception 'Las cajas no llevan kilometraje: programa este mantenimiento por meses' using errcode = '23514';
  end if;
  if new.cada_km is null then
    new.desde_km = null;
  end if;
  if new.desde_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La última vez que se hizo no puede ser una fecha futura' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.preparar_mantenimiento() from public, anon, authenticated;

create trigger mantenimientos_unidad_preparar
  before insert or update on public.mantenimientos_unidad
  for each row execute function public.preparar_mantenimiento();

create trigger mantenimientos_unidad_actualizar_updated_at
  before update on public.mantenimientos_unidad
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS: los tres roles ven; solo el admin crea y edita (quitar = desactivar).
-- ---------------------------------------------------------------------------
alter table public.mantenimientos_unidad enable row level security;

create policy "mantenimientos unidad: leer"
  on public.mantenimientos_unidad for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy "mantenimientos unidad: admin crea"
  on public.mantenimientos_unidad for insert to authenticated
  with check ((select public.es_admin()));

create policy "mantenimientos unidad: admin actualiza"
  on public.mantenimientos_unidad for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

revoke all on public.mantenimientos_unidad from anon;
revoke delete, truncate, references, trigger on public.mantenimientos_unidad from authenticated;
grant select, insert, update on public.mantenimientos_unidad to authenticated;

-- ---------------------------------------------------------------------------
-- 4. mantenimientos_pendientes: próximo, cuánto falta y estado
-- Estado: 'vencido' (ya pasó el km o la fecha), 'por_vencer' (faltan 1,000 km
-- o menos, o 15 días o menos), 'al_corriente', o 'sin_kilometraje' (solo por
-- km y la unidad aún no tiene kilometraje). Con km y meses, manda lo que
-- llegue primero. RLS de la tabla aplica (security invoker).
-- ---------------------------------------------------------------------------
create or replace function public.mantenimientos_pendientes(p_unidad_id uuid default null)
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
  estado text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  hoy as (select (now() at time zone 'America/Tijuana')::date as d),
  km as (select k.unidad_id, k.kilometraje from public.kilometraje_unidades(p_unidad_id) k),
  base as (
    select
      m.id, m.unidad_id, m.nombre, m.cada_km, m.cada_meses, m.desde_fecha, m.desde_km,
      km.kilometraje as km_actual,
      case when m.cada_km is not null then m.desde_km + m.cada_km end as proximo_km,
      case when m.cada_meses is not null then (m.desde_fecha + make_interval(months => m.cada_meses))::date end as proxima_fecha
    from public.mantenimientos_unidad m
    left join km on km.unidad_id = m.unidad_id
    where m.activo
      and (p_unidad_id is null or m.unidad_id = p_unidad_id)
  ),
  calc as (
    select
      b.*,
      case when b.proximo_km is not null and b.km_actual is not null then b.proximo_km - b.km_actual end as faltan_km,
      case when b.proxima_fecha is not null then b.proxima_fecha - (select d from hoy) end as faltan_dias
    from base b
  )
  select
    c.id, c.unidad_id, c.nombre, c.cada_km, c.cada_meses, c.desde_fecha, c.desde_km,
    c.km_actual, c.proximo_km, c.proxima_fecha, c.faltan_km, c.faltan_dias,
    case
      when c.faltan_km <= 0 or c.faltan_dias < 0 then 'vencido'
      when c.faltan_km <= 1000 or c.faltan_dias <= 15 then 'por_vencer'
      when c.faltan_km is null and c.faltan_dias is null then 'sin_kilometraje'
      else 'al_corriente'
    end
  from calc c;
$$;

revoke execute on function public.mantenimientos_pendientes(uuid) from public, anon;
grant execute on function public.mantenimientos_pendientes(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. copiar_mantenimientos (solo admin): copia los activos de otra unidad que
-- el destino aún no tiene (por nombre). Cuentan desde hoy y el km actual del
-- destino. A una caja solo pasan los que tienen meses (sin el km).
-- Regresa cuántos copió.
-- ---------------------------------------------------------------------------
create or replace function public.copiar_mantenimientos(p_origen uuid, p_destino uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tipo public.tipo_unidad;
  v_km integer;
  v_hoy date := (now() at time zone 'America/Tijuana')::date;
  v_copiados integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede copiar mantenimientos' using errcode = '42501';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'Elige otra unidad para copiar' using errcode = '23514';
  end if;

  select u.tipo into v_tipo from public.unidades u where u.id = p_destino;
  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  select k.kilometraje into v_km from public.kilometraje_unidades(p_destino) k;

  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  select
    p_destino,
    m.nombre,
    case when v_tipo = 'caja' or v_km is null then null else m.cada_km end,
    m.cada_meses,
    v_hoy,
    case when v_tipo = 'caja' or v_km is null then null else v_km end
  from public.mantenimientos_unidad m
  where m.unidad_id = p_origen
    and m.activo
    -- Si no se puede contar por km (caja o sin kilometraje), solo los que tienen meses.
    and (m.cada_meses is not null or (v_tipo <> 'caja' and v_km is not null))
    and not exists (
      select 1 from public.mantenimientos_unidad d
      where d.unidad_id = p_destino and d.activo and lower(trim(d.nombre)) = lower(trim(m.nombre))
    );

  get diagnostics v_copiados = row_count;
  return v_copiados;
end;
$$;

revoke execute on function public.copiar_mantenimientos(uuid, uuid) from public, anon;
grant execute on function public.copiar_mantenimientos(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
