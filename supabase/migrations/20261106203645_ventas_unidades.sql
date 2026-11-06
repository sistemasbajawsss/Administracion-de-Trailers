-- =============================================================================
-- Sección 5E, Etapa 2 — Unidades vendidas (2026-11-06)
-- Solo un admin marca una unidad como vendida (con fecha y nota) o deshace la
-- venta (con motivo). Vender una unidad en taller cierra su entrada. Una unidad
-- vendida se comporta como una de baja: el capturista no la ve, no admite
-- servicios nuevos ni entradas a taller, y su historial y gastos se conservan
-- (Reportes no filtra por estatus: sus totales no cambian).
-- La app publicada sigue funcionando: ninguna unidad tiene "vendida" hasta que
-- se use la función nueva.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla: cada venta (y, si se deshizo, quién, cuándo y por qué)
-- ---------------------------------------------------------------------------
create table public.ventas_unidades (
  id uuid primary key default gen_random_uuid(),
  -- Eliminar una unidad por completo (D5) borra también sus ventas.
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  fecha_venta date not null,
  nota text,
  vendida_nombre text,
  deshecha_at timestamptz,
  deshecha_by uuid references auth.users (id) on delete set null,
  deshecha_nombre text,
  motivo_deshacer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,

  constraint ventas_unidades_nota_corta
    check (nota is null or length(nota) <= 1000),
  constraint ventas_unidades_motivo_corto
    check (motivo_deshacer is null or length(motivo_deshacer) <= 1000),
  constraint ventas_unidades_deshacer_con_motivo
    check ((deshecha_at is null) = (motivo_deshacer is null))
);

comment on table public.ventas_unidades is 'Ventas de unidades y ventas deshechas (Sección 5E).';

-- Una sola venta vigente por unidad.
create unique index ventas_unidades_una_vigente on public.ventas_unidades (unidad_id) where deshecha_at is null;
create index ventas_unidades_unidad_idx on public.ventas_unidades (unidad_id, created_at desc);

create trigger ventas_unidades_actualizar_updated_at
  before update on public.ventas_unidades
  for each row execute function public.actualizar_updated_at();

alter table public.ventas_unidades enable row level security;

-- Solo admin y gerente (el capturista no ve las unidades vendidas).
create policy "ventas unidades: leer"
  on public.ventas_unidades for select to authenticated
  using ((select public.puede_ver_todo()));

revoke all on public.ventas_unidades from anon;
revoke insert, update, delete, truncate, references, trigger on public.ventas_unidades from authenticated;
grant select on public.ventas_unidades to authenticated;

-- ---------------------------------------------------------------------------
-- 2. El capturista no ve las vendidas (igual que las de baja)
-- Antes: estatus <> 'baja'.
-- ---------------------------------------------------------------------------
drop policy "unidades: leer" on public.unidades;
create policy "unidades: leer"
  on public.unidades for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (estatus not in ('baja', 'vendida') or (select public.puede_ver_todo()))
  );

-- ---------------------------------------------------------------------------
-- 3. Candado de estatus: ahora también "vendida"
-- Misma función que la Etapa 1 (proteger_estatus_taller) con la venta añadida.
-- "vendida" solo la ponen y quitan marcar_unidad_vendida() y deshacer_venta()
-- (avisan con app.cambio_venta = id de la unidad).
-- ---------------------------------------------------------------------------
create or replace function public.proteger_estatus_taller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_taller boolean := coalesce(current_setting('app.cambio_taller', true), '') = new.id::text;
  v_venta boolean := coalesce(current_setting('app.cambio_venta', true), '') = new.id::text;
begin
  if tg_op = 'INSERT' then
    if new.estatus = 'en_taller' then
      raise exception 'Para poner una unidad en taller, registra su entrada en Taller' using errcode = '23514';
    end if;
    if new.estatus = 'vendida' then
      raise exception 'Para marcar una unidad como vendida, usa "Marcar como vendida" en su ficha' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.estatus is not distinct from old.estatus then
    return new;
  end if;

  -- Venta: solo con las funciones de venta.
  if old.estatus = 'vendida' and not v_venta then
    raise exception 'La unidad % está vendida: usa "Deshacer venta" en su ficha', old.numero_economico using errcode = '23514';
  end if;
  if new.estatus = 'vendida' and not v_venta then
    raise exception 'Para marcar una unidad como vendida, usa "Marcar como vendida" en su ficha' using errcode = '23514';
  end if;
  if v_venta then
    return new;
  end if;

  -- Taller: solo con las funciones de taller.
  if v_taller then
    return new;
  end if;
  if new.estatus = 'en_taller' then
    raise exception 'Para poner una unidad en taller, registra su entrada en Taller' using errcode = '23514';
  end if;
  if old.estatus = 'en_taller' and exists (
    select 1 from public.entradas_taller e where e.unidad_id = old.id and e.fecha_salida is null
  ) then
    raise exception 'La unidad % está en taller: dale salida desde Taller', old.numero_economico using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Servicios nuevos: una unidad vendida se rechaza igual que una de baja
-- Copia de preparar_servicio() de 20261028191347_auditoria_integridad.sql; solo
-- cambia la condición de "baja" (y su mensaje).
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
  v_proveedor text;
  v_proveedor_activo boolean;
  v_restaurando boolean := false;
  v_validar boolean := tg_op = 'INSERT';
