-- Sección 1: catálogos (unidades, choferes, categorías y proveedores).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.tipo_unidad as enum ('trailer', 'caja', 'camion_rabon', 'pipa', 'camioneta');
create type public.operacion_unidad as enum ('local', 'foraneo');
create type public.estatus_unidad as enum ('activo', 'en_taller', 'por_llegar', 'baja');

-- Prefijo obligatorio del número económico según el tipo (T-17, R-39, F-03, P-02, C-01).
create or replace function public.prefijo_tipo_unidad(tipo public.tipo_unidad)
returns text
language sql
immutable
set search_path = ''
as $$
  select case tipo
    when 'trailer' then 'T'
    when 'caja' then 'R'
    when 'camion_rabon' then 'F'
    when 'pipa' then 'P'
    when 'camioneta' then 'C'
  end
$$;

-- ---------------------------------------------------------------------------
-- Choferes
-- ---------------------------------------------------------------------------
create table public.choferes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  telefono text check (telefono is null or length(trim(telefono)) between 1 and 30),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create unique index choferes_nombre_unico on public.choferes (lower(trim(nombre)));

create trigger choferes_actualizar_updated_at
  before update on public.choferes
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- Unidades
-- ---------------------------------------------------------------------------
create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  numero_economico text not null,
  tipo public.tipo_unidad not null,
  operacion public.operacion_unidad,
  estatus public.estatus_unidad not null default 'activo',
  chofer_id uuid references public.choferes (id) on delete restrict,
  longitud_pies smallint,
  placas text,
  marca text,
  modelo text,
  anio smallint,
  vin text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,

  constraint unidades_numero_economico_formato
    check (numero_economico ~ '^[A-Z]+-[0-9]+$'),
  constraint unidades_prefijo_segun_tipo
    check (split_part(numero_economico, '-', 1) = public.prefijo_tipo_unidad(tipo)),
  -- Las camionetas son su propio grupo: sin operación. El resto la requiere.
  constraint unidades_operacion_segun_tipo
    check ((tipo = 'camioneta') = (operacion is null)),
  constraint unidades_longitud_solo_cajas
    check (longitud_pies is null or (tipo = 'caja' and longitud_pies between 10 and 60)),
  constraint unidades_anio_valido
    check (anio is null or anio between 1950 and 2100),
  constraint unidades_vin_valido
    check (vin is null or vin ~ '^[A-Z0-9]{5,30}$'),
  constraint unidades_textos_cortos
    check (
      (placas is null or length(placas) <= 20)
      and (marca is null or length(marca) <= 60)
      and (modelo is null or length(modelo) <= 60)
      and (notas is null or length(notas) <= 1000)
    )
);

comment on table public.unidades is 'Trailers, cajas, camiones rabones, pipas y camionetas de la flotilla.';

create unique index unidades_numero_economico_unico on public.unidades (numero_economico);
create unique index unidades_vin_unico on public.unidades (vin) where vin is not null;
create index unidades_operacion_tipo_idx on public.unidades (operacion, tipo);
create index unidades_estatus_idx on public.unidades (estatus);
create index unidades_chofer_idx on public.unidades (chofer_id);

-- Normaliza antes de validar: "t-17 " → "T-17", placas y VIN en mayúsculas sin espacios,
-- textos vacíos → null.
create or replace function public.normalizar_unidad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.numero_economico = upper(regexp_replace(new.numero_economico, '\s', '', 'g'));
  new.placas = nullif(upper(regexp_replace(coalesce(new.placas, ''), '\s', '', 'g')), '');
  new.vin = nullif(upper(regexp_replace(coalesce(new.vin, ''), '\s', '', 'g')), '');
  new.marca = nullif(trim(new.marca), '');
  new.modelo = nullif(trim(new.modelo), '');
  new.notas = nullif(trim(new.notas), '');
  return new;
end;
$$;

create trigger unidades_normalizar
  before insert or update on public.unidades
  for each row execute function public.normalizar_unidad();

create trigger unidades_actualizar_updated_at
  before update on public.unidades
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- Categorías de gasto
-- ---------------------------------------------------------------------------
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create unique index categorias_nombre_unico on public.categorias (lower(trim(nombre)));

create trigger categorias_actualizar_updated_at
  before update on public.categorias
  for each row execute function public.actualizar_updated_at();

insert into public.categorias (nombre) values
  ('Motor'),
  ('Transmisión'),
  ('Frenos'),
  ('Suspensión'),
  ('Eléctrico'),
  ('Llantas'),
  ('Carrocería'),
  ('Mantenimiento preventivo'),
  ('Otros');

-- ---------------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  telefono text check (telefono is null or length(trim(telefono)) between 1 and 30),
  notas text check (notas is null or length(notas) <= 1000),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create unique index proveedores_nombre_unico on public.proveedores (lower(trim(nombre)));

create trigger proveedores_actualizar_updated_at
  before update on public.proveedores
  for each row execute function public.actualizar_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- Una sola política por acción (evita políticas permisivas duplicadas).
-- Sin políticas de delete: nada se borra; se da de baja o se desactiva.
-- anon no tiene acceso a ninguna de estas tablas.
-- ---------------------------------------------------------------------------
alter table public.choferes enable row level security;
alter table public.unidades enable row level security;
alter table public.categorias enable row level security;
alter table public.proveedores enable row level security;

revoke all on public.choferes, public.unidades, public.categorias, public.proveedores from anon;

-- Choferes: capturista ve activos; solo admin escribe.
create policy "choferes: leer"
  on public.choferes for select to authenticated
  using (activo or (select public.es_admin()));

create policy "choferes: admin crea"
  on public.choferes for insert to authenticated
  with check ((select public.es_admin()) and created_by = (select auth.uid()));

create policy "choferes: admin actualiza"
  on public.choferes for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- Unidades: capturista ve las que no están en baja; solo admin escribe.
create policy "unidades: leer"
  on public.unidades for select to authenticated
  using (estatus <> 'baja' or (select public.es_admin()));

create policy "unidades: admin crea"
  on public.unidades for insert to authenticated
  with check ((select public.es_admin()) and created_by = (select auth.uid()));

create policy "unidades: admin actualiza"
  on public.unidades for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- Categorías: capturista ve activas; solo admin escribe.
create policy "categorias: leer"
  on public.categorias for select to authenticated
  using (activo or (select public.es_admin()));

create policy "categorias: admin crea"
  on public.categorias for insert to authenticated
  with check ((select public.es_admin()) and created_by = (select auth.uid()));

create policy "categorias: admin actualiza"
  on public.categorias for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- Proveedores: ambos roles crean (alta rápida en la captura); solo admin edita o desactiva.
create policy "proveedores: leer"
  on public.proveedores for select to authenticated
  using (activo or (select public.es_admin()));

create policy "proveedores: crear"
  on public.proveedores for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (activo or (select public.es_admin()))
  );

create policy "proveedores: admin actualiza"
  on public.proveedores for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));
