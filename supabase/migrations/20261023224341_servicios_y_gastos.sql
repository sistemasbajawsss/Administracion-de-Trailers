-- Sección 2: servicios, gastos e historial de cambios.
--
-- Altas, ediciones y eliminaciones pasan por funciones (registrar_servicio, actualizar_servicio,
-- eliminar_servicio) que guardan el servicio y sus gastos en una sola transacción. Las funciones
-- corren con los permisos del usuario (security invoker), así que RLS sigue aplicando.
-- El motivo de cada cambio viaja en la variable de transacción `app.motivo`; los triggers
-- rechazan cualquier edición o borrado sin motivo, aunque se intente por API directa.

-- ---------------------------------------------------------------------------
-- Categorías: marca de "concepto obligatorio" (para "Otros (especificar)")
-- ---------------------------------------------------------------------------
alter table public.categorias
  add column requiere_concepto boolean not null default false;

update public.categorias set requiere_concepto = true where nombre = 'Otros (especificar)';

-- ---------------------------------------------------------------------------
-- Servicios
-- ---------------------------------------------------------------------------
create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references public.unidades (id) on delete restrict,
  fecha date not null check (fecha >= date '2000-01-01'),
  kilometraje integer check (kilometraje is null or kilometraje between 0 and 9999999),
  proveedor_id uuid references public.proveedores (id) on delete restrict,
  descripcion text check (descripcion is null or length(descripcion) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  updated_by uuid references auth.users (id) on delete restrict
);

comment on table public.servicios is 'Visita al taller o reparación de una unidad. Sus montos están en gastos.';

create index servicios_unidad_fecha_idx on public.servicios (unidad_id, fecha desc);
create index servicios_fecha_idx on public.servicios (fecha desc);
create index servicios_created_by_idx on public.servicios (created_by, fecha desc);
create index servicios_proveedor_idx on public.servicios (proveedor_id);

-- ---------------------------------------------------------------------------
-- Gastos (renglones de un servicio)
-- ---------------------------------------------------------------------------
create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios (id) on delete cascade,
  categoria_id uuid not null references public.categorias (id) on delete restrict,
  concepto text check (concepto is null or length(concepto) <= 200),
  monto numeric(12, 2) not null check (monto > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict
);

comment on table public.gastos is 'Renglón de gasto de un servicio. Monto en MXN con IVA incluido.';

create index gastos_servicio_idx on public.gastos (servicio_id);
create index gastos_categoria_idx on public.gastos (categoria_id);

-- ---------------------------------------------------------------------------
-- Historial de cambios (solo lo escriben los triggers; nadie lo edita ni borra)
-- ---------------------------------------------------------------------------
create type public.accion_historial as enum ('insert', 'update', 'delete');

create table public.historial_cambios (
  id bigint generated always as identity primary key,
  tabla text not null check (tabla in ('servicios', 'gastos')),
  registro_id uuid not null,
  -- Sin llave foránea: el historial sobrevive al servicio eliminado.
  servicio_id uuid not null,
  -- Quién capturó el servicio; decide quién puede ver este historial.
  dueno_id uuid not null,
  accion public.accion_historial not null,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  motivo text,
  created_by uuid references auth.users (id) on delete set null,
  autor_nombre text,
  created_at timestamptz not null default now()
);

comment on table public.historial_cambios is 'Línea de cambios de servicios y gastos: quién, cuándo, qué cambió y por qué.';

create index historial_servicio_idx on public.historial_cambios (servicio_id, created_at);
create index historial_dueno_idx on public.historial_cambios (dueno_id);

-- ---------------------------------------------------------------------------
-- Triggers de preparación y validación
-- security definer para leer unidades y categorías aunque RLS las oculte.
-- ---------------------------------------------------------------------------
create or replace function public.preparar_servicio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_tipo public.tipo_unidad;
  v_estatus public.estatus_unidad;
  v_validar_unidad boolean := tg_op = 'INSERT';
begin
  new.descripcion = nullif(trim(new.descripcion), '');

  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
  else
    -- Campos que no se pueden cambiar al editar.
    new.created_by = old.created_by;
    new.created_at = old.created_at;
    new.updated_by = auth.uid();
    v_validar_unidad = new.unidad_id is distinct from old.unidad_id;
  end if;

  select u.numero_economico, u.tipo, u.estatus
    into v_numero, v_tipo, v_estatus
  from public.unidades u
  where u.id = new.unidad_id;

  if v_validar_unidad and v_estatus = 'baja' then
    raise exception 'La unidad % está dada de baja', v_numero using errcode = '23514';
  end if;

  -- Las cajas no tienen odómetro.
  if v_tipo = 'caja' then
    new.kilometraje = null;
  end if;

  if new.fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha del servicio no puede ser futura' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger servicios_preparar
  before insert or update on public.servicios
  for each row execute function public.preparar_servicio();

create trigger servicios_actualizar_updated_at
  before update on public.servicios
  for each row execute function public.actualizar_updated_at();

