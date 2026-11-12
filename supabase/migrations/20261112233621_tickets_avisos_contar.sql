-- =============================================================================
-- Sección 5H — El aviso de tickets nuevos cuenta bien aunque lleguen juntos
-- (pedido del usuario, 2026-11-12).
-- El contador de avisos gana el total de tickets creados y de urgentes. La
-- pantalla compara contra lo último que vio: si dos tickets llegan casi al mismo
-- tiempo, o se pierde un aviso por mala señal, la diferencia los cuenta todos.
-- =============================================================================

alter table public.tickets_avisos
  add column creados bigint not null default 0,
  add column urgentes bigint not null default 0;

-- Empieza con lo que ya hay, para que el total sea real desde hoy.
update public.tickets_avisos
set creados = (select count(*) from public.tickets_taller),
    urgentes = (select count(*) from public.tickets_taller where prioridad = 'urgente')
where id = 1;

create or replace function public.avisar_cambio_tickets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- El update toma el candado del renglón: dos tickets al mismo tiempo suman uno tras otro.
  update public.tickets_avisos
  set version = version + 1,
      tipo = lower(tg_op),
      prioridad = new.prioridad,
      creado_por = new.created_by,
      creados = creados + case when tg_op = 'INSERT' then 1 else 0 end,
      urgentes = urgentes + case when tg_op = 'INSERT' and new.prioridad = 'urgente' then 1 else 0 end,
      updated_at = now()
  where id = 1;
  return null;
end;
$$;
