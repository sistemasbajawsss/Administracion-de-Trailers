-- Sección 5H, Etapa 3: tickets de taller (D16).
-- Crear (admin y gerente), aceptar (crea la entrada con km), rechazar con
-- motivo, cancelar (quien lo levantó o admin), enterado, candados de unidad
-- (en taller, de baja, ticket pendiente), entrada directa bloqueada con ticket
-- pendiente, cancelación sola al dar de baja, permisos de los tres roles.
-- Corre con la migración 20261112221529_tickets_taller ya aplicada (o pegada
-- antes, dentro del mismo begin, para el ensayo).
begin;
set local lock_timeout = '5s';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated, anon; grant all on r_n_seq to authenticated, anon;
create temp table x (k text primary key, v uuid);
grant all on x to authenticated, anon;

-- Unidades activas con odómetro, por orden; una sin odómetro.
create temp table activas as
  select id, row_number() over (order by numero_orden, numero_economico) as pos
  from public.unidades
  where estatus = 'activo' and public.tipo_lleva_kilometraje(tipo)
    and not exists (select 1 from public.tickets_taller t where t.unidad_id = unidades.id and t.estatus = 'pendiente');

insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capt', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('ger', (select id from public.perfiles where rol = 'gerente' and activo limit 1)),
  ('ua', (select id from activas where pos = 1)),
  ('ut', (select id from activas where pos = 2)),
  ('uc', (select id from activas where pos = 3)),
  ('ud', (select id from activas where pos = 4)),
  ('ue', (select id from activas where pos = 5)),
  ('uv', (select id from activas where pos = 6)),
  ('ubaja', (select id from activas where pos = 7)),
  ('sinkm', (select id from public.unidades where estatus = 'activo' and not public.tipo_lleva_kilometraje(tipo) order by numero_orden limit 1));

insert into r(caso, ok, detalle)
select 'Datos de prueba completos', count(*) = 11 and bool_and(v is not null), string_agg(k, ',') filter (where v is null) from x;

-- ue tiene una lectura semanal de 100,000 km la semana pasada (para probar que un km menor deshace el aceptar).
insert into public.lecturas_kilometraje (unidad_id, semana, fecha, kilometraje, created_by, autor_nombre, created_at)
select (select v from x where k = 'ue'),
       public.inicio_semana((now() at time zone 'America/Tijuana')::date - 7),
       (now() at time zone 'America/Tijuana')::date - 7,
       100000, (select v from x where k = 'admin'), 'Admin', now() - interval '7 days'
on conflict (unidad_id, semana) do update set kilometraje = 100000;

-- Contador de avisos al empezar (para ver que sube con cada cambio).
create temp table aviso0 as select version as v_inicio from public.tickets_avisos where id = 1;

-- ubaja: dada de baja (solo en esta transacción).
update public.unidades set estatus = 'baja' where id = (select v from x where k = 'ubaja');

