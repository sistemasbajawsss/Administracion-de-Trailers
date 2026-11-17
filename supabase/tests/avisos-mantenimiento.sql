-- Sección 5J, Etapa 1: avisos de mantenimiento (tres niveles, aviso general y
-- aviso propio de ciertas unidades, permisos).
-- Corre con las migraciones 20261117193935_avisos_mantenimiento y 20261117203357_quitar_mantenimientos_pendientes aplicadas.
begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('ub', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1 offset 1)),
  ('uc', (select id from public.unidades where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1 offset 2)),
  ('caja', (select id from public.unidades where estatus = 'activo' and not public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Kilometraje conocido: ua y ub sin lecturas de prueba; luego una de 100,000 hoy en ua y en ub.
select set_config('app.motivo', 'Prueba de avisos de mantenimiento', true);
update public.servicios set kilometraje = null, mantenimientos = '{}' where unidad_id in (select v from x where k in ('ua', 'ub'));
update public.mantenimientos_unidad set activo = false where unidad_id in (select v from x where k in ('ua', 'ub', 'caja'));
-- Avisos que ya existan (datos reales): la prueba empieza de cero.
delete from public.avisos_mantenimiento_unidad;
update public.ajustes_mantenimiento set aviso_km = 4000 where id = 1;
select set_config('app.motivo', '', true);

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  ua uuid := (select v from x where k = 'ua');
  ub uuid := (select v from x where k = 'ub');
  caja uuid := (select v from x where k = 'caja');
  g jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '10.00'));
  p record; n integer; t text;
