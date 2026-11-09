-- Sección 5F, Etapa 1: kilometraje (lecturas por fecha, entrada a taller,
-- correcciones del admin, kilometraje actual, permisos).
-- Corre con la migración 20261109185639_kilometraje ya aplicada.
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and tipo <> 'caja' order by numero_orden limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and tipo <> 'caja' order by numero_orden limit 1 offset 1)),
  ('caja', (select id from public.unidades where estatus = 'activo' and tipo = 'caja' order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Las unidades de prueba empiezan sin lecturas (los [PRUEBA] traen km al azar).
-- Solo dentro de esta transacción (rollback al final).
select set_config('app.motivo', 'Prueba de kilometraje', true);
update public.servicios set kilometraje = null where unidad_id in (select v from x where k in ('ua', 'ub'));
select set_config('app.motivo', '', true);

-- ---------------------------------------------------------------------------
-- Capturista: lecturas por fecha
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ua uuid := (select v from x where k = 'ua');
  ub uuid := (select v from x where k = 'ub');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  s uuid; s8 uuid; e uuid;
  kr record;
begin
  s := public.registrar_servicio(ua, hoy - 10, 100000, null, 'K1', g, false, 'Mantenimiento en patio');
  insert into r(caso, ok, detalle) values ('Primera lectura se guarda', true, '');

  begin
    perform public.registrar_servicio(ua, hoy - 5, 99000, null, 'x', g, false, 'Mantenimiento en patio');
    insert into r(caso, ok, detalle) values ('Menor que la anterior: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Menor que la anterior: rechazado',
      sqlstate = '23514' and sqlerrm like '%100,000%', sqlerrm);
  end;

  perform public.registrar_servicio(ua, hoy - 5, 100500, null, 'K2', g, false, 'Mantenimiento en patio');
  insert into r(caso, ok, detalle) values ('Mayor que la anterior se guarda', true, '');

  begin
    perform public.registrar_servicio(ua, hoy - 8, 101000, null, 'x', g, false, 'Mantenimiento en patio');
    insert into r(caso, ok, detalle) values ('Fecha atrasada mayor que la siguiente: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Fecha atrasada mayor que la siguiente: rechazado',
      sqlstate = '23514' and sqlerrm like '%menos que esto%', sqlerrm);
  end;

  s8 := public.registrar_servicio(ua, hoy - 8, 100200, null, 'K3', g, false, 'Mantenimiento en patio');
  insert into r(caso, ok, detalle) values ('Fecha atrasada entre las dos se guarda', true, '');

  perform public.registrar_servicio(ua, hoy - 5, 100400, null, 'K4', g, false, 'Mantenimiento en patio');
  insert into r(caso, ok, detalle) values ('Mismo día no se compara', true, '');

  select * into kr from public.kilometraje_unidades(ua);
  insert into r(caso, ok, detalle) values ('Actual: la más reciente (empate: la mayor)',
    kr.kilometraje = 100500 and kr.fecha = hoy - 5 and kr.fuente = 'servicio', kr.kilometraje || ' ' || kr.fecha || ' ' || kr.fuente);

  -- Editar el kilometraje de un servicio se valida contra las demás (no contra sí mismo).
  begin
    perform public.actualizar_servicio(s8, ua, hoy - 8, 102000, null, 'K3', g, 'Cambio de kilometraje');
    insert into r(caso, ok, detalle) values ('Editar a un km que no cuadra: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Editar a un km que no cuadra: rechazado', sqlstate = '23514', sqlerrm);
  end;
  perform public.actualizar_servicio(s8, ua, hoy - 8, 100300, null, 'K3', g, 'Cambio de kilometraje');
  insert into r(caso, ok, detalle) values ('Editar a un km que cuadra se guarda', true, '');

  -- Entrada a taller con kilometraje.
  begin
    perform public.registrar_entrada_taller(ua, hoy - 2, 'Frenos', 99999);
    insert into r(caso, ok, detalle) values ('Entrada con km menor: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada con km menor: rechazada', sqlstate = '23514', sqlerrm);
  end;
  e := public.registrar_entrada_taller(ua, hoy - 2, 'Frenos', 101000);
  select * into kr from public.kilometraje_unidades(ua);
  insert into r(caso, ok, detalle) values ('Actual: la entrada a taller',
    kr.kilometraje = 101000 and kr.fuente = 'entrada a taller', kr.kilometraje || ' ' || kr.fuente);
  insert into r(caso, ok, detalle)
  select 'Entrada guarda su km', kilometraje = 101000, coalesce(kilometraje::text, 'null')
  from public.entradas_taller where id = e;

  -- La app publicada llama con 3 argumentos por nombre: sigue igual.
  e := public.registrar_entrada_taller(p_unidad_id => ub, p_fecha => hoy, p_falla => 'Sin km');
  insert into r(caso, ok, detalle)
  select 'Entrada sin km (como la app de antes)', kilometraje is null, coalesce(kilometraje::text, 'null')
  from public.entradas_taller where id = e;

  -- Caja: no guarda km.
  e := public.registrar_entrada_taller((select v from x where k = 'caja'), hoy, 'Caja', 5000);
  insert into r(caso, ok, detalle)
  select 'Caja: la entrada no guarda km', kilometraje is null, coalesce(kilometraje::text, 'null')
  from public.entradas_taller where id = e;

  -- El capturista no corrige, no escribe directo ni llama la validación interna.
  begin
    perform public.corregir_kilometraje(ua, 1, hoy, 'Intento capturista');
    insert into r(caso, ok, detalle) values ('Capturista no corrige', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no corrige', sqlstate = '42501', sqlerrm);
  end;
  begin
    insert into public.correcciones_kilometraje (unidad_id, fecha, kilometraje, motivo) values (ua, hoy, 1, 'Directo');
    insert into r(caso, ok, detalle) values ('Capturista no inserta directo', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no inserta directo', true, sqlerrm);
  end;
  begin
    perform public.validar_kilometraje(ua, hoy, 1);
    insert into r(caso, ok, detalle) values ('Validación interna no se llama desde la API', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Validación interna no se llama desde la API', sqlstate = '42501', sqlerrm);
  end;
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque capturista', false, sqlerrm);
end $$;

insert into r(caso, ok, detalle)
select 'Capturista: actual de todas las unidades', count(*) = (select count(*) from public.unidades), count(*)::text
from public.kilometraje_unidades();
reset role;

-- ---------------------------------------------------------------------------
-- Admin: correcciones
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ua uuid := (select v from x where k = 'ua');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  c uuid;
  kr record;
begin
  begin
    perform public.corregir_kilometraje(ua, 500, hoy - 1, 'abc');
    insert into r(caso, ok, detalle) values ('Corrección sin motivo: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Corrección sin motivo: rechazada', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.corregir_kilometraje((select v from x where k = 'caja'), 500, hoy, 'Caja no lleva');
    insert into r(caso, ok, detalle) values ('Corrección de caja: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Corrección de caja: rechazada', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.corregir_kilometraje(ua, 500, hoy + 1, 'Fecha futura');
    insert into r(caso, ok, detalle) values ('Corrección con fecha futura: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Corrección con fecha futura: rechazada', sqlstate = '23514', sqlerrm);
  end;

  c := public.corregir_kilometraje(ua, 500, hoy - 1, 'Cambio de odómetro');
  insert into r(caso, ok, detalle)
  select 'Corrección guarda lo anterior, autor y motivo',
         kilometraje_anterior = 101000 and created_by = (select v from x where k = 'admin') and motivo = 'Cambio de odómetro',
         coalesce(kilometraje_anterior::text, 'null')
  from public.correcciones_kilometraje where id = c;

  select * into kr from public.kilometraje_unidades(ua);
  insert into r(caso, ok, detalle) values ('Actual: la corrección', kr.kilometraje = 500 and kr.fuente = 'corrección', kr.kilometraje || ' ' || kr.fuente);

  begin
    perform public.registrar_servicio(ua, hoy, 400, null, 'x', g, false);
    insert into r(caso, ok, detalle) values ('Después de corregir, menor que la corrección: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Después de corregir, menor que la corrección: rechazado',
      sqlstate = '23514' and sqlerrm like '%corrección%', sqlerrm);
  end;

  perform public.registrar_servicio(ua, hoy, 600, null, 'K5', g, false);
  insert into r(caso, ok, detalle) values ('Después de corregir, la cuenta sigue desde ahí', true, '');

  select * into kr from public.kilometraje_unidades(ua);
  insert into r(caso, ok, detalle) values ('Actual después de corregir', kr.kilometraje = 600 and kr.fecha = hoy, kr.kilometraje || ' ' || kr.fecha);
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Lectura por rol
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Capturista no ve las correcciones', count(*) = 0, count(*)::text from public.correcciones_kilometraje;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve las correcciones', count(*) >= 1, count(*)::text from public.correcciones_kilometraje;
insert into r(caso, ok, detalle)
select 'Gerente ve el actual', kilometraje = 600, coalesce(kilometraje::text, 'null')
from public.kilometraje_unidades((select v from x where k = 'ua'));
do $$
begin
  perform public.corregir_kilometraje((select v from x where k = 'ua'), 1, (now() at time zone 'America/Tijuana')::date, 'Gerente intenta');
  insert into r(caso, ok, detalle) values ('Gerente no corrige', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Gerente no corrige', sqlstate = '42501', sqlerrm);
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.kilometraje_unidades();
  insert into r(caso, ok, detalle) values ('Anónimo no ve kilometrajes', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no ve kilometrajes', true, sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
