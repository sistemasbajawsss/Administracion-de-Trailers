-- =============================================================================
-- Sección 3 — Comprobantes (D7)
-- PDF o foto del ticket de cada servicio, en un bucket privado. Hasta 10 por
-- servicio. Agregar y quitar sigue las reglas de editar el servicio (D1);
-- quitar pide motivo y queda en la línea de cambios.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Bucket privado. Storage rechaza otros tipos y archivos de más de 10 MB.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
);

-- ---------------------------------------------------------------------------
-- Tabla
-- Sin updated_at: un comprobante no se edita, se agrega o se quita.
-- ---------------------------------------------------------------------------
create table public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios (id) on delete cascade,
  ruta_archivo text not null,
  tipo_mime text not null
    check (tipo_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  tamano_bytes integer not null check (tamano_bytes > 0 and tamano_bytes <= 10485760),
  hash_sha256 text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  nombre_archivo text not null check (length(nombre_archivo) between 1 and 200),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  constraint comprobantes_ruta_unica unique (ruta_archivo),
  -- La ruta la arma el servidor: servicio/comprobante.ext. Así las políticas de
  -- Storage saben de qué servicio es cada archivo.
  constraint comprobantes_ruta_formato check (
    ruta_archivo = servicio_id::text || '/' || id::text || '.' ||
      case tipo_mime
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'webp'
      end
  ),
  -- El mismo archivo dos veces en un servicio no se permite (en otro, sí: D7).
  constraint comprobantes_archivo_por_servicio unique (servicio_id, hash_sha256)
);

comment on table public.comprobantes is 'PDF o foto del ticket de cada servicio (archivo en el bucket privado comprobantes).';

-- (servicio_id, hash_sha256) ya indexa servicio_id.
create index comprobantes_hash_idx on public.comprobantes (hash_sha256);
create index comprobantes_created_by_idx on public.comprobantes (created_by);

-- ---------------------------------------------------------------------------
-- Preparación: autor, límite de 10 por servicio.
-- Al restaurar un servicio (marca app.servicio_restaurado) se conservan el autor
-- y la fecha originales, igual que en servicios y gastos.
-- ---------------------------------------------------------------------------
create or replace function public.preparar_comprobante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.nombre_archivo = trim(new.nombre_archivo);

  if current_setting('app.servicio_restaurado', true) is distinct from new.servicio_id::text then
    new.created_by = auth.uid();
    new.created_at = now();
  end if;

  if (select count(*) from public.comprobantes c where c.servicio_id = new.servicio_id) >= 10 then
    raise exception 'Un servicio puede tener hasta 10 comprobantes' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger comprobantes_preparar
  before insert on public.comprobantes
  for each row execute function public.preparar_comprobante();

revoke execute on function public.preparar_comprobante() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Historial: ahora también registra comprobantes.
-- Agregar un comprobante no pide motivo (es evidencia, no una corrección);
-- quitarlo sí. Al eliminar un servicio, la copia guarda sus gastos y sus
-- comprobantes, y se omiten los renglones de ambos borrados en cascada.
-- ---------------------------------------------------------------------------
alter table public.historial_cambios drop constraint historial_cambios_tabla_check;
alter table public.historial_cambios
  add constraint historial_cambios_tabla_check check (tabla in ('servicios', 'gastos', 'comprobantes'));

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
    -- gastos y comprobantes
    v_servicio_id = (v_fila ->> 'servicio_id')::uuid;

    if tg_op = 'DELETE'
       and current_setting('app.servicio_eliminado', true) = v_servicio_id::text then
      return null;
    end if;

    select s.created_by into v_dueno_id from public.servicios s where s.id = v_servicio_id;

    if tg_table_name = 'comprobantes' then
      v_es_alta = tg_op = 'INSERT';
    else
      v_es_alta = tg_op = 'INSERT'
        and current_setting('app.servicio_nuevo', true) = v_servicio_id::text;
    end if;
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
       where g.servicio_id = v_servicio_id),
      'comprobantes',
      (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb)
       from public.comprobantes c
       where c.servicio_id = v_servicio_id)
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

create trigger comprobantes_historial
  after insert or delete on public.comprobantes
  for each row execute function public.registrar_historial();

