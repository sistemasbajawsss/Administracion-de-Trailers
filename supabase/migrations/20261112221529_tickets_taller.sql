-- =============================================================================
-- Sección 5H, Etapa 3 — Tickets de taller (D16, 2026-11-12)
-- Admin y gerente levantan un ticket (unidad, falla, prioridad). Les llega a
-- todos los capturistas; el primero que lo acepta da la entrada a taller en
-- automático (con el kilometraje). Rechazar exige motivo; quien lo levantó lo
-- ve hasta tocar "Enterado". Quien lo levantó o el admin lo cancelan mientras
-- siga pendiente.
-- Compatible con la app publicada: solo agrega. `registrar_entrada_taller()`
-- conserva su firma y gana un candado (unidad con ticket pendiente), que no
-- puede pasar mientras nadie levante tickets.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
create type public.prioridad_ticket as enum ('urgente', 'normal', 'baja');
create type public.estatus_ticket as enum ('pendiente', 'aceptado', 'rechazado', 'cancelado');

-- ---------------------------------------------------------------------------
-- 2. Tabla
-- Nadie la escribe directo: solo las funciones de abajo. Los nombres se
-- guardan como estaban en ese momento (igual que en entradas_taller).
-- La llave a la entrada va de este lado; ninguna consulta de la app anida
-- tickets todavía, así que no crea relaciones ambiguas en la API.
-- ---------------------------------------------------------------------------
create table public.tickets_taller (
  id uuid primary key default gen_random_uuid(),
  folio integer generated always as identity unique,
  -- Eliminar una unidad por completo (D5) borra también sus tickets.
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  falla text not null,
  prioridad public.prioridad_ticket not null default 'normal',
  estatus public.estatus_ticket not null default 'pendiente',
  creador_nombre text,
  -- Quién aceptó o rechazó, y cuándo (mide cuánto tardaron en atenderlo).
  atendido_at timestamptz,
  atendido_by uuid references auth.users (id) on delete set null,
  atendido_nombre text,
  -- La entrada a taller que se creó al aceptarlo.
  entrada_id uuid unique references public.entradas_taller (id) on delete set null,
  motivo_rechazo text,
  -- Quien lo levantó ya vio el rechazo.
  enterado_at timestamptz,
  cancelado_at timestamptz,
  cancelado_by uuid references auth.users (id) on delete set null,
  cancelado_nombre text,
  motivo_cancelacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,

  constraint tickets_taller_falla_valida
    check (length(trim(falla)) between 1 and 1000),
  constraint tickets_taller_motivo_rechazo_valido
    check (motivo_rechazo is null or length(trim(motivo_rechazo)) between 5 and 1000),
  constraint tickets_taller_motivo_cancelacion_corto
    check (motivo_cancelacion is null or length(motivo_cancelacion) <= 1000),
  constraint tickets_taller_estado_coherente check (
    case estatus
      when 'pendiente' then atendido_at is null and entrada_id is null and motivo_rechazo is null
                            and cancelado_at is null and enterado_at is null
      when 'aceptado' then atendido_at is not null and motivo_rechazo is null and cancelado_at is null
      when 'rechazado' then atendido_at is not null and motivo_rechazo is not null and entrada_id is null
                            and cancelado_at is null
      when 'cancelado' then cancelado_at is not null and atendido_at is null and entrada_id is null
    end
  ),
  constraint tickets_taller_enterado_solo_rechazados
    check (enterado_at is null or estatus = 'rechazado')
);

comment on table public.tickets_taller is 'Tickets de taller: admin y gerente piden que una unidad entre a taller; un capturista lo acepta (crea la entrada) o lo rechaza con motivo (Sección 5H, D16).';

-- Un solo ticket pendiente por unidad (también frena dos al mismo tiempo).
create unique index tickets_taller_uno_pendiente on public.tickets_taller (unidad_id) where estatus = 'pendiente';
-- Lista de pendientes (capturistas) y la página Tickets, de lo más nuevo a lo más viejo.
create index tickets_taller_estatus_idx on public.tickets_taller (estatus, created_at desc);
-- "Mis tickets" de quien los levantó (avisos de rechazo).
create index tickets_taller_creador_idx on public.tickets_taller (created_by, created_at desc);
create index tickets_taller_unidad_idx on public.tickets_taller (unidad_id, created_at desc);

