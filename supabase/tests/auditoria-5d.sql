begin; set local lock_timeout='5s';
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;

-- ========== Pruebas del Lote 1 (después de aplicar la migración en la transacción) ==========
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;
create temp table x (k text primary key, v uuid); grant all on x to authenticated;
create temp table h (k text primary key, v bigint); grant all on h to authenticated;
insert into x values
  ('capt', (select id from public.perfiles where rol='capturista' and activo limit 1)),
  ('admin', (select id from public.perfiles where rol='admin' and activo order by created_at limit 1)),
  ('ger', (select id from public.perfiles where rol='gerente' limit 1)),
  ('u_ok', (select id from public.unidades where estatus <> 'baja' order by numero_orden limit 1)),
  ('c_ok', (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1)),
  ('c_concepto', (select id from public.categorias where activo and not requiere_concepto order by nombre desc limit 1)),
  ('p_ok', (select id from public.proveedores where activo order by nombre limit 1));

-- Proveedor que luego se desactiva y unidades de prueba (como postgres)
insert into public.proveedores (nombre, created_by) values ('[TEST prov 5D]', (select v from x where k='admin'));
insert into x select 'p_inactivo', id from public.proveedores where nombre = '[TEST prov 5D]';
insert into public.unidades (numero_economico, tipo, operacion, created_by) values ('T-9901','trailer','local',(select v from x where k='admin')), ('T-9902','trailer','local',(select v from x where k='admin'));
insert into x select 'u1', id from public.unidades where numero_economico='T-9901';
insert into x select 'u2', id from public.unidades where numero_economico='T-9902';

