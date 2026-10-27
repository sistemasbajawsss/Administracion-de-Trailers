-- =============================================================================
-- Sección 5B — Facturas en dólares
-- Cada gasto se captura en pesos o en dólares. En dólares se guardan la cantidad
-- y el tipo de cambio, y la BD calcula el monto en pesos (gastos.monto), que es
-- el que suman los reportes y los totales. Los gastos existentes quedan en MXN.
-- =============================================================================

create type public.moneda as enum ('MXN', 'USD');

alter table public.gastos
  add column moneda public.moneda not null default 'MXN',
  add column monto_usd numeric(12, 2),
  add column tipo_cambio numeric(10, 4),
  add constraint gastos_moneda_check check (
    (moneda = 'MXN' and monto_usd is null and tipo_cambio is null)
    or (moneda = 'USD' and monto_usd > 0 and tipo_cambio > 0 and tipo_cambio <= 100)
  );

comment on column public.gastos.monto is 'Monto en MXN con IVA incluido. En gastos en dólares lo calcula preparar_gasto().';
comment on column public.gastos.monto_usd is 'Cantidad en dólares (solo moneda USD).';
comment on column public.gastos.tipo_cambio is 'Pesos por dólar con que se convirtió (solo moneda USD).';

-- ---------------------------------------------------------------------------
-- preparar_gasto: en dólares, el monto en pesos siempre sale de la cantidad y el
-- tipo de cambio (aunque alguien mande otro monto por API directa).
-- ---------------------------------------------------------------------------
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
    if current_setting('app.servicio_restaurado', true) is distinct from new.servicio_id::text then
      new.created_by = auth.uid();
    end if;
  else
    new.servicio_id = old.servicio_id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
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

-- ---------------------------------------------------------------------------
-- registrar_servicio / actualizar_servicio: mismos argumentos; cada gasto del
-- JSON puede traer moneda, monto_usd y tipo_cambio (texto). Sin moneda = MXN.
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
-- restaurar_servicio: también regresa la moneda y el tipo de cambio de sus gastos
-- (las copias de antes de esta migración no los traen: quedan en MXN).
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
-- gastos_detalle: moneda, cantidad en dólares y tipo de cambio al final
-- (create or replace view lo permite; listar_gastos() regresa la vista completa).
-- ---------------------------------------------------------------------------
create or replace view public.gastos_detalle
with (security_invoker = true)
as
select
  g.id,
  g.servicio_id,
  s.unidad_id,
  u.numero_economico,
  u.tipo as tipo_unidad,
  s.fecha,
  s.created_at as servicio_creado,
  s.created_by,
  g.categoria_id,
  c.nombre as categoria,
  g.concepto,
  g.monto,
  (select count(*) from public.comprobantes x where x.servicio_id = s.id)::integer as num_comprobantes,
  g.created_at,
  exists (
    select 1 from public.comprobantes x
    where x.servicio_id = s.id and x.tipo_mime = 'application/pdf'
  ) as tiene_pdf,
  g.moneda,
  g.monto_usd,
  g.tipo_cambio
from public.gastos g
join public.servicios s on s.id = g.servicio_id
left join public.unidades u on u.id = s.unidad_id
left join public.categorias c on c.id = g.categoria_id;

-- ---------------------------------------------------------------------------
-- exportar_gastos: tres columnas nuevas para el Excel. Cambia el tipo de
-- retorno: se vuelve a crear.
-- ---------------------------------------------------------------------------
drop function public.exportar_gastos(date, date, text, public.tipo_unidad);

create function public.exportar_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo public.tipo_unidad default null
)
returns table (
  fecha date,
  numero_economico text,
  tipo public.tipo_unidad,
  grupo text,
  categoria text,
  concepto text,
  proveedor text,
  descripcion text,
  monto text,
  moneda public.moneda,
  monto_usd text,
  tipo_cambio text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  perform public.validar_reporte(p_desde, p_hasta, p_grupo);

  return query
  select g.fecha, g.numero_economico, g.tipo, g.grupo, coalesce(g.categoria, 'Categoría'), g.concepto,
         coalesce(g.proveedor, 'Sin proveedor'), g.descripcion, g.monto::text,
         x.moneda, x.monto_usd::text, x.tipo_cambio::text
  from public.gastos_para_reporte(p_desde, p_hasta, p_grupo, p_tipo) as g
  join public.gastos x on x.id = g.gasto_id
  order by g.fecha desc, g.numero_orden, g.servicio_id, g.gasto_id
  limit 50000;
end;
$$;

revoke execute on function public.exportar_gastos(date, date, text, public.tipo_unidad) from public, anon;
grant execute on function public.exportar_gastos(date, date, text, public.tipo_unidad) to authenticated;
