-- =============================================================================
-- Sección 5F, Etapa 1 — Kilometraje (2026-11-09)
--
-- Lecturas del odómetro de cada unidad:
--   - el kilometraje de cada servicio (ya existía, opcional);
--   - el kilometraje de cada entrada a taller (nuevo);
--   - las correcciones del admin (nuevo): "desde esta fecha la unidad marca N km"
--     (odómetro cambiado, error anterior). Quedan registradas con motivo.
--
-- Regla (D14): una lectura no puede ser menor que la anterior ni mayor que la
-- siguiente, por fecha (un servicio capturado con fecha atrasada se compara con
-- lo que había en esa fecha, no con lo de hoy). Las lecturas del mismo día no se
-- comparan entre sí. Una corrección reinicia la cuenta desde su fecha.
--
-- El kilometraje actual NO se guarda en unidades: se calcula de las lecturas
-- (kilometraje_unidades), así nunca queda desfasado al editar, eliminar o
-- restaurar servicios.
--
-- Compatibilidad con la app publicada: nada nuevo es obligatorio en la BD (el
-- kilometraje obligatorio lo exige el servidor de la app, como el motivo D13).
-- registrar_entrada_taller recibe un parámetro opcional; llamada como antes,
-- hace lo mismo. Un servicio con kilometraje que no cuadra se rechaza con un
-- mensaje claro también desde la app publicada.
--
-- Versiones anteriores (para regresar): preparar_servicio en
-- 20261106205646_servicios_taller.sql, registrar_entrada_taller en
-- 20261106203645_ventas_unidades.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kilometraje en la entrada a taller (opcional; las de antes quedan sin él)
-- ---------------------------------------------------------------------------
alter table public.entradas_taller
  add column kilometraje integer,
  add constraint entradas_taller_kilometraje_valido
    check (kilometraje is null or kilometraje between 0 and 9999999);

comment on column public.entradas_taller.kilometraje is 'Kilometraje con el que entró a taller (5F). Null en cajas y en entradas anteriores.';

-- Lecturas de una unidad por fecha (validar y calcular el actual).
create index servicios_unidad_km_idx on public.servicios (unidad_id, fecha desc)
  where kilometraje is not null;
create index entradas_taller_unidad_km_idx on public.entradas_taller (unidad_id, fecha_entrada desc)
  where kilometraje is not null;

-- ---------------------------------------------------------------------------
-- 2. Correcciones de kilometraje (solo admin, por función; nadie escribe directo)
-- ---------------------------------------------------------------------------
create table public.correcciones_kilometraje (
  id uuid primary key default gen_random_uuid(),
  -- Eliminar una unidad por completo (D5) borra también sus correcciones.
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  fecha date not null,
  kilometraje integer not null,
  -- Lo que marcaba antes de corregir (null si no tenía lecturas).
  kilometraje_anterior integer,
  motivo text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  autor_nombre text,
  constraint correcciones_kilometraje_valido check (kilometraje between 0 and 9999999),
  constraint correcciones_kilometraje_motivo_valido check (length(trim(motivo)) between 5 and 500)
);

comment on table public.correcciones_kilometraje is 'Correcciones del kilometraje de una unidad hechas por el admin (5F): reinician la cuenta desde su fecha.';

create index correcciones_kilometraje_unidad_idx
  on public.correcciones_kilometraje (unidad_id, fecha desc, created_at desc);

alter table public.correcciones_kilometraje enable row level security;

-- Admin y gerente ven las correcciones (historial). El capturista no.
create policy "correcciones kilometraje: leer"
  on public.correcciones_kilometraje for select to authenticated
  using ((select public.puede_ver_todo()));

revoke all on public.correcciones_kilometraje from anon;
revoke insert, update, delete, truncate, references, trigger on public.correcciones_kilometraje from authenticated;
grant select on public.correcciones_kilometraje to authenticated;

