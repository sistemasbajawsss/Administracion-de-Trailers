-- Amplía el catálogo de categorías de gasto para cubrir trailers, cajas, rabones y pipas.
-- Se renombran categorías existentes (aún no tienen gastos ligados) y se agregan las nuevas.

update public.categorias set nombre = 'Transmisión y embrague' where nombre = 'Transmisión';
update public.categorias set nombre = 'Sistema eléctrico y luces' where nombre = 'Eléctrico';
update public.categorias set nombre = 'Llantas y rines' where nombre = 'Llantas';
update public.categorias set nombre = 'Carrocería y pintura' where nombre = 'Carrocería';
update public.categorias set nombre = 'Mantenimiento preventivo (aceite y filtros)' where nombre = 'Mantenimiento preventivo';
update public.categorias set nombre = 'Otros (especificar)' where nombre = 'Otros';

insert into public.categorias (nombre) values
  ('Diferencial y ejes'),
  ('Dirección'),
  ('Enfriamiento y radiador'),
  ('Aire acondicionado'),
  ('Quinta rueda y patines'),
  ('Caja: piso, puertas y estructura'),
  ('Pipa: tanque, válvulas y bomba'),
  ('Grúa y arrastre');
