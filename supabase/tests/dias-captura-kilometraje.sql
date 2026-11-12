-- Sección 5H, Etapa 2: días de registro del kilometraje semanal (los elige el admin).
-- Corre con la migración 20261112192726_dias_captura_kilometraje ya aplicada.
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
  ('ua', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden, numero_economico limit 1));

-- La unidad empieza sin lecturas de esta semana ni lecturas que estorben.
delete from public.lecturas_kilometraje where unidad_id = (select v from x where k = 'ua');
select set_config('app.motivo', 'Prueba de días de registro', true);
update public.servicios set kilometraje = null, mantenimientos = '{}' where unidad_id = (select v from x where k = 'ua');
update public.entradas_taller set kilometraje = null where unidad_id = (select v from x where k = 'ua');
delete from public.correcciones_kilometraje where unidad_id = (select v from x where k = 'ua');
select set_config('app.motivo', '', true);

-- ---------------------------------------------------------------------------
-- Admin cambia los días
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v smallint[];
begin
  perform public.cambiar_dias_captura_kilometraje('{4,1,4}');
  select dias_captura into v from public.ajustes_kilometraje;
  insert into r(caso, ok, detalle) values ('Admin elige días: sin repetidos y en orden', v = '{1,4}', v::text);

  perform public.cambiar_dias_captura_kilometraje('{5}');
  select dias_captura into v from public.ajustes_kilometraje;
  insert into r(caso, ok, detalle) values ('Admin puede dejar un solo día', v = '{5}', v::text);

  insert into r(caso, ok, detalle) values ('Día de captura sigue lo elegido (viernes sí, lunes no)',
    public.es_dia_de_captura_semanal('2026-11-13') and not public.es_dia_de_captura_semanal('2026-11-09'), '');

  begin
    perform public.cambiar_dias_captura_kilometraje('{1,2,3}');
    insert into r(caso, ok, detalle) values ('Tres días: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Tres días: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.cambiar_dias_captura_kilometraje('{}');
    insert into r(caso, ok, detalle) values ('Ningún día: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Ningún día: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.cambiar_dias_captura_kilometraje('{8}');
    insert into r(caso, ok, detalle) values ('Día que no existe: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Día que no existe: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    update public.ajustes_kilometraje set dias_captura = '{3}';
    insert into r(caso, ok, detalle) values ('Admin no escribe directo en la tabla', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Admin no escribe directo en la tabla', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

-- Hoy SÍ es día de registro: el capturista guarda.
update public.ajustes_kilometraje set dias_captura = array[extract(isodow from (now() at time zone 'America/Tijuana')::date)::smallint];

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  rr record;
begin
  select * into rr from public.registrar_lecturas_kilometraje(
    jsonb_build_array(jsonb_build_object('unidad_id', (select v from x where k = 'ua'), 'kilometraje', 12345)));
  insert into r(caso, ok, detalle) values ('Capturista registra en el día elegido', rr.lectura_id is not null, coalesce(rr.error, ''));

  begin
    perform public.cambiar_dias_captura_kilometraje('{1,2}');
    insert into r(caso, ok, detalle) values ('Capturista no cambia los días', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no cambia los días', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

-- Hoy NO es día de registro: el capturista no guarda.
update public.ajustes_kilometraje set dias_captura = array[(extract(isodow from (now() at time zone 'America/Tijuana')::date)::smallint % 7) + 1];
delete from public.lecturas_kilometraje where unidad_id = (select v from x where k = 'ua');

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform * from public.registrar_lecturas_kilometraje(
      jsonb_build_array(jsonb_build_object('unidad_id', (select v from x where k = 'ua'), 'kilometraje', 12345)));
    insert into r(caso, ok, detalle) values ('Capturista no registra fuera de los días elegidos', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no registra fuera de los días elegidos', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

-- Gerente: lee los días, no los cambia.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n integer;
begin
  select count(*) into n from public.ajustes_kilometraje;
  insert into r(caso, ok, detalle) values ('Gerente ve los días', n = 1, n::text);
  begin
    perform public.cambiar_dias_captura_kilometraje('{1,2}');
    insert into r(caso, ok, detalle) values ('Gerente no cambia los días', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no cambia los días', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.ajustes_kilometraje;
    insert into r(caso, ok, detalle) values ('Anónimo no ve los días', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Anónimo no ve los días', true, sqlerrm);
  end;
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
