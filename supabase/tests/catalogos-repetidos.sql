-- Sección 5I, Etapa 2: proveedores y talleres repetidos (catalogo_parecidos, unir_catalogo).
begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
set local lock_timeout = '5s';
-- 5H: los tickets pendientes de verdad bloquean la entrada directa; en esta prueba no cuentan (se deshace al final).
update public.tickets_taller set estatus = 'cancelado', cancelado_at = now() where estatus = 'pendiente';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;
create temp table nums (k text primary key, v numeric);
grant all on nums to authenticated, anon;

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('ua', (select id from public.unidades where estatus = 'activo' and not public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1)),
  ('cat', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1)),
  -- Proveedor y taller [PRUEBA] con más servicios, y otro activo de cada uno para recibirlos.
  ('prov_mucho', (select proveedor_id from public.servicios where proveedor_id is not null group by 1 order by count(*) desc limit 1)),
  ('taller_mucho', (select taller_id from public.servicios where taller_id is not null group by 1 order by count(*) desc limit 1));
insert into x values
  ('prov_otro', (select id from public.proveedores where activo and id <> (select v from x where k = 'prov_mucho') order by nombre limit 1)),
  ('taller_otro', (select id from public.talleres where activo and id <> (select v from x where k = 'taller_mucho') order by nombre limit 1));
insert into nums values ('total_antes', (select sum(monto) from public.gastos));

-- Normalizar.
insert into r(caso, ok, detalle)
select 'Normaliza acentos, puntos y razón social', public.normalizar_nombre_catalogo('Refacc. López, S.A. de C.V.') = 'refacc lopez',
       public.normalizar_nombre_catalogo('Refacc. López, S.A. de C.V.');

-- Admin: proveedores de prueba.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.proveedores (nombre, created_by) values ('Refaccionaria López 5I', (select v from x where k = 'admin'));
insert into public.proveedores (nombre, created_by) values ('Refacc. Lopez 5I', (select v from x where k = 'admin'));
insert into public.talleres (nombre, created_by) values ('Taller Hermanos García 5I', (select v from x where k = 'admin'));
insert into public.talleres (nombre, created_by) values ('Tller Hnos Garcia 5I', (select v from x where k = 'admin'));
insert into x values
  ('p_queda', (select id from public.proveedores where nombre = 'Refaccionaria López 5I')),
  ('p_quitar', (select id from public.proveedores where nombre = 'Refacc. Lopez 5I')),
  ('t_queda', (select id from public.talleres where nombre = 'Taller Hermanos García 5I')),
  ('t_quitar', (select id from public.talleres where nombre = 'Tller Hnos Garcia 5I'));
reset role;

