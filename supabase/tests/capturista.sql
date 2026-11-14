begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
create temp table r (n serial, grupo text, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;

-- ---------- Preparación (como postgres) ----------
create temp table ids as select
  (select id from public.perfiles where rol='capturista' and activo limit 1) a_id,
  (select id from public.perfiles where rol='admin' and activo order by created_at limit 1) admin_id,
  gen_random_uuid() b_id;
grant select on ids to authenticated;

-- Capturista B temporal (el trigger crea su perfil como capturista)
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, instance_id)
select b_id, 'prueba-b-' || left(b_id::text, 8) || '@ejemplo.test', 'authenticated', 'authenticated',
       '{"rol":"capturista"}', '{"nombre":"Capturista B prueba"}', '00000000-0000-0000-0000-000000000000'
from ids;

create temp table ref as select
  (select id from public.servicios where created_by = (select a_id from ids) order by fecha desc limit 1) s_a,
  (select id from public.servicios where created_by = (select admin_id from ids) order by fecha desc limit 1) s_admin,
  (select count(*) from public.servicios where created_by = (select a_id from ids)) n_serv_a,
  (select count(*) from public.gastos g join public.servicios s on s.id = g.servicio_id where s.created_by = (select a_id from ids)) n_gastos_a,
  (select count(*) from public.comprobantes c join public.servicios s on s.id = c.servicio_id where s.created_by = (select a_id from ids)) n_comp_a,
  (select count(*) from public.historial_cambios where dueno_id = (select a_id from ids)) n_hist_a,
  (select id from public.unidades order by numero_orden desc limit 1) u_baja,
  (select id from public.unidades order by numero_orden limit 1) u_ok,
  (select id from public.categorias where activo and not requiere_concepto order by nombre limit 1) c_ok,
  (select id from public.categorias where activo and not requiere_concepto order by nombre desc limit 1) c_inactiva,
  (select c.hash_sha256 from public.comprobantes c join public.servicios s on s.id = c.servicio_id where s.created_by = (select admin_id from ids) limit 1) hash_admin;
grant select on ref to authenticated;

-- Una unidad dada de baja y una categoría desactivada (solo dentro de la prueba)
update public.unidades set estatus = 'baja' where id = (select u_baja from ref);
update public.categorias set activo = false where id = (select c_inactiva from ref);

