-- =============================================================================
-- Ajuste de la 5E (2026-11-06, pedido por el usuario): "Dar salida" de una
-- estancia sin ningún servicio registrado exige motivo (la nota). Con servicios,
-- o cuando la salida la da un servicio (casilla), la nota sigue siendo opcional.
-- Copia de dar_salida_taller() de 20261106233851_salida_con_servicio.sql + esa
-- revisión. Misma firma: la app no cambia su llamada.
-- =============================================================================
create or replace function public.dar_salida_taller(
  p_entrada_id uuid,
  p_fecha date,
  p_nota text default null,
  p_servicio_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(trim(p_nota), '');
  v_unidad_id uuid;
  v_entrada date;
  v_salida date;
begin
  if not public.puede_capturar() then
    raise exception 'No tienes permiso para dar salida de taller' using errcode = '42501';
  end if;
  if v_nota is not null and length(v_nota) > 1000 then
    raise exception 'La nota puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;

  select e.unidad_id, e.fecha_entrada, e.fecha_salida into v_unidad_id, v_entrada, v_salida
  from public.entradas_taller e
  where e.id = p_entrada_id
  for update;

  if not found then
    raise exception 'La entrada a taller no existe' using errcode = 'P0002';
  end if;
  if v_salida is not null then
    raise exception 'Esta unidad ya salió de taller' using errcode = '23514';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Tijuana')::date then
    raise exception 'La fecha de salida no puede ser futura' using errcode = '23514';
  end if;
  if p_fecha < v_entrada then
    raise exception 'La salida no puede ser antes de la entrada (%)', to_char(v_entrada, 'DD/MM/YYYY') using errcode = '23514';
  end if;
  -- El servicio tiene que ser de esta misma estancia.
  if p_servicio_id is not null and not exists (
    select 1 from public.servicios s where s.id = p_servicio_id and s.entrada_taller_id = p_entrada_id
  ) then
    raise exception 'Ese servicio no es de esta estancia en taller' using errcode = '23514';
  end if;

  -- Sin ningún servicio en la estancia, la salida necesita motivo (decisión del
  -- usuario, 2026-11-06): que no salga una unidad sin saber qué pasó.
  if p_servicio_id is null and v_nota is null and not exists (
    select 1 from public.servicios s where s.entrada_taller_id = p_entrada_id
  ) then
    raise exception 'Escribe por qué sale de taller sin servicios registrados' using errcode = '23514';
  end if;
  update public.entradas_taller
  set fecha_salida = p_fecha,
      nota_salida = v_nota,
      salida_by = auth.uid(),
      salida_nombre = (select p.nombre from public.perfiles p where p.id = auth.uid()),
      servicio_salida_id = p_servicio_id
  where id = p_entrada_id;

  perform set_config('app.cambio_taller', v_unidad_id::text, true);
  update public.unidades set estatus = 'activo' where id = v_unidad_id;
  perform set_config('app.cambio_taller', '', true);
end;
$$;
