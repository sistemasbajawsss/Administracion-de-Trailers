-- =============================================================================
-- Sección 5E, Etapa 1 — Entradas a taller (2026-11-06)
-- Una unidad entra a taller con su falla y sale con fecha y nota. El estatus
-- `en_taller` ya no se pone a mano: solo lo ponen y lo quitan estas funciones.
-- Solo agrega: no cambia servicios, gastos, reportes ni funciones existentes.
-- La app publicada sigue funcionando; si intentara poner "En taller" a mano, la
-- BD lo rechaza con un mensaje claro.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla
-- Cada renglón es una estancia en taller. Nadie la escribe directo: solo las
-- funciones de abajo (sin políticas de insert / update / delete). Quién abrió y
-- quién cerró queda en la misma fila, con su nombre de ese momento.
-- ---------------------------------------------------------------------------
create table public.entradas_taller (
  id uuid primary key default gen_random_uuid(),
  -- Eliminar una unidad por completo (D5) borra también sus estancias.
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  fecha_entrada date not null,
  falla text not null,
  reporta_nombre text,
  fecha_salida date,
  nota_salida text,
  salida_by uuid references auth.users (id) on delete set null,
  salida_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,

  constraint entradas_taller_falla_valida
    check (length(trim(falla)) between 1 and 1000),
  constraint entradas_taller_nota_salida_corta
    check (nota_salida is null or length(nota_salida) <= 1000),
  constraint entradas_taller_salida_despues_de_entrada
    check (fecha_salida is null or fecha_salida >= fecha_entrada)
);

comment on table public.entradas_taller is 'Estancias de las unidades en taller: falla, entrada y salida (Sección 5E).';

-- Una sola entrada abierta por unidad (también frena dos entradas al mismo tiempo).
create unique index entradas_taller_una_abierta on public.entradas_taller (unidad_id) where fecha_salida is null;
-- Historial de estancias de una unidad (ficha), de la más reciente a la más vieja.
create index entradas_taller_unidad_idx on public.entradas_taller (unidad_id, fecha_entrada desc);

create trigger entradas_taller_actualizar_updated_at
  before update on public.entradas_taller
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS
-- Los tres roles ven las unidades que están en taller (el capturista necesita
-- verlas aunque otro haya reportado la falla). Las estancias ya cerradas son
-- historial: solo admin y gerente.
-- ---------------------------------------------------------------------------
alter table public.entradas_taller enable row level security;

create policy "entradas taller: leer"
  on public.entradas_taller for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (fecha_salida is null or (select public.puede_ver_todo()))
  );

-- Sin políticas de escritura; además, sin permisos de escritura directa.
revoke all on public.entradas_taller from anon;
revoke insert, update, delete, truncate, references, trigger on public.entradas_taller from authenticated;
grant select on public.entradas_taller to authenticated;

-- ---------------------------------------------------------------------------
-- 3. El estatus "en_taller" solo lo cambian las funciones de taller
-- Las funciones avisan con app.cambio_taller = id de la unidad (solo dura la
-- transacción). Cualquier otro intento (formulario, API directa) se rechaza:
-- - poner en_taller a mano;
-- - sacar de en_taller a una unidad con entrada abierta (primero, salida).
-- ---------------------------------------------------------------------------
create or replace function public.proteger_estatus_taller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.cambio_taller', true), '') = new.id::text then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.estatus = 'en_taller' then
      raise exception 'Para poner una unidad en taller, registra su entrada en Taller' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.estatus is distinct from old.estatus then
    if new.estatus = 'en_taller' then
      raise exception 'Para poner una unidad en taller, registra su entrada en Taller' using errcode = '23514';
    end if;
    if old.estatus = 'en_taller' and exists (
      select 1 from public.entradas_taller e where e.unidad_id = old.id and e.fecha_salida is null
    ) then
      raise exception 'La unidad % está en taller: dale salida desde Taller', old.numero_economico using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_estatus_taller() from public, anon, authenticated;

create trigger unidades_proteger_estatus_taller
  before insert or update of estatus on public.unidades
  for each row execute function public.proteger_estatus_taller();

-- ---------------------------------------------------------------------------
-- 4. Registrar entrada (admin y capturista)
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
  if v_estatus = 'baja' then
    raise exception 'La unidad % está dada de baja', v_numero using errcode = '23514';
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
-- 5. Dar salida (admin y capturista). La unidad regresa a Activo.
-- ---------------------------------------------------------------------------
create or replace function public.dar_salida_taller(
  p_entrada_id uuid,
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
  v_unidad_id uuid;
  v_entrada date;
  v_salida date;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para dar salida de taller' using errcode = '42501';
  end if;
  if v_nota is not null and length(v_nota) > 1000 then
    raise exception 'La nota puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;

  select e.unidad_id, e.fecha_entrada, e.fecha_salida into v_unidad_id, v_entrada, v_salida
  from public.entradas_taller e
  where e.id = p_entrada_id
  for update;

  if not found then
    raise exception 'La entrada a taller no existe' using errcode = 'P0002';
  end if;
  if v_salida is not null then
    raise exception 'Esta unidad ya salió de taller' using errcode = '23514';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha de salida no puede ser futura' using errcode = '23514';
  end if;
  if p_fecha < v_entrada then
    raise exception 'La salida no puede ser antes de la entrada (%)', to_char(v_entrada, 'DD/MM/YYYY') using errcode = '23514';
  end if;

  update public.entradas_taller
  set fecha_salida = p_fecha,
      nota_salida = v_nota,
      salida_by = auth.uid(),
      salida_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid())
  where id = p_entrada_id;

  perform set_config('app.cambio_taller', v_unidad_id::text, true);
  update public.unidades set estatus = 'activo' where id = v_unidad_id;
  perform set_config('app.cambio_taller', '', true);
end;
$$;

revoke execute on function public.registrar_entrada_taller(uuid, date, text) from public, anon;
revoke execute on function public.dar_salida_taller(uuid, date, text) from public, anon;
grant execute on function public.registrar_entrada_taller(uuid, date, text) to authenticated;
grant execute on function public.dar_salida_taller(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Las unidades que hoy están en taller reciben su entrada abierta
-- (fecha: su última modificación, en hora de Tijuana).
-- ---------------------------------------------------------------------------
insert into public.entradas_taller (unidad_id, fecha_entrada, falla, reporta_nombre, created_by)
select
  u.id,
  least((u.updated_at at time zone 'America/Tijuana')::date, (now() at time zone 'America/Tijuana')::date),
  'Registrada antes de las entradas a taller',
  'Sistema',
  null
from public.unidades u
where u.estatus = 'en_taller';