-- ---------- Como capturista A ----------
select set_config('request.jwt.claims', json_build_object('sub', (select a_id from ids), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare x record; v_s uuid; v_n int; v_g uuid;
begin
  select * into x from ref;

  -- Lectura
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Solo sus servicios', count(*) = x.n_serv_a and bool_and(created_by = (select a_id from ids)), count(*) || ' de ' || x.n_serv_a from public.servicios;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'No ve servicios del admin', count(*) = 0, count(*)::text from public.servicios where id = x.s_admin;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Solo sus gastos', count(*) = x.n_gastos_a, count(*) || ' de ' || x.n_gastos_a from public.gastos;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Solo sus comprobantes', count(*) = x.n_comp_a, count(*) || ' de ' || x.n_comp_a from public.comprobantes;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Solo su historial', count(*) = x.n_hist_a, count(*) || ' de ' || x.n_hist_a from public.historial_cambios;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Lista de gastos: solo suyos', r2.num_gastos = x.n_gastos_a, r2.num_gastos::text from public.resumen_gastos() r2;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Inicio: pendientes solo suyos', bool_and(created_by = (select a_id from ids)), count(*)::text from public.servicios_resumen where num_comprobantes = 0;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'No ve unidad dada de baja', count(*) = 0, '' from public.unidades where id = x.u_baja;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Ve unidades activas', count(*) > 0, count(*)::text from public.unidades;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'No ve categoría desactivada', count(*) = 0, '' from public.categorias where id = x.c_inactiva;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Solo su perfil', count(*) = 1, count(*)::text from public.perfiles;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Bitácora de eliminaciones: nada', count(*) = 0, count(*)::text from public.bitacora_eliminaciones;
  insert into r(grupo, caso, ok, detalle) select 'Ver', 'Storage: no ve archivos del admin', count(*) = 0, count(*)::text
    from storage.objects o where o.bucket_id = 'comprobantes' and split_part(o.name, '/', 1) = x.s_admin::text;

  -- Capturar y editar lo suyo
  v_s := public.registrar_servicio(x.u_ok, ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST capturista]', jsonb_build_array(jsonb_build_object('categoria_id', x.c_ok, 'monto', '150.00')));
  insert into r(grupo, caso, ok, detalle) values ('Capturar', 'Registra servicio', v_s is not null, '');
  perform public.actualizar_servicio(v_s, x.u_ok, ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST capturista] editado',
    (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '175.00')) from public.gastos where servicio_id = v_s), 'Corrijo el monto');
  insert into r(grupo, caso, ok, detalle) select 'Capturar', 'Edita lo suyo con motivo', monto = 175, monto::text from public.gastos where servicio_id = v_s;
  begin
    perform public.actualizar_servicio(v_s, x.u_ok, ((now() at time zone 'America/Tijuana')::date), null, null, 'x',
      (select jsonb_agg(jsonb_build_object('id', id, 'categoria_id', categoria_id, 'monto', '1')) from public.gastos where servicio_id = v_s), '');
    insert into r(grupo, caso, ok, detalle) values ('Capturar', 'Editar sin motivo rechazado', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Capturar', 'Editar sin motivo rechazado', true, sqlerrm); end;
  begin
    perform public.registrar_servicio(x.u_baja, ((now() at time zone 'America/Tijuana')::date), null, null, 'x', jsonb_build_array(jsonb_build_object('categoria_id', x.c_ok, 'monto', '1')));
    insert into r(grupo, caso, ok, detalle) values ('Capturar', 'No captura en unidad de baja', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Capturar', 'No captura en unidad de baja', true, sqlerrm); end;
  begin
    perform public.registrar_servicio(x.u_ok, ((now() at time zone 'America/Tijuana')::date), null, null, 'x', jsonb_build_array(jsonb_build_object('categoria_id', x.c_inactiva, 'monto', '1')));
    insert into r(grupo, caso, ok, detalle) values ('Capturar', 'No usa categoría desactivada', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Capturar', 'No usa categoría desactivada', true, sqlerrm); end;
  insert into public.proveedores (nombre) values ('[TEST proveedor capturista]');
  insert into r(grupo, caso, ok, detalle) values ('Capturar', 'Crea proveedor (alta rápida)', true, '');

  -- Lo ajeno
  begin
    perform public.actualizar_servicio(x.s_admin, x.u_ok, ((now() at time zone 'America/Tijuana')::date), null, null, 'hackeo',
      '[{"categoria_id":"00000000-0000-0000-0000-000000000000","monto":"1"}]'::jsonb, 'Intento ajeno');
    insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No edita servicio del admin', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No edita servicio del admin', true, sqlerrm); end;
  perform set_config('app.motivo', 'Intento ajeno directo', true);
  update public.gastos set monto = 1 where servicio_id = x.s_admin;
  get diagnostics v_n = row_count;
  insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No edita gastos del admin por API', v_n = 0, v_n || ' renglones');
  begin
    insert into public.gastos (servicio_id, categoria_id, monto) values (x.s_admin, x.c_ok, 1);
    insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No agrega gastos a servicio del admin', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No agrega gastos a servicio del admin', true, sqlerrm); end;
  delete from public.gastos where servicio_id = x.s_admin;
  get diagnostics v_n = row_count;
  insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No borra gastos del admin', v_n = 0, v_n || ' renglones');
  begin
    insert into public.comprobantes (id, servicio_id, ruta_archivo, tipo_mime, tamano_bytes, hash_sha256, nombre_archivo)
    select g, x.s_admin, x.s_admin || '/' || g || '.pdf', 'application/pdf', 1000, repeat('a', 64), 'x.pdf' from gen_random_uuid() g;
    insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No agrega comprobantes al admin', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'No agrega comprobantes al admin', true, sqlerrm); end;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('comprobantes', x.s_admin || '/' || gen_random_uuid() || '.pdf', (select a_id from ids)::text);
    insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'Storage: no sube archivos al admin', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Ajeno', 'Storage: no sube archivos al admin', true, sqlerrm); end;
  insert into r(grupo, caso, ok, detalle) select 'Ajeno', 'Duplicado: avisa sin dejar ver', coalesce(bool_and(not puede_ver), true), count(*) || ' coincidencias'
    from public.buscar_comprobante_duplicado(x.hash_admin);

  -- Solo admin
  begin perform public.eliminar_servicio(v_s, 'Intento eliminar');
    insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No elimina ni lo suyo', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No elimina ni lo suyo', true, sqlerrm); end;
  begin perform public.reporte_gastos(((now() at time zone 'America/Tijuana')::date) - 30, ((now() at time zone 'America/Tijuana')::date));
    insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'Sin Reportes', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'Sin Reportes', true, sqlerrm); end;
  begin perform 1 from public.exportar_gastos(((now() at time zone 'America/Tijuana')::date) - 30, ((now() at time zone 'America/Tijuana')::date));
    insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'Sin Excel', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'Sin Excel', true, sqlerrm); end;
  begin perform 1 from public.listar_usuarios();
    insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'Sin lista de usuarios', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'Sin lista de usuarios', true, sqlerrm); end;
  update public.perfiles set rol = 'admin' where id = (select a_id from ids);
  insert into r(grupo, caso, ok, detalle) select 'Solo admin', 'No se sube a admin', rol = 'capturista', rol::text from public.perfiles where id = (select a_id from ids);
  begin insert into public.categorias (nombre) values ('[TEST cat]');
    insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No crea categorías', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No crea categorías', true, sqlerrm); end;
  begin insert into public.unidades (numero_economico, tipo, operacion) values ('T-9998', 'trailer', 'local');
    insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No crea unidades', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No crea unidades', true, sqlerrm); end;
  update public.unidades set notas = 'x' where id = x.u_ok;
  get diagnostics v_n = row_count;
  insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No edita unidades', v_n = 0, v_n || ' renglones');
  update public.proveedores set nombre = 'x' where nombre <> '[TEST proveedor capturista]';
  get diagnostics v_n = row_count;
  insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No edita proveedores existentes', v_n = 0, v_n || ' renglones');
  begin perform public.eliminar_unidad(x.u_ok, 'ELIMINAR REGISTRO');
    insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No elimina unidades', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Solo admin', 'No elimina unidades', true, sqlerrm); end;
