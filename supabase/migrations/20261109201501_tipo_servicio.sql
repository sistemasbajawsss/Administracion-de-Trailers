-- =============================================================================
-- Sección 5F, Etapa 2 — Tipo de servicio (2026-11-09)
--
-- Cada servicio nuevo lleva su tipo, con los nombres del usuario (D14):
--   preventivo: se hace antes de que algo falle (ej. balatas gastadas);
--   correctivo: lo constante, cada cierto kilometraje o tiempo (ej. cambio de aceite);
--   servicio:   todo lo demás (reparaciones).
-- Los servicios de antes quedan sin tipo (null). El tipo va en el servicio; la
-- categoría de cada gasto sigue diciendo qué se compró.
--
-- Compatibilidad con la app publicada: el tipo es opcional en la BD (lo exige el
-- servidor de la app en servicios nuevos). registrar_servicio y
-- actualizar_servicio reciben un parámetro opcional al final; llamadas como
-- antes hacen lo mismo (al editar sin tipo, se conserva el que tenía).
-- Reportes agrega "por_tipo_servicio" y el Excel una columna: los totales no
-- cambian.
--
-- Versiones anteriores (para regresar): registrar_servicio y actualizar_servicio
-- en 20261106233851_salida_con_servicio.sql, restaurar_servicio en
-- 20261106205646_servicios_taller.sql, servicios_resumen en
-- 20261106215754_servicios_resumen_taller.sql, gastos_para_reporte en
-- 20261028172104_consultas_con_volumen.sql, exportar_gastos en
-- 20261027234242_gastos_en_dolares.sql, reporte_gastos en
-- 20261028191347_auditoria_integridad.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tipo y columna
-- ---------------------------------------------------------------------------
create type public.tipo_servicio as enum ('preventivo', 'correctivo', 'servicio');

alter table public.servicios add column tipo public.tipo_servicio;

comment on column public.servicios.tipo is 'Preventivo, correctivo o servicio (5F). Null en los servicios de antes.';

-- ---------------------------------------------------------------------------
-- 2. servicios_resumen: el tipo al final (create or replace view lo permite)
-- Copia de 20261106215754_servicios_resumen_taller.sql + tipo.
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
  s.tipo
from public.servicios s
left join lateral (
  select sum(x.monto) as total, count(*) as num_gastos
  from public.gastos x
  where x.servicio_id = s.id
) g on true;

-- ---------------------------------------------------------------------------
-- 3. registrar_servicio: tipo (opcional en la BD)
-- Copia de 20261106233851_salida_con_servicio.sql + p_tipo. "Se olvidó la
-- entrada" ahora registra la entrada con el kilometraje del servicio.
-- Se reemplaza la versión anterior (dos versiones confundirían a la API).
-- ---------------------------------------------------------------------------
drop function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text);

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
  p_tipo public.tipo_servicio default null
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

  insert into public.servicios (unidad_id, fecha, kilometraje, proveedor_id, descripcion, motivo_sin_entrada, tipo)
  values (p_unidad_id, p_fecha, p_kilometraje, p_proveedor_id, p_descripcion, p_motivo_sin_entrada, p_tipo)
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
-- 4. actualizar_servicio: tipo (sin tipo, se conserva el que tenía)
-- Copia de 20261106233851_salida_con_servicio.sql + p_tipo.
-- ---------------------------------------------------------------------------
drop function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text);

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
  p_tipo public.tipo_servicio default null
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
      tipo = coalesce(p_tipo, tipo)
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

revoke execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio) from public, anon;
revoke execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio) from public, anon;
grant execute on function public.registrar_servicio(uuid, date, integer, uuid, text, jsonb, boolean, text, date, text, public.tipo_servicio) to authenticated;
grant execute on function public.actualizar_servicio(uuid, uuid, date, integer, uuid, text, jsonb, text, boolean, text, public.tipo_servicio) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. restaurar_servicio: también regresa el tipo
-- Copia de 20261106205646_servicios_taller.sql + tipo (las copias de antes no
-- lo traen: queda null).
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
    entrada_taller_id, sin_entrada_taller, motivo_sin_entrada, tipo
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
    (v_datos ->> 'tipo')::public.tipo_servicio
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

