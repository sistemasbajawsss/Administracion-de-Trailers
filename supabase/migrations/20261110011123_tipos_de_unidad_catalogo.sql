-- =============================================================================
-- Tipos de unidad como catálogo (2026-11-10, pedido por el usuario)
--
-- Antes eran un enum fijo (tipo_unidad). Ahora son la tabla tipos_unidad, con
-- botón "Nuevo tipo" en Catálogos (solo admin). Cada tipo dice:
--   - prefijo: la letra del número económico (T-17, R-39…), única.
--   - lleva_kilometraje: si tiene odómetro (las cajas, dollys y góndolas no).
--   - lleva_largo: si se captura su largo en pies (las cajas).
--   - lleva_operacion: local / foráneo; si no, va con las camionetas.
-- Clave, prefijo, orden y las tres reglas no cambian después de crearlo (las
-- unidades ya numeradas dependen de ellos); el nombre sí, y se desactiva en vez
-- de borrarse (como los demás catálogos).
--
-- Se agregan Dolly (D-) y Góndola (G-), sin kilometraje.
--
-- unidades.tipo y bitacora_eliminaciones.tipo pasan de enum a texto con llave
-- al catálogo; las reglas que decían "si es caja" ahora preguntan al tipo.
-- unidades.orden_tipo (copiado del catálogo) conserva el orden de las listas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catálogo
-- ---------------------------------------------------------------------------
create table public.tipos_unidad (
  clave text primary key,
  nombre text not null,
  prefijo text not null,
  lleva_kilometraje boolean not null,
  lleva_largo boolean not null default false,
  lleva_operacion boolean not null default true,
  orden smallint not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint tipos_unidad_clave_valida check (clave ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint tipos_unidad_nombre_valido check (length(trim(nombre)) between 2 and 40),
  constraint tipos_unidad_prefijo_valido check (prefijo ~ '^[A-Z]{1,3}$')
);

comment on table public.tipos_unidad is 'Tipos de unidad (trailer, caja, dolly…): letra del número económico y qué datos lleva.';

create unique index tipos_unidad_prefijo_unico on public.tipos_unidad (prefijo);
create unique index tipos_unidad_nombre_unico on public.tipos_unidad (lower(trim(nombre)));

insert into public.tipos_unidad (clave, nombre, prefijo, lleva_kilometraje, lleva_largo, lleva_operacion, orden, created_by) values
  ('trailer', 'Trailer', 'T', true, false, true, 1, null),
  ('caja', 'Caja', 'R', false, true, true, 2, null),
  ('camion_rabon', 'Camión rabón', 'F', true, false, true, 3, null),
  ('pipa', 'Pipa', 'P', true, false, true, 4, null),
  ('camioneta', 'Camioneta', 'C', true, false, false, 5, null),
  ('dolly', 'Dolly', 'D', false, false, true, 6, null),
  ('gondola', 'Góndola', 'G', false, false, true, 7, null);

-- Alta: clave sacada del nombre ("Camión rabón" -> camion_rabon), orden al
-- final, autor. Edición: solo nombre y activo. (Va después de los datos de
-- arriba para no tocarlos.)
create or replace function public.preparar_tipo_unidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_n integer := 1;
begin
  new.nombre = trim(regexp_replace(new.nombre, '\s+', ' ', 'g'));
  new.prefijo = upper(trim(new.prefijo));

  if tg_op = 'INSERT' then
    v_base = trim(both '_' from regexp_replace(
      translate(lower(new.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '_', 'g'));
    if v_base !~ '^[a-z]' then v_base = 't_' || v_base; end if;
    v_base = left(v_base, 36);
    new.clave = v_base;
    while exists (select 1 from public.tipos_unidad t where t.clave = new.clave) loop
      v_n = v_n + 1;
      new.clave = v_base || '_' || v_n;
    end loop;
    new.orden = coalesce((select max(t.orden) from public.tipos_unidad t), 0) + 1;
    new.created_by = auth.uid();
    new.created_at = now();
    new.updated_at = now();
    new.activo = true;
  else
    if new.clave <> old.clave or new.prefijo <> old.prefijo or new.orden <> old.orden
       or new.lleva_kilometraje <> old.lleva_kilometraje or new.lleva_largo <> old.lleva_largo
       or new.lleva_operacion <> old.lleva_operacion then
      raise exception 'De un tipo de unidad solo se cambia el nombre; la letra y lo que lleva quedan fijos' using errcode = '23514';
    end if;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.preparar_tipo_unidad() from public, anon, authenticated;

create trigger tipos_unidad_preparar
  before insert or update on public.tipos_unidad
  for each row execute function public.preparar_tipo_unidad();

create trigger tipos_unidad_actualizar_updated_at
  before update on public.tipos_unidad
  for each row execute function public.actualizar_updated_at();

alter table public.tipos_unidad enable row level security;

create policy "tipos unidad: leer"
  on public.tipos_unidad for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy "tipos unidad: admin crea"
  on public.tipos_unidad for insert to authenticated
  with check ((select public.es_admin()));

create policy "tipos unidad: admin actualiza"
  on public.tipos_unidad for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

revoke all on public.tipos_unidad from anon;
revoke delete, truncate, references, trigger on public.tipos_unidad from authenticated;
grant select, insert, update on public.tipos_unidad to authenticated;

-- ¿El tipo tiene odómetro? (Un tipo desconocido se trata como que sí.)
create or replace function public.tipo_lleva_kilometraje(p_tipo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select t.lleva_kilometraje from public.tipos_unidad t where t.clave = p_tipo), true);
$$;

revoke execute on function public.tipo_lleva_kilometraje(text) from public, anon;
grant execute on function public.tipo_lleva_kilometraje(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lo que dependía del enum se quita para cambiar las columnas
-- ---------------------------------------------------------------------------
-- listar_gastos regresa filas de la vista: se quita y se vuelve a crear igual.
drop function public.listar_gastos(uuid, text, text, date, date, integer, integer);
drop view public.gastos_detalle;
drop function public.exportar_gastos(date, date, text, public.tipo_unidad);
drop function public.reporte_gastos(date, date, text, public.tipo_unidad, integer, date, date);
drop function public.gastos_para_reporte(date, date, text, public.tipo_unidad);

alter table public.unidades drop constraint unidades_prefijo_segun_tipo;
alter table public.unidades drop constraint unidades_operacion_segun_tipo;
alter table public.unidades drop constraint unidades_longitud_solo_cajas;

alter table public.unidades alter column tipo type text using tipo::text;
alter table public.bitacora_eliminaciones alter column tipo type text using tipo::text;

drop function public.prefijo_tipo_unidad(public.tipo_unidad);

alter table public.unidades add column orden_tipo smallint;
update public.unidades u set orden_tipo = t.orden from public.tipos_unidad t where t.clave = u.tipo;
alter table public.unidades
  alter column orden_tipo set not null,
  add constraint unidades_tipo_fkey foreign key (tipo) references public.tipos_unidad (clave);
create index unidades_orden_tipo_idx on public.unidades (orden_tipo, numero_orden);

-- ---------------------------------------------------------------------------
-- 3. Reglas de la unidad según su tipo (antes eran CHECK con el enum)
-- ---------------------------------------------------------------------------
create or replace function public.validar_tipo_de_unidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tipos_unidad;
begin
  select * into t from public.tipos_unidad x where x.clave = new.tipo;
  if not found then
    raise exception 'Elige un tipo de unidad válido' using errcode = '23514';
  end if;
  if not t.activo and (tg_op = 'INSERT' or new.tipo is distinct from old.tipo) then
    raise exception 'El tipo "%" está desactivado', t.nombre using errcode = '23514';
  end if;
  if split_part(new.numero_economico, '-', 1) <> t.prefijo then
    raise exception 'Un % empieza con %-', lower(t.nombre), t.prefijo using errcode = '23514';
  end if;
  if t.lleva_operacion and new.operacion is null then
    raise exception 'Elige si la unidad es local o foránea' using errcode = '23514';
  end if;
  if not t.lleva_operacion then
    new.operacion = null;
  end if;
  if new.longitud_pies is not null and (not t.lleva_largo or new.longitud_pies not between 10 and 60) then
    raise exception 'La longitud solo va en los tipos que la llevan, entre 10 y 60 pies' using errcode = '23514';
  end if;
  new.orden_tipo = t.orden;
  return new;
end;
$$;

revoke execute on function public.validar_tipo_de_unidad() from public, anon, authenticated;

-- Después de unidades_normalizar (los triggers corren en orden alfabético).
create trigger unidades_validar_tipo
  before insert or update on public.unidades
  for each row execute function public.validar_tipo_de_unidad();

drop type public.tipo_unidad;

-- ---------------------------------------------------------------------------
-- 4. Vista y reportes, iguales pero con el tipo en texto
-- ---------------------------------------------------------------------------
create view public.gastos_detalle
with (security_invoker = true) as
SELECT g.id,
    g.servicio_id,
    s.unidad_id,
    u.numero_economico,
    u.tipo AS tipo_unidad,
    s.fecha,
    s.created_at AS servicio_creado,
    s.created_by,
    g.categoria_id,
    c.nombre AS categoria,
    g.concepto,
    g.monto,
    (( SELECT count(*) AS count
           FROM comprobantes x
          WHERE x.servicio_id = s.id))::integer AS num_comprobantes,
    g.created_at,
    (EXISTS ( SELECT 1
           FROM comprobantes x
          WHERE x.servicio_id = s.id AND x.tipo_mime = 'application/pdf'::text)) AS tiene_pdf,
    g.moneda,
    g.monto_usd,
    g.tipo_cambio
   FROM gastos g
     JOIN servicios s ON s.id = g.servicio_id
     LEFT JOIN unidades u ON u.id = s.unidad_id
     LEFT JOIN categorias c ON c.id = g.categoria_id;

grant select on public.gastos_detalle to authenticated;

CREATE OR REPLACE FUNCTION public.listar_gastos(p_unidad_id uuid DEFAULT NULL::uuid, p_numero text DEFAULT NULL::text, p_busqueda text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_limite integer DEFAULT 25, p_desde_renglon integer DEFAULT 0)
 RETURNS SETOF gastos_detalle
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  return query execute
    'select d.* from public.gastos_detalle d where '
    || public.filtro_gastos(p_unidad_id, p_numero, p_busqueda, p_desde, p_hasta)
    -- Mismo servicio juntos, sus gastos en el orden en que se capturaron; id desempata.
    || ' order by d.fecha desc, d.servicio_creado desc, d.servicio_id, d.created_at, d.id'
    || ' limit $6 offset $7'
  using p_unidad_id, public.patron_busqueda(p_numero), public.patron_busqueda(p_busqueda), p_desde, p_hasta,
        least(greatest(p_limite, 1), 100), greatest(p_desde_renglon, 0);
end;
$function$;

revoke execute on function public.listar_gastos(uuid, text, text, date, date, integer, integer) from public, anon;
grant execute on function public.listar_gastos(uuid, text, text, date, date, integer, integer) to authenticated;

create or replace function public.gastos_para_reporte(p_desde date, p_hasta date, p_grupo text, p_tipo text)
returns table(gasto_id uuid, servicio_id uuid, fecha date, unidad_id uuid, numero_economico text, numero_orden integer,
              tipo text, grupo text, categoria_id uuid, categoria text, concepto text, proveedor_id uuid, proveedor text,
              descripcion text, monto numeric, moneda public.moneda, monto_usd numeric, tipo_cambio numeric,
              tipo_servicio public.tipo_servicio)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.puede_ver_todo() then
    raise exception 'Solo administradores y gerentes ven reportes' using errcode = '42501';
  end if;

  -- Sin operación = grupo Camionetas (lo garantiza validar_tipo_de_unidad).
  return query execute
    'select g.id, s.id, s.fecha, u.id, u.numero_economico, u.numero_orden, u.tipo,
            coalesce(u.operacion::text, ''camionetas''),
            c.id, c.nombre, g.concepto, p.id, p.nombre, s.descripcion, g.monto,
            g.moneda, g.monto_usd, g.tipo_cambio, s.tipo
     from public.gastos g
     join public.servicios s on s.id = g.servicio_id
     join public.unidades u on u.id = s.unidad_id
     left join public.categorias c on c.id = g.categoria_id
     left join public.proveedores p on p.id = s.proveedor_id
     where s.fecha between $1 and $2'
    || case when p_grupo is not null
         then ' and coalesce(u.operacion::text, ''camionetas'') = $3' else '' end
    || case when p_tipo is not null then ' and u.tipo = $4' else '' end
  using p_desde, p_hasta, p_grupo, p_tipo;
end;
$$;

revoke execute on function public.gastos_para_reporte(date, date, text, text) from public, anon;
grant execute on function public.gastos_para_reporte(date, date, text, text) to authenticated;

create or replace function public.exportar_gastos(p_desde date, p_hasta date, p_grupo text default null, p_tipo text default null)
returns table(fecha date, numero_economico text, tipo text, grupo text, categoria text, concepto text, proveedor text,
              descripcion text, monto text, moneda public.moneda, monto_usd text, tipo_cambio text,
              tipo_servicio public.tipo_servicio)
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

revoke execute on function public.exportar_gastos(date, date, text, text) from public, anon;
grant execute on function public.exportar_gastos(date, date, text, text) to authenticated;

create or replace function public.reporte_gastos(
  p_desde date,
  p_hasta date,
  p_grupo text default null,
  p_tipo text default null,
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
    select date_trunc('month', fecha) as m, sum(monto) as total, count(distinct servicio_id) as servicios,
           coalesce(sum(monto) filter (where tipo_servicio = 'correctivo'), 0) as correctivo,
           coalesce(sum(monto) filter (where tipo_servicio = 'preventivo'), 0) as preventivo,
           coalesce(sum(monto) filter (where tipo_servicio = 'servicio'), 0) as servicio,
           coalesce(sum(monto) filter (where tipo_servicio is null), 0) as sin_tipo
    from g group by 1
  ),
  por_mes as (
    select meses.mes, coalesce(g_mes.total, 0) as total, coalesce(g_mes.servicios, 0) as servicios,
           coalesce(g_mes.correctivo, 0) as correctivo, coalesce(g_mes.preventivo, 0) as preventivo,
           coalesce(g_mes.servicio, 0) as servicio, coalesce(g_mes.sin_tipo, 0) as sin_tipo
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
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'total', total::text, 'servicios', servicios,
        'correctivo', correctivo::text, 'preventivo', preventivo::text, 'servicio', servicio::text, 'sin_tipo', sin_tipo::text) order by mes), '[]') from por_mes),
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

