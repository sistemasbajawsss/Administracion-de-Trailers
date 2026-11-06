-- Sección 5E, Etapa 1 — Entradas a taller: permisos, candados y estatus.
-- Corre con la migración 20261106201328_entradas_taller ya aplicada.
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('u', (select id from public.unidades where estatus = 'activo' order by numero_orden limit 1)),
  ('u2', (select id from public.unidades where estatus = 'activo' order by numero_orden limit 1 offset 1));

-- Unidad de baja y unidad temporal (como postgres, antes de impersonar).
with b as (
  update public.unidades set estatus = 'baja'
  where id = (select id from public.unidades where estatus = 'activo' order by numero_orden desc limit 1)
  returning id
)
insert into x select 'baja', id from b;
insert into public.unidades (numero_economico, tipo, operacion) values ('T-99999', 'trailer', 'local');
insert into x values ('temp', (select id from public.unidades where numero_economico = 'T-99999'));

-- Entradas abiertas antes de la prueba (dependen de los datos reales del momento).
create temp table abiertas_antes as select count(*) as n from public.entradas_taller where fecha_salida is null;
grant select on abiertas_antes to authenticated;

-- Migración: lo que ya estaba en taller tiene su entrada abierta.
insert into r(caso, ok, detalle)
select 'Migración: cada unidad en taller tiene entrada abierta',
       (select count(*) from public.unidades where estatus = 'en_taller')
       = (select count(*) from public.entradas_taller where fecha_salida is null),
       (select count(*) from public.entradas_taller where fecha_salida is null)::text || ' abiertas';

-- ---------------------------------------------------------------------------
-- Capturista
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  v_u uuid := (select v from x where k = 'u');
  v_entrada uuid;
