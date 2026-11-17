-- =============================================================================
-- Sección 5J, Etapa 1 — Avisos de mantenimiento (2026-11-17)
--
-- Pedido del usuario: avisar con tiempo (4,000 km antes, por omisión) que a una
-- unidad le toca su mantenimiento, para que no regrese de un viaje ya pasada.
-- Tres niveles (decisión del usuario):
--   realizar_ahora  ya se pasó, o le faltan 1,000 km o menos / 15 días o menos
--   programar       le faltan el aviso de km o menos / 30 días o menos
--   al_corriente    le falta más
--   sin_kilometraje por km y la unidad aún no tiene lecturas
-- El aviso de km lo decide el admin: uno general (todas las unidades) y, si
-- quiere, uno propio para ciertas unidades. Debe ser mayor a 1,000 km (de ahí
-- para abajo ya es "Realizar ahora"). Lo de 1,000 km, 15 y 30 días es fijo.
--
-- Los avisos propios van en su propia tabla y no en `unidades`: cambiar un
-- aviso no debe mover `unidades.updated_at` (eso dispararía el aviso de
-- "otra persona editó esta unidad" de la 5I).
--
-- mantenimientos_pendientes() se queda igual mientras la app publicada la use;
-- la nueva mantenimientos_estado() la reemplaza y la vieja se quita en una
-- migración posterior, cuando las pantallas nuevas estén publicadas.
-- =============================================================================

-- Aviso general (una sola fila).
create table public.ajustes_mantenimiento (
  id smallint primary key default 1,
  aviso_km integer not null default 4000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint ajustes_mantenimiento_una_fila check (id = 1),
  constraint ajustes_mantenimiento_aviso_km check (aviso_km between 1001 and 100000)
);

comment on table public.ajustes_mantenimiento is 'Aviso general de mantenimiento: cuántos km antes se marca "Programar servicio" (5J). Una sola fila; la cambia el admin.';

insert into public.ajustes_mantenimiento (id, aviso_km) values (1, 4000);

create trigger ajustes_mantenimiento_updated_at
  before update on public.ajustes_mantenimiento
  for each row execute function public.actualizar_updated_at();

alter table public.ajustes_mantenimiento enable row level security;

create policy "ajustes mantenimiento: leer"
  on public.ajustes_mantenimiento for select to authenticated
  using ((select public.rol_actual()) is not null);

revoke all on public.ajustes_mantenimiento from anon;
revoke insert, update, delete, truncate, references, trigger on public.ajustes_mantenimiento from authenticated;
grant select on public.ajustes_mantenimiento to authenticated;

-- Aviso propio de ciertas unidades (las demás usan el general).
create table public.avisos_mantenimiento_unidad (
  unidad_id uuid primary key references public.unidades (id) on delete cascade,
  aviso_km integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint avisos_mantenimiento_unidad_aviso_km check (aviso_km between 1001 and 100000)
);

comment on table public.avisos_mantenimiento_unidad is 'Aviso de mantenimiento propio de una unidad, en km (5J). Sin fila = usa el aviso general.';

create trigger avisos_mantenimiento_unidad_updated_at
  before update on public.avisos_mantenimiento_unidad
  for each row execute function public.actualizar_updated_at();

alter table public.avisos_mantenimiento_unidad enable row level security;

create policy "avisos mantenimiento unidad: leer"
  on public.avisos_mantenimiento_unidad for select to authenticated
  using ((select public.rol_actual()) is not null);

revoke all on public.avisos_mantenimiento_unidad from anon;
revoke insert, update, delete, truncate, references, trigger on public.avisos_mantenimiento_unidad from authenticated;
grant select on public.avisos_mantenimiento_unidad to authenticated;