begin
  perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 100000, p_proveedor_id => null,
    p_descripcion => 'Lectura', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');
  perform public.registrar_servicio(p_unidad_id => ub, p_fecha => hoy, p_kilometraje => 100000, p_proveedor_id => null,
    p_descripcion => 'Lectura', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');

  -- Cada 30,000 km; el km de partida decide cuánto falta (km actual 100,000).
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, desde_fecha, desde_km) values
    (ua, 'Falta 5000', 30000, hoy - 30, 75000),
    (ua, 'Falta 4001', 30000, hoy - 30, 74001),
    (ua, 'Falta 4000', 30000, hoy - 30, 74000),
    (ua, 'Falta 3000', 30000, hoy - 30, 73000),
    (ua, 'Falta 1001', 30000, hoy - 30, 71001),
    (ua, 'Falta 1000', 30000, hoy - 30, 71000),
    (ua, 'Se paso 2000', 30000, hoy - 30, 68000),
    (ub, 'Falta 3000', 30000, hoy - 30, 73000),
    (ub, 'Falta 5000', 30000, hoy - 30, 75000);
  -- Por meses (cada 3): vence en 40, 30, 20, 16, 15 días y venció hace 5.
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha) values
    (caja, 'Meses 40', 3, (hoy + 40 - interval '3 months')::date),
    (caja, 'Meses 30', 3, (hoy + 30 - interval '3 months')::date),
    (caja, 'Meses 20', 3, (hoy + 20 - interval '3 months')::date),
    (caja, 'Meses 16', 3, (hoy + 16 - interval '3 months')::date),
    (caja, 'Meses 15', 3, (hoy + 15 - interval '3 months')::date),
    (caja, 'Meses vencido', 3, (hoy - 5 - interval '3 months')::date);

  select string_agg(nombre || '=' || estado, ', ' order by nombre) into t from public.mantenimientos_estado(ua);
  insert into r(caso, ok, detalle) values ('Niveles por km con aviso general de 4,000',
    t = 'Falta 1000=realizar_ahora, Falta 1001=programar, Falta 3000=programar, Falta 4000=programar, Falta 4001=al_corriente, Falta 5000=al_corriente, Se paso 2000=realizar_ahora', t);

  select * into p from public.mantenimientos_estado(ua) where nombre = 'Falta 3000';
  insert into r(caso, ok, detalle) values ('Dice el aviso que usó (general)', p.aviso_km = 4000 and not p.aviso_propio and p.faltan_km = 3000,
    p.aviso_km || ' ' || p.aviso_propio || ' ' || p.faltan_km);

  select string_agg(nombre || '=' || estado, ', ' order by nombre) into t from public.mantenimientos_estado(caja);
  insert into r(caso, ok, detalle) values ('Niveles por meses (30 y 15 días)',
    t = 'Meses 15=realizar_ahora, Meses 16=programar, Meses 20=programar, Meses 30=programar, Meses 40=al_corriente, Meses vencido=realizar_ahora', t);

  -- La función de antes ya no existe (20261117203357).
  select count(*) into n from pg_proc where proname = 'mantenimientos_pendientes' and pronamespace = 'public'::regnamespace;
  insert into r(caso, ok, detalle) values ('mantenimientos_pendientes ya no existe', n = 0, n::text);
  select faltan_dias into n from public.mantenimientos_estado(ua) where nombre = 'Se paso 2000';
  insert into r(caso, ok, detalle) values ('Por km no tiene días', n is null, coalesce(n::text, 'null'));

  -- Aviso propio de 6,000 km para ua.
  n := public.poner_aviso_mantenimiento(array[ua], 6000);
  insert into r(caso, ok, detalle) values ('Poner aviso propio', n = 1, n::text);
  select * into p from public.mantenimientos_estado(ua) where nombre = 'Falta 5000';
  insert into r(caso, ok, detalle) values ('Con aviso propio de 6,000 pasa a programar', p.estado = 'programar' and p.aviso_km = 6000 and p.aviso_propio,
    p.estado || ' ' || p.aviso_km || ' ' || p.aviso_propio);
  select estado into t from public.mantenimientos_estado(ub) where nombre = 'Falta 5000';
  insert into r(caso, ok, detalle) values ('Las demás siguen con el general', t = 'al_corriente', t);
  select estado into t from public.mantenimientos_estado(ua) where nombre = 'Falta 1000';
  insert into r(caso, ok, detalle) values ('1,000 km sigue siendo Realizar ahora con aviso propio', t = 'realizar_ahora', t);

  -- Cambiar el general a 2,000: ub cambia, ua conserva el suyo.
  perform public.cambiar_aviso_mantenimiento(2000);
  select estado into t from public.mantenimientos_estado(ub) where nombre = 'Falta 3000';
  insert into r(caso, ok, detalle) values ('General a 2,000: 3,000 km pasa a al corriente', t = 'al_corriente', t);
  select estado into t from public.mantenimientos_estado(ua) where nombre = 'Falta 5000';
  insert into r(caso, ok, detalle) values ('El aviso propio no cambia con el general', t = 'programar', t);
  select updated_by into p from public.ajustes_mantenimiento where id = 1;
  insert into r(caso, ok, detalle) values ('Guarda quién cambió el general', p.updated_by = (select v from x where k = 'admin'), coalesce(p.updated_by::text, 'null'));

  -- Volver a ponerlo lo actualiza (no duplica).
  n := public.poner_aviso_mantenimiento(array[ua, ua], 7000);
  select count(*) into n from public.avisos_mantenimiento_unidad where unidad_id = ua and aviso_km = 7000;
  insert into r(caso, ok, detalle) values ('Poner otra vez actualiza', n = 1, n::text);

  -- Quitar: vuelve al general.
  n := public.quitar_aviso_mantenimiento(array[ua]);
  select * into p from public.mantenimientos_estado(ua) where nombre = 'Falta 5000';
  insert into r(caso, ok, detalle) values ('Quitar: vuelve al general', n = 1 and p.aviso_km = 2000 and not p.aviso_propio and p.estado = 'al_corriente',
    n || ' ' || p.aviso_km || ' ' || p.estado);

  -- Validaciones.
  begin
    perform public.cambiar_aviso_mantenimiento(1000);
    insert into r(caso, ok, detalle) values ('General de 1,000: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('General de 1,000: rechazado', sqlstate = '23514' and sqlerrm like '%más de 1,000%', sqlerrm);
  end;
  begin
    perform public.cambiar_aviso_mantenimiento(100001);
    insert into r(caso, ok, detalle) values ('General de más de 100,000: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('General de más de 100,000: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.poner_aviso_mantenimiento(array[ua], 900);
    insert into r(caso, ok, detalle) values ('Propio de 900: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Propio de 900: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.poner_aviso_mantenimiento('{}', 5000);
    insert into r(caso, ok, detalle) values ('Sin unidades: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Sin unidades: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform public.poner_aviso_mantenimiento(array[gen_random_uuid()], 5000);
    insert into r(caso, ok, detalle) values ('Unidad que no existe: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Unidad que no existe: rechazada', sqlstate = '23503', sqlerrm);
  end;
  begin
    perform public.poner_aviso_mantenimiento(array[ua, caja], 5000);
    insert into r(caso, ok, detalle) values ('Unidad sin kilometraje: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Unidad sin kilometraje: rechazada', sqlstate = '23514' and sqlerrm like '%no llevan kilometraje%', sqlerrm);
  end;
  select count(*) into n from public.avisos_mantenimiento_unidad where unidad_id = ua;
  insert into r(caso, ok, detalle) values ('Todo o nada: ua no se guardó', n = 0, n::text);
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;

-- Unidad dada de baja: rechazada (se da de baja dentro de la transacción).
reset role;
update public.unidades set estatus = 'baja' where id = (select v from x where k = 'uc');
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.poner_aviso_mantenimiento(array[(select v from x where k = 'uc')], 5000);
  insert into r(caso, ok, detalle) values ('Unidad de baja: rechazada', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Unidad de baja: rechazada', sqlstate = '23514' and sqlerrm like '%baja o vendidas%', sqlerrm);
end $$;
-- Deja un aviso propio para que capturista y gerente lo vean.
select public.poner_aviso_mantenimiento(array[(select v from x where k = 'ua')], 5000);
reset role;

-- Capturista y gerente: ven, no cambian.
do $$
declare quien text;
begin
  foreach quien in array array['capt', 'ger'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = quien), 'role', 'authenticated')::text, true);
    set local role authenticated;
    declare n integer; m integer;
    begin
      select count(*) into n from public.mantenimientos_estado((select v from x where k = 'ua'));
      select count(*) into m from public.avisos_mantenimiento_unidad;
      insert into r(caso, ok, detalle) values (quien || ': ve los niveles y los avisos', n = 7 and m = 1, n || ' / ' || m);
      select aviso_km into n from public.ajustes_mantenimiento;
      insert into r(caso, ok, detalle) values (quien || ': lee el aviso general', n = 2000, coalesce(n::text, 'null'));
      begin
        perform public.cambiar_aviso_mantenimiento(5000);
        insert into r(caso, ok, detalle) values (quien || ': no cambia el general', false, 'pudo');
      exception when others then
        insert into r(caso, ok, detalle) values (quien || ': no cambia el general', sqlstate = '42501', sqlerrm);
      end;
      begin
        perform public.poner_aviso_mantenimiento(array[(select v from x where k = 'ub')], 5000);
        insert into r(caso, ok, detalle) values (quien || ': no pone avisos', false, 'pudo');
      exception when others then
        insert into r(caso, ok, detalle) values (quien || ': no pone avisos', sqlstate = '42501', sqlerrm);
      end;
      begin
        perform public.quitar_aviso_mantenimiento(array[(select v from x where k = 'ua')]);
        insert into r(caso, ok, detalle) values (quien || ': no quita avisos', false, 'pudo');
      exception when others then
        insert into r(caso, ok, detalle) values (quien || ': no quita avisos', sqlstate = '42501', sqlerrm);
      end;
      begin
        insert into public.avisos_mantenimiento_unidad (unidad_id, aviso_km) values ((select v from x where k = 'ub'), 5000);
        insert into r(caso, ok, detalle) values (quien || ': no escribe en la tabla', false, 'pudo');
      exception when others then
        insert into r(caso, ok, detalle) values (quien || ': no escribe en la tabla', sqlstate = '42501', sqlerrm);
      end;
      begin
        update public.ajustes_mantenimiento set aviso_km = 9000;
        insert into r(caso, ok, detalle) values (quien || ': no edita el general directo', false, 'pudo');
      exception when others then
        insert into r(caso, ok, detalle) values (quien || ': no edita el general directo', sqlstate = '42501', sqlerrm);
      end;
    end;
    reset role;
  end loop;
end $$;

-- Anónimo: nada.
set local role anon;
do $$
begin
  perform public.mantenimientos_estado();
  insert into r(caso, ok, detalle) values ('Anónimo no ve los niveles', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no ve los niveles', true, sqlerrm);
end $$;
do $$
begin
  perform 1 from public.ajustes_mantenimiento;
  insert into r(caso, ok, detalle) values ('Anónimo no lee el aviso', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no lee el aviso', true, sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
