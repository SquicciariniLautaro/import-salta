-- 20261031000000_fechas_a_mano.sql
-- Lo que pidio Import Salta: poder cargar la fecha de ingreso (compra) de un
-- celular o accesorio y la fecha de su venta. Hasta ahora las dos se ponian
-- solas con el momento en que se cargaban, asi que un equipo comprado o
-- vendido otro dia quedaba con la fecha de hoy.
--
-- - Al ingresar stock (de a un lote, un lote de proveedor o una permuta) se
--   puede mandar la fecha de compra.
-- - Al vender (y en la permuta) se puede mandar la fecha de la venta. Queda
--   en las unidades, en el comprobante y en la deuda que deje, asi la caja y
--   las ventas la muestran en ese dia.
-- - cambiar_fecha_compra y cambiar_fecha_venta corrigen las ya cargadas.
--
-- Sin fecha todo sigue como antes (el momento de la carga): el sitio
-- publicado sigue andando sin el codigo nuevo.
--
-- Como siempre: el panel no escribe en las tablas, llama a funciones. Todo se
-- puede correr dos veces sin romper nada.

-- ---------------------------------------------------------------------------
-- La fecha que se eligio, o este momento si no se eligio ninguna. No puede
-- ser futura (se deja un dia de margen por la diferencia de hora del
-- navegador) ni de antes del 2000.
-- ---------------------------------------------------------------------------
create or replace function public.fecha_elegida(p_fecha timestamptz)
returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  if p_fecha is null then return now(); end if;
  if p_fecha > now() + interval '1 day' then raise exception 'La fecha no puede ser futura'; end if;
  if p_fecha < timestamptz '2000-01-01' then raise exception 'Revisá la fecha: es demasiado vieja'; end if;
  return p_fecha;
end;
$$;

-- El dia (en la hora de Argentina) de una fecha, para comparar compras y ventas.
create or replace function public.dia_local(p_fecha timestamptz)
returns date language sql immutable set search_path = '' as $$
  select (p_fecha at time zone interval '-03:00')::date;
$$;

-- Un equipo no se puede vender antes del dia en que entro al stock.
create or replace function public.exigir_venta_despues_de_compra(p_comprobante bigint, p_fecha timestamptz)
returns void language plpgsql stable set search_path = '' as $$
declare
  v_ingreso timestamptz;
begin
  select max(fecha_ingreso) into v_ingreso from (
    select fecha_ingreso from public.celulares where comprobante_id = p_comprobante
    union all
    select fecha_ingreso from public.accesorios where comprobante_id = p_comprobante) u;
  if v_ingreso is not null and public.dia_local(v_ingreso) > public.dia_local(p_fecha) then
    raise exception 'La fecha de venta no puede ser anterior a la de compra (%). Si la compra fue antes, corregila primero desde Editar en el stock.',
      to_char(public.dia_local(v_ingreso), 'DD/MM/YYYY');
  end if;
end;
$$;

-- Pone la fecha de venta a todo un comprobante: sus unidades, el comprobante y
-- la deuda que dejo. Revisa que no quede antes de la compra.
create or replace function public.fechar_comprobante(p_comprobante bigint, p_fecha timestamptz)
returns void language plpgsql set search_path = '' as $$
begin
  update public.celulares set fecha_venta = p_fecha where comprobante_id = p_comprobante and estado = 'vendido';
  update public.accesorios set fecha_venta = p_fecha where comprobante_id = p_comprobante and estado = 'vendido';
  update public.comprobantes set fecha = p_fecha where id = p_comprobante;
  update public.cuenta_clientes set fecha = p_fecha where comprobante_id = p_comprobante and tipo = 'deuda';
  perform public.exigir_venta_despues_de_compra(p_comprobante, p_fecha);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ingresar stock con su fecha de compra (p_fecha, al final; NULL = ahora).
-- Igual que en 20261015000000_mayorista.sql, mas la fecha.
-- ---------------------------------------------------------------------------
drop function if exists public.ingresar_celulares(text, text, text, text, text, numeric, numeric, integer, text[], text, bigint, numeric);
create or replace function public.ingresar_celulares(
  p_modelo text, p_capacidad text, p_color text, p_bateria text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer,
  p_imeis text[] default null, p_proveedor text default null, p_compra bigint default null,
  p_precio_mayorista_usd numeric default null, p_fecha timestamptz default null
) returns integer language plpgsql set search_path = '' as $$
declare
  v_imeis     text[] := coalesce(p_imeis, '{}');
  v_proveedor bigint;
  v_clave     text;
  v_fecha     timestamptz;
