-- =============================================================================
-- Sección 5H — Pedidos del usuario (2026-11-12):
-- 1. Aceptar un ticket ya no pide kilometraje (lo alimenta la captura semanal).
-- 2. Cuando un admin acepta un ticket, lo "aprueba": tiene que decir por qué, y
--    queda marcado como aprobado por administrador. Si un admin rechaza, también
--    queda marcado. Los capturistas reciben un aviso con el nombre de quien
--    aprobó (el contador de avisos suma las aprobaciones de admin).
-- 3. Un mantenimiento se programa de una sola forma: por kilometraje o por
--    meses, no las dos. Los que tenían las dos se quedan por kilometraje.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 y 2. Tickets
-- ---------------------------------------------------------------------------
alter table public.tickets_taller
  add column atendido_por_admin boolean not null default false,
  add column motivo_aprobacion text,
  add constraint tickets_taller_motivo_aprobacion_valido
    check (motivo_aprobacion is null or length(trim(motivo_aprobacion)) between 5 and 1000),
  add constraint tickets_taller_aprobacion_de_admin
    check (motivo_aprobacion is null or (estatus = 'aceptado' and atendido_por_admin));

-- Firma nueva (motivo al final): se quita la de antes para no tener dos.
drop function public.aceptar_ticket_taller(uuid, integer);

create function public.aceptar_ticket_taller(
  p_ticket_id uuid,
  p_kilometraje integer default null,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets_taller;
  v_admin boolean := public.es_admin();
  v_motivo text := nullif(trim(p_motivo), '');
  v_entrada uuid;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para aceptar tickets de taller' using errcode = '42501';
  end if;
  v_ticket := public.tomar_ticket_pendiente(p_ticket_id);

  -- El admin aprueba: siempre con motivo. El capturista solo acepta. (Después de
  -- revisar el ticket: si otro ya lo aceptó, eso es lo primero que hay que decir.)
  if v_admin then
    if v_motivo is null or length(v_motivo) < 5 then
      raise exception 'Escribe por qué lo apruebas (al menos 5 letras)' using errcode = '23514';
    end if;
    if length(v_motivo) > 1000 then
      raise exception 'El motivo puede tener hasta 1000 caracteres' using errcode = '23514';
    end if;
  else
    v_motivo := null;
  end if;

  -- Primero deja de estar pendiente, para que la entrada no lo vea como
  -- ticket abierto. Si la entrada falla, todo se deshace.
  update public.tickets_taller
  set estatus = 'aceptado',
      atendido_at = now(),
      atendido_by = auth.uid(),
      atendido_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid()),
      atendido_por_admin = v_admin,
      motivo_aprobacion = v_motivo
  where id = v_ticket.id;

  -- El kilometraje es opcional (5H): si viene, se revisa como en toda entrada.
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

revoke execute on function public.aceptar_ticket_taller(uuid, integer, text) from public, anon;
grant execute on function public.aceptar_ticket_taller(uuid, integer, text) to authenticated;

-- Rechazar: igual que antes, y marca si lo rechazó un admin.
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
      atendido_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid()),
      atendido_por_admin = public.es_admin()
  where id = v_ticket.id;
end;
$$;

-- Contador de avisos: también cuenta las aprobaciones de admin (sin nombres:
-- el nombre lo pide la página al servidor, con sesión).
alter table public.tickets_avisos add column aprobados_admin bigint not null default 0;

update public.tickets_avisos set aprobados_admin = 0 where id = 1;

create or replace function public.avisar_cambio_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aprobado boolean := tg_op = 'UPDATE' and old.estatus = 'pendiente' and new.estatus = 'aceptado' and new.atendido_por_admin;
begin
  -- El update toma el candado del renglón: dos cambios al mismo tiempo suman uno tras otro.
  update public.tickets_avisos
  set version = version + 1,
      tipo = lower(tg_op),
      prioridad = new.prioridad,
      creado_por = new.created_by,
      creados = creados + case when tg_op = 'INSERT' then 1 else 0 end,
      urgentes = urgentes + case when tg_op = 'INSERT' and new.prioridad = 'urgente' then 1 else 0 end,
      aprobados_admin = aprobados_admin + case when v_aprobado then 1 else 0 end,
      updated_at = now()
  where id = 1;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Mantenimientos: una sola forma
-- ---------------------------------------------------------------------------
-- Los que tenían las dos se quedan por kilometraje (decisión del usuario).
update public.mantenimientos_unidad
set cada_meses = null
where cada_km is not null and cada_meses is not null;

create or replace function public.mantenimiento_una_forma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cada_km is not null and new.cada_meses is not null then
    raise exception 'Elige una sola forma: por kilometraje o por meses' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.mantenimiento_una_forma() from public, anon, authenticated;

create trigger mantenimientos_unidad_una_forma
  before insert or update of cada_km, cada_meses on public.mantenimientos_unidad
  for each row execute function public.mantenimiento_una_forma();
