-- gastos_detalle: ¿el servicio tiene algún PDF? La lista solo adelanta la carga
-- del visor de PDF (pdf.js) cuando hace falta, para no gastar datos del celular
-- en servicios que solo tienen fotos. Columna nueva al final (create or replace
-- view lo permite); listar_gastos() regresa la vista completa, así que la incluye.
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
  ) as tiene_pdf
from public.gastos g
join public.servicios s on s.id = g.servicio_id
left join public.unidades u on u.id = s.unidad_id
left join public.categorias c on c.id = g.categoria_id;