-- ---------------------------------------------------------------------------
-- RLS de la tabla
-- Ver: quien ve el servicio (hereda la RLS de servicios, como gastos).
-- Agregar y quitar: quien puede editar el servicio. El gerente no escribe.
-- ---------------------------------------------------------------------------
alter table public.comprobantes enable row level security;

revoke all on public.comprobantes from anon;
revoke update, truncate on public.comprobantes from authenticated;

create policy "comprobantes: leer"
  on public.comprobantes for select to authenticated
  using (exists (select 1 from public.servicios s where s.id = servicio_id));

create policy "comprobantes: agregar"
  on public.comprobantes for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select public.puede_capturar())
    and exists (
      select 1 from public.servicios s
      where s.id = servicio_id
        and ((select public.es_admin()) or s.created_by = (select auth.uid()))
    )
  );

create policy "comprobantes: quitar"
  on public.comprobantes for delete to authenticated
  using (
    (select public.puede_capturar())
    and exists (
      select 1 from public.servicios s
      where s.id = servicio_id
        and ((select public.es_admin()) or s.created_by = (select auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- RLS de los archivos (storage.objects, bucket comprobantes)
-- ---------------------------------------------------------------------------

-- ¿Algún comprobante usa este archivo? security definer: debe ver todos, no solo
-- los que RLS deja ver a quien pregunta.
create or replace function public.archivo_comprobante_en_uso(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.comprobantes c where c.ruta_archivo = p_ruta)
$$;

revoke execute on function public.archivo_comprobante_en_uso(text) from public, anon;
grant execute on function public.archivo_comprobante_en_uso(text) to authenticated;

-- Ver: quien ve el comprobante registrado, o quien acaba de subir el archivo y el
-- servidor todavía lo está revisando (antes de registrarlo).
create policy "comprobantes: ver archivo"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and (
      exists (select 1 from public.comprobantes c where c.ruta_archivo = name)
      or (owner_id = (select auth.uid())::text and (select public.puede_capturar()))
    )
  );

-- Subir: solo a la carpeta de un servicio que se puede editar, con el nombre que
-- arma el servidor. Sin política de update: un archivo nunca se sobrescribe.
create policy "comprobantes: subir archivo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (select public.puede_capturar())
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
    and exists (
      select 1 from public.servicios s
      where s.id::text = split_part(name, '/', 1)
        and ((select public.es_admin()) or s.created_by = (select auth.uid()))
    )
  );

-- Borrar: solo archivos que ya ningún comprobante usa (primero se quita el
-- comprobante, con su motivo en el historial). El capturista, solo de sus
-- servicios vigentes; los de un servicio en Eliminados se conservan para poder
-- restaurarlo, y solo el admin los borra al eliminarlo para siempre.
create policy "comprobantes: borrar archivo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprobantes'
    and not public.archivo_comprobante_en_uso(name)
    and (
      (select public.es_admin())
      or (
        (select public.puede_capturar())
        and exists (
          select 1 from public.servicios s
          where s.id::text = split_part(name, '/', 1)
            and s.created_by = (select auth.uid())
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Funciones para la app
-- ---------------------------------------------------------------------------

-- ¿Este archivo ya está en otro servicio? security definer: el capturista también
-- debe enterarse si está en un servicio que no es suyo. Solo devuelve unidad y
-- fecha, y si quien pregunta puede abrir ese servicio.
create or replace function public.buscar_comprobante_duplicado(p_hash text)
returns table (servicio_id uuid, numero_economico text, fecha date, puede_ver boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para subir comprobantes' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    u.numero_economico,
    s.fecha,
    public.puede_ver_todo() or s.created_by = auth.uid()
  from public.comprobantes c
  join public.servicios s on s.id = c.servicio_id
  join public.unidades u on u.id = s.unidad_id
  where c.hash_sha256 = lower(p_hash)
  order by c.created_at
  limit 1;
end;
$$;

revoke execute on function public.buscar_comprobante_duplicado(text) from public, anon;
grant execute on function public.buscar_comprobante_duplicado(text) to authenticated;

-- Quitar un comprobante con motivo. Regresa la ruta para que la app borre el
-- archivo de Storage (desde SQL no se puede).
create or replace function public.quitar_comprobante(p_comprobante_id uuid, p_motivo text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ruta text;
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se quita el comprobante' using errcode = '23514';
  end if;

  perform set_config('app.motivo', trim(p_motivo), true);

  delete from public.comprobantes where id = p_comprobante_id
  returning ruta_archivo into v_ruta;

  if v_ruta is null then
    raise exception 'No se encontró el comprobante o no tienes permiso para quitarlo' using errcode = 'P0002';
  end if;

  return v_ruta;
end;
$$;

revoke execute on function public.quitar_comprobante(uuid, text) from public, anon;
grant execute on function public.quitar_comprobante(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- restaurar_servicio: también regresa sus comprobantes (los archivos se
-- conservaron al eliminarlo).
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
    id, unidad_id, fecha, kilometraje, proveedor_id, descripcion, created_at, created_by
  )
  values (
    v_id,
    (v_datos ->> 'unidad_id')::uuid,
    (v_datos ->> 'fecha')::date,
    (v_datos ->> 'kilometraje')::integer,
    (v_datos ->> 'proveedor_id')::uuid,
    v_datos ->> 'descripcion',
    (v_datos ->> 'created_at')::timestamptz,
    (v_datos ->> 'created_by')::uuid
  );

  insert into public.gastos (id, servicio_id, categoria_id, concepto, monto, created_at, created_by)
  select
    (g ->> 'id')::uuid,
    v_id,
    (g ->> 'categoria_id')::uuid,
    g ->> 'concepto',
    (g ->> 'monto')::numeric,
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

-- ---------------------------------------------------------------------------
-- eliminar_servicio_definitivo: ahora regresa las rutas de sus archivos para que
-- la app los borre de Storage. Cambia el tipo de retorno: se vuelve a crear.
-- ---------------------------------------------------------------------------
drop function public.eliminar_servicio_definitivo(bigint, text);

create function public.eliminar_servicio_definitivo(p_historial_id bigint, p_confirmacion text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datos jsonb;
  v_servicio_id uuid;
  v_numero text;
  v_tipo public.tipo_unidad;
  v_rutas text[];
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede eliminar servicios para siempre' using errcode = '42501';
  end if;

  if p_confirmacion is distinct from 'ELIMINAR REGISTRO' then
    raise exception 'Escribe ELIMINAR REGISTRO para confirmar' using errcode = '23514';
  end if;

  select h.datos_anteriores, h.servicio_id into v_datos, v_servicio_id
  from public.historial_cambios h
  where h.id = p_historial_id and h.tabla = 'servicios' and h.accion = 'delete';

  if v_datos is null then
    raise exception 'No se encontró el servicio eliminado' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.servicios s where s.id = v_servicio_id) then
    raise exception 'Ese servicio está activo: elimínalo primero' using errcode = '23514';
  end if;

  select u.numero_economico, u.tipo into v_numero, v_tipo
  from public.unidades u
  where u.id = (v_datos ->> 'unidad_id')::uuid;

  -- Si la unidad se hubiera eliminado, su historial (y esta copia) ya no existiría.
  if v_numero is null then
    raise exception 'La unidad de ese servicio ya no existe' using errcode = 'P0002';
  end if;

  -- Archivos de todas las copias del servicio (pudo eliminarse más de una vez).
  select coalesce(array_agg(distinct c ->> 'ruta_archivo'), '{}') into v_rutas
  from public.historial_cambios h
  cross join lateral jsonb_array_elements(coalesce(h.datos_anteriores -> 'comprobantes', '[]'::jsonb)) as c
  where h.servicio_id = v_servicio_id and h.tabla = 'servicios' and h.accion = 'delete';

  insert into public.bitacora_eliminaciones (
    tipo_registro, unidad_id, numero_economico, tipo, servicio_id, fecha_servicio,
    num_servicios, num_gastos, total, created_by, autor_nombre
  )
  values (
    'servicio',
    (v_datos ->> 'unidad_id')::uuid,
    v_numero,
    v_tipo,
    v_servicio_id,
    (v_datos ->> 'fecha')::date,
    1,
    coalesce(jsonb_array_length(v_datos -> 'gastos'), 0),
    (select coalesce(sum((g ->> 'monto')::numeric), 0)
     from jsonb_array_elements(coalesce(v_datos -> 'gastos', '[]'::jsonb)) as g),
    auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  );

  delete from public.historial_cambios where servicio_id = v_servicio_id;

  return v_rutas;
end;
$$;

revoke execute on function public.eliminar_servicio_definitivo(bigint, text) from public, anon;
grant execute on function public.eliminar_servicio_definitivo(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- eliminar_unidad: regresa las rutas de los archivos (servicios vigentes y los
-- que estaban en Eliminados) y ahora también borra la copia de esos servicios
-- eliminados, que antes quedaba huérfana. Cambia el tipo de retorno.
-- ---------------------------------------------------------------------------
drop function public.eliminar_unidad(uuid, text);

create function public.eliminar_unidad(p_unidad_id uuid, p_confirmacion text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero text;
  v_tipo public.tipo_unidad;
  v_servicios uuid[];
  v_eliminados uuid[];
  v_servicio_id uuid;
  v_num_gastos integer;
  v_total numeric(12, 2);
  v_rutas text[];
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede eliminar unidades' using errcode = '42501';
  end if;

  if p_confirmacion is distinct from 'ELIMINAR REGISTRO' then
    raise exception 'Escribe ELIMINAR REGISTRO para confirmar' using errcode = '23514';
  end if;

  select u.numero_economico, u.tipo into v_numero, v_tipo
  from public.unidades u
  where u.id = p_unidad_id
  for update;

  if not found then
    raise exception 'No se encontró la unidad' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(s.id), '{}') into v_servicios
  from public.servicios s
  where s.unidad_id = p_unidad_id;

  -- Servicios de esta unidad que están en Eliminados (solo existe su copia).
  select coalesce(array_agg(distinct h.servicio_id), '{}') into v_eliminados
  from public.historial_cambios h
  where h.tabla = 'servicios'
    and h.accion = 'delete'
    and h.datos_anteriores ->> 'unidad_id' = p_unidad_id::text
    and h.servicio_id <> all (v_servicios);

  select count(*), coalesce(sum(g.monto), 0) into v_num_gastos, v_total
  from public.gastos g
  where g.servicio_id = any (v_servicios);

  select coalesce(array_agg(distinct r), '{}') into v_rutas
  from (
    select c.ruta_archivo as r
    from public.comprobantes c
    where c.servicio_id = any (v_servicios)
    union
    select c ->> 'ruta_archivo'
    from public.historial_cambios h
    cross join lateral jsonb_array_elements(coalesce(h.datos_anteriores -> 'comprobantes', '[]'::jsonb)) as c
    where h.tabla = 'servicios'
      and h.accion = 'delete'
      and h.servicio_id = any (v_servicios || v_eliminados)
  ) as rutas;

  insert into public.bitacora_eliminaciones (
    unidad_id, numero_economico, tipo, num_servicios, num_gastos, total, created_by, autor_nombre
  )
  values (
    p_unidad_id,
    v_numero,
    v_tipo,
    coalesce(array_length(v_servicios, 1), 0),
    v_num_gastos,
    v_total,
    auth.uid(),
    (select p.nombre from public.perfiles p where p.id = auth.uid())
  );

  -- Los triggers de historial exigen motivo al borrar servicios; después se borra
  -- todo el historial de esos servicios, incluidos los renglones recién creados.
  -- Un delete por servicio: el trigger marca qué servicio se elimina para omitir
  -- sus gastos y comprobantes borrados en cascada, y esa marca es de uno a la vez.
  perform set_config('app.motivo', 'Eliminación completa de la unidad ' || v_numero, true);
  foreach v_servicio_id in array v_servicios loop
    delete from public.servicios where id = v_servicio_id;
  end loop;
  delete from public.historial_cambios where servicio_id = any (v_servicios || v_eliminados);
  delete from public.unidades where id = p_unidad_id;

  return v_rutas;
end;
$$;

revoke execute on function public.eliminar_unidad(uuid, text) from public, anon;
grant execute on function public.eliminar_unidad(uuid, text) to authenticated;