-- ---------------------------------------------------------------------------
-- 6. Reportes: el tipo de servicio en los gastos del reporte
-- gastos_para_reporte cambia lo que regresa (columna nueva al final): se borra
-- y se vuelve a crear con los mismos permisos. reporte_gastos y exportar_gastos
-- la llaman por nombre de columna, así que no cambian salvo lo agregado.
-- ---------------------------------------------------------------------------
drop function public.exportar_gastos(date, date, text, public.tipo_unidad);
drop function public.gastos_para_reporte(date, date, text, public.tipo_unidad);

create function public.gastos_para_reporte(p_desde date, p_hasta date, p_grupo text, p_tipo public.tipo_unidad)
returns table (
  gasto_id uuid, servicio_id uuid, fecha date, unidad_id uuid, numero_economico text, numero_orden integer,
  tipo public.tipo_unidad, grupo text, categoria_id uuid, categoria text, concepto text, proveedor_id uuid,
  proveedor text, descripcion text, monto numeric, moneda public.moneda, monto_usd numeric, tipo_cambio numeric,
  tipo_servicio public.tipo_servicio
)
language plpgsql
stable
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
            g.moneda, g.monto_usd, g.tipo_cambio, s.tipo
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

revoke execute on function public.gastos_para_reporte(date, date, text, public.tipo_unidad) from public, anon;
grant execute on function public.gastos_para_reporte(date, date, text, public.tipo_unidad) to authenticated;

-- Excel: el tipo de servicio al final (la app de antes lee las columnas por nombre).
create function public.exportar_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo public.tipo_unidad default null
)
returns table (
  fecha date, numero_economico text, tipo public.tipo_unidad, grupo text, categoria text, concepto text,
  proveedor text, descripcion text, monto text, moneda public.moneda, monto_usd text, tipo_cambio text,
  tipo_servicio public.tipo_servicio
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.validar_reporte(p_desde, p_hasta, p_grupo);

  return query
  select g.fecha, g.numero_economico, g.tipo, g.grupo, coalesce(g.categoria, 'Categoría'), g.concepto,
         coalesce(g.proveedor, 'Sin proveedor'), g.descripcion, g.monto::text,
         g.moneda, g.monto_usd::text, g.tipo_cambio::text, g.tipo_servicio
  from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo) as g
  order by g.fecha desc, g.numero_orden, g.servicio_id, g.gasto_id
  limit 50000;
end;
$$;

revoke execute on function public.exportar_gastos(date, date, text, public.tipo_unidad) from public, anon;
grant execute on function public.exportar_gastos(date, date, text, public.tipo_unidad) to authenticated;

-- reporte_gastos: agrega por_tipo_servicio (copia de 20261028191347_auditoria_integridad.sql).
-- Los servicios sin tipo salen con tipo null ("Sin tipo" en la app).
create or replace function public.reporte_gastos(
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
  por_tipo_servicio as (
    select tipo_servicio, sum(monto) as total, count(distinct servicio_id) as servicios
    from g group by tipo_servicio
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
    'por_tipo_servicio', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo_servicio, 'total', total::text, 'servicios', servicios) order by total desc), '[]') from por_tipo_servicio),
    'por_proveedor', (select coalesce(jsonb_agg(x.obj order by x.total desc), '[]') from (
        select jsonb_build_object('id', proveedor_id, 'nombre', nombre, 'total', total::text, 'servicios', servicios) as obj, total
        from por_proveedor order by total desc limit v_limite) as x),
    'dolares', (select jsonb_build_object('usd', usd::text, 'mxn', mxn::text, 'gastos', gastos) from dolares)
  )
  into v_resultado;

  return v_resultado;
end;
$$;

-- La API debe ver las funciones nuevas de inmediato.
notify pgrst, 'reload schema';