create trigger tickets_taller_actualizar_updated_at
  before update on public.tickets_taller
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- Los tres roles ven todos los tickets: solo dicen unidad, falla y quién; los
-- capturistas necesitan ver cuando otro ya aceptó uno para que se les quite, y
-- Realtime solo avisa de los renglones que el usuario puede ver.
-- ---------------------------------------------------------------------------
alter table public.tickets_taller enable row level security;

create policy "tickets taller: leer"
  on public.tickets_taller for select to authenticated
  using ((select public.rol_actual()) is not null);

revoke all on public.tickets_taller from anon;
revoke insert, update, delete, truncate, references, trigger on public.tickets_taller from authenticated;
grant select on public.tickets_taller to authenticated;

-- Realtime: número del menú y tarjeta del Inicio al momento.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.tickets_taller;

-- ---------------------------------------------------------------------------
-- 4. Crear (admin y gerente; único permiso de escritura del gerente)
-- ---------------------------------------------------------------------------
create or replace function public.crear_ticket_taller(
  p_unidad_id uuid,
  p_falla text,
  p_prioridad public.prioridad_ticket default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_falla text := nullif(trim(p_falla), '');
  v_numero text;
  v_estatus public.estatus_unidad;
  v_id uuid;
begin
  if coalesce(public.rol_actual() not in ('admin', 'gerente'), true) then
    raise exception 'Solo un administrador o gerente puede levantar tickets de taller' using errcode = '42501';
  end if;
  if v_falla is null then
    raise exception 'Describe la falla' using errcode = '23514';
  end if;
  if length(v_falla) > 1000 then
    raise exception 'La falla puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;
  if p_prioridad is null then
    raise exception 'Elige la prioridad' using errcode = '23514';
  end if;

  -- Mismo candado que la entrada a taller: ticket y entrada se forman en fila.
  select u.numero_economico, u.estatus into v_numero, v_estatus
  from public.unidades u
  where u.id = p_unidad_id
  for update;

  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  if v_estatus in ('baja', 'vendida') then
    raise exception 'La unidad % está %', v_numero,
      case v_estatus when 'vendida' then 'vendida' else 'dada de baja' end
      using errcode = '23514';
  end if;
  if v_estatus = 'en_taller'
     or exists (select 1 from public.entradas_taller e where e.unidad_id = p_unidad_id and e.fecha_salida is null) then
    raise exception 'La unidad % ya está en taller', v_numero using errcode = '23505';
  end if;
  if exists (select 1 from public.tickets_taller t where t.unidad_id = p_unidad_id and t.estatus = 'pendiente') then
    raise exception 'La unidad % ya tiene un ticket pendiente', v_numero using errcode = '23505';
  end if;

  insert into public.tickets_taller (unidad_id, falla, prioridad, creador_nombre, created_by)
  values (
    p_unidad_id,
    v_falla,
    p_prioridad,
    (select p.nombre from public.perfiles p where p.id = auth.uid()),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ticket pendiente, bloqueado para cambiarlo (interna)
-- ---------------------------------------------------------------------------
create or replace function public.tomar_ticket_pendiente(p_ticket_id uuid)
returns public.tickets_taller
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets_taller;
begin
  select t.* into v_ticket
  from public.tickets_taller t
  where t.id = p_ticket_id
  for update;

  if not found then
    raise exception 'El ticket no existe' using errcode = 'P0002';
  end if;
  if v_ticket.estatus = 'aceptado' then
    raise exception 'Este ticket ya lo aceptó %', coalesce(v_ticket.atendido_nombre, 'otra persona') using errcode = '23505';
  end if;
  if v_ticket.estatus = 'rechazado' then
    raise exception 'Este ticket ya lo rechazó %', coalesce(v_ticket.atendido_nombre, 'otra persona') using errcode = '23505';
  end if;
  if v_ticket.estatus = 'cancelado' then
    raise exception 'Este ticket ya se canceló' using errcode = '23505';
  end if;
  return v_ticket;
end;
$$;

revoke execute on function public.tomar_ticket_pendiente(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Aceptar (capturista y admin): crea la entrada a taller con fecha de hoy
-- y la falla del ticket. Pide el kilometraje si el tipo lleva odómetro.
-- ---------------------------------------------------------------------------
create or replace function public.aceptar_ticket_taller(
  p_ticket_id uuid,
  p_kilometraje integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets_taller;
  v_tipo text;
  v_entrada uuid;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para aceptar tickets de taller' using errcode = '42501';
  end if;

  v_ticket := public.tomar_ticket_pendiente(p_ticket_id);

  select u.tipo into v_tipo from public.unidades u where u.id = v_ticket.unidad_id;
  if public.tipo_lleva_kilometraje(v_tipo) and p_kilometraje is null then
    raise exception 'Escribe el kilometraje de la unidad' using errcode = '23514';
  end if;

  -- Primero deja de estar pendiente, para que la entrada no lo vea como
  -- ticket abierto. Si la entrada falla (km, unidad en taller…), todo se deshace.
  update public.tickets_taller
  set estatus = 'aceptado',
      atendido_at = now(),
      atendido_by = auth.uid(),
      atendido_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid())
  where id = v_ticket.id;

  v_entrada := public.registrar_entrada_taller(
    v_ticket.unidad_id,
    (now() at time zone 'America/Tijuana')::date,
    v_ticket.falla,
    p_kilometraje
  );

  update public.tickets_taller set entrada_id = v_entrada where id = v_ticket.id;

  return v_entrada;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Rechazar (capturista y admin), con motivo
-- ---------------------------------------------------------------------------
create or replace function public.rechazar_ticket_taller(
  p_ticket_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(trim(p_motivo), '');
  v_ticket public.tickets_taller;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para rechazar tickets de taller' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Explica por qué lo rechazas (al menos 5 letras)' using errcode = '23514';
  end if;
  if length(v_motivo) > 1000 then
    raise exception 'El motivo puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;

  v_ticket := public.tomar_ticket_pendiente(p_ticket_id);

  update public.tickets_taller
  set estatus = 'rechazado',
      motivo_rechazo = v_motivo,
      atendido_at = now(),
      atendido_by = auth.uid(),
      atendido_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid())
  where id = v_ticket.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Cancelar (quien lo levantó o el admin), mientras siga pendiente
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_ticket_taller(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_usuario := public.rol_actual();
  v_creador uuid;
  v_ticket public.tickets_taller;
begin
  if v_rol is null or v_rol not in ('admin', 'gerente') then
    raise exception 'No tienes permiso para cancelar tickets de taller' using errcode = '42501';
  end if;

  -- Revisar el dueño antes de tomarlo: a otro no se le dice en qué estado está.
  select t.created_by into v_creador from public.tickets_taller t where t.id = p_ticket_id;
  if not found then
    raise exception 'El ticket no existe' using errcode = 'P0002';
  end if;
  if v_rol <> 'admin' and v_creador is distinct from auth.uid() then
    raise exception 'Solo quien levantó el ticket o un administrador puede cancelarlo' using errcode = '42501';
  end if;

  v_ticket := public.tomar_ticket_pendiente(p_ticket_id);

  update public.tickets_taller
  set estatus = 'cancelado',
      cancelado_at = now(),
      cancelado_by = auth.uid(),
      cancelado_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid())
  where id = v_ticket.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Enterado: quien lo levantó ya vio el rechazo (se quita del Inicio)
-- ---------------------------------------------------------------------------
create or replace function public.marcar_ticket_enterado(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets_taller;
begin
  if public.rol_actual() is null then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;

  select t.* into v_ticket from public.tickets_taller t where t.id = p_ticket_id for update;
  if not found then
    raise exception 'El ticket no existe' using errcode = 'P0002';
  end if;
  if v_ticket.created_by is distinct from auth.uid() then
    raise exception 'Solo quien levantó el ticket puede marcarlo como visto' using errcode = '42501';
  end if;
  if v_ticket.estatus <> 'rechazado' then
    raise exception 'Solo los tickets rechazados se marcan como vistos' using errcode = '23514';
  end if;
  if v_ticket.enterado_at is not null then
    return;
  end if;

  update public.tickets_taller set enterado_at = now() where id = v_ticket.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Si la unidad se vende o se da de baja, su ticket pendiente se cancela
-- solo (si no, quedaría pendiente sin que nadie pudiera aceptarlo).
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_tickets_unidad_retirada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tickets_taller
  set estatus = 'cancelado',
      cancelado_at = now(),
      cancelado_by = auth.uid(),
      cancelado_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid()),
      motivo_cancelacion = case new.estatus when 'vendida' then 'La unidad se vendió' else 'La unidad se dio de baja' end
  where unidad_id = new.id and estatus = 'pendiente';
  return new;
end;
$$;

revoke execute on function public.cancelar_tickets_unidad_retirada() from public, anon, authenticated;

create trigger unidades_cancelar_tickets_al_retirar
  after update of estatus on public.unidades
  for each row
  when (new.estatus in ('baja', 'vendida') and old.estatus is distinct from new.estatus)
  execute function public.cancelar_tickets_unidad_retirada();

-- ---------------------------------------------------------------------------
-- 11. Entrada directa a taller: no si la unidad tiene un ticket pendiente
-- (se acepta desde Tickets). Misma firma y mismo cuerpo; solo el candado nuevo.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_entrada_taller(
  p_unidad_id uuid,
  p_fecha date,
  p_falla text,
  p_kilometraje integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_falla text := nullif(trim(p_falla), '');
  v_numero text;
  v_tipo text;
  v_estatus public.estatus_unidad;
  v_km integer := p_kilometraje;
  v_id uuid;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para registrar entradas a taller' using errcode = '42501';
  end if;
  if v_falla is null then
    raise exception 'Describe la falla' using errcode = '23514';
  end if;
  if length(v_falla) > 1000 then
    raise exception 'La falla puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha de entrada no puede ser futura' using errcode = '23514';
  end if;
  if v_km is not null and v_km not between 0 and 9999999 then
    raise exception 'Kilometraje no válido' using errcode = '23514';
  end if;

  -- Candado sobre la unidad: dos entradas al mismo tiempo se forman en fila.
  select u.numero_economico, u.tipo, u.estatus into v_numero, v_tipo, v_estatus
  from public.unidades u
  where u.id = p_unidad_id
  for update;

  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  if v_estatus in ('baja', 'vendida') then
    raise exception 'La unidad % está %', v_numero,
      case v_estatus when 'vendida' then 'vendida' else 'dada de baja' end
      using errcode = '23514';
  end if;
  if v_estatus = 'en_taller'
     or exists (select 1 from public.entradas_taller e where e.unidad_id = p_unidad_id and e.fecha_salida is null) then
    raise exception 'La unidad % ya está en taller', v_numero using errcode = '23505';
  end if;
  -- 5H (D16): con ticket pendiente, la entrada se da aceptándolo.
  if exists (select 1 from public.tickets_taller t where t.unidad_id = p_unidad_id and t.estatus = 'pendiente') then
    raise exception 'La unidad % tiene un ticket de taller pendiente: acéptalo desde Tickets', v_numero using errcode = '23505';
  end if;

  -- Cajas, dollys, góndolas…: sin odómetro (tipos_unidad.lleva_kilometraje).
  if not public.tipo_lleva_kilometraje(v_tipo) then
    v_km = null;
  end if;
  perform public.validar_kilometraje(p_unidad_id, p_fecha, v_km);

  insert into public.entradas_taller (unidad_id, fecha_entrada, falla, kilometraje, reporta_nombre, created_by)
  values (
    p_unidad_id,
    p_fecha,
    v_falla,
    v_km,
    (select p.nombre from public.perfiles p where p.id = auth.uid()),
    auth.uid()
  )
  returning id into v_id;

  perform set_config('app.cambio_taller', p_unidad_id::text, true);
  update public.unidades set estatus = 'en_taller' where id = p_unidad_id;
  perform set_config('app.cambio_taller', '', true);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Permisos de las funciones
-- ---------------------------------------------------------------------------
revoke execute on function public.crear_ticket_taller(uuid, text, public.prioridad_ticket) from public, anon;
revoke execute on function public.aceptar_ticket_taller(uuid, integer) from public, anon;
revoke execute on function public.rechazar_ticket_taller(uuid, text) from public, anon;
revoke execute on function public.cancelar_ticket_taller(uuid) from public, anon;
revoke execute on function public.marcar_ticket_enterado(uuid) from public, anon;
grant execute on function public.crear_ticket_taller(uuid, text, public.prioridad_ticket) to authenticated;
grant execute on function public.aceptar_ticket_taller(uuid, integer) to authenticated;
grant execute on function public.rechazar_ticket_taller(uuid, text) to authenticated;
grant execute on function public.cancelar_ticket_taller(uuid) to authenticated;
grant execute on function public.marcar_ticket_enterado(uuid) to authenticated;
