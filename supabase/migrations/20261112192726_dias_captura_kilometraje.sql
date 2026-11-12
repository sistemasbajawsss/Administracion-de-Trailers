-- =============================================================================
-- Sección 5H, Etapa 2 — Días de registro del kilometraje semanal (2026-11-12)
--
-- Pedido del usuario: el admin elige en la página Kilometraje uno o dos días de
-- la semana en que el capturista registra (antes, lunes y martes fijos). Se
-- repiten cada semana. Sirve también para probar cualquier día antes de los
-- datos reales. La semana sigue empezando el lunes (una lectura por semana).
--
-- es_dia_de_captura_semanal(fecha) deja de ser fija: lee los días elegidos.
-- Versión anterior en 20261112185135_kilometraje_semanal.sql.
-- =============================================================================

create table public.ajustes_kilometraje (
  id smallint primary key default 1,
  -- Días ISO (1 = lunes … 7 = domingo), ordenados.
  dias_captura smallint[] not null default '{1,2}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint ajustes_kilometraje_una_fila check (id = 1),
  constraint ajustes_kilometraje_dias_validos check (
    cardinality(dias_captura) between 1 and 2
    and dias_captura <@ '{1,2,3,4,5,6,7}'::smallint[]
    and (cardinality(dias_captura) = 1 or dias_captura[1] < dias_captura[2])
  )
);

comment on table public.ajustes_kilometraje is 'Días de la semana en que el capturista registra el kilometraje semanal (5H). Una sola fila; la cambia el admin.';

insert into public.ajustes_kilometraje (id, dias_captura) values (1, '{1,2}');

create trigger ajustes_kilometraje_updated_at
  before update on public.ajustes_kilometraje
  for each row execute function public.actualizar_updated_at();

alter table public.ajustes_kilometraje enable row level security;

create policy "ajustes kilometraje: leer"
  on public.ajustes_kilometraje for select to authenticated
  using ((select public.rol_actual()) is not null);

revoke all on public.ajustes_kilometraje from anon;
revoke insert, update, delete, truncate, references, trigger on public.ajustes_kilometraje from authenticated;
grant select on public.ajustes_kilometraje to authenticated;

-- Días elegidos (para las funciones; la app lee la tabla).
create or replace function public.dias_captura_kilometraje()
returns smallint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.dias_captura from public.ajustes_kilometraje a where a.id = 1), '{1,2}'::smallint[]);
$$;

revoke execute on function public.dias_captura_kilometraje() from public, anon;
grant execute on function public.dias_captura_kilometraje() to authenticated;

-- Ahora según los días elegidos (antes: lunes y martes fijos).
create or replace function public.es_dia_de_captura_semanal(p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(isodow from p_fecha)::smallint = any (public.dias_captura_kilometraje());
$$;

comment on function public.es_dia_de_captura_semanal(date) is 'El día de esa fecha es uno de los días de registro del kilometraje semanal que eligió el admin (5H).';

-- Cambiar los días (solo admin): uno o dos días de la semana, 1 = lunes … 7 = domingo.
create or replace function public.cambiar_dias_captura_kilometraje(p_dias smallint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dias smallint[];
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar los días de registro' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct d order by d), '{}') into v_dias from unnest(p_dias) d where d is not null;

  if cardinality(v_dias) not between 1 and 2 then
    raise exception 'Elige uno o dos días' using errcode = '23514';
  end if;
  if not v_dias <@ '{1,2,3,4,5,6,7}'::smallint[] then
    raise exception 'Día no válido' using errcode = '23514';
  end if;

  update public.ajustes_kilometraje
  set dias_captura = v_dias, updated_by = auth.uid()
  where id = 1;
end;
$$;

revoke execute on function public.cambiar_dias_captura_kilometraje(smallint[]) from public, anon;
grant execute on function public.cambiar_dias_captura_kilometraje(smallint[]) to authenticated;

notify pgrst, 'reload schema';
