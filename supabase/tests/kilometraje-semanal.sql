-- Sección 5H, Etapa 1: kilometraje semanal (D15).
-- Semana y días de captura, alta de varias, una por semana, solo activas con
-- odómetro, revisión contra lecturas anteriores, kilometraje actual, corregir y
-- quitar (autor el mismo día, admin con motivo), permisos de los tres roles.
-- Corre con la migración 20261112185135_kilometraje_semanal ya aplicada.
-- La captura del capturista depende del día: lunes y martes se guarda; los demás
-- días se rechaza (las dos ramas se revisan según el día en que se corra).
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
  ('ua', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden, numero_economico limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden, numero_economico limit 1 offset 1)),
  ('uc', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden, numero_economico limit 1 offset 2)),
  ('ud', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden, numero_economico limit 1 offset 3)),
  ('sinkm', (select id from public.unidades where estatus = 'activo' and not public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Una unidad que no está activa (se pone en "por llegar" solo en esta transacción).
insert into x values ('inact', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden, numero_economico limit 1 offset 4));
update public.unidades set estatus = 'por_llegar' where id = (select v from x where k = 'inact');

-- Las unidades de prueba empiezan sin lecturas (los [PRUEBA] traen km al azar).
select set_config('app.motivo', 'Prueba de kilometraje semanal', true);
update public.servicios set kilometraje = null, mantenimientos = '{}' where unidad_id in (select v from x where k in ('ua', 'ub', 'uc', 'ud'));
update public.entradas_taller set kilometraje = null where unidad_id in (select v from x where k in ('ua', 'ub', 'uc', 'ud'));
delete from public.correcciones_kilometraje where unidad_id in (select v from x where k in ('ua', 'ub', 'uc', 'ud'));
select set_config('app.motivo', '', true);

-- Lecturas sembradas (como si ya existieran):
--   ua: la semana pasada, 100,000 km (del admin).
--   ub: esta semana, hoy, 50,000 km, del capturista (la puede corregir hoy).
--   uc: hace dos días, 70,000 km, del capturista (ya no la puede corregir).
do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  lunes date := public.inicio_semana((now() at time zone 'America/Tijuana')::date);
begin
  insert into public.lecturas_kilometraje (unidad_id, semana, fecha, kilometraje, created_by, autor_nombre, created_at)
  values ((select v from x where k = 'ua'), public.inicio_semana(hoy - 7), hoy - 7, 100000, (select v from x where k = 'admin'), 'Admin', now() - interval '7 days');
  insert into public.lecturas_kilometraje (unidad_id, semana, fecha, kilometraje, created_by, autor_nombre)
  values ((select v from x where k = 'ub'), lunes, hoy, 50000, (select v from x where k = 'capt'), 'Capt');
  insert into public.lecturas_kilometraje (unidad_id, semana, fecha, kilometraje, created_by, autor_nombre, created_at)
  values ((select v from x where k = 'uc'), public.inicio_semana(hoy - 2), hoy - 2, 70000, (select v from x where k = 'capt'), 'Capt', now() - interval '2 days');
end $$;

-- ---------------------------------------------------------------------------
-- Funciones puras
-- ---------------------------------------------------------------------------
insert into r(caso, ok, detalle) values
  ('Semana: jueves 12/11/2026 empieza el lunes 09/11', public.inicio_semana('2026-11-12') = '2026-11-09', ''),
  ('Semana: el lunes es su propio inicio', public.inicio_semana('2026-11-09') = '2026-11-09', ''),
  ('Semana: el domingo 15/11 es de la semana del 09/11', public.inicio_semana('2026-11-15') = '2026-11-09', ''),
  ('Día de captura: lunes y martes sí', public.es_dia_de_captura_semanal('2026-11-09') and public.es_dia_de_captura_semanal('2026-11-10'), ''),
  ('Día de captura: miércoles y domingo no', not public.es_dia_de_captura_semanal('2026-11-11') and not public.es_dia_de_captura_semanal('2026-11-15'), '');

-- ---------------------------------------------------------------------------
-- Gerente: ve, no escribe
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n integer;
begin
  begin
    perform * from public.registrar_lecturas_kilometraje(jsonb_build_array(jsonb_build_object('unidad_id', (select v from x where k = 'ud'), 'kilometraje', 1000)));
    insert into r(caso, ok, detalle) values ('Gerente no registra lecturas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no registra lecturas', sqlstate = '42501', sqlerrm);
  end;
  begin
    perform public.corregir_lectura_kilometraje((select id from public.lecturas_kilometraje where unidad_id = (select v from x where k = 'ub')), 51000, 'Motivo del gerente');
    insert into r(caso, ok, detalle) values ('Gerente no corrige lecturas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no corrige lecturas', sqlstate = '42501', sqlerrm);
  end;
  begin
    perform public.quitar_lectura_kilometraje((select id from public.lecturas_kilometraje where unidad_id = (select v from x where k = 'ub')), 'Motivo del gerente');
    insert into r(caso, ok, detalle) values ('Gerente no quita lecturas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no quita lecturas', sqlstate = '42501', sqlerrm);
  end;
  select count(*) into n from public.lecturas_kilometraje where unidad_id in (select v from x where k in ('ua', 'ub', 'uc'));
  insert into r(caso, ok, detalle) values ('Gerente ve las lecturas', n = 3, n::text);
  select count(*) into n from public.lecturas_semana();
  insert into r(caso, ok, detalle) values ('Gerente ve la lista de la semana', n > 0, n::text);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Capturista
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ub uuid := (select v from x where k = 'ub');
  uc uuid := (select v from x where k = 'uc');
  ud uuid := (select v from x where k = 'ud');
  v_lectura uuid;
  rr record;
  n integer;
begin
  -- Alta según el día.
  if public.es_dia_de_captura_semanal(hoy) then
    select * into rr from public.registrar_lecturas_kilometraje(jsonb_build_array(jsonb_build_object('unidad_id', ud, 'kilometraje', 30000)));
    insert into r(caso, ok, detalle) values ('Capturista registra lunes o martes', rr.lectura_id is not null and rr.error is null, coalesce(rr.error, ''));
  else
    begin
      perform * from public.registrar_lecturas_kilometraje(jsonb_build_array(jsonb_build_object('unidad_id', ud, 'kilometraje', 30000)));
      insert into r(caso, ok, detalle) values ('Capturista no registra fuera de lunes y martes', false, 'pudo');
    exception when others then
      insert into r(caso, ok, detalle) values ('Capturista no registra fuera de lunes y martes',
        sqlstate = '42501' and sqlerrm like '%lunes y martes%', sqlerrm);
    end;
  end if;

  -- Corregir la suya del mismo día, sin motivo.
  select id into v_lectura from public.lecturas_kilometraje where unidad_id = ub;
  perform public.corregir_lectura_kilometraje(v_lectura, 50500);
  select count(*) into n from public.lecturas_kilometraje where id = v_lectura and kilometraje = 50500;
  insert into r(caso, ok, detalle) values ('Capturista corrige la suya el mismo día sin motivo', n = 1, '');
  select count(*) into n from public.cambios_lecturas_kilometraje
  where lectura_id = v_lectura and accion = 'corregida' and kilometraje_anterior = 50000 and kilometraje_nuevo = 50500;
  insert into r(caso, ok, detalle) values ('La corrección queda registrada', n = 1, n::text);

  -- Mismo kilometraje: no hay cambio.
  begin
    perform public.corregir_lectura_kilometraje(v_lectura, 50500);
    insert into r(caso, ok, detalle) values ('Corregir al mismo kilometraje se rechaza', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Corregir al mismo kilometraje se rechaza', sqlstate = '23514', sqlerrm);
  end;

  -- La de hace dos días: ya no.
  select id into v_lectura from public.lecturas_kilometraje where unidad_id = uc;
  begin
    perform public.corregir_lectura_kilometraje(v_lectura, 70100, 'Error de dedo');
    insert into r(caso, ok, detalle) values ('Capturista no corrige una de otro día', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no corrige una de otro día', sqlstate = '42501', sqlerrm);
  end;

  -- La del admin: no.
  select id into v_lectura from public.lecturas_kilometraje where unidad_id = (select v from x where k = 'ua');
  begin
    perform public.quitar_lectura_kilometraje(v_lectura, 'No es mía');
    insert into r(caso, ok, detalle) values ('Capturista no quita una ajena', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no quita una ajena', sqlstate = '42501', sqlerrm);
  end;

  -- Escribir directo en la tabla: no.
  begin
    insert into public.lecturas_kilometraje (unidad_id, semana, fecha, kilometraje)
    values (ud, public.inicio_semana(hoy), hoy, 1);
    insert into r(caso, ok, detalle) values ('Capturista no escribe directo en la tabla', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no escribe directo en la tabla', sqlstate = '42501', sqlerrm);
  end;
  begin
    update public.lecturas_kilometraje set kilometraje = 1 where unidad_id = ub;
    insert into r(caso, ok, detalle) values ('Capturista no edita directo en la tabla', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no edita directo en la tabla', sqlstate = '42501', sqlerrm);
  end;

  -- Lista de la semana: activas con odómetro, con su lectura.
  select count(*) into n from public.lecturas_semana() where unidad_id = ub and lectura_kilometraje = 50500;
  insert into r(caso, ok, detalle) values ('Lista de la semana trae la lectura de esta semana', n = 1, '');
  select count(*) into n from public.lecturas_semana() where unidad_id in (select v from x where k in ('sinkm', 'inact'));
  insert into r(caso, ok, detalle) values ('Lista de la semana sin unidades sin odómetro ni inactivas', n = 0, n::text);

  -- Quitar la suya del mismo día.
  select id into v_lectura from public.lecturas_kilometraje where unidad_id = ub;
  perform public.quitar_lectura_kilometraje(v_lectura);
  select count(*) into n from public.lecturas_kilometraje where id = v_lectura;
  insert into r(caso, ok, detalle) values ('Capturista quita la suya el mismo día', n = 0, '');
  select count(*) into n from public.cambios_lecturas_kilometraje where lectura_id = v_lectura and accion = 'quitada' and kilometraje_anterior = 50500;
  insert into r(caso, ok, detalle) values ('Quitar queda registrado', n = 1, n::text);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ua uuid := (select v from x where k = 'ua');
  ub uuid := (select v from x where k = 'ub');
  uc uuid := (select v from x where k = 'uc');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  v_lectura uuid;
  rr record;
  n integer;
  ok_n integer;
  err_n integer;
  txt text;
begin
  -- Menor que la semana pasada: no se guarda.
  select * into rr from public.registrar_lecturas_kilometraje(jsonb_build_array(jsonb_build_object('unidad_id', ua, 'kilometraje', 99000)));
  insert into r(caso, ok, detalle) values ('Menor que la lectura anterior: no se guarda',
    rr.lectura_id is null and rr.error like '%no cuadra%' and rr.error like '%100,000%' and rr.error like '%lectura semanal%', coalesce(rr.error, ''));

  -- Varias a la vez: las buenas se guardan, las malas no.
  select count(*) filter (where lectura_id is not null), count(*) filter (where error is not null), string_agg(error, ' | ')
    into ok_n, err_n, txt
  from public.registrar_lecturas_kilometraje(jsonb_build_array(
    jsonb_build_object('unidad_id', ua, 'kilometraje', 101500),
    jsonb_build_object('unidad_id', ub, 'kilometraje', 60000),
    jsonb_build_object('unidad_id', (select v from x where k = 'sinkm'), 'kilometraje', 5000),
    jsonb_build_object('unidad_id', (select v from x where k = 'inact'), 'kilometraje', 5000),
    jsonb_build_object('unidad_id', ua, 'kilometraje', 101600),
    jsonb_build_object('unidad_id', ub, 'kilometraje', -5),
    jsonb_build_object('unidad_id', 'no-es-uuid', 'kilometraje', 5)
  ));
  insert into r(caso, ok, detalle) values ('Varias: 2 se guardan y 5 se rechazan', ok_n = 2 and err_n = 5, ok_n || '/' || err_n || ': ' || coalesce(txt, ''));
  insert into r(caso, ok, detalle) values ('Sin odómetro, inactiva, repetida en la semana y km no válido: con su motivo',
    txt like '%no lleva kilometraje%' and txt like '%no está activa (por llegar)%'
    and txt like '%ya tiene su lectura de esta semana%' and txt like '%Kilometraje no válido%' and txt like '%Lectura no válida%', txt);

  -- Kilometraje actual: sale de la lectura semanal.
  select * into rr from public.kilometraje_unidades(ua);
  insert into r(caso, ok, detalle) values ('El kilometraje actual toma la lectura semanal',
    rr.kilometraje = 101500 and rr.fuente = 'lectura semanal' and rr.fecha = hoy, rr.kilometraje || ' ' || rr.fuente);

  -- Un servicio con fecha posterior a la semana pasada y km menor: rechazado.
  begin
    perform public.registrar_servicio(ua, hoy - 3, 90000, null, 'x', g, false, 'Se olvidó la entrada');
    insert into r(caso, ok, detalle) values ('Servicio menor que una lectura semanal anterior: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Servicio menor que una lectura semanal anterior: rechazado',
      sqlstate = '23514' and sqlerrm like '%lectura semanal%', sqlerrm);
  end;
  -- Y uno mayor que la de hoy con fecha anterior: también.
  begin
    perform public.registrar_servicio(ua, hoy - 3, 105000, null, 'x', g, false, 'Se olvidó la entrada');
    insert into r(caso, ok, detalle) values ('Servicio mayor que una lectura semanal posterior: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Servicio mayor que una lectura semanal posterior: rechazado',
      sqlstate = '23514' and sqlerrm like '%menos que esto%', sqlerrm);
  end;

  -- Corregir la del capturista de hace dos días: con motivo sí, sin motivo no.
  select id into v_lectura from public.lecturas_kilometraje where unidad_id = uc;
  begin
    perform public.corregir_lectura_kilometraje(v_lectura, 70100);
    insert into r(caso, ok, detalle) values ('Admin corrige una ajena solo con motivo', false, 'pudo sin motivo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin corrige una ajena solo con motivo', sqlstate = '23514' and sqlerrm like '%motivo%', sqlerrm);
  end;
  perform public.corregir_lectura_kilometraje(v_lectura, 70100, 'El chofer mandó otra foto');
  select count(*) into n from public.cambios_lecturas_kilometraje
  where lectura_id = v_lectura and motivo = 'El chofer mandó otra foto' and kilometraje_nuevo = 70100;
  insert into r(caso, ok, detalle) values ('Admin corrige una ajena con motivo y queda registrada', n = 1, '');

  -- Su propia de hoy: sin motivo.
  select id into v_lectura from public.lecturas_kilometraje where unidad_id = ua and fecha = hoy;
  perform public.corregir_lectura_kilometraje(v_lectura, 101400);
  insert into r(caso, ok, detalle) values ('Admin corrige la suya del día sin motivo', true, '');

  -- Corregir a menos que la semana pasada: rechazado.
  begin
    perform public.corregir_lectura_kilometraje(v_lectura, 90000);
    insert into r(caso, ok, detalle) values ('Corregir a menos que la lectura anterior: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Corregir a menos que la lectura anterior: rechazado', sqlstate = '23514', sqlerrm);
  end;

  -- Un error de dedo alto bloquea; el admin lo corrige y todo vuelve a cuadrar.
  select id into v_lectura from public.lecturas_kilometraje where unidad_id = ua and semana < public.inicio_semana(hoy);
    begin
      perform public.corregir_lectura_kilometraje(v_lectura, 1000000, 'Prueba de error de dedo');
      insert into r(caso, ok, detalle) values ('Una lectura vieja no puede quedar mayor que una posterior', false, 'pudo');
    exception when others then
      insert into r(caso, ok, detalle) values ('Una lectura vieja no puede quedar mayor que una posterior',
        sqlstate = '23514' and sqlerrm like '%menos que esto%', sqlerrm);
    end;

  -- Quitar una ajena: con motivo.
  begin
    perform public.quitar_lectura_kilometraje(v_lectura);
    insert into r(caso, ok, detalle) values ('Admin quita una de otro día solo con motivo', false, 'pudo sin motivo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin quita una de otro día solo con motivo', sqlstate = '23514', sqlerrm);
  end;
  perform public.quitar_lectura_kilometraje(v_lectura, 'Era de otra unidad');
  select count(*) into n from public.lecturas_kilometraje where id = v_lectura;
  insert into r(caso, ok, detalle) values ('Admin quita una de otro día con motivo', n = 0, '');

  -- Una lectura que ya no existe.
  begin
    perform public.corregir_lectura_kilometraje(v_lectura, 5, 'Ya no existe');
    insert into r(caso, ok, detalle) values ('Corregir una lectura quitada: aviso claro', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Corregir una lectura quitada: aviso claro', sqlstate = 'P0002', sqlerrm);
  end;

  -- Lista vacía o demasiado larga.
  begin
    perform * from public.registrar_lecturas_kilometraje('[]'::jsonb);
    insert into r(caso, ok, detalle) values ('Lista vacía: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Lista vacía: rechazada', sqlstate = '22023', sqlerrm);
  end;
  begin
    perform * from public.registrar_lecturas_kilometraje(
      (select jsonb_agg(jsonb_build_object('unidad_id', ua, 'kilometraje', 1)) from generate_series(1, 201)));
    insert into r(caso, ok, detalle) values ('Más de 200: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Más de 200: rechazada', sqlstate = '22023', sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Anónimo
-- ---------------------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform * from public.lecturas_semana();
    insert into r(caso, ok, detalle) values ('Anónimo no ve la lista de la semana', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Anónimo no ve la lista de la semana', true, sqlerrm);
  end;
  begin
    perform 1 from public.lecturas_kilometraje;
    insert into r(caso, ok, detalle) values ('Anónimo no ve las lecturas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Anónimo no ve las lecturas', true, sqlerrm);
  end;
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