create or replace function public.preparar_gasto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
begin
  new.concepto = nullif(trim(new.concepto), '');

  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
  else
    new.servicio_id = old.servicio_id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;

  if new.concepto is null then
    select c.nombre into v_categoria
    from public.categorias c
    where c.id = new.categoria_id and c.requiere_concepto;

    if found then
      raise exception 'Escribe qué fue el gasto de "%"', v_categoria using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger gastos_preparar
  before insert or update on public.gastos
  for each row execute function public.preparar_gasto();

create trigger gastos_actualizar_updated_at
  before update on public.gastos
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger de historial
-- Exige motivo en todo cambio que no sea el alta de un servicio con sus gastos iniciales.
-- Al eliminar un servicio se guarda una foto de sus gastos en el mismo renglón y se
-- omiten los renglones de los gastos borrados en cascada.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_historial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(trim(current_setting('app.motivo', true)), '');
  v_anterior jsonb;
  v_nuevo jsonb;
  v_fila jsonb;
  v_servicio_id uuid;
  v_dueno_id uuid;
  v_es_alta boolean;
begin
  if tg_op <> 'INSERT' then
    v_anterior = to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_nuevo = to_jsonb(new);
  end if;
  v_fila = coalesce(v_nuevo, v_anterior);

  if tg_table_name = 'servicios' then
    v_servicio_id = (v_fila ->> 'id')::uuid;
    v_dueno_id = (v_fila ->> 'created_by')::uuid;
    v_es_alta = tg_op = 'INSERT';
  else
    v_servicio_id = (v_fila ->> 'servicio_id')::uuid;

    if tg_op = 'DELETE'
       and current_setting('app.servicio_eliminado', true) = v_servicio_id::text then
      return null;
    end if;

    select s.created_by into v_dueno_id from public.servicios s where s.id = v_servicio_id;
    v_es_alta = tg_op = 'INSERT'
      and current_setting('app.servicio_nuevo', true) = v_servicio_id::text;
  end if;

  if v_motivo is null and not v_es_alta then
    raise exception 'Todo cambio necesita un motivo' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and (v_anterior - 'updated_at' - 'updated_by') = (v_nuevo - 'updated_at' - 'updated_by') then
    return null;
  end if;

  if tg_table_name = 'servicios' and tg_op = 'DELETE' then
    v_anterior = v_anterior || jsonb_build_object(
      'gastos',
      (select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at), '[]'::jsonb)
       from public.gastos g
       where g.servicio_id = v_servicio_id)
    );
    perform set_config('app.servicio_eliminado', v_servicio_id::text, true);
  end if;

  insert into public.historial_cambios (
    tabla, registro_id, servicio_id, dueno_id, accion,
    datos_anteriores, datos_nuevos, motivo, created_by, autor_nombre
  )
  values (
    tg_table_name,
    (v_fila ->> 'id')::uuid,
    v_servicio_id,
    v_dueno_id,
    lower(tg_op)::public.accion_historial,
    v_anterior,
    v_nuevo,
    v_motivo,
    auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- El borrado de servicios se registra ANTES, cuando sus gastos todavía existen.
create trigger servicios_historial_borrado
  before delete on public.servicios
  for each row execute function public.registrar_historial();

create trigger servicios_historial
  after insert or update on public.servicios
  for each row execute function public.registrar_historial();

create trigger gastos_historial
  after insert or update or delete on public.gastos
  for each row execute function public.registrar_historial();

revoke execute on function public.preparar_servicio() from public, anon, authenticated;
revoke execute on function public.preparar_gasto() from public, anon, authenticated;
revoke execute on function public.registrar_historial() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.servicios enable row level security;
alter table public.gastos enable row level security;
alter table public.historial_cambios enable row level security;

revoke all on public.servicios, public.gastos, public.historial_cambios from anon;
revoke insert, update, delete, truncate on public.historial_cambios from authenticated;

-- Servicios: el capturista activo ve y edita los suyos; admin todos; solo admin elimina.
create policy "servicios: leer"
  on public.servicios for select to authenticated
  using (
    (select public.es_admin())
    or (created_by = (select auth.uid()) and (select public.rol_actual()) is not null)
  );

create policy "servicios: crear"
  on public.servicios for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.rol_actual()) is not null);

create policy "servicios: editar"
  on public.servicios for update to authenticated
  using (
    (select public.es_admin())
    or (created_by = (select auth.uid()) and (select public.rol_actual()) is not null)
  )
  with check (
    (select public.es_admin())
    or (created_by = (select auth.uid()) and (select public.rol_actual()) is not null)
  );

create policy "servicios: admin elimina"
  on public.servicios for delete to authenticated
  using ((select public.es_admin()));

-- Gastos: siguen al servicio (la subconsulta ya aplica la RLS de servicios).
create policy "gastos: leer"
  on public.gastos for select to authenticated
  using (exists (select 1 from public.servicios s where s.id = servicio_id));

