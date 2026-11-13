-- =============================================================================
-- Sección 5H — Aviso de posible servicio duplicado (pedido del usuario, 2026-11-12)
-- Con tickets aprobados por el admin, el admin y un capturista pueden capturar la
-- misma reparación. Antes de guardar un servicio nuevo, la pantalla pregunta si
-- ya hay servicios de esa unidad el mismo día o en la misma estancia en taller.
-- El capturista no ve los servicios de otros (RLS), así que esta función devuelve
-- solo lo necesario para reconocer el gasto: fecha, descripción, categorías,
-- total, quién y a qué hora. No bloquea nada: la persona decide.
-- =============================================================================

create or replace function public.servicios_parecidos(
  p_unidad_id uuid,
  p_fecha date
)
returns table (
  id uuid,
  fecha date,
  descripcion text,
  categorias text,
  total numeric,
  autor_nombre text,
  created_at timestamptz,
  misma_estancia boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_entrada uuid;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso' using errcode = '42501';
  end if;

  -- Estancia abierta a la que se ligaría el servicio nuevo (misma regla que preparar_servicio).
  select e.id into v_entrada
  from public.entradas_taller e
  where e.unidad_id = p_unidad_id and e.fecha_salida is null and e.fecha_entrada <= p_fecha;

  return query
  select s.id,
         s.fecha,
         s.descripcion,
         (select string_agg(coalesce(nullif(trim(g.concepto), ''), c.nombre), ', ' order by g.created_at)
            from public.gastos g join public.categorias c on c.id = g.categoria_id
           where g.servicio_id = s.id),
         s.total,
         s.autor_nombre,
         s.created_at,
         v_entrada is not null and s.entrada_taller_id = v_entrada
  from public.servicios_resumen s
  where s.unidad_id = p_unidad_id
    and (s.fecha = p_fecha or (v_entrada is not null and s.entrada_taller_id = v_entrada))
  order by s.created_at desc
  limit 5;
end;
$$;

revoke execute on function public.servicios_parecidos(uuid, date) from public, anon;
grant execute on function public.servicios_parecidos(uuid, date) to authenticated;
