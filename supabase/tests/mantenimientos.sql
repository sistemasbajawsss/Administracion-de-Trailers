-- Sección 5F, Etapa 3: mantenimientos por unidad (alta, validaciones, cálculo
-- de lo pendiente, copiar de otra unidad, permisos).
-- Corre con la migración 20261109205535_mantenimientos_unidad aplicada.
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

-- Kilometraje conocido: ua sin lecturas de prueba y con una de 100,000 hoy.
select set_config('app.motivo', 'Prueba de mantenimientos', true);
update public.servicios set kilometraje = null where unidad_id in (select v from x where k in ('ua', 'ub'));
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
  m uuid; p record; n integer;
begin
  perform public.registrar_servicio(p_unidad_id => ua, p_fecha => hoy, p_kilometraje => 100000, p_proveedor_id => null,
    p_descripcion => 'Lectura', p_gastos => g, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');

  -- Aceite: cada 15,000 km o 6 meses, hecho hace 2 meses a 90,000 km -> faltan 5,000 km: al corriente.
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  values (ua, '  Cambio   de aceite ', 15000, 6, hoy - 60, 90000) returning id into m;
  insert into x values ('m_aceite', m);
  select * into p from public.mantenimientos_pendientes(ua) where id = m;
  insert into r(caso, ok, detalle) values ('Nombre limpio', p.nombre = 'Cambio de aceite', p.nombre);
  insert into r(caso, ok, detalle) values ('Próximo km y faltan', p.proximo_km = 105000 and p.faltan_km = 5000, p.proximo_km || ' / ' || p.faltan_km);
  insert into r(caso, ok, detalle) values ('Próxima fecha a 6 meses', p.proxima_fecha = ((hoy - 60) + interval '6 months')::date, p.proxima_fecha::text);
  insert into r(caso, ok, detalle) values ('Al corriente', p.estado = 'al_corriente', p.estado);

  -- Por vencer por km (faltan 800).
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, desde_fecha, desde_km)
  values (ua, 'Engrasado', 10000, hoy - 10, 90800) returning id into m;
  select * into p from public.mantenimientos_pendientes(ua) where id = m;
  insert into r(caso, ok, detalle) values ('Por vencer por km', p.estado = 'por_vencer' and p.faltan_km = 800, p.estado || ' ' || p.faltan_km);

  -- Vencido por fecha aunque falten km (lo que pase primero).
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  values (ua, 'Filtro de aire', 50000, 3, hoy - 120, 99000) returning id into m;
  select * into p from public.mantenimientos_pendientes(ua) where id = m;
  insert into r(caso, ok, detalle) values ('Vencido por fecha (lo que pase primero)', p.estado = 'vencido', p.estado || ' ' || p.faltan_dias);

  -- Por vencer por fecha (vence en 10 días).
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha)
  values (ua, 'Revisión de luces', 1, (hoy + 10 - interval '1 month')::date) returning id into m;
  select * into p from public.mantenimientos_pendientes(ua) where id = m;
  insert into r(caso, ok, detalle) values ('Por vencer por fecha', p.estado = 'por_vencer', p.estado || ' ' || p.faltan_dias);

  -- Solo meses: no guarda km de partida.
  select desde_km into n from public.mantenimientos_unidad where id = m;
  insert into r(caso, ok, detalle) values ('Solo por meses no guarda km', n is null, coalesce(n::text, 'null'));

  -- Validaciones.
  begin
    insert into public.mantenimientos_unidad (unidad_id, nombre, desde_fecha) values (ua, 'Sin intervalo', hoy);
    insert into r(caso, ok, detalle) values ('Sin km ni meses: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Sin km ni meses: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, desde_fecha) values (ua, 'Sin desde km', 5000, hoy);
    insert into r(caso, ok, detalle) values ('Por km sin km de partida: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Por km sin km de partida: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, desde_fecha, desde_km) values (caja, 'Caja km', 5000, hoy, 0);
    insert into r(caso, ok, detalle) values ('Caja por km: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Caja por km: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha) values (ua, 'cambio de aceite', 6, hoy);
    insert into r(caso, ok, detalle) values ('Nombre repetido en la unidad: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Nombre repetido en la unidad: rechazado', sqlstate = '23505', sqlerrm);
  end;
  begin
    insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha) values (ua, 'Futuro', 6, hoy + 1);
    insert into r(caso, ok, detalle) values ('Fecha futura: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Fecha futura: rechazada', sqlstate = '23514', sqlerrm);
  end;

  -- Quitar = desactivar; ya no sale en lo pendiente y se puede volver a crear con el mismo nombre.
  update public.mantenimientos_unidad set activo = false where id = (select v from x where k = 'm_aceite');
  select count(*) into n from public.mantenimientos_pendientes(ua) where id = (select v from x where k = 'm_aceite');
  insert into r(caso, ok, detalle) values ('Desactivado no sale en pendientes', n = 0, n::text);
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, cada_meses, desde_fecha, desde_km)
  values (ua, 'Cambio de aceite', 15000, 6, hoy, 100000);
  insert into r(caso, ok, detalle) values ('Mismo nombre después de quitarlo', true, '');

  -- Copiar a ub (sin km): solo pasan los que tienen meses, sin km.
  n := public.copiar_mantenimientos(ua, ub);
  insert into r(caso, ok, detalle) values ('Copiar a unidad sin km: solo los de meses', n = 3, n::text);
  select count(*) into n from public.mantenimientos_unidad where unidad_id = ub and activo and cada_km is not null;
  insert into r(caso, ok, detalle) values ('Copiados sin km', n = 0, n::text);
  n := public.copiar_mantenimientos(ua, ub);
  insert into r(caso, ok, detalle) values ('Copiar otra vez no duplica', n = 0, n::text);

  -- Copiar a caja: solo meses.
  n := public.copiar_mantenimientos(ua, caja);
  insert into r(caso, ok, detalle) values ('Copiar a caja: solo los de meses', n = 3, n::text);

  -- Sin km: estado sin_kilometraje para los de solo km.
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, desde_fecha, desde_km) values (ub, 'Solo km', 5000, hoy, 0);
  select * into p from public.mantenimientos_pendientes(ub) where nombre = 'Solo km';
  insert into r(caso, ok, detalle) values ('Unidad sin km: sin_kilometraje', p.estado = 'sin_kilometraje', p.estado);
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