-- ---------- Capturista ----------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='capt'), 'role','authenticated')::text, true);
set local role authenticated;
do $$
declare s uuid; s2 uuid; v_n int; v_ok boolean;
begin
  -- Servicio propio normal (con proveedor que luego se desactiva)
  s := public.registrar_servicio((select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, (select v from x where k='p_inactivo'), '[TEST 5D]',
         jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k='c_ok'), 'monto', '100.00')));
  insert into x values ('s_capt', s);
  insert into r(caso, ok, detalle) values ('Registro normal', s is not null, '');

  -- A. Gasto directo sin motivo (app.servicio_nuevo nunca fijado en esta conexión)
  begin
    perform set_config('app.servicio_nuevo', '', true);  -- equivalente a conexión reutilizada
    insert into public.gastos (servicio_id, categoria_id, monto) values (s, (select v from x where k='c_ok'), 5);
    insert into r(caso, ok, detalle) values ('A. Gasto por API sin motivo rechazado', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('A. Gasto por API sin motivo rechazado', true, sqlerrm); end;

  -- K. created_at e id del gasto los fija la BD
  perform set_config('app.motivo', 'Prueba fechas', true);
  insert into public.gastos (id, servicio_id, categoria_id, monto, created_at)
  values ('00000000-0000-0000-0000-0000000000aa', s, (select v from x where k='c_ok'), 7, '2001-01-01');
  insert into r(caso, ok, detalle) select 'K. Gasto: id y created_at los fija la BD',
    count(*) filter (where id = '00000000-0000-0000-0000-0000000000aa') = 0 and bool_and(created_at > now() - interval '1 hour'), count(*)::text
    from public.gastos where servicio_id = s and monto = 7;
  perform set_config('app.motivo', '', true);

  -- D. actualizar_servicio con id ajeno
  begin
    perform public.actualizar_servicio(s, (select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, null, 'x',
      '[{"id":"00000000-0000-0000-0000-000000000001","categoria_id":"00000000-0000-0000-0000-000000000000","monto":"1"}]'::jsonb, 'Intento vaciar');
    insert into r(caso, ok, detalle) values ('D. actualizar_servicio con id ajeno rechazado', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('D. actualizar_servicio con id ajeno rechazado', true, sqlerrm); end;
  insert into r(caso, ok, detalle) select 'D. Los gastos siguen ahí', count(*) >= 1, count(*)::text from public.gastos where servicio_id = s;

  -- C. Servicio directo sin gastos (revisión diferida)
  begin
    insert into public.servicios (unidad_id, fecha) values ((select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date)) returning id into s2;
    set constraints all immediate;
    insert into r(caso, ok, detalle) values ('C. Servicio sin gastos rechazado', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('C. Servicio sin gastos rechazado', true, sqlerrm); end;
  set constraints all deferred;

  -- C2. Quitar todos los gastos por API
  begin
    perform set_config('app.motivo', 'Borro todo', true);
    delete from public.gastos where servicio_id = s;
    set constraints all immediate;
    insert into r(caso, ok, detalle) values ('C2. Dejar un servicio sin gastos rechazado', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('C2. Dejar un servicio sin gastos rechazado', true, sqlerrm); end;
  set constraints all deferred;
  perform set_config('app.motivo', '', true);

  -- H. Capturista no usa la base de reportes
  begin
    perform count(*) from public.gastos_para_reporte(((now() at time zone 'America/Tijuana')::date) - 30, ((now() at time zone 'America/Tijuana')::date), null, null);
    insert into r(caso, ok, detalle) values ('H. Capturista sin gastos_para_reporte', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('H. Capturista sin gastos_para_reporte', true, sqlerrm); end;

  -- Edición normal sigue funcionando
  perform public.actualizar_servicio(s, (select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, (select v from x where k='p_inactivo'), '[TEST 5D] ok',
    (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '110.00')) from public.gastos where servicio_id = s), 'Edición normal');
  insert into r(caso, ok, detalle) select 'Edición normal (con id propios)', bool_or(monto = 110), string_agg(monto::text, ',') from public.gastos where servicio_id = s;
end $$;
set constraints all immediate;
set constraints all deferred;
reset role;

-- Ahora se desactiva el proveedor
update public.proveedores set activo = false where id = (select v from x where k='p_inactivo');

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='capt'), 'role','authenticated')::text, true);
set local role authenticated;
do $$
declare s uuid := (select v from x where k='s_capt'); s2 uuid;
begin
  -- E. Proveedor desactivado
  begin
    s2 := public.registrar_servicio((select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, (select v from x where k='p_inactivo'), 'x',
           jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k='c_ok'), 'monto', '1')));
    insert into r(caso, ok, detalle) values ('E. Proveedor desactivado rechazado', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('E. Proveedor desactivado rechazado', true, sqlerrm); end;
  perform public.actualizar_servicio(s, (select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, (select v from x where k='p_inactivo'), '[TEST 5D] ok2',
    (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', monto::text)) from public.gastos where servicio_id = s), 'Edito con su proveedor de siempre');
  insert into r(caso, ok, detalle) values ('E. Editar servicio viejo con ese proveedor sigue', true, '');
exception when others then insert into r(caso, ok, detalle) values ('E. Editar servicio viejo con ese proveedor sigue', false, sqlerrm);
end $$;
reset role;

-- ---------- Admin: B (id de servicio eliminado), F (eliminar_unidad), J (restaurar con concepto) ----------
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='admin'), 'role','authenticated')::text, true);
set local role authenticated;
do $$
declare sa uuid; s uuid;
begin
  sa := public.registrar_servicio((select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST 5D] SA',
          jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k='c_concepto'), 'monto', '50.00')));
  insert into x values ('sa', sa);
  perform public.eliminar_servicio(sa, 'Prueba B y J');
  insert into h select 'h_sa', id from public.historial_cambios where tabla='servicios' and accion='delete' and registro_id = sa order by id desc limit 1;

  -- F. Servicio en T-9901 → eliminar → restaurar → mover a T-9902
  s := public.registrar_servicio((select v from x where k='u1'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST 5D] F',
         jsonb_build_array(jsonb_build_object('categoria_id', (select v from x where k='c_ok'), 'monto', '30.00')));
  insert into x values ('sf', s);
  perform public.eliminar_servicio(s, 'Prueba F');
  s := public.restaurar_servicio((select id from public.historial_cambios where tabla='servicios' and accion='delete' and registro_id = s order by id desc limit 1), 'Prueba F');
  perform public.actualizar_servicio(s, (select v from x where k='u2'), ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST 5D] F movido',
    (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', monto::text)) from public.gastos where servicio_id = s), 'Muevo a T-9902');
end $$;
reset role;

-- B. Capturista intenta crear servicio con el id de SA (eliminado)
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='capt'), 'role','authenticated')::text, true);
set local role authenticated;
do $$ declare v_id uuid; begin
  insert into public.servicios (id, unidad_id, fecha, created_at, updated_by)
  values ((select v from x where k='sa'), (select v from x where k='u_ok'), ((now() at time zone 'America/Tijuana')::date), '2020-01-01', (select v from x where k='admin'))
  returning id into v_id;
  perform set_config('app.servicio_nuevo', v_id::text, true);
  insert into public.gastos (servicio_id, categoria_id, monto) values (v_id, (select v from x where k='c_ok'), 1);
  insert into r(caso, ok, detalle) select 'B. Id y fechas los fija la BD (no reusa el id eliminado)',
    id <> (select v from x where k='sa') and created_at > now() - interval '1 hour' and updated_by is null, '' from public.servicios where id = v_id;
end $$;
reset role;

-- Categoría pasa a "requiere concepto" después del borrado (J)
update public.categorias set requiere_concepto = true where id = (select v from x where k='c_concepto');

select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='admin'), 'role','authenticated')::text, true);
set local role authenticated;
do $$ declare s uuid; v_rutas text[]; begin
  s := public.restaurar_servicio((select v from h where k='h_sa'), 'Prueba restaurar B/J');
  insert into r(caso, ok, detalle) values ('B/J. Admin restaura SA (id libre; categoría ahora pide concepto)', s = (select v from x where k='sa'), '');
