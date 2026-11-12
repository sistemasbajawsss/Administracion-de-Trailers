-- =============================================================================
-- Sección 5H, Etapa 4 — Aviso de tickets al momento sin exponer la sesión
-- (2026-11-12).
-- La cookie de sesión es httpOnly: el navegador no tiene el token y se conecta a
-- Realtime como anónimo. Los cambios de `tickets_taller` respetan RLS y no le
-- llegaban. En vez de darle el token al navegador, hay una tabla de un solo
-- renglón con un contador que sube con cada cambio de tickets: no dice qué
-- unidad ni qué falla, solo que algo cambió, la prioridad y quién lo levantó
-- (uuid, para no avisarle a él mismo). El anónimo la puede leer y la página,
-- al ver que cambió, vuelve a pedir lo suyo al servidor, que sí revisa la
-- sesión y los permisos.
-- (Se probó Broadcast desde la BD, `realtime.send`, y no se usó: sus mensajes
-- necesitan particiones diarias que este proyecto no tiene.)
-- =============================================================================

-- Los cambios de la tabla de tickets ya no se escuchan: se quita de la publicación.
alter publication supabase_realtime drop table public.tickets_taller;

create table public.tickets_avisos (
  id smallint primary key default 1,
  version bigint not null default 0,
  tipo text,
  prioridad public.prioridad_ticket,
  creado_por uuid,
  updated_at timestamptz not null default now(),
  constraint tickets_avisos_un_renglon check (id = 1),
  constraint tickets_avisos_tipo_valido check (tipo is null or tipo in ('insert', 'update'))
);

comment on table public.tickets_avisos is 'Un renglón: sube con cada cambio de tickets para que las páginas abiertas se actualicen por Realtime (5H). Sin datos de tickets.';

insert into public.tickets_avisos (id) values (1);

-- RLS: cualquiera lo lee (también anon: el navegador escucha sin sesión); nadie lo escribe directo.
alter table public.tickets_avisos enable row level security;

create policy "tickets avisos: leer"
  on public.tickets_avisos for select to anon, authenticated
  using (true);

revoke all on public.tickets_avisos from anon, authenticated;
grant select on public.tickets_avisos to anon, authenticated;

alter publication supabase_realtime add table public.tickets_avisos;

create or replace function public.avisar_cambio_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tickets_avisos
  set version = version + 1,
      tipo = lower(tg_op),
      prioridad = new.prioridad,
      creado_por = new.created_by,
      updated_at = now()
  where id = 1;
  return null;
end;
$$;

revoke execute on function public.avisar_cambio_tickets() from public, anon, authenticated;

create trigger tickets_taller_avisar_cambio
  after insert or update on public.tickets_taller
  for each row execute function public.avisar_cambio_tickets();
