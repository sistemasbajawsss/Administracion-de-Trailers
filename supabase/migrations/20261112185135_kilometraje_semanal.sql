-- =============================================================================
-- Sección 5H, Etapa 1 — Kilometraje semanal (2026-11-12, D15)
--
-- Cada lunes los choferes mandan foto del tablero y un capturista escribe el
-- kilometraje de todas las unidades activas que llevan odómetro.
--   - Una lectura por unidad por semana (la semana empieza el lunes).
--   - El capturista captura lunes y martes (hora de Tijuana); el admin, cualquier día.
--   - Solo unidades con estatus activo y cuyo tipo lleva kilometraje.
--   - Revisión de siempre (validar_kilometraje): no menor que la lectura anterior
--     ni mayor que una posterior. Las lecturas que no cuadran no se guardan; las
--     demás de la misma lista sí.
--   - Corregir o quitar: quien la capturó, el mismo día; después solo el admin,
--     con motivo. Queda en cambios_lecturas_kilometraje.
--   - Las lecturas son una fuente más del kilometraje actual
--     (kilometraje_unidades): Mantenimientos e Inicio se actualizan solos.
--
-- Compatibilidad con la app publicada: tablas y funciones nuevas; las de antes
-- se llaman igual. validar_kilometraje (interna) gana un parámetro opcional al
-- final; sus llamadas de 3 y 5 argumentos siguen igual.
--
-- Versiones anteriores (para regresar): validar_kilometraje y
-- kilometraje_unidades en 20261109185639_kilometraje.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Semana y día de captura (puras, para usarlas y probarlas igual)
-- ---------------------------------------------------------------------------
create or replace function public.inicio_semana(p_fecha date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_fecha - (extract(isodow from p_fecha)::integer - 1);
$$;

comment on function public.inicio_semana(date) is 'Lunes de la semana de esa fecha (D15).';

create or replace function public.es_dia_de_captura_semanal(p_fecha date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select extract(isodow from p_fecha)::integer in (1, 2);
$$;

comment on function public.es_dia_de_captura_semanal(date) is 'Lunes o martes: días en que el capturista registra el kilometraje semanal (D15).';

revoke execute on function public.inicio_semana(date) from public, anon;
revoke execute on function public.es_dia_de_captura_semanal(date) from public, anon;
grant execute on function public.inicio_semana(date) to authenticated;
grant execute on function public.es_dia_de_captura_semanal(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lecturas semanales (nadie escribe directo: solo por funciones)
-- ---------------------------------------------------------------------------
create table public.lecturas_kilometraje (
  id uuid primary key default gen_random_uuid(),
  -- Eliminar una unidad por completo (D5) borra también sus lecturas.
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  semana date not null,
  fecha date not null,
  kilometraje integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  autor_nombre text,
  updated_by uuid references auth.users (id) on delete set null,
  constraint lecturas_kilometraje_valido check (kilometraje between 0 and 9999999),
  constraint lecturas_kilometraje_semana_lunes check (semana = public.inicio_semana(fecha)),
  constraint lecturas_kilometraje_una_por_semana unique (unidad_id, semana)
);

comment on table public.lecturas_kilometraje is 'Kilometraje semanal de cada unidad (5H, D15): una lectura por semana, la captura el capturista lunes y martes o el admin.';

create index lecturas_kilometraje_unidad_fecha_idx
  on public.lecturas_kilometraje (unidad_id, fecha desc);
create index lecturas_kilometraje_semana_idx
  on public.lecturas_kilometraje (semana);

create trigger lecturas_kilometraje_updated_at
  before update on public.lecturas_kilometraje
  for each row execute function public.actualizar_updated_at();

alter table public.lecturas_kilometraje enable row level security;

-- Los tres roles las ven (el capturista las necesita para capturar).
create policy "lecturas kilometraje: leer"
  on public.lecturas_kilometraje for select to authenticated
  using ((select public.rol_actual()) is not null);

revoke all on public.lecturas_kilometraje from anon;
revoke insert, update, delete, truncate, references, trigger on public.lecturas_kilometraje from authenticated;
grant select on public.lecturas_kilometraje to authenticated;

-- Cambios a una lectura (corregida o quitada): quién, cuándo, de cuánto a cuánto y por qué.
create table public.cambios_lecturas_kilometraje (
  id uuid primary key default gen_random_uuid(),
  -- Sin llave a la lectura: el cambio sobrevive a la lectura quitada.
  lectura_id uuid not null,
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  semana date not null,
  accion text not null,
  kilometraje_anterior integer not null,
  kilometraje_nuevo integer,
  motivo text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  autor_nombre text,
  constraint cambios_lecturas_accion_valida check (
    (accion = 'corregida' and kilometraje_nuevo is not null)
    or (accion = 'quitada' and kilometraje_nuevo is null)
  )
);

comment on table public.cambios_lecturas_kilometraje is 'Correcciones y lecturas semanales quitadas (5H, D15).';

create index cambios_lecturas_unidad_idx
  on public.cambios_lecturas_kilometraje (unidad_id, created_at desc);

alter table public.cambios_lecturas_kilometraje enable row level security;

create policy "cambios lecturas kilometraje: leer"
  on public.cambios_lecturas_kilometraje for select to authenticated
  using ((select public.rol_actual()) is not null);

revoke all on public.cambios_lecturas_kilometraje from anon;
revoke insert, update, delete, truncate, references, trigger on public.cambios_lecturas_kilometraje from authenticated;
grant select on public.cambios_lecturas_kilometraje to authenticated;

-- ---------------------------------------------------------------------------
-- 3. validar_kilometraje: también compara contra las lecturas semanales
-- Copia de 20261109185639_kilometraje.sql + lecturas y p_lectura_id (la lectura
-- que se está corrigiendo no cuenta). Se quita la versión de 5 argumentos para
-- que no haya dos (las llamadas de 3 y 5 argumentos siguen funcionando).
-- ---------------------------------------------------------------------------
drop function public.validar_kilometraje(uuid, date, integer, uuid, uuid);

create function public.validar_kilometraje(
  p_unidad_id uuid,
  p_fecha date,
  p_kilometraje integer,
  p_servicio_id uuid default null,
  p_entrada_id uuid default null,
  p_lectura_id uuid default null
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
    union all
    select k.fecha, k.kilometraje, 'lectura semanal'
    from public.lecturas_kilometraje k
    where k.unidad_id = p_unidad_id
      and k.id is distinct from p_lectura_id
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
    union all
    select k.fecha, k.kilometraje, 'lectura semanal'
    from public.lecturas_kilometraje k
    where k.unidad_id = p_unidad_id
      and k.id is distinct from p_lectura_id
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

revoke execute on function public.validar_kilometraje(uuid, date, integer, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. kilometraje_unidades: las lecturas semanales cuentan como una lectura más
-- Copia de 20261109185639_kilometraje.sql + rama de lecturas.
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
      union all
      (select k.fecha, k.kilometraje, 'lectura semanal', 1
       from public.lecturas_kilometraje k
       where k.unidad_id = u.id
         and (c.fecha is null or k.fecha > c.fecha)
       order by k.fecha desc, k.kilometraje desc
       limit 1)
    ) l
    order by l.fecha desc, l.km desc, l.orden desc
    limit 1
  ) k on true
  where (p_unidad_id is null or u.id = p_unidad_id)
    and (select public.rol_actual()) is not null;
$$;

-- ---------------------------------------------------------------------------
-- 5. registrar_lecturas_kilometraje: varias a la vez
-- p_lecturas: [{"unidad_id": "...", "kilometraje": 123456}, ...] (hasta 200).
-- Cada lectura se guarda o se rechaza sola: regresa una fila por lectura con
-- su id (guardada) o el motivo (no guardada).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_lecturas_kilometraje(p_lecturas jsonb)
returns table (unidad_id uuid, lectura_id uuid, error text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Tijuana')::date;
  v_semana date := public.inicio_semana((now() at time zone 'America/Tijuana')::date);
  v_autor text;
  v_item jsonb;
  v_unidad uuid;
  v_km integer;
  v_numero text;
  v_tipo text;
  v_estatus public.estatus_unidad;
  v_id uuid;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para registrar el kilometraje' using errcode = '42501';
  end if;
  if not public.es_admin() and not public.es_dia_de_captura_semanal(v_hoy) then
    raise exception 'El kilometraje semanal se registra lunes y martes' using errcode = '42501';
  end if;
  if p_lecturas is null or jsonb_typeof(p_lecturas) <> 'array' or jsonb_array_length(p_lecturas) = 0 then
    raise exception 'No hay lecturas que guardar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lecturas) > 200 then
    raise exception 'Se pueden guardar hasta 200 lecturas a la vez' using errcode = '22023';
  end if;

  select p.nombre into v_autor from public.perfiles p where p.id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_lecturas)
  loop
    v_unidad = null;
    v_id = null;
    begin
      begin
        v_unidad = (v_item ->> 'unidad_id')::uuid;
        v_km = (v_item ->> 'kilometraje')::integer;
      exception when others then
        raise exception 'Lectura no válida' using errcode = '22023';
      end;
      if v_unidad is null then
        raise exception 'Falta la unidad' using errcode = '22023';
      end if;
      if v_km is null or v_km not between 0 and 9999999 then
        raise exception 'Kilometraje no válido' using errcode = '23514';
      end if;

      -- Candado sobre la unidad: dos lecturas al mismo tiempo se forman en fila.
      select u.numero_economico, u.tipo, u.estatus into v_numero, v_tipo, v_estatus
      from public.unidades u
      where u.id = v_unidad
      for update;

      if not found then
        raise exception 'La unidad no existe' using errcode = 'P0002';
      end if;
      if not public.tipo_lleva_kilometraje(v_tipo) then
        raise exception 'La unidad % no lleva kilometraje', v_numero using errcode = '23514';
      end if;
      if v_estatus <> 'activo' then
        raise exception 'La unidad % no está activa (%)', v_numero,
          case v_estatus
            when 'en_taller' then 'en taller'
            when 'vendida' then 'vendida'
            when 'baja' then 'dada de baja'
            when 'por_llegar' then 'por llegar'
            else v_estatus::text
          end
          using errcode = '23514';
      end if;
      if exists (
        select 1 from public.lecturas_kilometraje k
        where k.unidad_id = v_unidad and k.semana = v_semana
      ) then
        raise exception 'La unidad % ya tiene su lectura de esta semana', v_numero using errcode = '23505';
      end if;

      perform public.validar_kilometraje(v_unidad, v_hoy, v_km);

      insert into public.lecturas_kilometraje (unidad_id, semana, fecha, kilometraje, created_by, autor_nombre)
      values (v_unidad, v_semana, v_hoy, v_km, auth.uid(), v_autor)
      returning id into v_id;

      unidad_id := v_unidad;
      lectura_id := v_id;
      error := null;
      return next;
    exception
      when unique_violation then
        unidad_id := v_unidad;
        lectura_id := null;
        error := format('La unidad %s ya tiene su lectura de esta semana', coalesce(v_numero, ''));
        return next;
      when sqlstate '23514' or sqlstate '22023' or sqlstate 'P0002' then
        unidad_id := v_unidad;
        lectura_id := null;
        error := sqlerrm;
        return next;
    end;
  end loop;
end;
$$;

revoke execute on function public.registrar_lecturas_kilometraje(jsonb) from public, anon;
grant execute on function public.registrar_lecturas_kilometraje(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Corregir y quitar una lectura
-- Quien la capturó, el mismo día (motivo opcional); el admin, siempre (motivo
-- obligatorio salvo que sea suya del mismo día). Queda en cambios_lecturas_kilometraje.
-- ---------------------------------------------------------------------------
create or replace function public.puede_cambiar_lectura(p_lectura_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
-- 'autor' (suya, del mismo día), 'admin' (otra o de otro día) o error.
declare
  v_created_by uuid;
  v_creada date;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para cambiar lecturas de kilometraje' using errcode = '42501';
  end if;

  select k.created_by, (k.created_at at time zone 'America/Tijuana')::date
    into v_created_by, v_creada
  from public.lecturas_kilometraje k
  where k.id = p_lectura_id;

  if not found then
    raise exception 'La lectura ya no existe' using errcode = 'P0002';
  end if;

  if v_created_by = auth.uid() and v_creada = (now() at time zone 'America/Tijuana')::date then
    return 'autor';
  end if;
  if public.es_admin() then
    return 'admin';
  end if;
  raise exception 'Solo quien la capturó la puede corregir el mismo día; después, solo un administrador'
    using errcode = '42501';
end;
$$;

revoke execute on function public.puede_cambiar_lectura(uuid) from public, anon, authenticated;

create or replace function public.corregir_lectura_kilometraje(
  p_lectura_id uuid,
  p_kilometraje integer,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quien text;
  v_motivo text := nullif(trim(p_motivo), '');
  v_unidad uuid;
  v_fecha date;
  v_semana date;
  v_anterior integer;
begin
  v_quien = public.puede_cambiar_lectura(p_lectura_id);

  if v_quien = 'admin' and (v_motivo is null or length(v_motivo) < 5) then
    raise exception 'Escribe el motivo de la corrección' using errcode = '23514';
  end if;
  if v_motivo is not null and length(v_motivo) > 500 then
    raise exception 'El motivo puede tener hasta 500 caracteres' using errcode = '23514';
  end if;
  if p_kilometraje is null or p_kilometraje not between 0 and 9999999 then
    raise exception 'Kilometraje no válido' using errcode = '23514';
  end if;

  select k.unidad_id into v_unidad from public.lecturas_kilometraje k where k.id = p_lectura_id;
  perform 1 from public.unidades u where u.id = v_unidad for update;

  select k.fecha, k.semana, k.kilometraje into v_fecha, v_semana, v_anterior
  from public.lecturas_kilometraje k
  where k.id = p_lectura_id
  for update;

  if v_anterior = p_kilometraje then
    raise exception 'Es el mismo kilometraje' using errcode = '23514';
  end if;

  perform public.validar_kilometraje(v_unidad, v_fecha, p_kilometraje, null, null, p_lectura_id);

  update public.lecturas_kilometraje
  set kilometraje = p_kilometraje, updated_by = auth.uid()
  where id = p_lectura_id;

  insert into public.cambios_lecturas_kilometraje (
    lectura_id, unidad_id, semana, accion, kilometraje_anterior, kilometraje_nuevo, motivo, created_by, autor_nombre
  )
  values (
    p_lectura_id, v_unidad, v_semana, 'corregida', v_anterior, p_kilometraje, v_motivo, auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  );
end;
$$;

revoke execute on function public.corregir_lectura_kilometraje(uuid, integer, text) from public, anon;
grant execute on function public.corregir_lectura_kilometraje(uuid, integer, text) to authenticated;

create or replace function public.quitar_lectura_kilometraje(
  p_lectura_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quien text;
  v_motivo text := nullif(trim(p_motivo), '');
  v_unidad uuid;
  v_semana date;
  v_anterior integer;
begin
  v_quien = public.puede_cambiar_lectura(p_lectura_id);

  if v_quien = 'admin' and (v_motivo is null or length(v_motivo) < 5) then
    raise exception 'Escribe el motivo para quitar la lectura' using errcode = '23514';
  end if;
  if v_motivo is not null and length(v_motivo) > 500 then
    raise exception 'El motivo puede tener hasta 500 caracteres' using errcode = '23514';
  end if;

  select k.unidad_id into v_unidad from public.lecturas_kilometraje k where k.id = p_lectura_id;
  perform 1 from public.unidades u where u.id = v_unidad for update;

  delete from public.lecturas_kilometraje k
  where k.id = p_lectura_id
  returning k.semana, k.kilometraje into v_semana, v_anterior;

  insert into public.cambios_lecturas_kilometraje (
    lectura_id, unidad_id, semana, accion, kilometraje_anterior, kilometraje_nuevo, motivo, created_by, autor_nombre
  )
  values (
    p_lectura_id, v_unidad, v_semana, 'quitada', v_anterior, null, v_motivo, auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  );
end;
$$;

revoke execute on function public.quitar_lectura_kilometraje(uuid, text) from public, anon;
grant execute on function public.quitar_lectura_kilometraje(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. lecturas_semana: la lista de la semana actual
-- Unidades activas cuyo tipo lleva kilometraje, con su kilometraje actual y la
-- lectura de esta semana (si ya la tienen). Sin lectura = pendiente.
-- ---------------------------------------------------------------------------
create or replace function public.lecturas_semana()
returns table (
  unidad_id uuid,
  numero_economico text,
  tipo text,
  operacion public.operacion_unidad,
  orden_tipo smallint,
  numero_orden integer,
  kilometraje integer,
  kilometraje_fecha date,
  kilometraje_fuente text,
  lectura_id uuid,
  lectura_kilometraje integer,
  lectura_autor text,
  lectura_created_by uuid,
  lectura_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with semana as (
    select public.inicio_semana((now() at time zone 'America/Tijuana')::date) as lunes
  )
  select u.id, u.numero_economico, u.tipo, u.operacion, u.orden_tipo, u.numero_orden,
         km.kilometraje, km.fecha, km.fuente,
         l.id, l.kilometraje, l.autor_nombre, l.created_by, l.created_at
  from public.unidades u
  cross join semana s
  left join public.kilometraje_unidades(null) km on km.unidad_id = u.id
  left join public.lecturas_kilometraje l on l.unidad_id = u.id and l.semana = s.lunes
  where u.estatus = 'activo'
    and public.tipo_lleva_kilometraje(u.tipo)
    and (select public.rol_actual()) is not null
  order by u.orden_tipo, u.numero_orden, u.numero_economico;
$$;

revoke execute on function public.lecturas_semana() from public, anon;
grant execute on function public.lecturas_semana() to authenticated;

-- La API debe ver las funciones nuevas de inmediato.
notify pgrst, 'reload schema';
