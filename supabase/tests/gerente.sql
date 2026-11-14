begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
-- 5H: los tickets pendientes de verdad bloquean la entrada directa; en esta prueba no cuentan (se deshace al final).
update public.tickets_taller set estatus = 'cancelado', cancelado_at = now() where estatus = 'pendiente';
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;
create temp table g as select id, activo from public.perfiles where rol = 'gerente' order by created_at desc limit 1;
grant select on g to authenticated;
insert into r(caso, ok, detalle) select 'gerente existe y activo', count(*) = 1 and bool_and(activo), count(*)::text from g;

create temp table totales as select
  (select count(*) from public.servicios) servicios,
  (select count(*) from public.gastos) gastos,
  (select count(*) from public.unidades) unidades,
  (select count(*) from public.historial_cambios) historial;
grant select on totales to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', (select id from g), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_u uuid; v_s uuid; v_c uuid;
begin
  insert into r(caso, ok, detalle) select 've todos los servicios', (select count(*) from public.servicios) = servicios, servicios::text from totales;
  insert into r(caso, ok, detalle) select 've todos los gastos', (select count(*) from public.gastos) = gastos, gastos::text from totales;
  insert into r(caso, ok, detalle) select 've todas las unidades (incl. baja)', (select count(*) from public.unidades) = unidades, unidades::text from totales;
  insert into r(caso, ok, detalle) select 've todo el historial', (select count(*) from public.historial_cambios) = historial, historial::text from totales;
  insert into r(caso, ok, detalle) select 'reportes', public.reporte_gastos(((now() at time zone 'America/Tijuana')::date) - 365, ((now() at time zone 'America/Tijuana')::date)) ? 'total', '';
  insert into r(caso, ok, detalle) select 'excel', count(*) > 0, count(*)::text from public.exportar_gastos(((now() at time zone 'America/Tijuana')::date) - 365, ((now() at time zone 'America/Tijuana')::date));
  insert into r(caso, ok, detalle) select 'solo ve su perfil', count(*) = 1, count(*)::text from public.perfiles;

  select id into v_u from public.unidades limit 1;
  select id into v_c from public.categorias where activo and not requiere_concepto limit 1;
  select id into v_s from public.servicios limit 1;

  begin perform public.registrar_servicio(v_u, ((now() at time zone 'America/Tijuana')::date), null, null, 'x', jsonb_build_array(jsonb_build_object('categoria_id', v_c, 'monto', '1')));
    insert into r(caso, ok, detalle) values ('no registra servicios', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('no registra servicios', true, sqlerrm); end;

  begin update public.servicios set descripcion = 'x' where id = v_s;
    insert into r(caso, ok, detalle) select 'no edita servicios', descripcion is distinct from 'x', '' from public.servicios where id = v_s;
  exception when others then insert into r(caso, ok, detalle) values ('no edita servicios', true, sqlerrm); end;

  begin perform public.eliminar_servicio(v_s, 'prueba gerente');
    insert into r(caso, ok, detalle) select 'no elimina servicios', exists (select 1 from public.servicios where id = v_s), '';
  exception when others then insert into r(caso, ok, detalle) values ('no elimina servicios', true, sqlerrm); end;

  begin update public.unidades set notas = 'x' where id = v_u;
    insert into r(caso, ok, detalle) select 'no edita unidades', notas is distinct from 'x', '' from public.unidades where id = v_u;
  exception when others then insert into r(caso, ok, detalle) values ('no edita unidades', true, sqlerrm); end;

  begin insert into public.proveedores (nombre) values ('[TEST gerente]');
    insert into r(caso, ok, detalle) values ('no crea proveedores', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('no crea proveedores', true, sqlerrm); end;

  begin perform 1 from public.listar_usuarios();
    insert into r(caso, ok, detalle) values ('no lista usuarios', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('no lista usuarios', true, sqlerrm); end;

  -- 5H (D16): levantar tickets de taller es su único permiso de escritura.
  select id into v_u from public.unidades u
  where u.estatus = 'activo'
    and not exists (select 1 from public.tickets_taller t where t.unidad_id = u.id and t.estatus = 'pendiente')
  limit 1;
  begin v_s := public.crear_ticket_taller(v_u, '[TEST gerente] falla', 'normal');
    insert into r(caso, ok, detalle) values ('sí levanta tickets de taller', v_s is not null, '');
  exception when others then insert into r(caso, ok, detalle) values ('sí levanta tickets de taller', false, sqlerrm); end;

  begin perform public.aceptar_ticket_taller(v_s, 9000000);
    insert into r(caso, ok, detalle) values ('no acepta tickets', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('no acepta tickets', sqlstate = '42501', sqlerrm); end;

  begin perform public.registrar_entrada_taller(v_u, ((now() at time zone 'America/Tijuana')::date), 'x', 9000000);
    insert into r(caso, ok, detalle) values ('no da entradas a taller', false, 'pudo');
  exception when others then insert into r(caso, ok, detalle) values ('no da entradas a taller', sqlstate = '42501', sqlerrm); end;
end $$;
reset role;
select caso, ok, detalle from r order by n;
rollback;