begin
  perform public.exigir_admin();
  if public.limpiar(p_modelo) = '' then raise exception 'Falta el modelo'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'La cantidad tiene que estar entre 1 y 500';
  end if;
  if p_costo_usd is null or p_costo_usd < 0 or p_precio_usd is null or p_precio_usd < 0 then
    raise exception 'El costo y el precio no pueden ser negativos';
  end if;
  if p_precio_mayorista_usd < 0 then raise exception 'El precio mayorista no puede ser negativo'; end if;
  if coalesce(array_length(v_imeis, 1), 0) > p_cantidad then
    raise exception 'Hay más IMEI que equipos';
  end if;
  v_fecha := public.fecha_elegida(p_fecha);
  v_proveedor := public.proveedor_por_nombre(p_proveedor);

  for i in 1 .. p_cantidad loop
    insert into public.celulares (modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd, proveedor_id, compra_id, fecha_ingreso)
    values (upper(public.limpiar(p_modelo)), upper(public.limpiar(p_capacidad)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_bateria)),
            upper(public.limpiar(p_detalles)),
            -- v_imeis[i] es NULL cuando no hay un IMEI para esa posicion.
            nullif(public.limpiar(v_imeis[i]), ''),
            round(p_costo_usd, 4), round(p_precio_usd, 4), v_proveedor, p_compra, v_fecha)
    returning clave into v_clave;
  end loop;

  perform public.recordar_opcion('modelo', p_modelo);
  perform public.recordar_opcion('capacidad', p_capacidad);
  perform public.recordar_opcion('color', p_color);
  perform public.promediar_lote('celulares', v_clave);
  perform public.fijar_mayorista('celulares', v_clave, p_precio_mayorista_usd);
  return p_cantidad;
end;
$$;

drop function if exists public.ingresar_accesorios(text, text, text, text, numeric, numeric, integer, text, bigint, numeric);
create or replace function public.ingresar_accesorios(
  p_tipo text, p_modelo text, p_color text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer,
  p_proveedor text default null, p_compra bigint default null,
  p_precio_mayorista_usd numeric default null, p_fecha timestamptz default null
) returns integer language plpgsql set search_path = '' as $$
declare
  v_proveedor bigint;
  v_clave     text;
  v_fecha     timestamptz;
begin
  perform public.exigir_admin();
  if public.limpiar(p_tipo) = '' then raise exception 'Falta el tipo de accesorio'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'La cantidad tiene que estar entre 1 y 500';
  end if;
  if p_costo_usd is null or p_costo_usd < 0 or p_precio_usd is null or p_precio_usd < 0 then
    raise exception 'El costo y el precio no pueden ser negativos';
  end if;
  if p_precio_mayorista_usd < 0 then raise exception 'El precio mayorista no puede ser negativo'; end if;
  v_fecha := public.fecha_elegida(p_fecha);
  v_proveedor := public.proveedor_por_nombre(p_proveedor);

  for i in 1 .. p_cantidad loop
    insert into public.accesorios (tipo, modelo, color, detalles, costo_usd, precio_usd, proveedor_id, compra_id, fecha_ingreso)
    values (upper(public.limpiar(p_tipo)), upper(public.limpiar(p_modelo)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_detalles)),
            round(p_costo_usd, 4), round(p_precio_usd, 4), v_proveedor, p_compra, v_fecha)
    returning clave into v_clave;
  end loop;

  perform public.recordar_opcion('tipo', p_tipo);
  perform public.promediar_lote('accesorios', v_clave);
  perform public.fijar_mayorista('accesorios', v_clave, p_precio_mayorista_usd);
  return p_cantidad;
end;
$$;