begin
  v_entrada := public.registrar_entrada_taller(v_u, hoy - 3, '  No frena bien  ');
  insert into r(caso, ok, detalle)
  select 'Capturista registra entrada: unidad queda en taller', u.estatus = 'en_taller', u.estatus::text
  from public.unidades u where u.id = v_u;
  insert into r(caso, ok, detalle)
  select 'Entrada guarda falla limpia, fecha, autor y nombre',
         e.falla = 'No frena bien' and e.fecha_entrada = hoy - 3 and e.created_by = (select v from x where k = 'capt') and e.reporta_nombre is not null,
         e.falla || ' / ' || coalesce(e.reporta_nombre, '(sin nombre)')
  from public.entradas_taller e where e.id = v_entrada;
  insert into x values ('entrada', v_entrada);

  begin
    perform public.registrar_entrada_taller(v_u, hoy, 'Otra');
    insert into r(caso, ok, detalle) values ('Segunda entrada a la misma unidad rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Segunda entrada a la misma unidad rechazada', sqlstate = '23505', sqlerrm);
  end;

  begin
    perform public.registrar_entrada_taller((select v from x where k = 'u2'), hoy + 1, 'Futura');
    insert into r(caso, ok, detalle) values ('Entrada con fecha futura rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada con fecha futura rechazada', true, sqlerrm);
  end;

  begin
    perform public.registrar_entrada_taller((select v from x where k = 'u2'), hoy, '   ');
    insert into r(caso, ok, detalle) values ('Entrada sin falla rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada sin falla rechazada', true, sqlerrm);
  end;

  begin
    perform public.registrar_entrada_taller((select v from x where k = 'baja'), hoy, 'Falla');
    insert into r(caso, ok, detalle) values ('Entrada a unidad de baja rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada a unidad de baja rechazada', true, sqlerrm);
  end;

  begin
    insert into public.entradas_taller (unidad_id, fecha_entrada, falla) values ((select v from x where k = 'u2'), hoy, 'Directo');
    insert into r(caso, ok, detalle) values ('Capturista no inserta directo en la tabla', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no inserta directo en la tabla', true, sqlerrm);
  end;

  begin
    update public.entradas_taller set falla = 'cambiada' where id = v_entrada;
    insert into r(caso, ok, detalle) values ('Capturista no edita directo la tabla', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no edita directo la tabla', true, sqlerrm);
  end;

  begin
    perform public.dar_salida_taller(v_entrada, hoy - 4, null);
    insert into r(caso, ok, detalle) values ('Salida antes de la entrada rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Salida antes de la entrada rechazada', true, sqlerrm);
  end;

  begin
    perform public.dar_salida_taller(v_entrada, hoy + 1, null);
    insert into r(caso, ok, detalle) values ('Salida con fecha futura rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Salida con fecha futura rechazada', true, sqlerrm);
  end;

  insert into r(caso, ok, detalle)
  select 'Capturista ve las entradas abiertas (todas, también las de otros)', count(*) = (select n from abiertas_antes) + 1, count(*)::text
  from public.entradas_taller where fecha_salida is null;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Admin: el estatus no se cambia a mano
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_u uuid := (select v from x where k = 'u');
begin
  begin
    update public.unidades set estatus = 'activo' where id = v_u;
    insert into r(caso, ok, detalle) values ('Admin no saca a mano una unidad con entrada abierta', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no saca a mano una unidad con entrada abierta', true, sqlerrm);
  end;

  begin
    update public.unidades set estatus = 'baja' where id = v_u;
    insert into r(caso, ok, detalle) values ('Admin no da de baja una unidad en taller', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no da de baja una unidad en taller', true, sqlerrm);
  end;

  begin
    update public.unidades set estatus = 'en_taller' where id = (select v from x where k = 'u2');
    insert into r(caso, ok, detalle) values ('Admin no pone En taller a mano', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no pone En taller a mano', true, sqlerrm);
  end;

  begin
    insert into public.unidades (numero_economico, tipo, operacion, estatus) values ('T-99998', 'trailer', 'local', 'en_taller');
    insert into r(caso, ok, detalle) values ('Admin no crea una unidad En taller', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no crea una unidad En taller', true, sqlerrm);
  end;

  begin
    -- Editar otros datos de una unidad en taller (la app manda el mismo estatus).
    update public.unidades set notas = 'Prueba 5E', estatus = 'en_taller' where id = v_u;
    insert into r(caso, ok, detalle) values ('Admin edita otros datos de una unidad en taller', true, '');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin edita otros datos de una unidad en taller', false, sqlerrm);
  end;

  begin
    update public.unidades set estatus = 'por_llegar' where id = (select v from x where k = 'u2');
    update public.unidades set estatus = 'activo' where id = (select v from x where k = 'u2');
    insert into r(caso, ok, detalle) values ('Admin sigue cambiando Activo / Por llegar a mano', true, '');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin sigue cambiando Activo / Por llegar a mano', false, sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Gerente: ve, no escribe
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  begin
    perform public.registrar_entrada_taller((select v from x where k = 'u2'), (now() at time zone 'America/Tijuana')::date, 'Falla');
    insert into r(caso, ok, detalle) values ('Gerente no registra entradas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no registra entradas', sqlstate = '42501', sqlerrm);
  end;

  begin
    perform public.dar_salida_taller((select v from x where k = 'entrada'), (now() at time zone 'America/Tijuana')::date, null);
    insert into r(caso, ok, detalle) values ('Gerente no da salida', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no da salida', sqlstate = '42501', sqlerrm);
  end;

  insert into r(caso, ok, detalle)
  select 'Gerente ve las entradas', count(*) >= 2, count(*)::text from public.entradas_taller;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Salida (capturista) y lo que se ve después
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  v_entrada uuid := (select v from x where k = 'entrada');
begin
  perform public.dar_salida_taller(v_entrada, hoy, '  Quedó lista  ');
  insert into r(caso, ok, detalle)
  select 'Salida: unidad regresa a Activo', u.estatus = 'activo', u.estatus::text
  from public.unidades u where u.id = (select v from x where k = 'u');

  begin
    perform public.dar_salida_taller(v_entrada, hoy, null);
    insert into r(caso, ok, detalle) values ('Segunda salida rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Segunda salida rechazada', true, sqlerrm);
  end;

  insert into r(caso, ok, detalle)
  select 'Capturista ya no ve la estancia cerrada', count(*) = 0, count(*)::text
  from public.entradas_taller where id = v_entrada;
end $$;
reset role;

insert into r(caso, ok, detalle)
select 'Salida guarda fecha, nota limpia, autor y nombre',
       e.fecha_salida = (now() at time zone 'America/Tijuana')::date and e.nota_salida = 'Quedó lista'
       and e.salida_by = (select v from x where k = 'capt') and e.salida_nombre is not null,
       coalesce(e.nota_salida, '(sin nota)')
from public.entradas_taller e where e.id = (select v from x where k = 'entrada');

-- Admin ve la estancia cerrada.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Admin ve la estancia cerrada', count(*) = 1, count(*)::text
from public.entradas_taller where id = (select v from x where k = 'entrada');

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
begin
  -- Eliminar por completo una unidad con entrada abierta borra sus estancias.
  perform public.registrar_entrada_taller((select v from x where k = 'temp'), hoy, 'Temporal');
  perform public.eliminar_unidad((select v from x where k = 'temp'), 'ELIMINAR REGISTRO');
  insert into r(caso, ok, detalle) values ('Eliminar unidad por completo con entrada abierta', true, '');
exception when others then
  insert into r(caso, ok, detalle) values ('Eliminar unidad por completo con entrada abierta', false, sqlerrm);
end $$;
reset role;

insert into r(caso, ok, detalle)
select 'Sus estancias se borraron con ella', count(*) = 0, count(*)::text
from public.entradas_taller where unidad_id = (select v from x where k = 'temp');

-- ---------------------------------------------------------------------------
-- Usuario desactivado y anon
-- ---------------------------------------------------------------------------
update public.perfiles set activo = false where id = (select v from x where k = 'capt');
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into r(caso, ok, detalle)
  select 'Capturista desactivado no ve entradas', count(*) = 0, count(*)::text from public.entradas_taller;
  begin
    perform public.registrar_entrada_taller((select v from x where k = 'u2'), (now() at time zone 'America/Tijuana')::date, 'Falla');
    insert into r(caso, ok, detalle) values ('Capturista desactivado no registra', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista desactivado no registra', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform count(*) from public.entradas_taller;
    insert into r(caso, ok, detalle) values ('anon no lee entradas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('anon no lee entradas', true, sqlerrm);
  end;
  begin
    perform public.registrar_entrada_taller(gen_random_uuid(), current_date, 'x');
    insert into r(caso, ok, detalle) values ('anon no registra entradas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('anon no registra entradas', true, sqlerrm);
  end;
end $$;
reset role;

select caso, ok, left(detalle, 90) detalle from r order by n;
rollback;
