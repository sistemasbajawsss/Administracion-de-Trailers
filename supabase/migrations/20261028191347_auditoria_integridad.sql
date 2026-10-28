-- =============================================================================
-- Sección 5D — Correcciones de la auditoría (2026-10-28)
-- 1. registrar_historial: current_setting(..., true) sin coalesce daba NULL y no
--    exigía motivo al agregar un gasto por API (mismo error que preparar_servicio).
-- 2. preparar_servicio / preparar_gasto: fuera de una restauración, la BD fija id,
--    created_at, updated_at y updated_by (antes el cliente podía mandarlos: crear
--    un servicio con el id de uno eliminado bloqueaba "Restaurar" del admin).
--    Proveedor desactivado rechazado como unidad de baja y categoría desactivada.
--    Restaurar no exige concepto (la categoría pudo cambiar después).
-- 3. Todo servicio tiene al menos un gasto (revisión al terminar la transacción);
--    actualizar_servicio rechaza ids de gastos que no son de ese servicio.
-- 4. eliminar_unidad: solo borra historial y archivos de servicios eliminados cuya
--    copia más reciente es de esa unidad (antes alcanzaba servicios vivos que
--    alguna vez fueron de ella).
-- 5. Usuario desactivado: nombre_usuario y archivo_comprobante_en_uso no le
--    responden; gastos_para_reporte exige poder ver todo.
-- 6. Concurrencia: tope de 10 comprobantes y "siempre un admin activo" con candado.
-- 7. reporte_gastos recibe el periodo anterior desde la app (mes anterior, mismo
--    tramo del año pasado, etc.); sin él, usa los días previos del mismo largo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Historial
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
    -- gastos y comprobantes
    v_servicio_id = (v_fila ->> 'servicio_id')::uuid;

    -- coalesce: sin el ajuste, current_setting(..., true) regresa NULL.
    if tg_op = 'DELETE'
       and coalesce(current_setting('app.servicio_eliminado', true), '') = v_servicio_id::text then
      return null;
    end if;

    select s.created_by into v_dueno_id from public.servicios s where s.id = v_servicio_id;

    if tg_table_name = 'comprobantes' then
      v_es_alta = tg_op = 'INSERT';
    else
      v_es_alta = tg_op = 'INSERT'
        and coalesce(current_setting('app.servicio_nuevo', true), '') = v_servicio_id::text;
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

-- ---------------------------------------------------------------------------
-- 2. Servicios y gastos: lo que fija la BD
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

  if v_estatus = 'baja'
     and (v_validar or (tg_op = 'UPDATE' and new.unidad_id is distinct from old.unidad_id)) then
    raise exception 'La unidad % está dada de baja', v_numero using errcode = '23514';
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

create or replace function public.preparar_gasto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_activa boolean;
  v_restaurando boolean := tg_op = 'INSERT'
    and coalesce(current_setting('app.servicio_restaurado', true), '') = new.servicio_id::text;
begin
  new.concepto = nullif(trim(new.concepto), '');

  if tg_op = 'INSERT' then
    if not v_restaurando then
      new.id = gen_random_uuid();
      new.created_by = auth.uid();
      new.created_at = now();
      new.updated_at = now();
    end if;
  else
    new.id = old.id;
    new.servicio_id = old.servicio_id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;

  -- Categoría desactivada: no se usa en gastos nuevos ni al cambiar la categoría.
  if not v_restaurando and (tg_op = 'INSERT' or new.categoria_id is distinct from old.categoria_id) then
    select c.nombre, c.activo into v_categoria, v_activa
    from public.categorias c
    where c.id = new.categoria_id;

    if found and not v_activa then
      raise exception 'La categoría "%" está desactivada', v_categoria using errcode = '23514';
    end if;
  end if;

  if new.moneda = 'USD' then
    if new.monto_usd is null or new.monto_usd <= 0 or new.tipo_cambio is null or new.tipo_cambio <= 0 then
      raise exception 'Escribe la cantidad en dólares y el tipo de cambio' using errcode = '23514';
    end if;
    new.monto = round(new.monto_usd * new.tipo_cambio, 2);
  else
    new.monto_usd = null;
    new.tipo_cambio = null;
  end if;

  -- Restaurar no exige concepto: la categoría pudo pasar a "requiere concepto" después.
  if new.concepto is null and not v_restaurando then
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

-- ---------------------------------------------------------------------------
-- 3. Todo servicio tiene al menos un gasto. Se revisa al terminar la
-- transacción: registrar, editar, restaurar y eliminar pasan por estados
-- intermedios sin gastos.
-- ---------------------------------------------------------------------------
create or replace function public.validar_servicio_con_gastos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_servicio_id uuid;
begin
  -- Cada tabla tiene su propio registro: no se pueden mezclar en una sola expresión.
  if tg_table_name = 'servicios' then
    v_servicio_id = new.id;
  else
    v_servicio_id = old.servicio_id;
  end if;

  if exists (select 1 from public.servicios s where s.id = v_servicio_id)
     and not exists (select 1 from public.gastos g where g.servicio_id = v_servicio_id) then
    raise exception 'Un servicio debe tener al menos un gasto' using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function public.validar_servicio_con_gastos() from public, anon, authenticated;