-- Un lote de proveedor con su fecha de compra: vale para el lote, sus equipos
-- y la deuda que deja. Igual que en 20261017000000_clientes.sql, mas la fecha.
drop function if exists public.ingresar_compra(text, text, jsonb, numeric);
create or replace function public.ingresar_compra(
  p_proveedor text, p_nota text, p_celulares jsonb, p_deuda_usd numeric default null,
  p_fecha timestamptz default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_compra    bigint;
  v_proveedor bigint;
  v_item      jsonb;
  v_unidades  integer := 0;
  v_fecha     timestamptz;
begin
  perform public.exigir_admin();
  if public.normalizar(p_proveedor) = '' then raise exception 'Elegí el proveedor del lote'; end if;
  if coalesce(jsonb_array_length(p_celulares), 0) = 0 then raise exception 'Agregá al menos un modelo al lote'; end if;
  if p_deuda_usd < 0 then raise exception 'La deuda no puede ser negativa'; end if;
  v_fecha := public.fecha_elegida(p_fecha);

  v_proveedor := public.proveedor_por_nombre(p_proveedor);
  insert into public.compras (proveedor_id, nota, fecha)
  values (v_proveedor, public.limpiar(p_nota), v_fecha)
  returning id into v_compra;

  for v_item in select value from jsonb_array_elements(p_celulares) loop
    v_unidades := v_unidades + public.ingresar_celulares(
      v_item->>'modelo', v_item->>'capacidad', v_item->>'color', v_item->>'bateria', v_item->>'detalles',
      (v_item->>'costo_usd')::numeric, (v_item->>'precio_usd')::numeric, (v_item->>'cantidad')::integer,
      case when jsonb_typeof(v_item->'imeis') = 'array'
           then array(select jsonb_array_elements_text(v_item->'imeis')) end,
      p_proveedor, v_compra, (v_item->>'precio_mayorista_usd')::numeric, v_fecha);
  end loop;

  if coalesce(p_deuda_usd, 0) > 0 then
    insert into public.deudas_proveedor (proveedor_id, monto_usd, detalle, compra_id, fecha)
    values (v_proveedor, round(p_deuda_usd, 4), 'Lote N° ' || lpad(v_compra::text, 6, '0'), v_compra, v_fecha);
  end if;

  return jsonb_build_object('compra', v_compra, 'unidades', v_unidades);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vender con fecha: p_datos puede traer "fecha" (NULL o vacia = ahora).
-- Igual que en 20261017000000_clientes.sql, mas la fecha.
-- ---------------------------------------------------------------------------
create or replace function public.vender(p_celulares jsonb, p_accesorios jsonb, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_datos       jsonb := coalesce(p_datos, '{}'::jsonb);
  v_fecha       timestamptz;
  v_comprobante bigint;
  v_total       integer;
begin
  perform public.exigir_admin();
  if coalesce(jsonb_array_length(p_celulares), 0) + coalesce(jsonb_array_length(p_accesorios), 0) = 0 then
    raise exception 'No hay nada para vender';
  end if;
  v_fecha := public.fecha_elegida(nullif(v_datos->>'fecha', '')::timestamptz);

  v_comprobante := public.crear_comprobante('mostrador', v_datos);
  v_total := public.pasar_a_vendido('celulares', p_celulares, 'disponible', v_comprobante,
                                    (v_datos->>'garantia_celulares')::integer)
           + public.pasar_a_vendido('accesorios', p_accesorios, 'disponible', v_comprobante,
                                    (v_datos->>'garantia_accesorios')::integer);
  perform public.anotar_deuda_de_venta(v_comprobante);
  if nullif(v_datos->>'fecha', '') is not null then
    perform public.fechar_comprobante(v_comprobante, v_fecha);
  end if;
  return jsonb_build_object('unidades', v_total, 'comprobante', v_comprobante);
end;
$$;

-- La permuta con fecha (p_datos->>'fecha'): es la de la venta y la de ingreso
-- del equipo que se recibe.
create or replace function public.registrar_permuta(
  p_recibido jsonb, p_entregado_id bigint default null, p_entregado_precio_usd numeric default null,
  p_datos jsonb default '{}'::jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_valor       numeric := (p_recibido->>'valor_usd')::numeric;
  v_datos       jsonb := coalesce(p_datos, '{}'::jsonb);
  v_fecha       timestamptz;
  v_comprobante bigint;
begin
  perform public.exigir_admin();
  if v_valor is null or v_valor < 0 then raise exception 'Falta el valor de toma del equipo recibido'; end if;
  v_fecha := public.fecha_elegida(nullif(v_datos->>'fecha', '')::timestamptz);

  if p_entregado_id is not null then
    if public.limpiar(v_datos->>'nota') = '' then
      v_datos := v_datos || jsonb_build_object('nota', left('Recibido en parte de pago: ' || upper(public.limpiar(
        concat_ws(' ', p_recibido->>'modelo', p_recibido->>'capacidad', p_recibido->>'color',
                  case when public.limpiar(p_recibido->>'imei') <> '' then 'IMEI ' || public.limpiar(p_recibido->>'imei') end))), 300));
    end if;
    v_comprobante := public.crear_comprobante('permuta', v_datos);
    perform public.pasar_a_vendido(
      'celulares',
      jsonb_build_array(jsonb_build_object('id', p_entregado_id, 'precio_usd', p_entregado_precio_usd)),
      'disponible', v_comprobante, (v_datos->>'garantia_celulares')::integer);
    update public.celulares set permuta_usd = round(v_valor, 4) where id = p_entregado_id;
    perform public.anotar_deuda_de_venta(v_comprobante);
    if nullif(v_datos->>'fecha', '') is not null then
      perform public.fechar_comprobante(v_comprobante, v_fecha);
    end if;
  end if;

  perform public.ingresar_celulares(
    p_recibido->>'modelo', p_recibido->>'capacidad', p_recibido->>'color',
    p_recibido->>'bateria', p_recibido->>'detalles',
    v_valor, coalesce((p_recibido->>'precio_usd')::numeric, v_valor), 1,
    case when public.limpiar(p_recibido->>'imei') = '' then null else array[p_recibido->>'imei'] end,
    null, null, null, v_fecha);
  return jsonb_build_object('comprobante', v_comprobante);
end;
$$;

-- ---------------------------------------------------------------------------
-- Corregir fechas ya cargadas.
-- ---------------------------------------------------------------------------

-- La fecha de compra de unas unidades (en el stock o ya vendidas). Una unidad
-- vendida no puede quedar comprada despues del dia en que se vendio.
create or replace function public.cambiar_fecha_compra(p_tabla text, p_ids bigint[], p_fecha timestamptz)
returns integer language plpgsql set search_path = '' as $$
declare
  v_hechas integer;
  v_venta  timestamptz;
begin
  perform public.exigir_admin();
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  perform public.fecha_elegida(p_fecha);
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No hay unidades para cambiar'; end if;

  execute format('select min(fecha_venta) from public.%I where id = any($1) and estado = ''vendido''',
                 public.tabla_valida(p_tabla)) into v_venta using p_ids;
  if v_venta is not null and public.dia_local(p_fecha) > public.dia_local(v_venta) then
    raise exception 'La fecha de compra no puede ser posterior a la de venta (%)', to_char(public.dia_local(v_venta), 'DD/MM/YYYY');
  end if;

  execute format('update public.%I set fecha_ingreso = $2 where id = any($1)', public.tabla_valida(p_tabla))
    using p_ids, p_fecha;
  get diagnostics v_hechas = row_count;
  if v_hechas <> array_length(p_ids, 1) then
    raise exception 'El stock cambió. Actualizá la página y probá de nuevo.';
  end if;
  return v_hechas;
end;
$$;

-- La fecha de venta de unas unidades vendidas. Si tienen comprobante cambia
-- toda esa venta (el ticket tiene una sola fecha): sus unidades, el
-- comprobante y la deuda que dejo.
create or replace function public.cambiar_fecha_venta(p_tabla text, p_ids bigint[], p_fecha timestamptz)
returns void language plpgsql set search_path = '' as $$
declare
  v_comprobante bigint;
  v_ingreso     timestamptz;
  v_hechas      integer;
begin
  perform public.exigir_admin();
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  perform public.fecha_elegida(p_fecha);
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'No hay unidades para cambiar'; end if;

  -- Las que no tienen comprobante (ventas viejas) se cambian de a una.
  execute format(
    'update public.%I set fecha_venta = $2 where id = any($1) and estado = ''vendido'' and comprobante_id is null',
    public.tabla_valida(p_tabla)) using p_ids, p_fecha;
  execute format('select max(fecha_ingreso) from public.%I where id = any($1) and comprobante_id is null',
                 public.tabla_valida(p_tabla)) into v_ingreso using p_ids;
  if v_ingreso is not null and public.dia_local(v_ingreso) > public.dia_local(p_fecha) then
    raise exception 'La fecha de venta no puede ser anterior a la de compra (%). Si la compra fue antes, corregila primero.',
      to_char(public.dia_local(v_ingreso), 'DD/MM/YYYY');
  end if;

  for v_comprobante in execute format(
    'select distinct comprobante_id from public.%I where id = any($1) and estado = ''vendido'' and comprobante_id is not null',
    public.tabla_valida(p_tabla)) using p_ids
  loop
    perform public.fechar_comprobante(v_comprobante, p_fecha);
  end loop;

  execute format('select count(*) from public.%I where id = any($1) and estado = ''vendido''', public.tabla_valida(p_tabla))
    into v_hechas using p_ids;
  if v_hechas <> array_length(p_ids, 1) then
    raise exception 'La venta cambió. Actualizá la página y probá de nuevo.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