end $$;
reset role;

-- ---------- Como capturista B (otro capturista) ----------
select set_config('request.jwt.claims', json_build_object('sub', (select b_id from ids), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare x record;
begin
  select * into x from ref;
  insert into r(grupo, caso, ok, detalle) select 'Otro capturista', 'No ve servicios de A', count(*) = 0, count(*)::text from public.servicios;
  insert into r(grupo, caso, ok, detalle) select 'Otro capturista', 'No ve gastos de A', count(*) = 0, count(*)::text from public.gastos;
  insert into r(grupo, caso, ok, detalle) select 'Otro capturista', 'No ve historial de A', count(*) = 0, count(*)::text from public.historial_cambios;
  begin
    perform public.actualizar_servicio(x.s_a, x.u_ok, ((now() at time zone 'America/Tijuana')::date), null, null, 'x',
      '[{"categoria_id":"00000000-0000-0000-0000-000000000000","monto":"1"}]'::jsonb, 'Intento ajeno');
    insert into r(grupo, caso, ok, detalle) values ('Otro capturista', 'No edita servicios de A', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Otro capturista', 'No edita servicios de A', true, sqlerrm); end;
end $$;
reset role;

-- ---------- Capturista A desactivado (token aún vigente) ----------
update public.perfiles set activo = false where id = (select a_id from ids);
select set_config('request.jwt.claims', json_build_object('sub', (select a_id from ids), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare x record;
begin
  select * into x from ref;
  insert into r(grupo, caso, ok, detalle) select 'Desactivado', 'No ve servicios', count(*) = 0, count(*)::text from public.servicios;
  insert into r(grupo, caso, ok, detalle) select 'Desactivado', 'No ve unidades', count(*) = 0, count(*)::text from public.unidades;
  begin
    perform public.registrar_servicio(x.u_ok, ((now() at time zone 'America/Tijuana')::date), null, null, 'x', jsonb_build_array(jsonb_build_object('categoria_id', x.c_ok, 'monto', '1')));
    insert into r(grupo, caso, ok, detalle) values ('Desactivado', 'No registra', false, 'pudo');
  exception when others then insert into r(grupo, caso, ok, detalle) values ('Desactivado', 'No registra', true, sqlerrm); end;
end $$;
reset role;

select grupo, caso, ok, left(detalle, 90) detalle from r order by n;
rollback;
