begin;
-- 5I: el cierre de mes no cuenta en esta prueba (meses reabiertos dentro de la transacción; se deshace al final).
insert into public.cierres_mes_eventos (mes, accion, motivo, created_by) select g::date, 'reabrir', 'Prueba: meses abiertos', (select id from public.perfiles where rol = 'admin' order by created_at limit 1) from generate_series(date_trunc('month', now()) - interval '36 months', date_trunc('month', now()) - interval '1 month', interval '1 month') g;
create temp table r (n serial, caso text, ok boolean, detalle text);
grant all on r to authenticated; grant all on r_n_seq to authenticated;
-- servicios viejos en pesos (antes de impersonar)
insert into r(caso, ok, detalle)
select 'Existentes quedan en MXN', count(*) filter (where moneda <> 'MXN' or monto_usd is not null or tipo_cambio is not null) = 0, count(*)::text || ' gastos'
from public.gastos where created_at < '2026-10-27 23:42:42+00';

select set_config('request.jwt.claims', json_build_object('sub', (select id from public.perfiles where rol='admin' and activo order by created_at limit 1), 'role','authenticated')::text, true);
set local role authenticated;

do $$
declare v_s uuid; v_u uuid; v_c uuid; v_g uuid; v_h bigint;
begin
  select id into v_u from public.unidades order by numero_orden limit 1;
  select id into v_c from public.categorias where activo and not requiere_concepto limit 1;

  -- 1. alta en USD con monto falso
  v_s := public.registrar_servicio(v_u, ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST5B]',
    jsonb_build_array(
      jsonb_build_object('categoria_id', v_c, 'moneda','USD','monto','1.00','monto_usd','123.45','tipo_cambio','18.3337'),
      jsonb_build_object('categoria_id', v_c, 'monto','500.10')));
  select id into v_g from public.gastos where servicio_id = v_s and moneda='USD';
  insert into r(caso, ok, detalle) select 'Alta USD: monto = round(123.45*18.3337,2)', monto = round(123.45*18.3337,2), monto::text from public.gastos where id=v_g;
  insert into r(caso, ok, detalle) select 'Alta MXN sin moneda queda MXN', moneda='MXN' and monto=500.10 and monto_usd is null, monto::text from public.gastos where servicio_id=v_s and moneda='MXN';

  -- 2. API directa
  perform set_config('app.motivo', 'Prueba API directa', true);
  update public.gastos set monto = 99999 where id = v_g;
  insert into r(caso, ok, detalle) select 'Update directo de monto se ignora', monto = round(123.45*18.3337,2), monto::text from public.gastos where id=v_g;

  insert into public.gastos(servicio_id, categoria_id, moneda, monto, monto_usd, tipo_cambio) values (v_s, v_c, 'USD', 1, 10, 20);
  insert into r(caso, ok, detalle) select 'Insert directo USD calcula monto', bool_and(monto = 200), string_agg(monto::text, ',') from public.gastos where servicio_id=v_s and monto_usd=10;

  begin
    insert into public.gastos(servicio_id, categoria_id, moneda, monto, monto_usd) values (v_s, v_c, 'USD', 1, 10);
    insert into r(caso, ok, detalle) values ('USD sin TC rechazado', false, 'se acepto');
  exception when others then insert into r(caso, ok, detalle) values ('USD sin TC rechazado', true, sqlerrm); end;

  begin
    insert into public.gastos(servicio_id, categoria_id, moneda, monto, monto_usd, tipo_cambio) values (v_s, v_c, 'USD', 1, 10, 150);
    insert into r(caso, ok, detalle) values ('TC > 100 rechazado', false, 'se acepto');
  exception when others then insert into r(caso, ok, detalle) values ('TC > 100 rechazado', true, sqlerrm); end;

  insert into public.gastos(servicio_id, categoria_id, moneda, monto, monto_usd, tipo_cambio) values (v_s, v_c, 'MXN', 77, 5, 5);
  insert into r(caso, ok, detalle) select 'MXN limpia monto_usd/TC', monto_usd is null and tipo_cambio is null, '' from public.gastos where servicio_id=v_s and monto=77;
  delete from public.gastos where servicio_id=v_s and (monto_usd=10 or monto=77);

  -- 3. editar TC
  perform public.actualizar_servicio(v_s, v_u, ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST5B]',
    (select jsonb_agg(case when id=v_g then jsonb_build_object('id',id,'categoria_id',categoria_id,'moneda','USD','monto','5','monto_usd','123.45','tipo_cambio','19.0000')
                       else jsonb_build_object('id',id,'categoria_id',categoria_id,'monto',monto::text) end) from public.gastos where servicio_id=v_s),
    'Corrijo tipo de cambio');
  insert into r(caso, ok, detalle) select 'Editar TC recalcula', monto = round(123.45*19,2), monto::text from public.gastos where id=v_g;
  select id into v_h from public.historial_cambios where registro_id=v_g and accion='update' order by id desc limit 1;
  insert into r(caso, ok, detalle) select 'Historial: motivo y TC viejo/nuevo',
    coalesce(motivo='Corrijo tipo de cambio' and (datos_anteriores->>'tipo_cambio')::numeric=18.3337 and (datos_nuevos->>'tipo_cambio')::numeric=19
      and (datos_nuevos->>'monto')::numeric=round(123.45*19,2), false), coalesce(motivo,'sin historial') from public.historial_cambios where id=v_h;

  -- editar cantidad USD
  perform public.actualizar_servicio(v_s, v_u, ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST5B]',
    (select jsonb_agg(case when id=v_g then jsonb_build_object('id',id,'categoria_id',categoria_id,'moneda','USD','monto_usd','200','tipo_cambio','19.0000')
                       else jsonb_build_object('id',id,'categoria_id',categoria_id,'monto',monto::text) end) from public.gastos where servicio_id=v_s),
    'Corrijo cantidad');
  insert into r(caso, ok, detalle) select 'Editar USD recalcula', monto = 3800, monto::text from public.gastos where id=v_g;

  -- pasar a MXN
  perform public.actualizar_servicio(v_s, v_u, ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST5B]',
    (select jsonb_agg(case when id=v_g then jsonb_build_object('id',id,'categoria_id',categoria_id,'moneda','MXN','monto','4000')
                       else jsonb_build_object('id',id,'categoria_id',categoria_id,'monto',monto::text) end) from public.gastos where servicio_id=v_s),
    'Era en pesos');
  insert into r(caso, ok, detalle) select 'USD -> MXN limpia', moneda='MXN' and monto=4000 and monto_usd is null and tipo_cambio is null, monto::text from public.gastos where id=v_g;

  perform public.actualizar_servicio(v_s, v_u, ((now() at time zone 'America/Tijuana')::date), null, null, '[TEST5B]',
    (select jsonb_agg(case when id=v_g then jsonb_build_object('id',id,'categoria_id',categoria_id,'moneda','USD','monto_usd','150.55','tipo_cambio','18.1234')
                       else jsonb_build_object('id',id,'categoria_id',categoria_id,'monto',monto::text) end) from public.gastos where servicio_id=v_s),
    'Era en dolares');

  -- 4. eliminar y restaurar
  perform public.eliminar_servicio(v_s, 'Prueba eliminar');
  select id into v_h from public.historial_cambios where tabla='servicios' and registro_id=v_s and accion='delete' order by id desc limit 1;
  v_s := public.restaurar_servicio(v_h, 'Prueba restaurar');
  insert into r(caso, ok, detalle) select 'Restaurar conserva moneda/USD/TC/monto',
    moneda='USD' and monto_usd=150.55 and tipo_cambio=18.1234 and monto=round(150.55*18.1234,2), moneda||' '||monto_usd||' x '||tipo_cambio||' = '||monto from public.gastos where id=v_g;
  insert into r(caso, ok, detalle) select 'Restaurar conserva renglon MXN', count(*)=1, count(*)::text from public.gastos where servicio_id=v_s and moneda='MXN' and monto=500.10;

  -- vista y reportes
  insert into r(caso, ok, detalle) select 'gastos_detalle trae USD', moneda='USD' and tipo_cambio=18.1234, '' from public.gastos_detalle where id=v_g;
  insert into r(caso, ok, detalle) select 'exportar_gastos trae USD', count(*)=1, count(*)::text from public.exportar_gastos(((now() at time zone 'America/Tijuana')::date), ((now() at time zone 'America/Tijuana')::date)) e where e.moneda='USD' and e.tipo_cambio='18.1234';
  insert into r(caso, ok, detalle) select 'reporte_gastos: dolares', (x->'dolares'->>'usd')::numeric >= 150.55, (x->'dolares')::text from (select public.reporte_gastos(((now() at time zone 'America/Tijuana')::date), ((now() at time zone 'America/Tijuana')::date)) x) t;
end $$;

reset role;
select caso, ok, detalle from r order by n;
rollback;
