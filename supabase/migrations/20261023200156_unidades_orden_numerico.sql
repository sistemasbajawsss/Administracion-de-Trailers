-- Orden natural del número económico: T-2, T-10, T-100 (en texto quedaría T-10, T-100, T-2).
-- El formato LETRA-NÚMERO ya lo garantiza el check unidades_numero_economico_formato.
alter table public.unidades
  add column numero_orden integer
  generated always as (split_part(numero_economico, '-', 2)::integer) stored;

create index unidades_tipo_orden_idx on public.unidades (tipo, numero_orden);