-- Capturista: parecidos.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Parecidos: "REFACCIONARIA LOPEZ 5I, S.A. DE C.V." encuentra el mismo', bool_or(id = (select v from x where k = 'p_queda')), string_agg(nombre || ' ' || similitud, ' | ')
from public.catalogo_parecidos('proveedores', 'REFACCIONARIA LOPEZ 5I, S.A. DE C.V.');
insert into r(caso, ok, detalle)
select 'Parecidos: "Refaccionaria Lopes 5I" (error de dedo) los encuentra', count(*) >= 1, string_agg(nombre || ' ' || similitud, ' | ')
from public.catalogo_parecidos('proveedores', 'Refaccionaria Lopes 5I') where nombre like '%5I';
insert into r(caso, ok, detalle)
select 'Parecidos: "Taller Hnos. García 5I" encuentra los dos talleres', count(*) = 2, string_agg(nombre || ' ' || similitud, ' | ')
from public.catalogo_parecidos('talleres', 'Taller Hnos. García 5I') where nombre like '%5I';
insert into r(caso, ok, detalle)
select 'Parecidos: un nombre distinto no trae los de prueba', count(*) = 0, string_agg(nombre || ' ' || similitud, ' | ')
from public.catalogo_parecidos('proveedores', 'Llantera del Norte') where nombre like '%5I';
do $$
begin
  perform public.unir_catalogo('proveedores', (select v from x where k = 'p_quitar'), (select v from x where k = 'p_queda'), 'Prueba capturista');
  insert into r(caso, ok, detalle) values ('Capturista no une', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Capturista no une', sqlstate = '42501', sqlerrm);
end $$;
insert into r(caso, ok, detalle)
select 'Capturista no ve la bitácora', count(*) = 0, count(*)::text from public.uniones_catalogo;
reset role;

-- Gerente: ni parecidos ni unir.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform * from public.catalogo_parecidos('proveedores', 'Refaccionaria');
  insert into r(caso, ok, detalle) values ('Gerente no busca parecidos', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Gerente no busca parecidos', sqlstate = '42501', sqlerrm);
end $$;
do $$
begin
  perform public.unir_catalogo('proveedores', (select v from x where k = 'p_quitar'), (select v from x where k = 'p_queda'), 'Prueba gerente');
  insert into r(caso, ok, detalle) values ('Gerente no une', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Gerente no une', sqlstate = '42501', sqlerrm);
end $$;
reset role;
set local role anon;
do $$
begin
  perform public.unir_catalogo('proveedores', (select v from x where k = 'p_quitar'), (select v from x where k = 'p_queda'), 'Prueba anon');
  insert into r(caso, ok, detalle) values ('Anónimo no une', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Anónimo no une', sqlstate = '42501', sqlerrm);
end $$;
reset role;

-- Capturista: un servicio con el proveedor repetido y el taller repetido.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into x values ('s', public.registrar_servicio(p_unidad_id => (select v from x where k = 'ua'),
    p_fecha => (now() at time zone 'America/Tijuana')::date - 2, p_kilometraje => null,
    p_proveedor_id => (select v from x where k = 'p_quitar'), p_descripcion => 'Prueba 5I unir',
    p_tipo => 'servicio', p_lugar => 'taller_externo', p_taller_id => (select v from x where k = 't_quitar'),
    p_motivo_sin_entrada => 'Reparación en camino',
    p_gastos => jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k = 'cat'), 'monto', '800.00'))));
end $$;
reset role;

-- Admin: errores y uniones.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.unir_catalogo('proveedores', (select v from x where k = 'p_quitar'), (select v from x where k = 'p_quitar'), 'Prueba mismo');
  insert into r(caso, ok, detalle) values ('No une consigo mismo', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('No une consigo mismo', sqlstate = '23514', sqlerrm);
end $$;
do $$
begin
  perform public.unir_catalogo('proveedores', (select v from x where k = 'p_quitar'), (select v from x where k = 'p_queda'), 'no');
  insert into r(caso, ok, detalle) values ('Motivo corto rechazado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Motivo corto rechazado', sqlstate = '23514', sqlerrm);
end $$;
update public.proveedores set activo = false where id = (select v from x where k = 'p_queda');
do $$
begin
  perform public.unir_catalogo('proveedores', (select v from x where k = 'p_quitar'), (select v from x where k = 'p_queda'), 'Prueba queda inactivo');
  insert into r(caso, ok, detalle) values ('No se queda uno desactivado', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('No se queda uno desactivado', sqlstate = '23514', sqlerrm);
end $$;
update public.proveedores set activo = true where id = (select v from x where k = 'p_queda');

do $$
declare
  n integer;
begin
  n := public.unir_catalogo('proveedores', (select v from x where k = 'p_quitar'), (select v from x where k = 'p_queda'), 'Era el mismo negocio');
  insert into r(caso, ok, detalle) values ('Unir proveedores: 1 servicio', n = 1, n::text);
  n := public.unir_catalogo('talleres', (select v from x where k = 't_quitar'), (select v from x where k = 't_queda'), 'Era el mismo taller');
  insert into r(caso, ok, detalle) values ('Unir talleres: 1 servicio', n = 1, n::text);
end $$;
insert into r(caso, ok, detalle)
select 'El servicio quedó con el que se queda', proveedor_id = (select v from x where k = 'p_queda') and taller_id = (select v from x where k = 't_queda'), ''
from public.servicios where id = (select v from x where k = 's');
insert into r(caso, ok, detalle)
select 'El repetido quedó desactivado', not activo, '' from public.proveedores where id = (select v from x where k = 'p_quitar');
insert into r(caso, ok, detalle)
select 'El taller repetido quedó desactivado', not activo, '' from public.talleres where id = (select v from x where k = 't_quitar');
insert into r(caso, ok, detalle)
select 'Historial con el motivo de la unión', count(*) >= 1, string_agg(motivo, ' | ')
from public.historial_cambios where servicio_id = (select v from x where k = 's') and motivo like 'Unión de proveedores%';
insert into r(caso, ok, detalle)
select 'Bitácora: dos uniones, el admin la ve', count(*) = 2, string_agg(quitado_nombre || ' -> ' || queda_nombre, ' | ')
from public.uniones_catalogo;
insert into r(caso, ok, detalle)
select 'Parecidos ya no ofrece el desactivado', not bool_or(id = (select v from x where k = 'p_quitar')), string_agg(nombre, ' | ')
from public.catalogo_parecidos('proveedores', 'Refaccionaria López 5I');

-- Unir el proveedor y el taller con más servicios (datos [PRUEBA]): ningún trigger debe rechazar servicios viejos.
do $$
declare
  antes integer;
  n integer;
begin
  select count(*) into antes from public.servicios where proveedor_id = (select v from x where k = 'prov_mucho');
  n := public.unir_catalogo('proveedores', (select v from x where k = 'prov_mucho'), (select v from x where k = 'prov_otro'), 'Prueba con volumen');
  insert into r(caso, ok, detalle) values ('Volumen: todos los servicios del proveedor pasan', n = antes and n > 0, n || ' de ' || antes);
  select count(*) into antes from public.servicios where taller_id = (select v from x where k = 'taller_mucho');
  n := public.unir_catalogo('talleres', (select v from x where k = 'taller_mucho'), (select v from x where k = 'taller_otro'), 'Prueba con volumen');
  insert into r(caso, ok, detalle) values ('Volumen: todos los servicios del taller pasan', n = antes and n > 0, n || ' de ' || antes);
exception when others then
  insert into r(caso, ok, detalle) values ('Volumen: unir sin errores', false, sqlstate || ' ' || sqlerrm);
end $$;
reset role;

insert into r(caso, ok, detalle)
select 'Total de gastos igual (solo cambió el servicio de prueba)',
       (select sum(monto) from public.gastos) = (select v from nums where k = 'total_antes') + 800,
       (select sum(monto) from public.gastos)::text || ' vs ' || ((select v from nums where k = 'total_antes') + 800)::text;

-- Gerente lee la bitácora.
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle)
select 'Gerente ve la bitácora', count(*) = 4, count(*)::text from public.uniones_catalogo;
do $$
begin
  insert into public.uniones_catalogo (catalogo, quitado_id, quitado_nombre, queda_id, queda_nombre, servicios, motivo, created_by)
  values ('proveedores', gen_random_uuid(), 'x', gen_random_uuid(), 'y', 0, 'directo', gen_random_uuid());
  insert into r(caso, ok, detalle) values ('Nadie escribe directo en la bitácora', false, 'pudo');
exception when others then
  insert into r(caso, ok, detalle) values ('Nadie escribe directo en la bitácora', sqlstate = '42501', sqlerrm);
end $$;
reset role;

select caso, ok, detalle from r order by n;
rollback;