-- ---------------------------------------------------------------------------
-- 3. validar_kilometraje: rechaza una lectura que no cuadra con las demás
-- Interna (la llaman preparar_servicio y registrar_entrada_taller). Ve todas
-- las lecturas de la unidad, también los servicios de otros capturistas.
-- p_servicio_id / p_entrada_id: la lectura que se está editando (no cuenta).
-- ---------------------------------------------------------------------------
create or replace function public.validar_kilometraje(
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_servicio_id uuid default null,
  p_entrada_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_corr_fecha date;
  v_corr_km integer;
  v_sig_corr date;
  v_fecha date;
  v_km integer;
  v_fuente text;
begin
  if p_kilometraje is null then
    return;
  end if;

  select u.numero_economico into v_numero from public.unidades u where u.id = p_unidad_id;

  -- Corrección vigente en esa fecha y la siguiente (si hay).
  select c.fecha, c.kilometraje into v_corr_fecha, v_corr_km
  from public.correcciones_kilometraje c
  where c.unidad_id = p_unidad_id and c.fecha <= p_fecha
  order by c.fecha desc, c.created_at desc
  limit 1;

  select min(c.fecha) into v_sig_corr
  from public.correcciones_kilometraje c
  where c.unidad_id = p_unidad_id and c.fecha > p_fecha;

  -- Mayor lectura ANTES de esa fecha (desde la corrección vigente).
  select l.fecha, l.km, l.fuente into v_fecha, v_km, v_fuente
  from (
    select s.fecha, s.kilometraje as km, 'servicio' as fuente
    from public.servicios s
    where s.unidad_id = p_unidad_id and s.kilometraje is not null
      and s.id is distinct from p_servicio_id
    union all
    select e.fecha_entrada, e.kilometraje, 'entrada a taller'
    from public.entradas_taller e
    where e.unidad_id = p_unidad_id and e.kilometraje is not null
      and e.id is distinct from p_entrada_id
  ) l
  where l.fecha < p_fecha
    and (v_corr_fecha is null or l.fecha > v_corr_fecha)
  order by l.km desc, l.fecha desc
  limit 1;

  if v_corr_km is not null and (v_km is null or v_corr_km > v_km) then
    v_fecha = v_corr_fecha;
    v_km = v_corr_km;
    v_fuente = 'corrección';
  end if;

  if v_km is not null and p_kilometraje < v_km then
    raise exception 'El kilometraje no cuadra: el % la unidad % ya tenía % km (%)',
      to_char(v_fecha, 'DD/MM/YYYY'), v_numero, to_char(v_km, 'FM9,999,999'), v_fuente
      using errcode = '23514';
  end if;

  -- Menor lectura DESPUÉS de esa fecha (hasta la siguiente corrección).
  v_km = null;
  select l.fecha, l.km, l.fuente into v_fecha, v_km, v_fuente
  from (
    select s.fecha, s.kilometraje as km, 'servicio' as fuente
    from public.servicios s
    where s.unidad_id = p_unidad_id and s.kilometraje is not null
      and s.id is distinct from p_servicio_id
    union all
    select e.fecha_entrada, e.kilometraje, 'entrada a taller'
    from public.entradas_taller e
    where e.unidad_id = p_unidad_id and e.kilometraje is not null
      and e.id is distinct from p_entrada_id
  ) l
  where l.fecha > p_fecha
    and (v_sig_corr is null or l.fecha < v_sig_corr)
  order by l.km asc, l.fecha asc
  limit 1;

  if v_km is not null and p_kilometraje > v_km then
    raise exception 'El kilometraje no cuadra: el % la unidad % tenía % km (%), menos que esto',
      to_char(v_fecha, 'DD/MM/YYYY'), v_numero, to_char(v_km, 'FM9,999,999'), v_fuente
      using errcode = '23514';
  end if;
end;
$$;

revoke execute on function public.validar_kilometraje(uuid, date, integer, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. kilometraje_unidades: kilometraje actual de cada unidad (o de una)
-- La lectura más reciente por fecha desde la última corrección (empates: la
-- mayor). Los tres roles la ven (el capturista la necesita al capturar).
-- ---------------------------------------------------------------------------
create or replace function public.kilometraje_unidades(p_unidad_id uuid default null)
returns table (unidad_id uuid, kilometraje integer, fecha date, fuente text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, k.km, k.fecha, k.fuente
  from public.unidades u
  left join lateral (
    select c.fecha, c.kilometraje
    from public.correcciones_kilometraje c
    where c.unidad_id = u.id
    order by c.fecha desc, c.created_at desc
    limit 1
  ) c on true
  left join lateral (
    select l.fecha, l.km, l.fuente
    from (
      select c.fecha, c.kilometraje as km, 'corrección' as fuente, 0 as orden
      where c.fecha is not null
      union all
      (select s.fecha, s.kilometraje, 'servicio', 1
       from public.servicios s
       where s.unidad_id = u.id and s.kilometraje is not null
         and (c.fecha is null or s.fecha > c.fecha)
       order by s.fecha desc, s.kilometraje desc
       limit 1)
      union all
      (select e.fecha_entrada, e.kilometraje, 'entrada a taller', 1
       from public.entradas_taller e
       where e.unidad_id = u.id and e.kilometraje is not null
         and (c.fecha is null or e.fecha_entrada > c.fecha)
       order by e.fecha_entrada desc, e.kilometraje desc
       limit 1)
    ) l
    order by l.fecha desc, l.km desc, l.orden desc
    limit 1
  ) k on true
  where (p_unidad_id is null or u.id = p_unidad_id)
    and (select public.rol_actual()) is not null;
$$;

revoke execute on function public.kilometraje_unidades(uuid) from public, anon;
grant execute on function public.kilometraje_unidades(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. corregir_kilometraje (solo admin, con motivo). Las cajas no tienen odómetro.
-- ---------------------------------------------------------------------------
create or replace function public.corregir_kilometraje(
  p_unidad_id uuid,
  p_kilometraje integer,
  p_fecha date,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(trim(p_motivo), '');
  v_numero text;
  v_tipo public.tipo_unidad;
  v_anterior integer;
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede corregir el kilometraje' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la corrección' using errcode = '23514';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'El motivo puede tener hasta 500 caracteres' using errcode = '23514';
  end if;
  if p_kilometraje is null or p_kilometraje not between 0 and 9999999 then
    raise exception 'Kilometraje no válido' using errcode = '23514';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha de la corrección no puede ser futura' using errcode = '23514';
  end if;

  select u.numero_economico, u.tipo into v_numero, v_tipo
  from public.unidades u
  where u.id = p_unidad_id
  for update;

  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  if v_tipo = 'caja' then
    raise exception 'Las cajas no llevan kilometraje' using errcode = '23514';
  end if;

  select k.kilometraje into v_anterior from public.kilometraje_unidades(p_unidad_id) k;

  insert into public.correcciones_kilometraje (
    unidad_id, fecha, kilometraje, kilometraje_anterior, motivo, created_by, autor_nombre
  )
  values (
    p_unidad_id, p_fecha, p_kilometraje, v_anterior, v_motivo, auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.corregir_kilometraje(uuid, integer, date, text) from public, anon;
grant execute on function public.corregir_kilometraje(uuid, integer, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. preparar_servicio: valida el kilometraje
-- Copia de la versión de 20261106205646_servicios_taller.sql + bloque 5F.
-- Se valida al dar de alta y al editar si cambió el kilometraje, la fecha o la
-- unidad (editar otra cosa de un servicio viejo no se bloquea). Restaurar no se
-- valida: es historial.
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
  v_entrada uuid;
  v_fecha_entrada date;
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

  -- ---- Kilometraje (5F) ----
  if new.kilometraje is not null
     and (v_validar
          or (tg_op = 'UPDATE' and (new.kilometraje is distinct from old.kilometraje
                                    or new.fecha is distinct from old.fecha
                                    or new.unidad_id is distinct from old.unidad_id))) then
    -- Candado sobre la unidad: dos lecturas al mismo tiempo se forman en fila.
    perform 1 from public.unidades u where u.id = new.unidad_id for update;
    perform public.validar_kilometraje(
      new.unidad_id, new.fecha, new.kilometraje,
      case when tg_op = 'UPDATE' then old.id end, null
    );
  end if;

  -- ---- Taller (5E) ----
  -- Estancia abierta de la unidad a la que pertenece esta fecha (si hay).
  select e.id into v_entrada
  from public.entradas_taller e
  where e.unidad_id = new.unidad_id
    and e.fecha_salida is null
    and e.fecha_entrada <= new.fecha;

  if tg_op = 'INSERT' then
    if v_restaurando then
      -- Se restaura tal como estaba; si su estancia ya no existe, sin liga.
      if new.entrada_taller_id is not null
         and not exists (select 1 from public.entradas_taller e where e.id = new.entrada_taller_id) then
        new.entrada_taller_id = null;
      end if;
    else
      new.entrada_taller_id = v_entrada;
      new.sin_entrada_taller = v_entrada is null;
    end if;
  elsif old.sin_entrada_taller is null then
    -- Servicio de antes de la 5E: no se liga ni se marca.
    new.entrada_taller_id = old.entrada_taller_id;
    new.sin_entrada_taller = old.sin_entrada_taller;
    new.motivo_sin_entrada = old.motivo_sin_entrada;
  else
    new.entrada_taller_id = old.entrada_taller_id;
    if new.unidad_id is distinct from old.unidad_id then
      -- Otra unidad: se desliga y se busca la estancia abierta de la nueva.
      new.entrada_taller_id = v_entrada;
    elsif new.entrada_taller_id is not null then
      -- Misma unidad: la liga se queda salvo que la fecha quede antes de la entrada.
      select e.fecha_entrada into v_fecha_entrada from public.entradas_taller e where e.id = new.entrada_taller_id;
      if new.fecha < v_fecha_entrada then
        new.entrada_taller_id = null;
      end if;
    elsif new.fecha is distinct from old.fecha then
      new.entrada_taller_id = v_entrada;
    end if;
    new.sin_entrada_taller = new.entrada_taller_id is null;
  end if;

  if new.entrada_taller_id is not null then
    new.motivo_sin_entrada = null;
  else
    new.motivo_sin_entrada = nullif(trim(new.motivo_sin_entrada), '');
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. registrar_entrada_taller: kilometraje opcional
-- Copia de la versión de 20261106203645_ventas_unidades.sql + kilometraje.
-- Se reemplaza la versión de 3 argumentos (dos versiones confundirían a la API);
-- llamada como antes (también desde registrar_servicio), hace lo mismo.
-- ---------------------------------------------------------------------------
drop function public.registrar_entrada_taller(uuid, date, text);

create function public.registrar_entrada_taller(
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
  v_tipo public.tipo_unidad;
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

  -- Las cajas no tienen odómetro.
  if v_tipo = 'caja' then
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

revoke execute on function public.registrar_entrada_taller(uuid, date, text, integer) from public, anon;
grant execute on function public.registrar_entrada_taller(uuid, date, text, integer) to authenticated;

-- La API debe ver las funciones nuevas de inmediato.
notify pgrst, 'reload schema';
