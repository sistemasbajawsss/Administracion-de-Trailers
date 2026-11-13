-- Tipos de unidad como catálogo: alta de tipos, reglas de la unidad según su
-- tipo (letra, kilometraje, largo, local/foráneo), Dolly y Góndola, permisos.
-- Corre con la migración 20261110011123_tipos_de_unidad_catalogo aplicada.
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1));

-- Lo de antes quedó igual.
insert into r(caso, ok, detalle)
select 'Las unidades conservan su tipo', count(*) = 0, count(*)::text
from public.unidades u left join public.tipos_unidad t on t.clave = u.tipo where t.clave is null;
insert into r(caso, ok, detalle)
select 'Orden del tipo copiado', count(*) = 0, count(*)::text
from public.unidades u join public.tipos_unidad t on t.clave = u.tipo where u.orden_tipo <> t.orden;
insert into r(caso, ok, detalle)
select 'Dolly y Góndola sin kilometraje', count(*) = 2 and bool_and(not lleva_kilometraje), string_agg(prefijo, ',')
from public.tipos_unidad where clave in ('dolly', 'gondola');

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  hoy date := (now() at time zone 'America/Tijuana')::date;
  d uuid; g uuid; n integer; t record; txt text;
  gj jsonb := jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '50.00'));
begin
  -- Dolly foráneo y góndola local.
  insert into public.unidades (numero_economico, tipo, operacion) values ('d-901', 'dolly', 'foraneo') returning id into d;
  insert into public.unidades (numero_economico, tipo, operacion) values ('G-901', 'gondola', 'local') returning id into g;
  insert into x values ('dolly', d), ('gondola', g);
  insert into r(caso, ok, detalle) values ('Alta de dolly y góndola', true, '');

  begin
    insert into public.unidades (numero_economico, tipo, operacion) values ('T-901', 'dolly', 'foraneo');
    insert into r(caso, ok, detalle) values ('Letra que no es del tipo: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Letra que no es del tipo: rechazada', sqlstate = '23514', sqlerrm);
  end;
  begin
    insert into public.unidades (numero_economico, tipo) values ('D-902', 'dolly');
    insert into r(caso, ok, detalle) values ('Sin local/foráneo: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Sin local/foráneo: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    insert into public.unidades (numero_economico, tipo, operacion, longitud_pies) values ('D-903', 'dolly', 'local', 20);
    insert into r(caso, ok, detalle) values ('Largo en un tipo que no lo lleva: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Largo en un tipo que no lo lleva: rechazado', sqlstate = '23514', sqlerrm);
  end;
  begin
    insert into public.unidades (numero_economico, tipo, operacion) values ('X-901', 'nave', 'local');
    insert into r(caso, ok, detalle) values ('Tipo que no existe: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Tipo que no existe: rechazado', sqlstate in ('23514', '23503'), sqlerrm);
  end;
  insert into public.unidades (numero_economico, tipo, operacion, longitud_pies) values ('R-901', 'caja', 'local', 53);
  insert into r(caso, ok, detalle) values ('Caja con largo sigue igual', true, '');
  insert into public.unidades (numero_economico, tipo, operacion) values ('C-901', 'camioneta', 'local') returning id into d;
  select operacion::text into txt from public.unidades where id = d;
  insert into r(caso, ok, detalle) values ('Camioneta queda sin operación', txt is null, coalesce(txt, 'null'));

  -- Sin odómetro: el km del servicio no se guarda; mantenimientos solo por meses.
  perform public.registrar_servicio(p_unidad_id => (select v from x where k = 'dolly'), p_fecha => hoy, p_kilometraje => 5000,
    p_proveedor_id => null, p_descripcion => 'Prueba', p_gastos => gj, p_motivo_sin_entrada => 'Mantenimiento en patio', p_tipo => 'servicio');
  select count(*) into n from public.servicios where unidad_id = (select v from x where k = 'dolly') and kilometraje is not null;
  insert into r(caso, ok, detalle) values ('Dolly: el servicio no guarda km', n = 0, n::text);
  begin
    insert into public.mantenimientos_unidad (unidad_id, nombre, cada_km, desde_fecha, desde_km)
    values ((select v from x where k = 'gondola'), 'Por km', 5000, hoy, 0);
    insert into r(caso, ok, detalle) values ('Góndola: mantenimiento por km rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Góndola: mantenimiento por km rechazado', sqlstate = '23514', sqlerrm);
  end;
  select string_agg(resultado, ',' order by resultado) into txt
  from public.agregar_mantenimiento((select id from public.unidades where tipo = 'trailer' and estatus = 'activo' order by numero_orden limit 1),
    'Prueba tipos', 10000, null, hoy, 0, array[(select v from x where k = 'gondola')]);
  -- Una sola forma (5H): por km no pasa a la góndola (sin odómetro).
  insert into r(caso, ok, detalle) values ('Góndola se salta un mantenimiento por km', txt like '%caja_solo_km%' or txt like '%sin_kilometraje%', txt);
  begin
    perform public.corregir_kilometraje((select v from x where k = 'dolly'), 100, hoy, 'Prueba');
    insert into r(caso, ok, detalle) values ('Dolly: corregir km rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Dolly: corregir km rechazado', sqlstate = '23514', sqlerrm);
  end;

  -- Tipo nuevo: clave y orden automáticos.
  insert into public.tipos_unidad (nombre, prefijo, lleva_kilometraje, lleva_largo, lleva_operacion)
  values ('  Plataforma   cama baja ', 'pb', false, true, true);
  select * into t from public.tipos_unidad where prefijo = 'PB';
  insert into r(caso, ok, detalle) values ('Tipo nuevo: clave, letra y orden', t.clave = 'plataforma_cama_baja' and t.orden = 8 and t.nombre = 'Plataforma cama baja',
    t.clave || ' ' || t.orden || ' ' || t.nombre);
  insert into public.unidades (numero_economico, tipo, operacion, longitud_pies) values ('PB-1', 'plataforma_cama_baja', 'foraneo', 48);
  insert into r(caso, ok, detalle) values ('Unidad del tipo nuevo', true, '');
  begin
    insert into public.tipos_unidad (nombre, prefijo, lleva_kilometraje) values ('Otro', 'T', true);
    insert into r(caso, ok, detalle) values ('Letra repetida: rechazada', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Letra repetida: rechazada', sqlstate = '23505', sqlerrm);
  end;
  begin
    insert into public.tipos_unidad (nombre, prefijo, lleva_kilometraje) values ('dolly', 'DY', true);
    insert into r(caso, ok, detalle) values ('Nombre repetido: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Nombre repetido: rechazado', sqlstate = '23505', sqlerrm);
  end;
  begin
    update public.tipos_unidad set prefijo = 'Z' where clave = 'dolly';
    insert into r(caso, ok, detalle) values ('Cambiar la letra: rechazado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Cambiar la letra: rechazado', sqlstate = '23514', sqlerrm);
  end;
  update public.tipos_unidad set nombre = 'Dolly convertidor' where clave = 'dolly';
  insert into r(caso, ok, detalle) values ('Cambiar el nombre sí se puede', true, '');

  -- Desactivado: no se dan de alta unidades, las que hay siguen.
  update public.tipos_unidad set activo = false where clave = 'plataforma_cama_baja';
  begin
    insert into public.unidades (numero_economico, tipo, operacion) values ('PB-2', 'plataforma_cama_baja', 'local');
    insert into r(caso, ok, detalle) values ('Tipo desactivado: sin altas', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Tipo desactivado: sin altas', sqlstate = '23514', sqlerrm);
  end;
  update public.unidades set notas = 'sigue' where numero_economico = 'PB-1';
  insert into r(caso, ok, detalle) values ('Unidad de un tipo desactivado se edita', true, '');

  -- Reportes con el tipo en texto.
  select count(*) into n from public.gastos_para_reporte(hoy - 1, hoy, 'foraneo', 'dolly');
  insert into r(caso, ok, detalle) values ('Reporte filtra por tipo nuevo', n = 1, n::text);
  select count(*) into n from public.exportar_gastos(hoy - 1, hoy, null, 'dolly');
  insert into r(caso, ok, detalle) values ('Excel con tipo nuevo', n = 1, n::text);
  insert into r(caso, ok, detalle)
  select 'Reporte por tipo incluye dolly', exists (select 1 from jsonb_array_elements(public.reporte_gastos(hoy - 1, hoy) -> 'por_tipo') e where e ->> 'tipo' = 'dolly'), '';
exception when others then
  insert into r(caso, ok, detalle) values ('Bloque admin', false, sqlerrm);
end $$;
reset role;

-- Capturista: ve los tipos, no los crea.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle) select 'Capturista ve los tipos', count(*) >= 7, count(*)::text from public.tipos_unidad;
do $$
begin
  insert into public.tipos_unidad (nombre, prefijo, lleva_kilometraje) values ('Capturista', 'CP', true);
  insert into r(caso, ok, detalle) values ('Capturista no crea tipos', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no crea tipos', true, sqlerrm);
end $$;
reset role;

set local role anon;
do $$
declare n integer;
begin
  select count(*) into n from public.tipos_unidad;
  insert into r(caso, ok, detalle) values ('Anónimo no ve tipos', n = 0, n::text);
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no ve tipos', true, sqlerrm);
end $$;
reset role;

select n, caso, ok, detalle from r order by n;
rollback;
