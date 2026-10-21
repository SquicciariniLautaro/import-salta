-- 20261013120000_panel.sql
-- Todo lo que usa el panel: carga de stock, ventas, permutas, cuentas de
-- revendedores y senas, precios por cantidad y busqueda de IMEI.
--
-- IDEA CENTRAL: el panel no escribe en las tablas directamente. Cada accion
-- del negocio es una FUNCION de la base ("vender", "registrar_pago"...).
--   * Una funcion corre entera dentro de una transaccion: un grupo de cambios
--     que se aplica completo o no se aplica. Si se corta la senal en la mitad
--     de una venta, no queda nada a medias.
--   * La regla de negocio se cumple aunque el frontend mande algo mal.
--   * Dos personas no pueden vender la misma unidad: la segunda recibe "el
--     stock cambio" y no pasa nada.
-- Las funciones corren con los permisos de quien las llama ("security
-- invoker"), asi que las politicas de la primera migracion siguen valiendo, y
-- ademas cada una empieza revisando que quien llama sea administrador.

-- ---------------------------------------------------------------------------
-- Texto: limpiar y normalizar.
-- ---------------------------------------------------------------------------

-- Saca espacios de las puntas y deja uno solo entre palabras.
create or replace function public.limpiar(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'));
$$;

-- Deja un texto listo para comparar: mayusculas, sin tildes ni simbolos raros.
-- "  iPhone   13 pró " -> "IPHONE 13 PRO"
create or replace function public.normalizar(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(
    translate(upper(coalesce(p_texto, '')),
              'ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
              'AAAAAEEEEIIIIOOOOOUUUUNC'),
    '[^A-Z0-9%+./ -]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- clave: identifica el lote. Es una columna "generada": la calcula la base
-- sola cada vez que cambia la fila, asi hay un unico lugar que decide que
-- unidades van juntas. Costo, precio e IMEI no forman parte de la clave.
-- ---------------------------------------------------------------------------
alter table public.celulares add column if not exists clave text
  generated always as (
    public.normalizar(modelo) || '|' || public.normalizar(capacidad) || '|' ||
    public.normalizar(color)  || '|' || public.normalizar(bateria)   || '|' ||
    public.normalizar(detalles)
  ) stored;

alter table public.accesorios add column if not exists clave text
  generated always as (
    public.normalizar(tipo)  || '|' || public.normalizar(modelo) || '|' ||
    public.normalizar(color) || '|' || public.normalizar(detalles)
  ) stored;

create index if not exists celulares_clave on public.celulares (clave, estado);
create index if not exists accesorios_clave on public.accesorios (clave, estado);

-- ---------------------------------------------------------------------------
-- Ayudas internas.
-- ---------------------------------------------------------------------------

-- Corta la funcion si quien llama no es administrador.
create or replace function public.exigir_admin()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;

-- Las funciones que sirven para las dos tablas reciben el nombre por
-- parametro. Esto impide que llegue cualquier otro nombre.
create or replace function public.tabla_valida(p_tabla text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_tabla not in ('celulares', 'accesorios') then
    raise exception 'Tabla desconocida';
  end if;
  return p_tabla;
end;
$$;

-- Revendedores y senas son el mismo mecanismo con dos nombres. Segun el tipo
-- de cuenta, devuelve la tabla de pagos y el estado que llevan sus unidades.
create or replace function public.datos_de_cuenta(p_tipo text, out tabla_pagos text, out estado text)
language plpgsql immutable set search_path = '' as $$
begin
  if p_tipo = 'revendedor' then
    tabla_pagos := 'pagos_revendedor'; estado := 'revendedor';
  elsif p_tipo = 'sena' then
    tabla_pagos := 'pagos_sena'; estado := 'senado';
  else
    raise exception 'Tipo de cuenta desconocido';
  end if;
end;
$$;

-- Promedio ponderado de un lote. Si las unidades disponibles tienen distinto
-- costo o precio, escribe el promedio en todas y marca el lote como
-- promediado. Como cada fila es una unidad, avg() ya es ponderado:
-- 3 a 700 y 1 a 720 da 705.
create or replace function public.promediar_lote(p_tabla text, p_clave text)
returns void language plpgsql set search_path = '' as $$
declare
  v_costo  numeric;
  v_precio numeric;
  v_mezcla boolean;
begin
  execute format(
    'select round(avg(costo_usd), 4), round(avg(precio_usd), 4),
            count(distinct costo_usd) > 1 or count(distinct precio_usd) > 1
       from public.%I where clave = $1 and estado = ''disponible''',
    public.tabla_valida(p_tabla))
    into v_costo, v_precio, v_mezcla using p_clave;

  if v_mezcla then
    execute format(
      'update public.%I set costo_usd = $2, precio_usd = $3, promediado = true
        where clave = $1 and estado = ''disponible''',
      p_tabla) using p_clave, v_costo, v_precio;
  end if;
end;
$$;

-- Pasa unidades a "vendido". p_items es una lista [{ "id": 1, "precio_usd": 400 }].
-- Solo toca las unidades que estan en el estado esperado (p_origen): si alguna
-- ya no lo esta (otro la vendio primero), corta todo con un error.
-- now() devuelve la misma hora durante toda la transaccion: todas las
-- unidades de una misma venta quedan con la misma fecha_venta.
create or replace function public.pasar_a_vendido(p_tabla text, p_items jsonb, p_origen text)
returns integer language plpgsql set search_path = '' as $$
declare
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_venta numeric;
  v_costo numeric;
  v_hechas integer;
begin
  if jsonb_array_length(v_items) = 0 then return 0; end if;

  if exists (
    select 1 from jsonb_array_elements(v_items) e
     where (e->>'precio_usd') is null or (e->>'precio_usd')::numeric < 0
  ) then
    raise exception 'El precio no puede ser negativo';
  end if;

  -- Cotizaciones de hoy: quedan guardadas en cada unidad vendida.
  select cotizacion_dolar, coalesce(cotizacion_costo, cotizacion_dolar)
    into strict v_venta, v_costo
    from public.configuracion where id = 1;

  execute format(
    'update public.%I u
        set estado = ''vendido'', precio_usd = round((e->>''precio_usd'')::numeric, 4),
            fecha_venta = now(), cotizacion_venta = $2, cotizacion_costo = $3
       from jsonb_array_elements($1) e
      where u.id = (e->>''id'')::bigint and u.estado = $4',
    public.tabla_valida(p_tabla)) using v_items, v_venta, v_costo, p_origen;
  get diagnostics v_hechas = row_count;

  if v_hechas <> jsonb_array_length(v_items) then
    raise exception 'El stock cambió. Actualizá la página y probá de nuevo.';
  end if;
  return v_hechas;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuracion.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_configuracion(p_cotizacion_dolar numeric, p_cotizacion_costo numeric)
returns jsonb language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  update public.configuracion
     set cotizacion_dolar = p_cotizacion_dolar, cotizacion_costo = p_cotizacion_costo
   where id = 1;
  return (select jsonb_build_object('cotizacion_dolar', cotizacion_dolar, 'cotizacion_costo', cotizacion_costo)
            from public.configuracion where id = 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Carga de stock.
-- ---------------------------------------------------------------------------

-- Ingresa p_cantidad celulares iguales. p_imeis es opcional: el primero va a
-- la primera unidad, el segundo a la segunda, y asi. Si el lote ya existia
-- con otro costo o precio, queda promediado.
create or replace function public.ingresar_celulares(
  p_modelo text, p_capacidad text, p_color text, p_bateria text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer, p_imeis text[] default null
) returns integer language plpgsql set search_path = '' as $$
declare
  v_imeis text[] := coalesce(p_imeis, '{}');
  v_clave text;
begin
  perform public.exigir_admin();
  if public.limpiar(p_modelo) = '' then raise exception 'Falta el modelo'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'La cantidad tiene que estar entre 1 y 500';
  end if;
  if p_costo_usd is null or p_costo_usd < 0 or p_precio_usd is null or p_precio_usd < 0 then
    raise exception 'El costo y el precio no pueden ser negativos';
  end if;
  if coalesce(array_length(v_imeis, 1), 0) > p_cantidad then
    raise exception 'Hay más IMEI que equipos';
  end if;

  for i in 1 .. p_cantidad loop
    insert into public.celulares (modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd)
    values (upper(public.limpiar(p_modelo)), upper(public.limpiar(p_capacidad)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_bateria)),
            upper(public.limpiar(p_detalles)),
            -- v_imeis[i] es NULL cuando no hay un IMEI para esa posicion.
            nullif(public.limpiar(v_imeis[i]), ''),
            round(p_costo_usd, 4), round(p_precio_usd, 4))
    returning clave into v_clave;
  end loop;

  perform public.promediar_lote('celulares', v_clave);
  return p_cantidad;
end;
$$;

create or replace function public.ingresar_accesorios(
  p_tipo text, p_modelo text, p_color text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer
) returns integer language plpgsql set search_path = '' as $$
declare
  v_clave text;
begin
  perform public.exigir_admin();
  if public.limpiar(p_tipo) = '' then raise exception 'Falta el tipo de accesorio'; end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'La cantidad tiene que estar entre 1 y 500';
  end if;
  if p_costo_usd is null or p_costo_usd < 0 or p_precio_usd is null or p_precio_usd < 0 then
    raise exception 'El costo y el precio no pueden ser negativos';
  end if;

  for i in 1 .. p_cantidad loop
    insert into public.accesorios (tipo, modelo, color, detalles, costo_usd, precio_usd)
    values (upper(public.limpiar(p_tipo)), upper(public.limpiar(p_modelo)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_detalles)),
            round(p_costo_usd, 4), round(p_precio_usd, 4))
    returning clave into v_clave;
  end loop;

  perform public.promediar_lote('accesorios', v_clave);
  return p_cantidad;
end;
$$;

-- Edita los datos de un lote entero: todas sus unidades que no esten vendidas
-- (las del local y las que tienen revendedores o clientes). Editar a mano
-- quita la marca de promediado. Devuelve la clave nueva del lote.
-- p_datos: { modelo, capacidad, color, bateria, detalles } o { tipo, modelo, color, detalles }.
create or replace function public.editar_lote(
  p_tabla text, p_clave text, p_datos jsonb, p_costo_usd numeric, p_precio_usd numeric
) returns text language plpgsql set search_path = '' as $$
declare
  v_nueva text;
begin
  perform public.exigir_admin();
  if p_costo_usd is null or p_costo_usd < 0 or p_precio_usd is null or p_precio_usd < 0 then
    raise exception 'El costo y el precio no pueden ser negativos';
  end if;

  if public.tabla_valida(p_tabla) = 'celulares' then
    if public.limpiar(p_datos->>'modelo') = '' then raise exception 'Falta el modelo'; end if;
    -- El UPDATE puede tocar varias filas; todas quedan con la misma clave nueva.
    with cambiadas as (
      update public.celulares
         set modelo = upper(public.limpiar(p_datos->>'modelo')),
             capacidad = upper(public.limpiar(p_datos->>'capacidad')),
             color = upper(public.limpiar(p_datos->>'color')),
             bateria = upper(public.limpiar(p_datos->>'bateria')),
             detalles = upper(public.limpiar(p_datos->>'detalles')),
             costo_usd = round(p_costo_usd, 4), precio_usd = round(p_precio_usd, 4), promediado = false
       where clave = p_clave and estado <> 'vendido'
      returning clave
    )
    select max(clave) into v_nueva from cambiadas;
  else
    if public.limpiar(p_datos->>'tipo') = '' then raise exception 'Falta el tipo de accesorio'; end if;
    -- El UPDATE puede tocar varias filas; todas quedan con la misma clave nueva.
    with cambiadas as (
      update public.accesorios
         set tipo = upper(public.limpiar(p_datos->>'tipo')),
             modelo = upper(public.limpiar(p_datos->>'modelo')),
             color = upper(public.limpiar(p_datos->>'color')),
             detalles = upper(public.limpiar(p_datos->>'detalles')),
             costo_usd = round(p_costo_usd, 4), precio_usd = round(p_precio_usd, 4), promediado = false
       where clave = p_clave and estado <> 'vendido'
      returning clave
    )
    select max(clave) into v_nueva from cambiadas;

    -- Los precios por cantidad siguen al accesorio si le cambio la clave
    -- (salvo que el lote de destino ya tenga los suyos).
    if v_nueva is distinct from p_clave
       and not exists (select 1 from public.escalas_precio where clave = v_nueva) then
      update public.escalas_precio set clave = v_nueva where clave = p_clave;
    end if;
  end if;

  if v_nueva is null then raise exception 'Ese lote ya no existe. Actualizá la página.'; end if;
  return v_nueva;
end;
$$;

-- Cambia (o borra, con texto vacio) el IMEI de un equipo.
create or replace function public.editar_imei(p_id bigint, p_imei text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  update public.celulares set imei = nullif(public.limpiar(p_imei), '') where id = p_id;
  if not found then raise exception 'Ese equipo ya no existe. Actualizá la página.'; end if;
end;
$$;

-- Borra unidades del local (cargadas por error). Nunca borra unidades
-- vendidas ni las que tiene un revendedor o un cliente.
create or replace function public.borrar_unidades(p_tabla text, p_ids bigint[])
returns integer language plpgsql set search_path = '' as $$
declare
  v_hechas integer;
begin
  perform public.exigir_admin();
  execute format('delete from public.%I where id = any($1) and estado = ''disponible''',
                 public.tabla_valida(p_tabla)) using p_ids;
  get diagnostics v_hechas = row_count;
  if v_hechas <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'El stock cambió. Actualizá la página y probá de nuevo.';
  end if;
  return v_hechas;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ventas.
-- ---------------------------------------------------------------------------

-- Una venta: celulares y accesorios juntos, cada unidad con su precio real
-- cobrado en USD. Un accesorio de regalo va con precio 0.
create or replace function public.vender(p_celulares jsonb, p_accesorios jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  v_total integer;
begin
  perform public.exigir_admin();
  v_total := public.pasar_a_vendido('celulares', p_celulares, 'disponible')
           + public.pasar_a_vendido('accesorios', p_accesorios, 'disponible');
  if v_total = 0 then raise exception 'No hay nada para vender'; end if;
  return v_total;
end;
$$;

-- Corrige el precio de unidades ya vendidas.
create or replace function public.editar_venta(p_tabla text, p_ids bigint[], p_precio_usd numeric)
returns integer language plpgsql set search_path = '' as $$
declare
  v_hechas integer;
begin
  perform public.exigir_admin();
  if p_precio_usd is null or p_precio_usd < 0 then raise exception 'El precio no puede ser negativo'; end if;
  execute format('update public.%I set precio_usd = round($2, 4) where id = any($1) and estado = ''vendido''',
                 public.tabla_valida(p_tabla)) using p_ids, p_precio_usd;
  get diagnostics v_hechas = row_count;
  if v_hechas <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'Esa venta cambió. Actualizá la página y probá de nuevo.';
  end if;
  return v_hechas;
end;
$$;

-- Anula ventas: las unidades vuelven al local. Como al vender el precio de
-- lista se piso con el cobrado, al volver toman el precio del lote si quedan
-- unidades iguales en el local; si no, conservan el de la venta.
create or replace function public.anular_venta(p_tabla text, p_ids bigint[])
returns integer language plpgsql set search_path = '' as $$
declare
  v_hechas integer;
begin
  perform public.exigir_admin();
  execute format(
    'update public.%1$I u
        set estado = ''disponible'', fecha_venta = null, cotizacion_venta = null,
            cotizacion_costo = null, revendedor = null, precio_revendedor = null,
            fecha_revendedor = null %2$s,
            precio_usd = coalesce(
              (select round(avg(l.precio_usd), 4) from public.%1$I l
                where l.clave = u.clave and l.estado = ''disponible''),
              u.precio_usd)
      where u.id = any($1) and u.estado = ''vendido''',
    public.tabla_valida(p_tabla),
    case when p_tabla = 'celulares' then ', permuta_usd = null' else '' end) using p_ids;
  get diagnostics v_hechas = row_count;
  if v_hechas <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'Esa venta cambió. Actualizá la página y probá de nuevo.';
  end if;
  return v_hechas;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permuta: el cliente entrega un equipo usado como parte de pago.
-- p_recibido: { modelo, capacidad, color, bateria, detalles, imei, valor_usd, precio_usd }
--   El equipo recibido entra al stock; su valor de toma es su costo.
-- p_entregado_id / p_entregado_precio_usd: opcional, el equipo que se lleva.
--   Su venta guarda en permuta_usd el valor del equipo recibido: como cobrado
--   cuenta solo la diferencia (si no, el total vendido se contaria dos veces).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_permuta(
  p_recibido jsonb, p_entregado_id bigint default null, p_entregado_precio_usd numeric default null
) returns void language plpgsql set search_path = '' as $$
declare
  v_valor numeric := (p_recibido->>'valor_usd')::numeric;
begin
  perform public.exigir_admin();
  if v_valor is null or v_valor < 0 then raise exception 'Falta el valor de toma del equipo recibido'; end if;

  -- Primero se vende el equipo entregado: asi el recibido no puede caer en el
  -- mismo lote y cambiarle el precio antes de la venta.
  if p_entregado_id is not null then
    perform public.pasar_a_vendido(
      'celulares',
      jsonb_build_array(jsonb_build_object('id', p_entregado_id, 'precio_usd', p_entregado_precio_usd)),
      'disponible');
    update public.celulares set permuta_usd = round(v_valor, 4) where id = p_entregado_id;
  end if;

  perform public.ingresar_celulares(
    p_recibido->>'modelo', p_recibido->>'capacidad', p_recibido->>'color',
    p_recibido->>'bateria', p_recibido->>'detalles',
    v_valor, coalesce((p_recibido->>'precio_usd')::numeric, v_valor), 1,
    case when public.limpiar(p_recibido->>'imei') = '' then null else array[p_recibido->>'imei'] end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuentas: revendedores y senas.
-- p_tipo es 'revendedor' o 'sena'. La cuenta se identifica por el nombre de
-- la persona, guardado siempre con la misma escritura.
-- ---------------------------------------------------------------------------

-- Devuelve como esta escrito el nombre si esa persona ya tiene cuenta (para
-- que "juan perez" y "Juan Pérez" sean la misma), o el nombre limpio si es nueva.
create or replace function public.nombre_de_cuenta(p_tipo text, p_nombre text)
returns text language plpgsql stable set search_path = '' as $$
declare
  v_cuenta record;
  v_clave  text := public.normalizar(p_nombre);
  v_nombre text;
begin
  select * into v_cuenta from public.datos_de_cuenta(p_tipo);
  if v_clave = '' then raise exception 'Falta el nombre'; end if;

  if p_tipo = 'revendedor' then
    select nombre into v_nombre from public.revendedores_lista where clave = v_clave;
    if v_nombre is not null then return v_nombre; end if;
  end if;

  select revendedor into v_nombre from public.celulares
   where estado = v_cuenta.estado and public.normalizar(revendedor) = v_clave limit 1;
  if v_nombre is not null then return v_nombre; end if;

  select revendedor into v_nombre from public.accesorios
   where estado = v_cuenta.estado and public.normalizar(revendedor) = v_clave limit 1;
  if v_nombre is not null then return v_nombre; end if;

  execute format('select revendedor from public.%I where not aplicado and public.normalizar(revendedor) = $1 limit 1',
                 v_cuenta.tabla_pagos) into v_nombre using v_clave;
  return coalesce(v_nombre, upper(public.limpiar(p_nombre)));
end;
$$;

-- Lo entregado y todavia no aplicado, en USD (pagos positivos menos descuentos).
create or replace function public.entregado_de_cuenta(p_tipo text, p_nombre text)
returns numeric language plpgsql stable set search_path = '' as $$
declare
  v_total numeric;
begin
  execute format('select coalesce(sum(monto_usd), 0) from public.%I where revendedor = $1 and not aplicado',
                 (public.datos_de_cuenta(p_tipo)).tabla_pagos) into v_total using p_nombre;
  return v_total;
end;
$$;

-- Si lo entregado cubre el valor de los equipos (falta menos de medio centavo
-- de dolar), la cuenta se cierra sola: sus unidades pasan a vendido al precio
-- acordado y sus pagos quedan aplicados.
create or replace function public.cerrar_si_cubierto(p_tipo text, p_nombre text)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_cuenta     record;
  v_celulares  jsonb;
  v_accesorios jsonb;
  v_valor      numeric;
begin
  select * into v_cuenta from public.datos_de_cuenta(p_tipo);

  select jsonb_agg(jsonb_build_object('id', id, 'precio_usd', precio_revendedor)), coalesce(sum(precio_revendedor), 0)
    into v_celulares, v_valor
    from public.celulares where estado = v_cuenta.estado and revendedor = p_nombre;
  select jsonb_agg(jsonb_build_object('id', id, 'precio_usd', precio_revendedor)), v_valor + coalesce(sum(precio_revendedor), 0)
    into v_accesorios, v_valor
    from public.accesorios where estado = v_cuenta.estado and revendedor = p_nombre;

  -- Sin equipos no hay nada que cerrar.
  if v_celulares is null and v_accesorios is null then return false; end if;
  if v_valor - public.entregado_de_cuenta(p_tipo, p_nombre) >= 0.005 then return false; end if;

  perform public.pasar_a_vendido('celulares', v_celulares, v_cuenta.estado);
  perform public.pasar_a_vendido('accesorios', v_accesorios, v_cuenta.estado);
  execute format('update public.%I set aplicado = true where revendedor = $1 and not aplicado',
                 v_cuenta.tabla_pagos) using p_nombre;
  return true;
end;
$$;

-- Guarda un pago en pesos, convertido a USD con la cotizacion de hoy.
create or replace function public.anotar_pago(p_tipo text, p_nombre text, p_monto_ars numeric)
returns void language plpgsql set search_path = '' as $$
declare
  v_venta numeric;
begin
  select cotizacion_dolar into strict v_venta from public.configuracion where id = 1;
  execute format('insert into public.%I (revendedor, monto_ars, cotizacion, monto_usd) values ($1, $2, $3, $4)',
                 (public.datos_de_cuenta(p_tipo)).tabla_pagos)
    using p_nombre, round(p_monto_ars, 4), v_venta, round(p_monto_ars / v_venta, 4);
end;
$$;

-- El carrito: se le entregan equipos a un revendedor (sin pagarlos todavia)
-- o se le reservan a un cliente con una sena. p_celulares y p_accesorios son
-- listas [{ "id": 1, "precio_usd": 400 }] con el precio acordado por unidad.
create or replace function public.entregar_a_cuenta(
  p_tipo text, p_nombre text, p_celulares jsonb, p_accesorios jsonb, p_pago_ars numeric default 0
) returns text language plpgsql set search_path = '' as $$
declare
  v_cuenta record;
  v_nombre text;
  v_items  jsonb;
  v_tabla  text;
  v_hechas integer;
  v_total  integer := 0;
begin
  perform public.exigir_admin();
  select * into v_cuenta from public.datos_de_cuenta(p_tipo);
  v_nombre := public.nombre_de_cuenta(p_tipo, p_nombre);
  if coalesce(p_pago_ars, 0) < 0 then raise exception 'El pago no puede ser negativo'; end if;

  foreach v_tabla in array array['celulares', 'accesorios'] loop
    v_items := coalesce(case when v_tabla = 'celulares' then p_celulares else p_accesorios end, '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements(v_items) e
                where (e->>'precio_usd') is null or (e->>'precio_usd')::numeric < 0) then
      raise exception 'El precio no puede ser negativo';
    end if;

    execute format(
      'update public.%I u
          set estado = $2, revendedor = $3, fecha_revendedor = now(),
              precio_revendedor = round((e->>''precio_usd'')::numeric, 4)
         from jsonb_array_elements($1) e
        where u.id = (e->>''id'')::bigint and u.estado = ''disponible''', v_tabla)
      using v_items, v_cuenta.estado, v_nombre;
    get diagnostics v_hechas = row_count;
    if v_hechas <> jsonb_array_length(v_items) then
      raise exception 'El stock cambió. Actualizá la página y probá de nuevo.';
    end if;
    v_total := v_total + v_hechas;
  end loop;

  if v_total = 0 then raise exception 'El carrito está vacío'; end if;

  -- Un revendedor nuevo queda guardado en la lista.
  if p_tipo = 'revendedor' then
    insert into public.revendedores_lista (nombre, clave)
    values (v_nombre, public.normalizar(v_nombre))
    on conflict (clave) do nothing;
  end if;

  if coalesce(p_pago_ars, 0) > 0 then
    perform public.anotar_pago(p_tipo, v_nombre, p_pago_ars);
  end if;
  perform public.cerrar_si_cubierto(p_tipo, v_nombre);
  return v_nombre;
end;
$$;

-- Registra plata entregada. Devuelve true si con eso la cuenta quedo cerrada.
create or replace function public.registrar_pago(p_tipo text, p_nombre text, p_monto_ars numeric)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_nombre text;
begin
  perform public.exigir_admin();
  if p_monto_ars is null or p_monto_ars <= 0 then raise exception 'El pago tiene que ser mayor que cero'; end if;
  v_nombre := public.nombre_de_cuenta(p_tipo, p_nombre);
  perform public.anotar_pago(p_tipo, v_nombre, p_monto_ars);
  return public.cerrar_si_cubierto(p_tipo, v_nombre);
end;
$$;

-- "Pagado": pasa unidades de una cuenta a vendido al precio acordado.
-- Primero descuenta lo ya entregado, con una fila negativa de pago (para no
-- contar esa plata dos veces); lo que falte se toma como cobrado en el momento.
create or replace function public.marcar_pagado(
  p_tipo text, p_nombre text, p_celulares bigint[], p_accesorios bigint[]
) returns void language plpgsql set search_path = '' as $$
declare
  v_cuenta     record;
  v_celulares  jsonb;
  v_accesorios jsonb;
  v_valor      numeric;
  v_descuento  numeric;
  v_venta      numeric;
  v_quedan     boolean;
begin
  perform public.exigir_admin();
  select * into v_cuenta from public.datos_de_cuenta(p_tipo);

  select jsonb_agg(jsonb_build_object('id', id, 'precio_usd', precio_revendedor)), coalesce(sum(precio_revendedor), 0)
    into v_celulares, v_valor
    from public.celulares
   where id = any(coalesce(p_celulares, '{}')) and estado = v_cuenta.estado and revendedor = p_nombre;
  select jsonb_agg(jsonb_build_object('id', id, 'precio_usd', precio_revendedor)), v_valor + coalesce(sum(precio_revendedor), 0)
    into v_accesorios, v_valor
    from public.accesorios
   where id = any(coalesce(p_accesorios, '{}')) and estado = v_cuenta.estado and revendedor = p_nombre;

  if coalesce(jsonb_array_length(v_celulares), 0) <> coalesce(array_length(p_celulares, 1), 0)
     or coalesce(jsonb_array_length(v_accesorios), 0) <> coalesce(array_length(p_accesorios, 1), 0) then
    raise exception 'La cuenta cambió. Actualizá la página y probá de nuevo.';
  end if;
  if v_celulares is null and v_accesorios is null then raise exception 'No hay equipos para marcar'; end if;

  v_descuento := least(v_valor, greatest(public.entregado_de_cuenta(p_tipo, p_nombre), 0));
  if v_descuento > 0 then
    select cotizacion_dolar into strict v_venta from public.configuracion where id = 1;
    execute format('insert into public.%I (revendedor, monto_ars, cotizacion, monto_usd) values ($1, $2, $3, $4)',
                   v_cuenta.tabla_pagos)
      using p_nombre, -round(v_descuento * v_venta, 4), v_venta, -round(v_descuento, 4);
  end if;

  perform public.pasar_a_vendido('celulares', v_celulares, v_cuenta.estado);
  perform public.pasar_a_vendido('accesorios', v_accesorios, v_cuenta.estado);

  -- Si no le quedan equipos, la cuenta se cierra y sus pagos quedan aplicados.
  select exists (select 1 from public.celulares where estado = v_cuenta.estado and revendedor = p_nombre)
      or exists (select 1 from public.accesorios where estado = v_cuenta.estado and revendedor = p_nombre)
    into v_quedan;
  if not v_quedan then
    execute format('update public.%I set aplicado = true where revendedor = $1 and not aplicado',
                   v_cuenta.tabla_pagos) using p_nombre;
  end if;
end;
$$;

-- "Devolvio" / "Cancelo": las unidades vuelven al local y la deuda baja.
create or replace function public.devolver_unidades(p_tipo text, p_celulares bigint[], p_accesorios bigint[])
returns integer language plpgsql set search_path = '' as $$
declare
  v_cuenta record;
  v_tabla  text;
  v_ids    bigint[];
  v_hechas integer;
  v_total  integer := 0;
begin
  perform public.exigir_admin();
  select * into v_cuenta from public.datos_de_cuenta(p_tipo);

  foreach v_tabla in array array['celulares', 'accesorios'] loop
    v_ids := coalesce(case when v_tabla = 'celulares' then p_celulares else p_accesorios end, '{}');
    execute format(
      'update public.%I set estado = ''disponible'', revendedor = null, precio_revendedor = null, fecha_revendedor = null
        where id = any($1) and estado = $2', v_tabla) using v_ids, v_cuenta.estado;
    get diagnostics v_hechas = row_count;
    if v_hechas <> coalesce(array_length(v_ids, 1), 0) then
      raise exception 'La cuenta cambió. Actualizá la página y probá de nuevo.';
    end if;
    v_total := v_total + v_hechas;
  end loop;
  return v_total;
end;
$$;

-- Corrige el monto de un pago (con monto 0 o NULL lo elimina). El total
-- entregado no puede quedar por debajo de lo ya usado en equipos marcados
-- como pagados. Devuelve true si la cuenta quedo cerrada.
create or replace function public.editar_pago(p_tipo text, p_id bigint, p_monto_ars numeric)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_cuenta record;
  v_nombre text;
begin
  perform public.exigir_admin();
  select * into v_cuenta from public.datos_de_cuenta(p_tipo);
  if p_monto_ars < 0 then raise exception 'El pago no puede ser negativo'; end if;

  if coalesce(p_monto_ars, 0) = 0 then
    execute format('delete from public.%I where id = $1 and not aplicado and monto_usd > 0 returning revendedor',
                   v_cuenta.tabla_pagos) into v_nombre using p_id;
  else
    execute format(
      'update public.%I set monto_ars = round($2, 4), monto_usd = round($2 / cotizacion, 4)
        where id = $1 and not aplicado and monto_usd > 0 returning revendedor',
      v_cuenta.tabla_pagos) into v_nombre using p_id, p_monto_ars;
  end if;
  if v_nombre is null then raise exception 'Ese pago ya no se puede cambiar. Actualizá la página.'; end if;

  if public.entregado_de_cuenta(p_tipo, v_nombre) < -0.00005 then
    raise exception 'No se puede: parte de esa plata ya se usó en equipos marcados como pagados';
  end if;
  return public.cerrar_si_cubierto(p_tipo, v_nombre);
end;
$$;

-- Revendedores guardados: existen aunque no tengan equipos ni deuda.
create or replace function public.guardar_revendedor(p_nombre text, p_celular text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if public.normalizar(p_nombre) = '' then raise exception 'Falta el nombre'; end if;
  insert into public.revendedores_lista (nombre, clave, celular)
  values (upper(public.limpiar(p_nombre)), public.normalizar(p_nombre), public.limpiar(p_celular))
  on conflict (clave) do update set celular = excluded.celular;
end;
$$;

-- No se puede eliminar a quien tiene equipos, debe plata o tiene pagos sin cerrar.
create or replace function public.eliminar_revendedor(p_id bigint)
returns void language plpgsql set search_path = '' as $$
declare
  v_nombre text;
begin
  perform public.exigir_admin();
  select nombre into v_nombre from public.revendedores_lista where id = p_id;
  if v_nombre is null then return; end if;

  if exists (select 1 from public.celulares where estado = 'revendedor' and revendedor = v_nombre)
     or exists (select 1 from public.accesorios where estado = 'revendedor' and revendedor = v_nombre)
     or exists (select 1 from public.pagos_revendedor where revendedor = v_nombre and not aplicado) then
    raise exception 'No se puede eliminar: tiene equipos o pagos sin cerrar';
  end if;
  delete from public.revendedores_lista where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Precios por cantidad de un accesorio. p_tramos: [{ desde, moneda, precio }].
-- Reemplaza la escala completa del lote; con una lista vacia la borra.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_escalas(p_clave text, p_tramos jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.escalas_precio where clave = p_clave;
  insert into public.escalas_precio (clave, desde, moneda, precio)
  select p_clave, (e->>'desde')::integer, e->>'moneda', round((e->>'precio')::numeric, 4)
    from jsonb_array_elements(coalesce(p_tramos, '[]'::jsonb)) e;
exception
  when unique_violation then raise exception 'Hay dos tramos que arrancan en la misma cantidad';
  when check_violation then raise exception 'Revisá los tramos: cantidad desde 1, precio desde 0, moneda pesos o dólares';
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas del panel. Cada una devuelve todo junto en un solo pedido.
-- ---------------------------------------------------------------------------

-- Todo lo que NO esta vendido: stock del local, lo que tienen revendedores y
-- clientes, pagos sin cerrar, escalas y cotizaciones.
create or replace function public.panel_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'configuracion',
      (select jsonb_build_object('cotizacion_dolar', cotizacion_dolar, 'cotizacion_costo', cotizacion_costo)
         from public.configuracion where id = 1),
    'celulares', coalesce((
      select jsonb_agg(f order by f.id) from (
        select id, clave, modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd,
               estado, fecha_ingreso, revendedor, precio_revendedor, fecha_revendedor, promediado
          from public.celulares where estado <> 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f order by f.id) from (
        select id, clave, tipo, modelo, color, detalles, costo_usd, precio_usd,
               estado, fecha_ingreso, revendedor, precio_revendedor, fecha_revendedor, promediado
          from public.accesorios where estado <> 'vendido') f), '[]'::jsonb),
    'escalas', coalesce((
      select jsonb_agg(f order by f.clave, f.desde) from (
        select clave, desde, moneda, precio from public.escalas_precio) f), '[]'::jsonb),
    'revendedores', coalesce((
      select jsonb_agg(f order by f.nombre) from (
        select id, nombre, celular from public.revendedores_lista) f), '[]'::jsonb),
    'pagos_revendedor', coalesce((
      select jsonb_agg(f order by f.fecha) from (
        select id, revendedor, monto_ars, cotizacion, monto_usd, fecha
          from public.pagos_revendedor where not aplicado) f), '[]'::jsonb),
    'pagos_sena', coalesce((
      select jsonb_agg(f order by f.fecha) from (
        select id, revendedor, monto_ars, cotizacion, monto_usd, fecha
          from public.pagos_sena where not aplicado) f), '[]'::jsonb)
  );
end;
$$;

-- El historial: todas las unidades vendidas.
create or replace function public.ventas_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'celulares', coalesce((
      select jsonb_agg(f) from (
        select id, clave, modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, permuta_usd, revendedor
          from public.celulares where estado = 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f) from (
        select id, clave, tipo, modelo, color, detalles, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, revendedor
          from public.accesorios where estado = 'vendido') f), '[]'::jsonb)
  );
end;
$$;

-- Busca equipos por IMEI (completo o una parte) en todos los estados:
-- en el local, vendidos, senados o en manos de un revendedor.
create or replace function public.buscar_imei(p_imei text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_imei text := public.limpiar(p_imei);
begin
  perform public.exigir_admin();
  if char_length(v_imei) < 4 then raise exception 'Escribí al menos 4 dígitos del IMEI'; end if;
  return coalesce((
    select jsonb_agg(f) from (
      select id, clave, modelo, capacidad, color, bateria, detalles, imei, estado, precio_usd,
             fecha_ingreso, fecha_venta, cotizacion_venta, revendedor, precio_revendedor
        from public.celulares
       -- strpos busca el texto tal cual: no interpreta % ni _ como comodines.
       where strpos(imei, v_imei) > 0
       order by fecha_ingreso desc limit 20) f), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- El catalogo publico ahora agrupa por "clave" (ya no hace falta que el
-- frontend junte los lotes) y solo manda las escalas de accesorios que estan
-- en el local. Sigue nombrando las columnas una por una.
-- ---------------------------------------------------------------------------
create or replace function public.catalogo_publico()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'cotizacion',
      (select cotizacion_dolar from public.configuracion where id = 1),

    'celulares',
      coalesce((
        select jsonb_agg(fila)
          from (
            -- (array_agg(x order by id))[1] = el dato tal como esta en la unidad mas vieja del lote.
            select clave,
                   (array_agg(modelo order by id))[1]    as modelo,
                   (array_agg(capacidad order by id))[1] as capacidad,
                   (array_agg(color order by id))[1]     as color,
                   (array_agg(bateria order by id))[1]   as bateria,
                   (array_agg(detalles order by id))[1]  as detalles,
                   count(*)::int   as cantidad,
                   sum(precio_usd) as suma_precio
              from public.celulares
             where estado = 'disponible'
             group by clave
          ) fila
      ), '[]'::jsonb),

    'accesorios',
      coalesce((
        select jsonb_agg(fila)
          from (
            select clave,
                   (array_agg(tipo order by id))[1]     as tipo,
                   (array_agg(modelo order by id))[1]   as modelo,
                   (array_agg(color order by id))[1]    as color,
                   (array_agg(detalles order by id))[1] as detalles,
                   count(*)::int   as cantidad,
                   sum(precio_usd) as suma_precio
              from public.accesorios
             where estado = 'disponible'
             group by clave
          ) fila
      ), '[]'::jsonb),

    'escalas',
      coalesce((
        select jsonb_agg(fila)
          from (
            select clave, desde, moneda, precio
              from public.escalas_precio escala
             where exists (select 1 from public.accesorios accesorio
                            where accesorio.clave = escala.clave and accesorio.estado = 'disponible')
             order by clave, desde
          ) fila
      ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones.
-- Por defecto Postgres deja que cualquiera ejecute una funcion nueva. Aca se
-- le saca ese permiso a los visitantes para TODAS las funciones y se les
-- devuelve solamente el catalogo.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
