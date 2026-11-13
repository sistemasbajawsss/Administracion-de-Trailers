-- 5I, Etapa 2: proveedores y talleres repetidos (D18).
-- 1. catalogo_parecidos(): al dar de alta uno nuevo, los que ya existen con un
--    nombre parecido (sin acentos, mayúsculas, puntos ni "S.A. de C.V.").
-- 2. unir_catalogo(): el admin une el repetido en el que se queda; sus servicios
--    pasan al que se queda (con motivo en el historial) y el repetido se
--    desactiva. Queda en la bitácora uniones_catalogo.
-- Compatible con la app publicada: solo agrega objetos nuevos.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Nombre para comparar: minúsculas, sin acentos, solo letras y números, sin
-- razón social. "Refacc. López, S.A. de C.V." -> "refacc lopez".
-- ---------------------------------------------------------------------------
create function public.normalizar_nombre_catalogo(p_nombre text)
returns text
language sql
stable
set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_nombre, ''))), '[^a-z0-9]+', ' ', 'g'),
      '(^| )(s a de c v|sa de cv|s de r l de c v|s de rl de cv|s de r l|s de rl|s a|sa|s c|sc)( |$)', ' ', 'g'),
    ' +', ' ', 'g'));
$$;

revoke execute on function public.normalizar_nombre_catalogo(text) from public, anon;
grant execute on function public.normalizar_nombre_catalogo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Parecidos: solo activos, los 5 más parecidos. Para quien da de alta
-- (admin y capturista); el gerente no da de alta.
-- ---------------------------------------------------------------------------
create function public.catalogo_parecidos(p_catalogo text, p_nombre text)
returns table (id uuid, nombre text, similitud real)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_buscado text := public.normalizar_nombre_catalogo(p_nombre);
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;
  if p_catalogo not in ('proveedores', 'talleres') then
    raise exception 'Catálogo no válido' using errcode = '22023';
  end if;
  if length(v_buscado) < 2 then
    return;
  end if;

  return query
  with c as (
    select p.id, p.nombre from public.proveedores p where p_catalogo = 'proveedores' and p.activo
    union all
    select t.id, t.nombre from public.talleres t where p_catalogo = 'talleres' and t.activo
  ), s as (
    select c.id, c.nombre, public.normalizar_nombre_catalogo(c.nombre) as normal
    from c
  )
  select s.id, s.nombre,
         greatest(
           extensions.similarity(s.normal, v_buscado),
           extensions.word_similarity(v_buscado, s.normal),
           extensions.word_similarity(s.normal, v_buscado),
           case when s.normal = v_buscado then 1 else 0 end
         )::real as similitud
  from s
  where s.normal = v_buscado
     or extensions.similarity(s.normal, v_buscado) >= 0.35
     or extensions.word_similarity(v_buscado, s.normal) >= 0.5
     or extensions.word_similarity(s.normal, v_buscado) >= 0.5
  order by 3 desc, 2
  limit 5;
end;
$$;

revoke execute on function public.catalogo_parecidos(text, text) from public, anon;
grant execute on function public.catalogo_parecidos(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bitácora de uniones: solo lectura para admin y gerente; la llena unir_catalogo().
-- ---------------------------------------------------------------------------
create table public.uniones_catalogo (
  id uuid primary key default gen_random_uuid(),
  catalogo text not null check (catalogo in ('proveedores', 'talleres')),
  quitado_id uuid not null,
  quitado_nombre text not null,
  queda_id uuid not null,
  queda_nombre text not null,
  servicios integer not null check (servicios >= 0),
  motivo text not null check (length(trim(motivo)) >= 5),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index uniones_catalogo_quitado_idx on public.uniones_catalogo (quitado_id);
create index uniones_catalogo_queda_idx on public.uniones_catalogo (queda_id);
create index uniones_catalogo_created_by_idx on public.uniones_catalogo (created_by);

alter table public.uniones_catalogo enable row level security;

create policy "uniones_catalogo: leer admin y gerente"
on public.uniones_catalogo for select
to authenticated
using ((select public.puede_ver_todo()));

revoke all on public.uniones_catalogo from public, anon, authenticated;
grant select on public.uniones_catalogo to authenticated;

-- ---------------------------------------------------------------------------
-- Unir: solo admin. Regresa cuántos servicios cambiaron.
-- Mueve también los servicios de meses cerrados (5I, Etapa 3): no cambia montos.
-- ---------------------------------------------------------------------------
create function public.unir_catalogo(p_catalogo text, p_quitar uuid, p_queda uuid, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quitado text;
  v_queda text;
  v_queda_activo boolean;
  v_servicios integer;
  v_etiqueta text := case p_catalogo when 'talleres' then 'talleres' else 'proveedores' end;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede unir %', v_etiqueta using errcode = '42501';
  end if;
  if p_catalogo not in ('proveedores', 'talleres') then
    raise exception 'Catálogo no válido' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 letras)' using errcode = '23514';
  end if;
  if p_quitar is null or p_queda is null or p_quitar = p_queda then
    raise exception 'Elige dos % distintos', v_etiqueta using errcode = '23514';
  end if;

  if p_catalogo = 'proveedores' then
    select nombre into v_quitado from public.proveedores where id = p_quitar for update;
    if not found then raise exception 'No se encontró el proveedor que se va a quitar' using errcode = 'P0002'; end if;
    select nombre, activo into v_queda, v_queda_activo from public.proveedores where id = p_queda for update;
    if not found then raise exception 'No se encontró el proveedor que se queda' using errcode = 'P0002'; end if;
  else
    select nombre into v_quitado from public.talleres where id = p_quitar for update;
    if not found then raise exception 'No se encontró el taller que se va a quitar' using errcode = 'P0002'; end if;
    select nombre, activo into v_queda, v_queda_activo from public.talleres where id = p_queda for update;
    if not found then raise exception 'No se encontró el taller que se queda' using errcode = 'P0002'; end if;
  end if;

  if not v_queda_activo then
    raise exception '"%" está desactivado: elige uno activo para que se quede', v_queda using errcode = '23514';
  end if;

  -- Motivo para el historial de cada servicio que cambia.
  perform set_config('app.motivo',
    format('Unión de %s: "%s" pasó a "%s". %s', v_etiqueta, v_quitado, v_queda, trim(p_motivo)), true);

  if p_catalogo = 'proveedores' then
    update public.servicios set proveedor_id = p_queda where proveedor_id = p_quitar;
    get diagnostics v_servicios = row_count;
    update public.proveedores set activo = false where id = p_quitar;
  else
    update public.servicios set taller_id = p_queda where taller_id = p_quitar;
    get diagnostics v_servicios = row_count;
    update public.talleres set activo = false where id = p_quitar;
  end if;

  insert into public.uniones_catalogo (catalogo, quitado_id, quitado_nombre, queda_id, queda_nombre, servicios, motivo, created_by)
  values (p_catalogo, p_quitar, v_quitado, p_queda, v_queda, v_servicios, trim(p_motivo), auth.uid());

  return v_servicios;
end;
$$;

revoke execute on function public.unir_catalogo(text, uuid, uuid, text) from public, anon;
grant execute on function public.unir_catalogo(text, uuid, uuid, text) to authenticated;