-- Cambiar el aviso general (solo admin).
create or replace function public.cambiar_aviso_mantenimiento(p_aviso_km integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar el aviso de mantenimiento' using errcode = '42501';
  end if;
  if p_aviso_km is null or p_aviso_km not between 1001 and 100000 then
    raise exception 'El aviso debe ser de más de 1,000 km y hasta 100,000 km' using errcode = '23514';
  end if;

  update public.ajustes_mantenimiento
  set aviso_km = p_aviso_km, updated_by = auth.uid()
  where id = 1;
end;
$$;

revoke execute on function public.cambiar_aviso_mantenimiento(integer) from public, anon;
grant execute on function public.cambiar_aviso_mantenimiento(integer) to authenticated;

-- Poner un aviso propio a una o varias unidades (solo admin). Todo o nada: si
-- alguna no aplica, no se guarda ninguna y se dice cuáles. Regresa cuántas.
create or replace function public.poner_aviso_mantenimiento(p_unidades uuid[], p_aviso_km integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidades uuid[];
  v_malas text;
  v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar el aviso de mantenimiento' using errcode = '42501';
  end if;
  if p_aviso_km is null or p_aviso_km not between 1001 and 100000 then
    raise exception 'El aviso debe ser de más de 1,000 km y hasta 100,000 km' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct u), '{}') into v_unidades from unnest(p_unidades) u where u is not null;
  if cardinality(v_unidades) = 0 then
    raise exception 'Elige al menos una unidad' using errcode = '23514';
  end if;
  if cardinality(v_unidades) > 500 then
    raise exception 'Demasiadas unidades' using errcode = '23514';
  end if;
  if (select count(*) from public.unidades where id = any (v_unidades)) <> cardinality(v_unidades) then
    raise exception 'Una de las unidades no existe' using errcode = '23503';
  end if;

  select string_agg(u.numero_economico, ', ' order by u.orden_tipo, u.numero_orden) into v_malas
  from public.unidades u
  where u.id = any (v_unidades) and u.estatus in ('baja', 'vendida');
  if v_malas is not null then
    raise exception 'Estas unidades están dadas de baja o vendidas: %', v_malas using errcode = '23514';
  end if;

  select string_agg(u.numero_economico, ', ' order by u.orden_tipo, u.numero_orden) into v_malas
  from public.unidades u
  where u.id = any (v_unidades) and not public.tipo_lleva_kilometraje(u.tipo);
  if v_malas is not null then
    raise exception 'Estas unidades no llevan kilometraje (se avisan por días): %', v_malas using errcode = '23514';
  end if;

  insert into public.avisos_mantenimiento_unidad (unidad_id, aviso_km, created_by, updated_by)
  select u, p_aviso_km, auth.uid(), auth.uid() from unnest(v_unidades) u
  on conflict (unidad_id) do update
    set aviso_km = excluded.aviso_km, updated_by = excluded.updated_by;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.poner_aviso_mantenimiento(uuid[], integer) from public, anon;
grant execute on function public.poner_aviso_mantenimiento(uuid[], integer) to authenticated;

-- Quitar el aviso propio (vuelven al general). Solo admin. Regresa cuántas tenían.
create or replace function public.quitar_aviso_mantenimiento(p_unidades uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar el aviso de mantenimiento' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_unidades), 0) = 0 then
    raise exception 'Elige al menos una unidad' using errcode = '23514';
  end if;

  delete from public.avisos_mantenimiento_unidad where unidad_id = any (p_unidades);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.quitar_aviso_mantenimiento(uuid[]) from public, anon;
grant execute on function public.quitar_aviso_mantenimiento(uuid[]) to authenticated;

-- Lo que le toca a cada mantenimiento, con los tres niveles y el aviso que usó.
-- Mismo cálculo que mantenimientos_pendientes() (20261109221717) salvo el estado.
-- security definer: los tres roles ven lo mismo (como la anterior).
create function public.mantenimientos_estado(p_unidad_id uuid default null)
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
  ultimo_servicio_id uuid,
  aviso_km integer,
  aviso_propio boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  hoy as (select (now() at time zone 'America/Tijuana')::date as d),
  general as (select coalesce((select a.aviso_km from public.ajustes_mantenimiento a where a.id = 1), 4000) as km),
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
      km.kilometraje as km_actual,
      coalesce(a.aviso_km, (select g.km from general g)) as aviso_km,
      a.unidad_id is not null as aviso_propio
    from ultima u
    left join km on km.unidad_id = u.unidad_id
    left join public.avisos_mantenimiento_unidad a on a.unidad_id = u.unidad_id
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
      when c.faltan_km <= 1000 or c.faltan_dias <= 15 then 'realizar_ahora'
      when c.faltan_km <= c.aviso_km or c.faltan_dias <= 30 then 'programar'
      when c.faltan_km is null and c.faltan_dias is null then 'sin_kilometraje'
      else 'al_corriente'
    end,
    c.ultima_fecha, c.ultimo_km, c.ultimo_servicio_id,
    c.aviso_km, c.aviso_propio
  from calc c;
$$;

comment on function public.mantenimientos_estado(uuid) is 'Mantenimientos activos con lo que les falta y su nivel: realizar_ahora (vencido o <= 1,000 km / 15 días), programar (<= aviso de km / 30 días), al_corriente, sin_kilometraje (5J).';

revoke execute on function public.mantenimientos_estado(uuid) from public, anon;
grant execute on function public.mantenimientos_estado(uuid) to authenticated;

notify pgrst, 'reload schema';
