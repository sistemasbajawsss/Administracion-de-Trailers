-- Etapa 0: tiempos de las consultas principales (mismas que hace la app), como
-- admin y como capturista. Cada una 5 veces; se reporta la mediana en ms.
-- Solo lecturas; todo dentro de una transacción que se deshace.
begin;
create temp table t (rol text, consulta text, ms numeric);
grant all on t to authenticated;
create temp table x (k text primary key, v uuid);
grant select on x to authenticated;
insert into x values
  ('admin', (select id from public.perfiles where rol = 'admin' and activo order by created_at limit 1)),
  ('capturista', (select id from public.perfiles where rol = 'capturista' and activo limit 1)),
  ('unidad', (select u.id from public.unidades u join public.servicios s on s.unidad_id = u.id group by u.id order by count(*) desc limit 1));

do $$
declare
  rol text;
  i int;
  t0 timestamptz;
  hoy date := (now() at time zone 'America/Tijuana')::date;
  desde12 date := (date_trunc('month', hoy) - interval '11 months')::date;
  v_unidad uuid := (select v from x where k = 'unidad');
begin
  foreach rol in array array['admin', 'capturista'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', (select v from x where k = rol), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    for i in 1..5 loop
      -- Servicios: primera tanda y total de lo filtrado
      t0 := clock_timestamp();
      perform count(*) from public.listar_gastos(p_unidad_id => null, p_numero => null, p_busqueda => null, p_desde => null, p_hasta => null, p_limite => 25, p_desde_renglon => 0);
      insert into t values (rol, 'Servicios: lista (25)', extract(epoch from clock_timestamp() - t0) * 1000);

      t0 := clock_timestamp();
      perform public.resumen_gastos(p_unidad_id => null, p_numero => null, p_busqueda => null, p_desde => null, p_hasta => null);
      insert into t values (rol, 'Servicios: total filtrado', extract(epoch from clock_timestamp() - t0) * 1000);

      t0 := clock_timestamp();
      perform count(*) from public.listar_gastos(p_unidad_id => null, p_numero => null, p_busqueda => 'llanta', p_desde => null, p_hasta => null, p_limite => 25, p_desde_renglon => 0);
      insert into t values (rol, 'Servicios: búsqueda', extract(epoch from clock_timestamp() - t0) * 1000);

      -- Inicio
      t0 := clock_timestamp();
      perform count(*) from (select id from public.servicios_resumen where num_comprobantes = 0 order by fecha desc, created_at desc limit 50) s;
      perform count(*) from public.servicios_resumen where num_comprobantes = 0;
      perform count(*) from (select id from public.servicios_resumen order by created_at desc limit 5) s;
      perform count(*) from public.unidades where estatus = 'en_taller';
      insert into t values (rol, 'Inicio', extract(epoch from clock_timestamp() - t0) * 1000);

      -- Taller (5E): unidades en taller con su unidad.
      t0 := clock_timestamp();
      perform count(*) from (
        select e.id from public.entradas_taller e join public.unidades u on u.id = e.unidad_id
        where e.fecha_salida is null order by e.fecha_entrada
      ) s;
      insert into t values (rol, 'Taller', extract(epoch from clock_timestamp() - t0) * 1000);

      if rol = 'admin' then
        -- Unidades: lista de la primera página
        t0 := clock_timestamp();
        perform count(*) from (select u.id from public.unidades u left join public.choferes c on c.id = u.chofer_id where u.operacion = 'local' order by u.numero_orden limit 25) s;
        perform count(*) from public.unidades where operacion = 'local';
        perform count(*) from public.unidades where operacion = 'foraneo';
        perform count(*) from public.unidades where tipo = 'camioneta';
        insert into t values (rol, 'Unidades: lista', extract(epoch from clock_timestamp() - t0) * 1000);

        -- Ficha de la unidad con más servicios
        t0 := clock_timestamp();
        perform * from public.totales_por_unidad where unidad_id = v_unidad;
        perform count(*) from public.gastos g join public.servicios s on s.id = g.servicio_id where s.unidad_id = v_unidad;
        perform count(*) from public.listar_gastos(p_unidad_id => v_unidad, p_numero => null, p_busqueda => null, p_desde => null, p_hasta => null, p_limite => 25, p_desde_renglon => 0);
        perform public.resumen_gastos(p_unidad_id => v_unidad, p_numero => null, p_busqueda => null, p_desde => null, p_hasta => null);
        -- 5E: estancias en taller de la unidad y su venta.
        perform count(*) from (
          select e.id from public.entradas_taller e where e.unidad_id = v_unidad order by e.fecha_entrada desc limit 20
        ) s;
        perform * from public.ventas_unidades where unidad_id = v_unidad and deshecha_at is null;
        insert into t values (rol, 'Ficha de unidad', extract(epoch from clock_timestamp() - t0) * 1000);

        -- Inicio del admin (5E): servicios sin entrada a taller de los últimos 30 días.
        t0 := clock_timestamp();
        perform count(*) from (
          select id from public.servicios_resumen where sin_entrada_taller and fecha >= hoy - 30
          order by fecha desc, created_at desc limit 50
        ) s;
        perform count(*) from public.servicios_resumen where sin_entrada_taller and fecha >= hoy - 30;
        insert into t values (rol, 'Inicio: sin entrada a taller', extract(epoch from clock_timestamp() - t0) * 1000);

        -- Reportes: últimos 12 meses
        t0 := clock_timestamp();
        perform public.reporte_gastos(p_desde => desde12, p_hasta => hoy);
        insert into t values (rol, 'Reportes 12 meses', extract(epoch from clock_timestamp() - t0) * 1000);
      end if;
    end loop;
    execute 'reset role';
  end loop;
end $$;

select rol, consulta,
       round(percentile_cont(0.5) within group (order by ms)::numeric, 1) as mediana_ms,
       round(max(ms), 1) as max_ms
from t
group by rol, consulta
order by rol, consulta;
rollback;
