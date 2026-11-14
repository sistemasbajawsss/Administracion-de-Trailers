-- 5I, Etapa 3: cierre de mes (D17).
-- Un mes que ya terminó se cierra solo el día de cierre del mes siguiente (5 al
-- empezar, 00:00 de Tijuana) o antes si el admin lo cierra; el admin lo reabre
-- con motivo y queda abierto hasta que lo vuelva a cerrar.
-- Cerrado: quien no es admin no registra, edita, mueve ni elimina servicios de
-- ese mes, no cambia sus gastos y no quita sus comprobantes (sí los agrega).
-- Lo que corre sin usuario (auth.uid() nulo: SQL del sistema) no se frena.
-- No se cierra: taller, tickets, kilometraje, mantenimientos.

-- ---------------------------------------------------------------------------
-- Ajuste: día del cierre automático (un renglón).
-- ---------------------------------------------------------------------------
create table public.ajustes_cierre (
  id smallint primary key default 1 check (id = 1),
  dia_cierre smallint not null default 5 check (dia_cierre between 1 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.ajustes_cierre (id, dia_cierre) values (1, 5);

create trigger ajustes_cierre_actualizar_updated_at
before update on public.ajustes_cierre
for each row execute function public.actualizar_updated_at();

alter table public.ajustes_cierre enable row level security;

create policy "ajustes_cierre: leer con rol"
on public.ajustes_cierre for select
to authenticated
using ((select public.rol_actual()) is not null);

revoke all on public.ajustes_cierre from public, anon, authenticated;
grant select on public.ajustes_cierre to authenticated;

-- ---------------------------------------------------------------------------
-- Cierres y reaperturas (bitácora; el estado de un mes es su último evento).
-- ---------------------------------------------------------------------------
create table public.cierres_mes_eventos (
  id uuid primary key default gen_random_uuid(),
  mes date not null check (extract(day from mes) = 1),
  accion text not null check (accion in ('cerrar', 'reabrir')),
  motivo text check (motivo is null or length(trim(motivo)) >= 5),
  created_by uuid not null,
  -- clock_timestamp: dos eventos en la misma transacción quedan en orden.
  created_at timestamptz not null default clock_timestamp(),
  check (accion = 'cerrar' or motivo is not null)
);

create index cierres_mes_eventos_mes_idx on public.cierres_mes_eventos (mes, created_at desc);
create index cierres_mes_eventos_created_by_idx on public.cierres_mes_eventos (created_by);

alter table public.cierres_mes_eventos enable row level security;

create policy "cierres_mes_eventos: leer admin y gerente"
on public.cierres_mes_eventos for select
to authenticated
using ((select public.puede_ver_todo()));

revoke all on public.cierres_mes_eventos from public, anon, authenticated;
grant select on public.cierres_mes_eventos to authenticated;

-- ---------------------------------------------------------------------------
-- Apoyo.
-- ---------------------------------------------------------------------------
create function public.hoy_tijuana()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Tijuana')::date;
$$;

/** "octubre de 2026". */
create function public.nombre_mes(p_fecha date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from p_fecha)::int]
         || ' de ' || extract(year from p_fecha)::int;
$$;

create function public.dia_cierre()
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.dia_cierre from public.ajustes_cierre a where a.id = 1), 5::smallint);
$$;

/**
 * ¿El mes de esta fecha está cerrado? El mes en curso (y los futuros) nunca.
 * Con eventos, manda el último; sin eventos, se cierra solo el día de cierre
 * del mes siguiente.
 */
create function public.mes_cerrado(p_fecha date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_fecha)::date;
  v_hoy date := public.hoy_tijuana();
  v_accion text;
begin
  if p_fecha is null or v_mes >= date_trunc('month', v_hoy)::date then
    return false;
  end if;

  select e.accion into v_accion
  from public.cierres_mes_eventos e
  where e.mes = v_mes
  order by e.created_at desc, e.id desc
  limit 1;

  if found then
    return v_accion = 'cerrar';
  end if;

  return v_hoy >= (v_mes + interval '1 month')::date + (public.dia_cierre() - 1);