-- ---------------------------------------------------------------------------
-- Admin: mete ut a taller (entrada directa) y levanta un ticket de ud
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_id uuid;
begin
  perform public.registrar_entrada_taller((select v from x where k = 'ut'), (now() at time zone 'America/Tijuana')::date, 'Prueba ticket: ya en taller', 9000000);

  v_id := public.crear_ticket_taller((select v from x where k = 'ud'), 'Prueba ticket: falla del admin', 'normal');
  insert into x values ('t_admin', v_id);
  insert into r(caso, ok, detalle)
  select 'Admin crea ticket', estatus = 'pendiente' and prioridad = 'normal' and created_by = (select v from x where k = 'admin') and creador_nombre is not null, estatus::text
  from public.tickets_taller where id = v_id;

  v_id := public.crear_ticket_taller((select v from x where k = 'sinkm'), 'Prueba ticket: caja', 'baja');
  insert into x values ('t_caja', v_id);
  v_id := public.crear_ticket_taller((select v from x where k = 'ue'), 'Prueba ticket: km menor', 'normal');
  insert into x values ('t_ue', v_id);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Gerente: crea, no acepta ni rechaza, cancela solo los suyos
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'ger'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_id uuid;
begin
  v_id := public.crear_ticket_taller((select v from x where k = 'ua'), '  Prueba ticket: no frena  ', 'urgente');
  insert into x values ('t_ger', v_id);
  insert into r(caso, ok, detalle)
  select 'Gerente crea ticket (falla sin espacios de más)', estatus = 'pendiente' and prioridad = 'urgente' and falla = 'Prueba ticket: no frena', falla
  from public.tickets_taller where id = v_id;

  begin
    perform public.crear_ticket_taller((select v from x where k = 'ua'), 'Otro', 'normal');
    insert into r(caso, ok, detalle) values ('No hay dos pendientes de la misma unidad', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('No hay dos pendientes de la misma unidad', sqlstate = '23505' and sqlerrm like '%ticket pendiente%', sqlerrm);
  end;

  begin
    perform public.crear_ticket_taller((select v from x where k = 'ut'), 'Otro', 'normal');
    insert into r(caso, ok, detalle) values ('No se crea si la unidad ya está en taller', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('No se crea si la unidad ya está en taller', sqlstate = '23505' and sqlerrm like '%ya está en taller%', sqlerrm);
  end;

  begin
    perform public.crear_ticket_taller((select v from x where k = 'ubaja'), 'Otro', 'normal');
    insert into r(caso, ok, detalle) values ('No se crea si la unidad está de baja', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('No se crea si la unidad está de baja', sqlstate = '23514' and sqlerrm like '%dada de baja%', sqlerrm);
  end;

  begin
    perform public.crear_ticket_taller((select v from x where k = 'uc'), '   ', 'normal');
    insert into r(caso, ok, detalle) values ('Falla vacía se rechaza', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Falla vacía se rechaza', sqlstate = '23514', sqlerrm);
  end;

  begin
    perform public.crear_ticket_taller((select v from x where k = 'uc'), repeat('a', 1001), 'normal');
    insert into r(caso, ok, detalle) values ('Falla de más de 1000 se rechaza', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Falla de más de 1000 se rechaza', sqlstate = '23514', sqlerrm);
  end;

  begin
    perform public.aceptar_ticket_taller((select v from x where k = 't_ger'), 9000000);
    insert into r(caso, ok, detalle) values ('Gerente no acepta', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no acepta', sqlstate = '42501', sqlerrm);
  end;

  begin
    perform public.rechazar_ticket_taller((select v from x where k = 't_ger'), 'No se puede ahora');
    insert into r(caso, ok, detalle) values ('Gerente no rechaza', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no rechaza', sqlstate = '42501', sqlerrm);
  end;

  begin
    perform public.cancelar_ticket_taller((select v from x where k = 't_admin'));
    insert into r(caso, ok, detalle) values ('Gerente no cancela el ticket del admin', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente no cancela el ticket del admin', sqlstate = '42501', sqlerrm);
  end;

  begin
    perform public.registrar_entrada_taller((select v from x where k = 'uc'), (now() at time zone 'America/Tijuana')::date, 'x', 9000000);
    insert into r(caso, ok, detalle) values ('Gerente sigue sin dar entradas a taller', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Gerente sigue sin dar entradas a taller', sqlstate = '42501', sqlerrm);
  end;

  v_id := public.crear_ticket_taller((select v from x where k = 'uc'), 'Prueba ticket: se cancela', 'baja');
  perform public.cancelar_ticket_taller(v_id);
  insert into r(caso, ok, detalle)
  select 'Gerente cancela el suyo', estatus = 'cancelado' and cancelado_by = (select v from x where k = 'ger') and cancelado_at is not null, estatus::text
  from public.tickets_taller where id = v_id;

  begin
    perform public.cancelar_ticket_taller(v_id);
    insert into r(caso, ok, detalle) values ('No se cancela dos veces', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('No se cancela dos veces', sqlstate = '23505' and sqlerrm like '%ya se canceló%', sqlerrm);
  end;

  v_id := public.crear_ticket_taller((select v from x where k = 'uc'), 'Prueba ticket: después de cancelar se puede otro', 'normal');
  insert into x values ('t_ger2', v_id);
  insert into r(caso, ok, detalle) values ('Tras cancelar se puede levantar otro de la misma unidad', v_id is not null, '');

  begin
    insert into public.tickets_taller (unidad_id, falla) values ((select v from x where k = 'uv'), 'directo');
    insert into r(caso, ok, detalle) values ('Nadie escribe directo en la tabla', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Nadie escribe directo en la tabla', sqlstate = '42501', sqlerrm);
  end;

  insert into r(caso, ok, detalle)
  select 'Gerente ve todos los tickets', count(*) >= 5, count(*)::text from public.tickets_taller;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Capturista: no crea; entrada directa bloqueada; acepta; rechaza
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'capt'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_entrada uuid;
begin
  insert into r(caso, ok, detalle)
  select 'Capturista ve todos los tickets', count(*) >= 5, count(*)::text from public.tickets_taller;

  begin
    perform public.crear_ticket_taller((select v from x where k = 'uv'), 'x', 'normal');
    insert into r(caso, ok, detalle) values ('Capturista no crea tickets', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no crea tickets', sqlstate = '42501', sqlerrm);
  end;

  begin
    perform public.registrar_entrada_taller((select v from x where k = 'ua'), (now() at time zone 'America/Tijuana')::date, 'Directa', 9000000);
    insert into r(caso, ok, detalle) values ('Entrada directa bloqueada con ticket pendiente', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Entrada directa bloqueada con ticket pendiente', sqlstate = '23505' and sqlerrm like '%acéptalo desde Tickets%', sqlerrm);
  end;

  begin
    perform public.aceptar_ticket_taller((select v from x where k = 't_ger'), null);
    insert into r(caso, ok, detalle) values ('Aceptar pide km si la unidad tiene odómetro', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Aceptar pide km si la unidad tiene odómetro', sqlstate = '23514' and sqlerrm like '%kilometraje%', sqlerrm);
  end;

  begin
    perform public.aceptar_ticket_taller((select v from x where k = 't_ue'), 5);
    insert into r(caso, ok, detalle) values ('Km menor: no acepta', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Km menor: no acepta', sqlstate = '23514', sqlerrm);
  end;
  insert into r(caso, ok, detalle)
  select 'Km menor: el ticket sigue pendiente y la unidad fuera de taller',
         t.estatus = 'pendiente' and t.atendido_at is null and u.estatus = 'activo'
         and not exists (select 1 from public.entradas_taller e where e.unidad_id = t.unidad_id and e.fecha_salida is null),
         t.estatus::text || ' / ' || u.estatus::text
  from public.tickets_taller t join public.unidades u on u.id = t.unidad_id
  where t.id = (select v from x where k = 't_ue');

  v_entrada := public.aceptar_ticket_taller((select v from x where k = 't_ger'), 9000000);
  insert into r(caso, ok, detalle)
  select 'Aceptar: ticket aceptado, ligado a su entrada, con quién y cuándo',
         t.estatus = 'aceptado' and t.entrada_id = v_entrada and t.atendido_by = (select v from x where k = 'capt')
         and t.atendido_nombre is not null and t.atendido_at >= t.created_at,
         t.estatus::text
  from public.tickets_taller t where t.id = (select v from x where k = 't_ger');
  insert into r(caso, ok, detalle)
  select 'Aceptar: entrada de hoy, con la falla del ticket y el km',
         e.fecha_entrada = (now() at time zone 'America/Tijuana')::date and e.falla = 'Prueba ticket: no frena'
         and e.kilometraje = 9000000 and e.fecha_salida is null and e.created_by = (select v from x where k = 'capt'),
         e.falla
  from public.entradas_taller e where e.id = v_entrada;
  insert into r(caso, ok, detalle)
  select 'Aceptar: la unidad queda en taller', estatus = 'en_taller', estatus::text
  from public.unidades where id = (select v from x where k = 'ua');

  begin
    perform public.rechazar_ticket_taller((select v from x where k = 't_admin'), 'no');
    insert into r(caso, ok, detalle) values ('Rechazar exige motivo de 5 letras', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Rechazar exige motivo de 5 letras', sqlstate = '23514', sqlerrm);
  end;

  perform public.rechazar_ticket_taller((select v from x where k = 't_admin'), '  No hay mecánico hoy  ');
  insert into r(caso, ok, detalle)
  select 'Rechazar: guarda motivo, quién y cuándo',
         estatus = 'rechazado' and motivo_rechazo = 'No hay mecánico hoy' and atendido_by = (select v from x where k = 'capt')
         and entrada_id is null and enterado_at is null,
         coalesce(motivo_rechazo, '')
  from public.tickets_taller where id = (select v from x where k = 't_admin');
  insert into r(caso, ok, detalle)
  select 'Rechazar: la unidad no entra a taller', estatus = 'activo', estatus::text
  from public.unidades where id = (select v from x where k = 'ud');

  begin
    perform public.cancelar_ticket_taller((select v from x where k = 't_ger2'));
    insert into r(caso, ok, detalle) values ('Capturista no cancela', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no cancela', sqlstate = '42501', sqlerrm);
  end;

  begin
    perform public.marcar_ticket_enterado((select v from x where k = 't_admin'));
    insert into r(caso, ok, detalle) values ('Solo quien lo levantó marca Enterado', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Solo quien lo levantó marca Enterado', sqlstate = '42501', sqlerrm);
  end;

  begin
    update public.tickets_taller set estatus = 'cancelado' where id = (select v from x where k = 't_ger2');
    insert into r(caso, ok, detalle)
    select 'Capturista no cambia tickets directo', estatus = 'pendiente', estatus::text
    from public.tickets_taller where id = (select v from x where k = 't_ger2');
  exception when others then
    insert into r(caso, ok, detalle) values ('Capturista no cambia tickets directo', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Admin: no acepta lo ya aceptado; enterado; acepta caja sin km; cancela el del gerente
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = 'admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_entrada uuid;
begin
  begin
    perform public.aceptar_ticket_taller((select v from x where k = 't_ger'), 9000001);
    insert into r(caso, ok, detalle) values ('El segundo en aceptar ve quién ya lo aceptó', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('El segundo en aceptar ve quién ya lo aceptó', sqlstate = '23505' and sqlerrm like 'Este ticket ya lo aceptó %', sqlerrm);
  end;

  begin
    perform public.rechazar_ticket_taller((select v from x where k = 't_admin'), 'Otra vez rechazado');
    insert into r(caso, ok, detalle) values ('No se rechaza dos veces', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('No se rechaza dos veces', sqlstate = '23505' and sqlerrm like '%ya lo rechazó%', sqlerrm);
  end;

  perform public.marcar_ticket_enterado((select v from x where k = 't_admin'));
  perform public.marcar_ticket_enterado((select v from x where k = 't_admin'));
  insert into r(caso, ok, detalle)
  select 'Enterado (dos veces no falla)', enterado_at is not null, ''
  from public.tickets_taller where id = (select v from x where k = 't_admin');

  begin
    perform public.marcar_ticket_enterado((select v from x where k = 't_caja'));
    insert into r(caso, ok, detalle) values ('Enterado solo en rechazados', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Enterado solo en rechazados', sqlstate = '23514', sqlerrm);
  end;

  v_entrada := public.aceptar_ticket_taller((select v from x where k = 't_caja'), 12345);
  insert into r(caso, ok, detalle)
  select 'Admin acepta; sin odómetro la entrada no guarda km', e.kilometraje is null and t.estatus = 'aceptado' and t.atendido_by = (select v from x where k = 'admin'), coalesce(e.kilometraje::text, 'sin km')
  from public.entradas_taller e join public.tickets_taller t on t.entrada_id = e.id
  where e.id = v_entrada;

  perform public.cancelar_ticket_taller((select v from x where k = 't_ger2'));
  insert into r(caso, ok, detalle)
  select 'Admin cancela el ticket del gerente', estatus = 'cancelado' and cancelado_by = (select v from x where k = 'admin'), estatus::text
  from public.tickets_taller where id = (select v from x where k = 't_ger2');

  insert into x values ('t_uv', public.crear_ticket_taller((select v from x where k = 'uv'), 'Prueba ticket: se da de baja', 'normal'));
end $$;
reset role;

-- Dar de baja la unidad cancela su ticket pendiente.
update public.unidades set estatus = 'baja' where id = (select v from x where k = 'uv');
insert into r(caso, ok, detalle)
select 'Dar de baja cancela su ticket pendiente', estatus = 'cancelado' and motivo_cancelacion = 'La unidad se dio de baja', coalesce(motivo_cancelacion, estatus::text)
from public.tickets_taller where id = (select v from x where k = 't_uv');

-- Anónimo: no llama a las funciones ni lee.
set local role anon;
do $$
begin
  begin
    perform public.crear_ticket_taller((select v from x where k = 'uc'), 'x', 'normal');
    insert into r(caso, ok, detalle) values ('Anónimo no crea', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Anónimo no crea', sqlstate = '42501', sqlerrm);
  end;
  begin
    perform 1 from public.tickets_taller;
    insert into r(caso, ok, detalle) values ('Anónimo no lee', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Anónimo no lee', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

-- Aviso al momento (20261112225715): el contador sin datos sube con cada cambio.
insert into r(caso, ok, detalle)
select 'Cada cambio sube el contador de avisos', version >= (select v_inicio from aviso0) + 10 and tipo = 'update' and prioridad = 'normal',
       (version - (select v_inicio from aviso0))::text || ' cambios'
from public.tickets_avisos where id = 1;
insert into r(caso, ok, detalle)
select 'Realtime escucha el contador, no los tickets',
       exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tickets_avisos')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tickets_taller'), '';
set local role anon;
do $$
begin
  begin
    perform 1 from public.tickets_avisos;
    insert into r(caso, ok, detalle) values ('Anónimo lee el contador (sin datos de tickets)', true, '');
  exception when others then
    insert into r(caso, ok, detalle) values ('Anónimo lee el contador (sin datos de tickets)', false, sqlerrm);
  end;
  begin
    update public.tickets_avisos set version = 0;
    insert into r(caso, ok, detalle) values ('Nadie cambia el contador directo', false, 'pudo');
  exception when others then
    insert into r(caso, ok, detalle) values ('Nadie cambia el contador directo', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

select caso, ok, detalle from r order by n;
rollback;
