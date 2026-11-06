-- =============================================================================
-- Corrección (2026-11-06): la llave foránea entradas_taller.servicio_salida_id →
-- servicios creó una segunda relación entre las dos tablas, y la API ya no sabía
-- cuál usar al anidar una en la otra (detalle del servicio y ficha de la unidad
-- daban error, también en la app publicada). Se quita solo la llave: el dato se
-- queda igual. Si el servicio se elimina, el id queda sin servicio (la pantalla
-- no lo encuentra y no marca nada); si se restaura, vuelve con el mismo id.
-- =============================================================================
alter table public.entradas_taller drop constraint entradas_taller_servicio_salida_id_fkey;

notify pgrst, 'reload schema';