end;
$$;

/**
 * Meses que ya terminaron y siguen abiertos (el anterior antes de su día de
 * cierre, y los que reabrió el admin). Todo mes pasado que no esté aquí está
 * cerrado; así la pantalla sabe qué fechas ofrecer.
 */
create function public.meses_abiertos()
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  with candidatos as (
    select (date_trunc('month', public.hoy_tijuana()) - interval '1 month')::date as mes
    union
    select distinct e.mes from public.cierres_mes_eventos e
  )
  select c.mes
  from candidatos c
  where c.mes < date_trunc('month', public.hoy_tijuana())::date
    and not public.mes_cerrado(c.mes)
  order by c.mes;
$$;

/** Estado de los últimos meses para la sección "Cierre de mes" (admin y gerente). */
create function public.meses_cierre(p_meses integer default 12)
returns table (
  mes date,
  en_curso boolean,
  cerrado boolean,
  cierra_solo date,
  ultima_accion text,
  por text,
  at timestamptz,
  motivo text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_ver_todo() then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;

  return query
  select m.mes,
         m.mes = date_trunc('month', public.hoy_tijuana())::date,
         public.mes_cerrado(m.mes),
         ((m.mes + interval '1 month')::date + (public.dia_cierre() - 1))::date,
         e.accion,
         public.nombre_usuario(e.created_by),
         e.created_at,
         e.motivo
  from (
    select (date_trunc('month', public.hoy_tijuana()) - make_interval(months => g))::date as mes
    from generate_series(0, greatest(least(coalesce(p_meses, 12), 60), 1) - 1) g
  ) m
  left join lateral (
    select ev.accion, ev.created_by, ev.created_at, ev.motivo
    from public.cierres_mes_eventos ev
    where ev.mes = m.mes
    order by ev.created_at desc, ev.id desc
    limit 1
  ) e on true
  order by m.mes desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acciones del admin.
-- ---------------------------------------------------------------------------
create function public.cerrar_mes(p_mes date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cerrar un mes' using errcode = '42501';
  end if;
  if v_mes is null or v_mes >= date_trunc('month', public.hoy_tijuana())::date then
    raise exception 'Solo se puede cerrar un mes que ya terminó' using errcode = '23514';
  end if;
  if public.mes_cerrado(v_mes) then
    raise exception 'El mes de % ya está cerrado', public.nombre_mes(v_mes) using errcode = '23514';
  end if;

  insert into public.cierres_mes_eventos (mes, accion, created_by) values (v_mes, 'cerrar', auth.uid());
end;
$$;

create function public.reabrir_mes(p_mes date, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede reabrir un mes' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se reabre (mínimo 5 letras)' using errcode = '23514';
  end if;
  if v_mes is null or not public.mes_cerrado(v_mes) then
    raise exception 'Ese mes no está cerrado' using errcode = '23514';
  end if;

  insert into public.cierres_mes_eventos (mes, accion, motivo, created_by)
  values (v_mes, 'reabrir', trim(p_motivo), auth.uid());
end;
$$;

create function public.cambiar_dia_cierre(p_dia smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar el día de cierre' using errcode = '42501';
  end if;
  if p_dia is null or p_dia not between 1 and 28 then
    raise exception 'El día de cierre va del 1 al 28' using errcode = '23514';
  end if;

  update public.ajustes_cierre set dia_cierre = p_dia, updated_by = auth.uid() where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Candados (triggers). El admin y lo que corre sin usuario pasan.
-- ---------------------------------------------------------------------------
create function public.puede_cambiar_mes_cerrado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null or public.es_admin();
$$;

create function public.validar_mes_abierto_servicio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.puede_cambiar_mes_cerrado() then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and public.mes_cerrado(old.fecha) then
    raise exception 'El mes de % ya está cerrado: solo el administrador puede cambiar sus servicios. Pídeselo.',
      public.nombre_mes(old.fecha) using errcode = '23514';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and public.mes_cerrado(new.fecha) then
    raise exception 'El mes de % ya está cerrado: solo el administrador puede registrar servicios con esa fecha. Pídeselo.',
      public.nombre_mes(new.fecha) using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger servicios_mes_abierto
before insert or update or delete on public.servicios
for each row execute function public.validar_mes_abierto_servicio();

create function public.validar_mes_abierto_gasto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date;
begin
  if public.puede_cambiar_mes_cerrado() then
    return coalesce(new, old);
  end if;

  select s.fecha into v_fecha from public.servicios s where s.id = coalesce(new.servicio_id, old.servicio_id);
  if public.mes_cerrado(v_fecha) then
    raise exception 'El mes de % ya está cerrado: solo el administrador puede cambiar sus gastos. Pídeselo.',
      public.nombre_mes(v_fecha) using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.servicio_id is distinct from old.servicio_id then
    select s.fecha into v_fecha from public.servicios s where s.id = old.servicio_id;
    if public.mes_cerrado(v_fecha) then
      raise exception 'El mes de % ya está cerrado: solo el administrador puede cambiar sus gastos. Pídeselo.',
        public.nombre_mes(v_fecha) using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger gastos_mes_abierto
before insert or update or delete on public.gastos
for each row execute function public.validar_mes_abierto_gasto();

-- Comprobantes: agregar sí (las facturas llegan tarde); quitar, solo el admin.
create function public.validar_mes_abierto_comprobante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date;
begin
  if public.puede_cambiar_mes_cerrado() then
    return old;
  end if;

  select s.fecha into v_fecha from public.servicios s where s.id = old.servicio_id;
  if public.mes_cerrado(v_fecha) then
    raise exception 'El mes de % ya está cerrado: solo el administrador puede quitar sus facturas. Pídeselo.',
      public.nombre_mes(v_fecha) using errcode = '23514';
  end if;

  return old;
end;
$$;

create trigger comprobantes_mes_abierto
before delete on public.comprobantes
for each row execute function public.validar_mes_abierto_comprobante();

-- ---------------------------------------------------------------------------
-- Permisos.
-- ---------------------------------------------------------------------------
revoke execute on function public.hoy_tijuana() from public, anon;
revoke execute on function public.nombre_mes(date) from public, anon;
revoke execute on function public.dia_cierre() from public, anon;
revoke execute on function public.mes_cerrado(date) from public, anon;
revoke execute on function public.meses_abiertos() from public, anon;
revoke execute on function public.meses_cierre(integer) from public, anon;
revoke execute on function public.cerrar_mes(date) from public, anon;
revoke execute on function public.reabrir_mes(date, text) from public, anon;
revoke execute on function public.cambiar_dia_cierre(smallint) from public, anon;
revoke execute on function public.puede_cambiar_mes_cerrado() from public, anon, authenticated;
revoke execute on function public.validar_mes_abierto_servicio() from public, anon, authenticated;
revoke execute on function public.validar_mes_abierto_gasto() from public, anon, authenticated;
revoke execute on function public.validar_mes_abierto_comprobante() from public, anon, authenticated;

grant execute on function public.hoy_tijuana() to authenticated;
grant execute on function public.nombre_mes(date) to authenticated;
grant execute on function public.dia_cierre() to authenticated;
grant execute on function public.mes_cerrado(date) to authenticated;
grant execute on function public.meses_abiertos() to authenticated;
grant execute on function public.meses_cierre(integer) to authenticated;
grant execute on function public.cerrar_mes(date) to authenticated;
grant execute on function public.reabrir_mes(date, text) to authenticated;
grant execute on function public.cambiar_dia_cierre(smallint) to authenticated;