-- Capturista y gerente: ven, no escriben.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Capturista ve lo pendiente', count(*) >= 4, count(*)::text from public.mantenimientos_pendientes((select v from x where k = 'ua'));
do $$
begin
  insert into public.mantenimientos_unidad (unidad_id, nombre, cada_meses, desde_fecha)
  values ((select v from x where k = 'ua'), 'Capturista', 6, (now() at time zone 'America/Tijuana')::date);
  insert into r(caso, ok, detalle) values ('Capturista no crea', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no crea', true, sqlerrm);
end $$;
do $$
declare n integer;
begin
  update public.mantenimientos_unidad set nombre = 'Hackeo' where unidad_id = (select v from x where k = 'ua');
  get diagnostics n = row_count;
  insert into r(caso, ok, detalle) values ('Capturista no edita', n = 0, n::text);
end $$;
do $$
begin
  perform public.copiar_mantenimientos((select v from x where k = 'ua'), (select v from x where k = 'ub'));
  insert into r(caso, ok, detalle) values ('Capturista no copia', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no copia', sqlstate = '42501', sqlerrm);
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve lo pendiente de todas', count(*) >= 8, count(*)::text from public.mantenimientos_pendientes();
do $$
declare n integer;
begin
  delete from public.mantenimientos_unidad where unidad_id = (select v from x where k = 'ua');
  get diagnostics n = row_count;
  insert into r(caso, ok, detalle) values ('Gerente no borra', n = 0, n::text);
exception when others then
  insert into r(caso, ok, detalle) values ('Gerente no borra', true, sqlerrm);
end $$;
reset role;

set local role anon;
do $$
begin
  perform public.mantenimientos_pendientes();
  insert into r(caso, ok, detalle) values ('Anónimo no ve', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no ve', true, sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
