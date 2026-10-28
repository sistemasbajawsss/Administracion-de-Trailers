-- =============================================================================
-- Sección 5C — Permisos sobrantes
-- anon (sin sesión) no necesita nada en public: la app siempre trabaja con
-- sesión y RLS. TRUNCATE, REFERENCES y TRIGGER no los usa nadie por la API y
-- TRUNCATE se salta RLS. Los permisos de fábrica se cierran para que lo que se
-- cree después no nazca abierto a anon.
-- =============================================================================

-- Tablas y vistas existentes.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Funciones existentes: quitar el permiso implícito de PUBLIC (que también es
-- de anon). authenticated y service_role conservan sus permisos explícitos; las
-- funciones de trigger siguen cerradas (se ejecutan sin revisar este permiso).
revoke execute on all functions in schema public from public, anon;

-- Secuencias existentes.
revoke all on all sequences in schema public from anon;

-- Lo que se cree después en public (migraciones corren como postgres).
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
-- El EXECUTE de fábrica para PUBLIC solo se quita con el ajuste global (sin
-- "in schema"); authenticated y service_role lo siguen recibiendo por el de public.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