begin
  new.descripcion = nullif(trim(new.descripcion), '');

  if tg_op = 'INSERT' then
    -- coalesce: sin restauración en curso el ajuste no existe (NULL).
    v_restaurando = coalesce(current_setting('app.servicio_restaurado', true), '') = new.id::text;
    if not v_restaurando then
      -- Un alta nueva no elige su id ni sus fechas de auditoría.
      new.id = gen_random_uuid();
      new.created_by = auth.uid();
      new.created_at = now();
      new.updated_at = now();
      new.updated_by = null;
    end if;
    -- Restaurar a una unidad o proveedor que hoy están de baja es válido: es historial.
    v_validar = not v_restaurando;
  else
    -- Campos que no se pueden cambiar al editar.
    new.id = old.id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
    new.updated_by = auth.uid();
  end if;

  select u.numero_economico, u.tipo, u.estatus
    into v_numero, v_tipo, v_estatus
  from public.unidades u
  where u.id = new.unidad_id;

  if v_estatus in ('baja', 'vendida')
     and (v_validar or (tg_op = 'UPDATE' and new.unidad_id is distinct from old.unidad_id)) then
    raise exception 'La unidad % está %', v_numero,
      case v_estatus when 'vendida' then 'vendida' else 'dada de baja' end
      using errcode = '23514';
  end if;

  if new.proveedor_id is not null
     and (v_validar or (tg_op = 'UPDATE' and new.proveedor_id is distinct from old.proveedor_id)) then
    select p.nombre, p.activo into v_proveedor, v_proveedor_activo
    from public.proveedores p
    where p.id = new.proveedor_id;

    if found and not v_proveedor_activo then
      raise exception 'El proveedor "%" está desactivado', v_proveedor using errcode = '23514';
    end if;
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

-- ---------------------------------------------------------------------------
-- 5. Entrada a taller: tampoco para vendidas
-- Copia de registrar_entrada_taller() de 20261106201328_entradas_taller.sql;
-- solo cambia la condición de "baja".
-- ---------------------------------------------------------------------------
create or replace function public.registrar_entrada_taller(
  p_unidad_id uuid,
  p_fecha date,
  p_falla text
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

  -- Candado sobre la unidad: dos entradas al mismo tiempo se forman en fila.
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

  insert into public.entradas_taller (unidad_id, fecha_entrada, falla, reporta_nombre, created_by)
  values (
    p_unidad_id,
    p_fecha,
    v_falla,
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
-- 6. Marcar como vendida (solo admin)
-- Si está en taller, la entrada se cierra con la fecha de venta.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_unidad_vendida(
  p_unidad_id uuid,
  p_fecha date,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(trim(p_nota), '');
  v_nombre text := (select p.nombre from public.perfiles p where p.id = auth.uid());
  v_numero text;
  v_estatus public.estatus_unidad;
  v_entrada_id uuid;
  v_fecha_entrada date;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede marcar unidades como vendidas' using errcode = '42501';
  end if;
  if v_nota is not null and length(v_nota) > 1000 then
    raise exception 'La nota puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha de venta no puede ser futura' using errcode = '23514';
  end if;

  select u.numero_economico, u.estatus into v_numero, v_estatus
  from public.unidades u
  where u.id = p_unidad_id
  for update;

  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  if v_estatus = 'vendida' then
    raise exception 'La unidad % ya está vendida', v_numero using errcode = '23505';
  end if;

  -- En taller: se cierra la estancia con la fecha de venta.
  select e.id, e.fecha_entrada into v_entrada_id, v_fecha_entrada
  from public.entradas_taller e
  where e.unidad_id = p_unidad_id and e.fecha_salida is null
  for update;

  if found then
    if p_fecha < v_fecha_entrada then
      raise exception 'La fecha de venta no puede ser antes de su entrada a taller (%)', to_char(v_fecha_entrada, 'DD/MM/YYYY')
        using errcode = '23514';
    end if;
    update public.entradas_taller
    set fecha_salida = p_fecha,
        nota_salida = 'Unidad vendida',
        salida_by = auth.uid(),
        salida_nombre = v_nombre
    where id = v_entrada_id;
  end if;

  insert into public.ventas_unidades (unidad_id, fecha_venta, nota, vendida_nombre, created_by)
  values (p_unidad_id, p_fecha, v_nota, v_nombre, auth.uid());

  perform set_config('app.cambio_venta', p_unidad_id::text, true);
  update public.unidades set estatus = 'vendida' where id = p_unidad_id;
  perform set_config('app.cambio_venta', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Deshacer venta (solo admin, con motivo). La unidad regresa a Activo.
-- ---------------------------------------------------------------------------
create or replace function public.deshacer_venta(
  p_unidad_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(trim(p_motivo), '');
  v_numero text;
  v_estatus public.estatus_unidad;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede deshacer una venta' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Escribe el motivo' using errcode = '23514';
  end if;
  if length(v_motivo) > 1000 then
    raise exception 'El motivo puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;

  select u.numero_economico, u.estatus into v_numero, v_estatus
  from public.unidades u
  where u.id = p_unidad_id
  for update;

  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  if v_estatus <> 'vendida' then
    raise exception 'La unidad % no está vendida', v_numero using errcode = '23514';
  end if;

  update public.ventas_unidades
  set deshecha_at = now(),
      deshecha_by = auth.uid(),
      deshecha_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid()),
      motivo_deshacer = v_motivo
  where unidad_id = p_unidad_id and deshecha_at is null;

  perform set_config('app.cambio_venta', p_unidad_id::text, true);
  update public.unidades set estatus = 'activo' where id = p_unidad_id;
  perform set_config('app.cambio_venta', '', true);
end;
$$;

revoke execute on function public.marcar_unidad_vendida(uuid, date, text) from public, anon;
revoke execute on function public.deshacer_venta(uuid, text) from public, anon;
grant execute on function public.marcar_unidad_vendida(uuid, date, text) to authenticated;
grant execute on function public.deshacer_venta(uuid, text) to authenticated;