revoke execute on function public.reporte_gastos(date, date, text, text, integer, date, date) from public, anon;
grant execute on function public.reporte_gastos(date, date, text, text, integer, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Funciones que preguntaban "si es caja": ahora preguntan al tipo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agregar_mantenimiento(p_unidad_id uuid, p_nombre text, p_cada_km integer, p_cada_meses smallint, p_desde_fecha date, p_desde_km integer, p_otras uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(unidad_id uuid, numero_economico text, resultado text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Tijuana')::date;
  v_nombre text := trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_cada_km integer;
  v_km integer;
  u record;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar los mantenimientos' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_otras, '{}')) > 200 then
    raise exception 'Demasiadas unidades a la vez' using errcode = '23514';
  end if;

  -- La unidad de la ficha: como siempre (el trigger y las reglas de la tabla validan).
  select x.id, x.numero_economico, x.estatus into u from public.unidades x where x.id = p_unidad_id;
  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  if u.estatus in ('baja', 'vendida') then
    raise exception 'La unidad está de baja o vendida: ya no se le programan mantenimientos' using errcode = '23514';
  end if;
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  values (p_unidad_id, v_nombre, p_cada_km, p_cada_meses, p_desde_fecha, p_desde_km);
  unidad_id := u.id; numero_economico := u.numero_economico; resultado := 'agregado';
  return next;

  -- Las otras, en el orden de la lista de unidades.
  for u in
    select x.id, x.numero_economico, x.tipo, x.estatus
    from public.unidades x
    where x.id = any (coalesce(p_otras, '{}')) and x.id <> p_unidad_id
    order by x.orden_tipo, x.numero_orden, x.numero_economico
  loop
    unidad_id := u.id; numero_economico := u.numero_economico;

    if u.estatus in ('baja', 'vendida') then
      resultado := 'retirada'; return next; continue;
    end if;
    if exists (
      select 1 from public.mantenimientos_unidad d
      where d.unidad_id = u.id and d.activo and lower(d.nombre) = lower(v_nombre)
    ) then
      resultado := 'ya_tiene'; return next; continue;
    end if;

    v_cada_km := p_cada_km;
    v_km := null;
    if v_cada_km is not null then
      if not public.tipo_lleva_kilometraje(u.tipo) then
        v_cada_km := null;
      else
        select k.kilometraje into v_km from public.kilometraje_unidades(u.id) k;
        if v_km is null then v_cada_km := null; end if;
      end if;
    end if;

    if v_cada_km is null and p_cada_meses is null then
      resultado := case when not public.tipo_lleva_kilometraje(u.tipo) then 'caja_solo_km' else 'sin_kilometraje' end;
      return next; continue;
    end if;

    insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
    values (u.id, v_nombre, v_cada_km, p_cada_meses, v_hoy, v_km);
    resultado := case when v_cada_km is distinct from p_cada_km then 'solo_meses' else 'agregado' end;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.copiar_mantenimientos(p_origen uuid, p_destino uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tipo text;
  v_km integer;
  v_hoy date := (now() at time zone 'America/Tijuana')::date;
  v_copiados integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede copiar mantenimientos' using errcode = '42501';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'Elige otra unidad para copiar' using errcode = '23514';
  end if;

  select u.tipo into v_tipo from public.unidades u where u.id = p_destino;
  if not found then
    raise exception 'La unidad no existe' using errcode = 'P0002';
  end if;
  select k.kilometraje into v_km from public.kilometraje_unidades(p_destino) k;

  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  select
    p_destino,
    m.nombre,
    case when not public.tipo_lleva_kilometraje(v_tipo) or v_km is null then null else m.cada_km end,
    m.cada_meses,
    v_hoy,
    case when not public.tipo_lleva_kilometraje(v_tipo) or v_km is null then null else v_km end
  from public.mantenimientos_unidad m
  where m.unidad_id = p_origen
    and m.activo
    -- Si no se puede contar por km (caja o sin kilometraje), solo los que tienen meses.
    and (m.cada_meses is not null or (public.tipo_lleva_kilometraje(v_tipo) and v_km is not null))
    and not exists (
      select 1 from public.mantenimientos_unidad d
      where d.unidad_id = p_destino and d.activo and lower(trim(d.nombre)) = lower(trim(m.nombre))
    );

  get diagnostics v_copiados = row_count;
  return v_copiados;
end;
$function$;

CREATE OR REPLACE FUNCTION public.corregir_kilometraje(p_unidad_id uuid, p_kilometraje integer, p_fecha date, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_motivo text := nullif(trim(p_motivo), '');
  v_numero text;
  v_tipo text;
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
  if not public.tipo_lleva_kilometraje(v_tipo) then
    raise exception 'Este tipo de unidad no lleva kilometraje' using errcode = '23514';
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
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_servicio_definitivo(p_historial_id bigint, p_confirmacion text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_datos jsonb;
  v_servicio_id uuid;
  v_numero text;
  v_tipo text;
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
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_unidad(p_unidad_id uuid, p_confirmacion text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_numero text;
  v_tipo text;
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
$function$;

CREATE OR REPLACE FUNCTION public.preparar_mantenimiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tipo text;
begin
  new.nombre = trim(regexp_replace(new.nombre, '\s+', ' ', 'g'));

  if tg_op = 'INSERT' then
    new.id = gen_random_uuid();
    new.created_by = auth.uid();
    new.created_at = now();
    new.updated_at = now();
    new.updated_by = null;
  else
    new.id = old.id;
    new.unidad_id = old.unidad_id;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
    new.updated_by = auth.uid();
  end if;

  select u.tipo into v_tipo from public.unidades u where u.id = new.unidad_id;
  if not public.tipo_lleva_kilometraje(v_tipo) and new.cada_km is not null then
    raise exception 'Este tipo de unidad no lleva kilometraje: programa este mantenimiento por meses' using errcode = '23514';
  end if;
  if new.cada_km is null then
    new.desde_km = null;
  end if;
  if new.desde_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La última vez que se hizo no puede ser una fecha futura' using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.preparar_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_numero text;
  v_tipo text;
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

  -- Cajas, dollys, góndolas…: sin odómetro (tipos_unidad.lleva_kilometraje).
  if not public.tipo_lleva_kilometraje(v_tipo) then
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_entrada_taller(p_unidad_id uuid, p_fecha date, p_falla text, p_kilometraje integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_falla text := nullif(trim(p_falla), '');
  v_numero text;
  v_tipo text;
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

  -- Cajas, dollys, góndolas…: sin odómetro (tipos_unidad.lleva_kilometraje).
  if not public.tipo_lleva_kilometraje(v_tipo) then
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
$function$;

notify pgrst, 'reload schema';
