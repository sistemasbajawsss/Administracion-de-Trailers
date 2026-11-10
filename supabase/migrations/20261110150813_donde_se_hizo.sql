-- =============================================================================
-- Sección 5G — ¿Dónde se hizo? (2026-11-10)
--
-- Cada servicio nuevo dice dónde se hizo el trabajo (pedido del usuario):
--   taller_propio:  en Taller Realso, el taller de la empresa;
--   taller_externo: en un taller de fuera (cuál, del catálogo talleres);
--   en_camino:      en la carretera (qué taller, del catálogo talleres).
-- El proveedor sigue siendo dónde se compró la pieza; el taller es quién hizo
-- el trabajo. Los servicios de antes quedan sin dato (null).
--
-- Compatibilidad con la app publicada: el lugar es opcional en la BD (lo exige
-- el servidor de la app en servicios nuevos). registrar_servicio y
-- actualizar_servicio reciben dos parámetros opcionales al final; llamadas como
-- antes hacen lo mismo (al editar sin lugar, se conserva el que tenía).
--
-- Versiones anteriores (para regresar): registrar_servicio, actualizar_servicio,
-- restaurar_servicio y servicios_resumen en 20261109221717_mantenimientos_cumplidos.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tipo, catálogo de talleres y columnas
-- ---------------------------------------------------------------------------
create type public.lugar_servicio as enum ('taller_propio', 'taller_externo', 'en_camino');

-- Talleres de fuera (los que trabajan fuera o en camino). Mismas reglas que
-- proveedores: admin y capturista dan de alta; solo el admin edita y desactiva;
-- no se borran.
create table public.talleres (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.talleres is 'Talleres de fuera que hacen trabajos (5G). Taller Realso, el propio, no va aquí.';

create unique index talleres_nombre_unico on public.talleres (lower(trim(nombre)));

create trigger talleres_actualizar_updated_at
  before update on public.talleres
  for each row execute function public.actualizar_updated_at();

alter table public.talleres enable row level security;

revoke all on public.talleres from anon;
revoke delete, truncate, references, trigger on public.talleres from authenticated;
grant select, insert, update on public.talleres to authenticated;

create policy "talleres: leer"
  on public.talleres for select to authenticated
  using ((select public.rol_actual()) is not null and (activo or (select public.puede_ver_todo())));

create policy "talleres: crear"
  on public.talleres for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.puede_capturar())
    and (activo or (select public.es_admin()))
  );

create policy "talleres: admin actualiza"
  on public.talleres for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

alter table public.servicios
  add column lugar public.lugar_servicio,
  add column taller_id uuid references public.talleres (id) on delete restrict,
  -- Taller Realso no lleva taller; fuera y en camino, sí.
  add constraint servicios_lugar_con_taller check (
    (lugar is null and taller_id is null)
    or (lugar = 'taller_propio' and taller_id is null)
    or (lugar in ('taller_externo', 'en_camino') and taller_id is not null)
  );

comment on column public.servicios.lugar is 'Dónde se hizo: Taller Realso, taller de fuera o en camino (5G). Null en los de antes.';
comment on column public.servicios.taller_id is 'Qué taller lo hizo, si fue fuera o en camino (5G).';

create index servicios_taller_idx on public.servicios (taller_id) where taller_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Validación: con taller, que exista y esté activo; con Taller Realso, sin taller
-- Security definer: el capturista no ve los talleres desactivados y la revisión
-- debe verlos para rechazarlos. Al restaurar un servicio no se revisa (regresa
-- tal como estaba).
-- ---------------------------------------------------------------------------
create or replace function public.validar_lugar_servicio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_activo boolean;
begin
  if new.lugar is distinct from 'taller_externo' and new.lugar is distinct from 'en_camino' then
    new.taller_id := null;
    return new;
  end if;

  if new.taller_id is null then
    raise exception 'Elige qué taller hizo el servicio' using errcode = '23514';
  end if;

  if coalesce(current_setting('app.servicio_restaurado', true), '') = new.id::text then
    return new;
  end if;

  if tg_op = 'INSERT' or new.taller_id is distinct from old.taller_id then
    select t.nombre, t.activo into v_nombre, v_activo
    from public.talleres t
    where t.id = new.taller_id;

    if not found then
      raise exception 'No se encontró el taller' using errcode = '23503';
    end if;
    if not v_activo then
      raise exception 'El taller "%" está desactivado', v_nombre using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_lugar_servicio() from public, anon, authenticated;

create trigger servicios_validar_lugar
  before insert or update of lugar, taller_id on public.servicios
  for each row execute function public.validar_lugar_servicio();

-- ---------------------------------------------------------------------------
-- 3. servicios_resumen: lugar y taller al final (create or replace view lo permite)
-- Copia de 20261109221717_mantenimientos_cumplidos.sql + lugar y taller_id.
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
  s.mantenimientos,
  s.lugar,
  s.taller_id
from public.servicios s
left join lateral (
  select sum(x.monto) as total, count(*) as num_gastos
  from public.gastos x
  where x.servicio_id = s.id
) g on true;

-- ---------------------------------------------------------------------------
-- 4. registrar_servicio: dónde se hizo (opcional en la BD)
-- Copia de 20261109221717_mantenimientos_cumplidos.sql + p_lugar y p_taller_id.
-- ---------------------------------------------------------------------------
drop function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio, uuid[]);

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
  p_mantenimientos uuid[] default null,
  p_lugar public.lugar_servicio default null,
  p_taller_id uuid default null
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
    unidad_id, fecha, kilometraje, proveedor_id, descripcion, motivo_sin_entrada, tipo, mantenimientos, lugar, taller_id
  )
  values (
    p_unidad_id, p_fecha, p_kilometraje, p_proveedor_id, p_descripcion, p_motivo_sin_entrada, p_tipo,
    coalesce(p_mantenimientos, '{}'), p_lugar, p_taller_id
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
-- 5. actualizar_servicio: dónde se hizo (sin lugar, se conserva el que tenía)
-- Copia de 20261109221717_mantenimientos_cumplidos.sql + p_lugar y p_taller_id.
-- ---------------------------------------------------------------------------
drop function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[]);

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
  p_mantenimientos uuid[] default null,
  p_lugar public.lugar_servicio default null,
  p_taller_id uuid default null
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
      mantenimientos = coalesce(p_mantenimientos, mantenimientos),
      -- Sin lugar (app de antes), se conservan el lugar y el taller que tenía.
      lugar = coalesce(p_lugar, lugar),
      taller_id = case when p_lugar is null then taller_id else p_taller_id end
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

revoke execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio, uuid[], public.lugar_servicio, uuid) from public, anon;
revoke execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[], public.lugar_servicio, uuid) from public, anon;
grant execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio, uuid[], public.lugar_servicio, uuid) to authenticated;
grant execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio, uuid[], public.lugar_servicio, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. restaurar_servicio: también regresa dónde se hizo
-- Copia de 20261109221717_mantenimientos_cumplidos.sql + lugar y taller_id (las
-- copias de antes no los traen: queda sin dato).
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
    entrada_taller_id, sin_entrada_taller, motivo_sin_entrada, tipo, mantenimientos, lugar, taller_id
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
    ),
    (v_datos ->> 'lugar')::public.lugar_servicio,
    (v_datos ->> 'taller_id')::uuid
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
