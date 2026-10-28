-- =============================================================================
-- Sección 5C — Performance Advisor: perfiles tenía dos políticas de lectura
-- permisivas ("cada usuario lee el suyo" y "admin lee todos") y Postgres evalúa
-- las dos en cada consulta. Se unen en una sola con el mismo resultado.
-- =============================================================================

drop policy "perfiles: cada usuario lee el suyo" on public.perfiles;
drop policy "perfiles: admin lee todos" on public.perfiles;

create policy "perfiles: leer"
  on public.perfiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()));