exception when others then insert into r(caso, ok, detalle) values ('B/J. Admin restaura SA', false, sqlerrm); end $$;
do $$ declare v_rutas text[]; v_n int; begin
  v_rutas := public.eliminar_unidad((select v from x where k='u1'), 'ELIMINAR REGISTRO');
  select count(*) into v_n from public.historial_cambios where servicio_id = (select v from x where k='sf');
  insert into r(caso, ok, detalle) values ('F. eliminar_unidad no borra historial del servicio movido', v_n > 0, v_n || ' renglones de historial');
  insert into r(caso, ok, detalle) select 'F. Servicio movido sigue vivo', count(*) = 1, '' from public.servicios where id = (select v from x where k='sf');
end $$;
-- I. Periodo anterior explícito vs suma directa
do $$ declare j jsonb; v_dir numeric; begin
  j := public.reporte_gastos(date_trunc('month', ((now() at time zone 'America/Tijuana')::date) - interval '1 month')::date, (date_trunc('month', ((now() at time zone 'America/Tijuana')::date)) - interval '1 day')::date,
        null, null, 10, date_trunc('month', ((now() at time zone 'America/Tijuana')::date) - interval '2 month')::date, (date_trunc('month', ((now() at time zone 'America/Tijuana')::date) - interval '1 month') - interval '1 day')::date);
  select coalesce(sum(g.monto), 0) into v_dir from public.gastos g join public.servicios s on s.id = g.servicio_id
  where s.fecha between date_trunc('month', ((now() at time zone 'America/Tijuana')::date) - interval '2 month')::date and (date_trunc('month', ((now() at time zone 'America/Tijuana')::date) - interval '1 month') - interval '1 day')::date;
  insert into r(caso, ok, detalle) values ('I. Mes pasado vs mes completo anterior', (j ->> 'total_anterior')::numeric = v_dir, (j ->> 'total_anterior') || ' = ' || v_dir || ' (' || (j->>'anterior_desde') || ' a ' || (j->>'anterior_hasta') || ')');
  j := public.reporte_gastos(((now() at time zone 'America/Tijuana')::date) - 29, ((now() at time zone 'America/Tijuana')::date));
  insert into r(caso, ok, detalle) values ('I. Sin periodo anterior: días previos del mismo largo', (j->>'anterior_hasta')::date = ((now() at time zone 'America/Tijuana')::date) - 30, (j->>'anterior_desde') || ' a ' || (j->>'anterior_hasta'));
  begin j := public.reporte_gastos(((now() at time zone 'America/Tijuana')::date) - 29, ((now() at time zone 'America/Tijuana')::date), null, null, 10, ((now() at time zone 'America/Tijuana')::date) - 10, ((now() at time zone 'America/Tijuana')::date));
    insert into r(caso, ok, detalle) values ('I. Periodo anterior que se encima se rechaza', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('I. Periodo anterior que se encima se rechaza', true, sqlerrm); end;
  insert into r(caso, ok, detalle) select 'H. Admin sí usa gastos_para_reporte', count(*) > 0, count(*)::text from public.gastos_para_reporte(((now() at time zone 'America/Tijuana')::date) - 30, ((now() at time zone 'America/Tijuana')::date), null, null);
end $$;
reset role;

-- G. Usuario desactivado
update public.perfiles set activo = false where id = (select v from x where k='capt');
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='capt'), 'role','authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle) select 'G. Desactivado: nombre_usuario vacío', public.nombre_usuario((select v from x where k='admin')) is null, coalesce(public.nombre_usuario((select v from x where k='admin')), 'null');
insert into r(caso, ok, detalle) select 'G. Desactivado: archivo "en uso" (no habilita borrar)', public.archivo_comprobante_en_uso('no/existe.pdf'), '';
reset role;
update public.perfiles set activo = true where id = (select v from x where k='capt');
select set_config('request.jwt.claims', json_build_object('sub', (select v from x where k='ger'), 'role','authenticated')::text, true);
set local role authenticated;
insert into r(caso, ok, detalle) select 'G. Activo: nombre_usuario responde', public.nombre_usuario((select v from x where k='admin')) is not null, '';
insert into r(caso, ok, detalle) select 'G. Activo: archivo inexistente no está en uso', not public.archivo_comprobante_en_uso('no/existe.pdf'), '';
reset role;

-- Revisión final de todo lo diferido: ningún servicio sin gastos
do $$ begin
  set constraints all immediate;
  insert into r(caso, ok, detalle) values ('Revisión diferida al final: todo cuadra', true, '');
exception when others then insert into r(caso, ok, detalle) values ('Revisión diferida al final: todo cuadra', false, sqlerrm); end $$;

select caso, ok, left(detalle, 90) detalle from r order by n;
rollback;