create policy "gastos: crear"
  on public.gastos for insert to authenticated
  with check (exists (select 1 from public.servicios s where s.id = servicio_id));

create policy "gastos: editar"
  on public.gastos for update to authenticated
  using (exists (select 1 from public.servicios s where s.id = servicio_id))
  with check (exists (select 1 from public.servicios s where s.id = servicio_id));

create policy "gastos: quitar"
  on public.gastos for delete to authenticated
  using (exists (select 1 from public.servicios s where s.id = servicio_id));

-- Historial: solo lectura; el capturista ve el de sus propios servicios.
create policy "historial: leer"
  on public.historial_cambios for select to authenticated
  using (
    (select public.es_admin())
    or (dueno_id = (select auth.uid()) and (select public.rol_actual()) is not null)
  );

-- ---------------------------------------------------------------------------
-- Vistas (security_invoker: respetan la RLS de quien consulta)
-- Los totales se suman en la base de datos, nunca en JavaScript.
-- ---------------------------------------------------------------------------
create view public.servicios_resumen
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
  ) as editado
from public.servicios s
left join lateral (
  select sum(x.monto) as total, count(*) as num_gastos
  from public.gastos x
  where x.servicio_id = s.id
) g on true;

create view public.totales_por_unidad
with (security_invoker = true)
as
select
  s.unidad_id,
  sum(g.monto)::numeric(12, 2) as total,
  count(distinct s.id)::integer as num_servicios,
  max(s.fecha) as ultimo_servicio
from public.servicios s
join public.gastos g on g.servicio_id = s.id
group by s.unidad_id;

revoke all on public.servicios_resumen, public.totales_por_unidad from anon;

-- ---------------------------------------------------------------------------
-- Funciones para la app (security invoker: RLS aplica)
-- p_gastos: arreglo JSON de { id?, categoria_id, concepto, monto } con monto como texto.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_servicio(
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_proveedor_id uuid,
  p_descripcion text,
  p_gastos jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_gastos) is distinct from 'array' or jsonb_array_length(p_gastos) = 0 then
    raise exception 'Agrega al menos un gasto' using errcode = '23514';
  end if;

  insert into public.servicios (unidad_id, fecha, kilometraje, proveedor_id, descripcion)
  values (p_unidad_id, p_fecha, p_kilometraje, p_proveedor_id, p_descripcion)
  returning id into v_id;

  perform set_config('app.servicio_nuevo', v_id::text, true);

  insert into public.gastos (servicio_id, categoria_id, concepto, monto)
  select v_id, (x ->> 'categoria_id')::uuid, x ->> 'concepto', (x ->> 'monto')::numeric
  from jsonb_array_elements(p_gastos) as x;

  return v_id;
end;
$$;

create or replace function public.actualizar_servicio(
  p_servicio_id uuid,
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_proveedor_id uuid,
  p_descripcion text,
  p_gastos jsonb,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo del cambio' using errcode = '23514';
  end if;
  if jsonb_typeof(p_gastos) is distinct from 'array' or jsonb_array_length(p_gastos) = 0 then
    raise exception 'Agrega al menos un gasto' using errcode = '23514';
  end if;

  perform set_config('app.motivo', trim(p_motivo), true);

  update public.servicios
  set unidad_id = p_unidad_id,
      fecha = p_fecha,
      kilometraje = p_kilometraje,
      proveedor_id = p_proveedor_id,
      descripcion = p_descripcion
  where id = p_servicio_id;

  if not found then
    raise exception 'No se encontró el servicio' using errcode = 'P0002';
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
  update public.gastos g
  set categoria_id = (x ->> 'categoria_id')::uuid,
      concepto = x ->> 'concepto',
      monto = (x ->> 'monto')::numeric
  from jsonb_array_elements(p_gastos) as x
  where nullif(x ->> 'id', '') is not null
    and g.id = (x ->> 'id')::uuid
    and g.servicio_id = p_servicio_id;

  -- Renglones nuevos.
  insert into public.gastos (servicio_id, categoria_id, concepto, monto)
  select p_servicio_id, (x ->> 'categoria_id')::uuid, x ->> 'concepto', (x ->> 'monto')::numeric
  from jsonb_array_elements(p_gastos) as x
  where nullif(x ->> 'id', '') is null;
end;
$$;

create or replace function public.eliminar_servicio(p_servicio_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la eliminación' using errcode = '23514';
  end if;

  perform set_config('app.motivo', trim(p_motivo), true);

  delete from public.servicios where id = p_servicio_id;

  if not found then
    raise exception 'No se encontró el servicio o no tienes permiso para eliminarlo' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb) from public, anon;
revoke execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text) from public, anon;
revoke execute on function public.eliminar_servicio(uuid, text) from public, anon;
grant execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb) to authenticated;
grant execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text) to authenticated;
grant execute on function public.eliminar_servicio(uuid, text) to authenticated;