create constraint trigger servicios_con_gastos
  after insert on public.servicios
  deferrable initially deferred
  for each row execute function public.validar_servicio_con_gastos();

create constraint trigger gastos_servicio_no_vacio
  after delete on public.gastos
  deferrable initially deferred
  for each row execute function public.validar_servicio_con_gastos();

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
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. eliminar_unidad: solo servicios eliminados cuya copia más reciente es de esta unidad
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_unidad(p_unidad_id uuid, p_confirmacion text)
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

  -- Servicios en Eliminados (ya no existen) cuya copia de borrado MÁS RECIENTE es de
  -- esta unidad. Uno restaurado y movido a otra unidad, o borrado después desde otra,
  -- no es de esta unidad.
  select coalesce(array_agg(x.servicio_id), '{}') into v_eliminados
  from (
    select distinct on (h.servicio_id) h.servicio_id, h.datos_anteriores ->> 'unidad_id' as unidad_id
    from public.historial_cambios h
    where h.tabla = 'servicios'
      and h.accion = 'delete'
      and not exists (select 1 from public.servicios s where s.id = h.servicio_id)
    order by h.servicio_id, h.id desc
  ) as x
  where x.unidad_id = p_unidad_id::text;

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

-- ---------------------------------------------------------------------------
-- 5. Usuario desactivado (sin rol) no obtiene respuesta
-- ---------------------------------------------------------------------------
create or replace function public.nombre_usuario(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.nombre from public.perfiles p
  where p.id = p_id and public.rol_actual() is not null
$$;

-- Sin rol responde "en uso": así nunca habilita borrar un archivo.
create or replace function public.archivo_comprobante_en_uso(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() is null
    or exists (select 1 from public.comprobantes c where c.ruta_archivo = p_ruta)
$$;

-- ---------------------------------------------------------------------------
-- 6. Concurrencia
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

  -- Dos subidas al mismo tiempo cuentan en orden (si no, 9 + 2 podía dejar 11).
  perform pg_advisory_xact_lock(hashtextextended('comprobantes:' || new.servicio_id::text, 0));
  if (select count(*) from public.comprobantes c where c.servicio_id = new.servicio_id) >= 10 then
    raise exception 'Un servicio puede tener hasta 10 comprobantes' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.id = old.id;
  new.created_at = old.created_at;
  new.created_by = old.created_by;
  new.nombre = trim(new.nombre);

  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo) then
    if old.id = auth.uid() then
      raise exception 'No puedes quitarte tu propio acceso de administrador' using errcode = '23514';
    end if;
    -- Dos admins quitándose acceso al mismo tiempo se revisan en orden.
    perform pg_advisory_xact_lock(hashtextextended('perfiles:admins', 0));
    if not exists (
      select 1 from public.perfiles p
      where p.rol = 'admin' and p.activo and p.id <> old.id
    ) then
      raise exception 'Debe quedar al menos un administrador activo' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 y 7. Reportes: base solo para quien ve todo; periodo anterior desde la app
-- ---------------------------------------------------------------------------
create or replace function public.gastos_para_reporte(
  p_desde date,
  p_hasta date,
  p_grupo text,
  p_tipo public.tipo_unidad
)
returns table (
  gasto_id uuid,
  servicio_id uuid,
  fecha date,
  unidad_id uuid,
  numero_economico text,
  numero_orden integer,
  tipo public.tipo_unidad,
  grupo text,
  categoria_id uuid,
  categoria text,
  concepto text,
  proveedor_id uuid,
  proveedor text,
  descripcion text,
  monto numeric(12, 2),
  moneda public.moneda,
  monto_usd numeric(12, 2),
  tipo_cambio numeric(10, 4)
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.puede_ver_todo() then
    raise exception 'Solo administradores y gerentes ven reportes' using errcode = '42501';
  end if;

  return query execute
    'select g.id, s.id, s.fecha, u.id, u.numero_economico, u.numero_orden, u.tipo,
            case when u.tipo = ''camioneta'' then ''camionetas'' else u.operacion::text end,
            c.id, c.nombre, g.concepto, p.id, p.nombre, s.descripcion, g.monto,
            g.moneda, g.monto_usd, g.tipo_cambio
     from public.gastos g
     join public.servicios s on s.id = g.servicio_id
     join public.unidades u on u.id = s.unidad_id
     left join public.categorias c on c.id = g.categoria_id
     left join public.proveedores p on p.id = s.proveedor_id
     where s.fecha between $1 and $2'
    || case when p_grupo is not null
         then ' and (case when u.tipo = ''camioneta'' then ''camionetas'' else u.operacion::text end) = $3' else '' end
    || case when p_tipo is not null then ' and u.tipo = $4' else '' end
  using p_desde, p_hasta, p_grupo, p_tipo;
end;
$$;

-- Nueva firma (periodo anterior): se vuelve a crear.
drop function public.reporte_gastos(date, date, text, public.tipo_unidad, integer);

create function public.reporte_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo public.tipo_unidad default null,
  p_limite_ranking integer default 10,
  p_anterior_desde date default null,
  p_anterior_hasta date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set work_mem = '32MB'
as $$
declare
  v_dias integer := p_hasta - p_desde + 1;
  v_limite integer := least(greatest(coalesce(p_limite_ranking, 10), 1), 50);
  v_ant_desde date := coalesce(p_anterior_desde, p_desde - v_dias);
  v_ant_hasta date := coalesce(p_anterior_hasta, p_desde - 1);
  v_resultado jsonb;
begin
  perform public.validar_reporte(p_desde, p_hasta, p_grupo);
  if v_ant_desde > v_ant_hasta or v_ant_hasta >= p_desde then
    raise exception 'Revisa el periodo anterior' using errcode = '23514';
  end if;

  with
  g as (
    select * from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo)
  ),
  anterior as (
    select coalesce(sum(monto), 0) as total
    from public.gastos_para_reporte(v_ant_desde, v_ant_hasta, p_grupo, p_tipo)
  ),
  meses as (
    select m, to_char(m, 'YYYY-MM') as mes
    from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') as m
  ),
  g_mes as (
    select date_trunc('month', fecha) as m, sum(monto) as total, count(distinct servicio_id) as servicios
    from g group by 1
  ),
  por_mes as (
    select meses.mes, coalesce(g_mes.total, 0) as total, coalesce(g_mes.servicios, 0) as servicios
    from meses
    left join g_mes on g_mes.m = meses.m
  ),
  por_categoria as (
    select categoria_id, coalesce(categoria, 'Categoría') as nombre, sum(monto) as total, count(*) as gastos
    from g group by categoria_id, categoria
  ),
  por_unidad as (
    select unidad_id, numero_economico, numero_orden, tipo, grupo,
           sum(monto) as total, count(distinct servicio_id) as servicios
    from g group by unidad_id, numero_economico, numero_orden, tipo, grupo
  ),
  por_grupo as (
    select grupo, sum(monto) as total from g group by grupo
  ),
  por_tipo as (
    select tipo, sum(monto) as total from g group by tipo
  ),
  por_proveedor as (
    select proveedor_id, coalesce(proveedor, 'Sin proveedor') as nombre, sum(monto) as total,
           count(distinct servicio_id) as servicios
    from g group by proveedor_id, proveedor
  ),
  dolares as (
    select coalesce(sum(monto_usd), 0) as usd, coalesce(sum(monto), 0) as mxn, count(*) as gastos
    from g
    where moneda = 'USD'
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(monto), 0)::text from g),
    'total_anterior', (select total::text from anterior),
    'anterior_desde', v_ant_desde,
    'anterior_hasta', v_ant_hasta,
    'servicios', (select count(distinct servicio_id) from g),
    'gastos', (select count(*) from g),
    'unidades', (select count(distinct unidad_id) from g),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'total', total::text, 'servicios', servicios) order by mes), '[]') from por_mes),
    'por_categoria', (select coalesce(jsonb_agg(jsonb_build_object('id', categoria_id, 'nombre', nombre, 'total', total::text, 'gastos', gastos) order by total desc), '[]') from por_categoria),
    'por_unidad', (select coalesce(jsonb_agg(x.obj order by x.total desc, x.numero_orden), '[]') from (
        select jsonb_build_object('id', unidad_id, 'numero', numero_economico, 'tipo', tipo, 'grupo', grupo,
                                  'total', total::text, 'servicios', servicios) as obj, total, numero_orden
        from por_unidad order by total desc, numero_orden limit v_limite) as x),
    'por_grupo', (select coalesce(jsonb_agg(jsonb_build_object('grupo', grupo, 'total', total::text) order by total desc), '[]') from por_grupo),
    'por_tipo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'total', total::text) order by total desc), '[]') from por_tipo),
    'por_proveedor', (select coalesce(jsonb_agg(x.obj order by x.total desc), '[]') from (
        select jsonb_build_object('id', proveedor_id, 'nombre', nombre, 'total', total::text, 'servicios', servicios) as obj, total
        from por_proveedor order by total desc limit v_limite) as x),
    'dolares', (select jsonb_build_object('usd', usd::text, 'mxn', mxn::text, 'gastos', gastos) from dolares)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function public.reporte_gastos(date, date, text, public.tipo_unidad, integer, date, date) from public, anon;
grant execute on function public.reporte_gastos(date, date, text, public.tipo_unidad, integer, date, date) to authenticated;
