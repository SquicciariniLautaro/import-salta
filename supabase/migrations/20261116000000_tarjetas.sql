-- 20261116000000_tarjetas.sql
-- Lo que pidio Import Salta: elegir con que tarjeta paga el cliente (Visa,
-- Mastercard, Naranja...), porque a el cada tarjeta le cuesta distinto.
--
--   * En Ajustes, en vez de una sola lista de cuotas, se arman tarjetas (o
--     grupos de tarjetas: "Visa / Mastercard", "Naranja"). Cada una tiene su
--     recargo en 1 pago y sus propios planes de cuotas con su recargo.
--   * Al cobrar se elige la tarjeta y despues las cuotas: el recargo sale de
--     esa tarjeta. La venta guarda con que tarjeta se pago (sale en el ticket
--     y en el historial de ventas).
--   * El catalogo muestra las cuotas de cada tarjeta.
--
-- Se mantiene "cuotas_planes" como copia de los planes de la primera tarjeta,
-- para que el panel de antes siga andando mientras se publica el nuevo.
--
-- Como siempre: el panel no escribe en las tablas, llama a funciones. Todo se
-- puede correr dos veces sin romper nada.

-- ---------------------------------------------------------------------------
-- Las tarjetas, en la unica fila de "configuracion".
-- [{ "nombre": "Visa / Mastercard", "un_pago": 0,
--    "planes": [{ "cuotas": 3, "recargo": 0 }, ...] }, ...]
-- "un_pago" es el recargo (%) pagando en 1 pago con esa tarjeta. La primera
-- tarjeta es la que se propone al cobrar.
-- ---------------------------------------------------------------------------
alter table public.configuracion
  add column if not exists tarjetas jsonb not null default '[]'::jsonb;

alter table public.configuracion drop constraint if exists configuracion_tarjetas_validas;
alter table public.configuracion add constraint configuracion_tarjetas_validas check (
  jsonb_typeof(tarjetas) = 'array' and jsonb_array_length(tarjetas) <= 8
);

-- Las tarjetas con las que arranca:
--   * Los planes que ya estaban cargados pasan a ser los de "Visa / Mastercard".
--   * Naranja, como la pidio el dueno: 3 cuotas con 24 % y 6 cuotas con 43 %
--     (en 1 pago sin recargo). Despues lo cambia el en Ajustes.
-- Solo si todavia no hay tarjetas: correrla de nuevo no pisa lo que el dueno
-- cargo. Si no habia planes, Naranja queda primera y sus planes van a
-- "cuotas_planes" (la copia de la primera tarjeta).
update public.configuracion
   set tarjetas =
         case when jsonb_array_length(cuotas_planes) > 0
              then jsonb_build_array(jsonb_build_object('nombre', 'Visa / Mastercard', 'un_pago', 0, 'planes', cuotas_planes))
              else '[]'::jsonb end
         || jsonb_build_array(jsonb_build_object('nombre', 'Naranja', 'un_pago', 0,
              'planes', '[{"cuotas": 3, "recargo": 24}, {"cuotas": 6, "recargo": 43}]'::jsonb)),
       cuotas_planes =
         case when jsonb_array_length(cuotas_planes) > 0 then cuotas_planes
              else '[{"cuotas": 3, "recargo": 24}, {"cuotas": 6, "recargo": 43}]'::jsonb end
 where id = 1 and tarjetas = '[]'::jsonb;

-- Revisa una lista de tarjetas: cada una con nombre (sin repetir), recargo en
-- 1 pago de 0 a 300 % y sus planes (ver limpiar_cuotas()). Respeta el orden.
create or replace function public.limpiar_tarjetas(p_tarjetas jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_tarjeta jsonb;
  v_nombre  text;
  v_un_pago numeric;
  v_vistos  text[] := '{}';
  v_lista   jsonb := '[]'::jsonb;
begin
  if p_tarjetas is null or jsonb_typeof(p_tarjetas) <> 'array' then raise exception 'Las tarjetas no son válidas'; end if;
  if jsonb_array_length(p_tarjetas) > 8 then raise exception 'Como máximo 8 tarjetas'; end if;
  for v_tarjeta in select * from jsonb_array_elements(p_tarjetas) loop
    if jsonb_typeof(v_tarjeta) <> 'object' then raise exception 'Las tarjetas no son válidas'; end if;
    v_nombre := public.limpiar(v_tarjeta->>'nombre');
    if v_nombre = '' then raise exception 'Hay una tarjeta sin nombre'; end if;
    if char_length(v_nombre) > 40 then raise exception 'El nombre de la tarjeta % es muy largo', v_nombre; end if;
    if upper(v_nombre) = any (v_vistos) then raise exception 'La tarjeta % está repetida', v_nombre; end if;
    v_vistos := v_vistos || upper(v_nombre);
    begin
      v_un_pago := round(coalesce((v_tarjeta->>'un_pago')::numeric, 0), 2);
    exception
      when invalid_text_representation then raise exception 'El recargo en 1 pago de % no es un número', v_nombre;
    end;
    if v_un_pago < 0 or v_un_pago > 300 then raise exception 'El recargo va de 0 %% a 300 %%'; end if;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object(
      'nombre', v_nombre,
      'un_pago', v_un_pago,
      'planes', public.limpiar_cuotas(coalesce(v_tarjeta->'planes', '[]'::jsonb))));
  end loop;
  return v_lista;
end;
$$;

-- Igual que antes, mas las tarjetas. Con "tarjetas" se guardan las tarjetas y
-- "cuotas_planes" queda con los planes de la primera. El panel de antes manda
-- "cuotas_planes": esos pasan a ser los planes de la primera tarjeta.
create or replace function public.guardar_ajustes(p_datos jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_tarjetas jsonb;
  v_planes   jsonb;
begin
  perform public.exigir_admin();
  select tarjetas, cuotas_planes into v_tarjetas, v_planes from public.configuracion where id = 1;
  if p_datos ? 'tarjetas' then
    v_tarjetas := public.limpiar_tarjetas(p_datos->'tarjetas');
    v_planes := coalesce(v_tarjetas->0->'planes', '[]'::jsonb);
  elsif p_datos ? 'cuotas_planes' then
    v_planes := public.limpiar_cuotas(p_datos->'cuotas_planes');
    if jsonb_array_length(v_tarjetas) > 0 then
      v_tarjetas := jsonb_set(v_tarjetas, '{0,planes}', v_planes);
    elsif jsonb_array_length(v_planes) > 0 then
      v_tarjetas := jsonb_build_array(jsonb_build_object('nombre', 'Visa / Mastercard', 'un_pago', 0, 'planes', v_planes));
    end if;
  end if;

  update public.configuracion set
    negocio_nombre           = public.limpiar(coalesce(p_datos->>'negocio_nombre', negocio_nombre)),
    negocio_direccion        = public.limpiar(coalesce(p_datos->>'negocio_direccion', negocio_direccion)),
    negocio_telefono         = public.limpiar(coalesce(p_datos->>'negocio_telefono', negocio_telefono)),
    negocio_cuit             = public.limpiar(coalesce(p_datos->>'negocio_cuit', negocio_cuit)),
    ticket_pie               = public.limpiar(coalesce(p_datos->>'ticket_pie', ticket_pie)),
    ticket_condiciones       = public.limpiar(coalesce(p_datos->>'ticket_condiciones', ticket_condiciones)),
    ticket_duplicado         = coalesce((p_datos->>'ticket_duplicado')::boolean, ticket_duplicado),
    garantia_dias_celulares  = coalesce((p_datos->>'garantia_dias_celulares')::integer, garantia_dias_celulares),
    garantia_dias_accesorios = coalesce((p_datos->>'garantia_dias_accesorios')::integer, garantia_dias_accesorios),
    garantia_dias_servicio   = coalesce((p_datos->>'garantia_dias_servicio')::integer, garantia_dias_servicio),
    aviso_celulares          = coalesce((p_datos->>'aviso_celulares')::integer, aviso_celulares),
    aviso_accesorios         = coalesce((p_datos->>'aviso_accesorios')::integer, aviso_accesorios),
    ticket_ancho_mm          = coalesce((p_datos->>'ticket_ancho_mm')::integer, ticket_ancho_mm),
    ticket_alto_mm           = coalesce((p_datos->>'ticket_alto_mm')::integer, ticket_alto_mm),
    etiqueta_ancho_mm        = coalesce((p_datos->>'etiqueta_ancho_mm')::integer, etiqueta_ancho_mm),
    etiqueta_alto_mm         = coalesce((p_datos->>'etiqueta_alto_mm')::integer, etiqueta_alto_mm),
    tarjetas                 = v_tarjetas,
    cuotas_planes            = v_planes,
    cuotas_leyenda           = public.limpiar(coalesce(p_datos->>'cuotas_leyenda', cuotas_leyenda)),
    cuotas_accesorios        = coalesce((p_datos->>'cuotas_accesorios')::boolean, cuotas_accesorios),
    revision_puntos          = case when p_datos ? 'revision_puntos'
                                    then public.limpiar_puntos(p_datos->'revision_puntos') else revision_puntos end,
    acta_condiciones         = public.limpiar(coalesce(p_datos->>'acta_condiciones', acta_condiciones)),
    descuento_efectivo_celulares  = coalesce(public.leer_descuento(p_datos->>'descuento_efectivo_celulares'), descuento_efectivo_celulares),
    descuento_efectivo_accesorios = coalesce(public.leer_descuento(p_datos->>'descuento_efectivo_accesorios'), descuento_efectivo_accesorios)
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Con que tarjeta se pago cada venta. Se guarda el nombre tal como estaba en
-- Ajustes ese dia: si despues se renombra o se borra la tarjeta, la venta
-- sigue diciendo con cual se pago. Vacio en las ventas de antes.
-- ---------------------------------------------------------------------------
alter table public.comprobantes
  add column if not exists tarjeta text;

alter table public.comprobantes drop constraint if exists comprobantes_tarjeta_valida;
alter table public.comprobantes add constraint comprobantes_tarjeta_valida check (
  tarjeta is null or (medio = 'tarjeta' and char_length(tarjeta) between 1 and 40)
);

-- La tarjeta de un cobro. NULL si no es con tarjeta o si no se dijo cual.
create or replace function public.leer_tarjeta(p_datos jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_nombre text;
begin
  if coalesce(p_datos->>'medio', '') <> 'tarjeta' then return null; end if;
  v_nombre := public.limpiar(p_datos->>'tarjeta');
  if v_nombre = '' then return null; end if;
  if char_length(v_nombre) > 40 then raise exception 'El nombre de la tarjeta es muy largo'; end if;
  return v_nombre;
end;
$$;

-- Igual que antes, mas la tarjeta.
create or replace function public.crear_comprobante(p_origen text, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_cobro  record;
  v_cuotas record;
  v_debe   numeric := round(coalesce((p_datos->>'debe_ars')::numeric, 0), 4);
  v_id     bigint;
begin
  select * into v_cobro from public.leer_cobro(p_datos);
  select * into v_cuotas from public.leer_cuotas(p_datos);
  if v_debe < 0 then raise exception 'Lo que queda debiendo no puede ser negativo'; end if;
  if v_debe > 0 and public.normalizar(p_datos->>'cliente') = '' then
    raise exception 'Para dejar una deuda hace falta el nombre del cliente';
  end if;
  insert into public.comprobantes (origen, cliente, telefono, medio, efectivo_ars, nota, cliente_id, debe_ars, vendedor,
                                   cuotas, recargo_pct, tarjeta)
  values (p_origen, upper(public.limpiar(p_datos->>'cliente')), public.limpiar(p_datos->>'telefono'),
          v_cobro.medio, v_cobro.efectivo_ars, public.limpiar(p_datos->>'nota'),
          public.cliente_por_nombre(p_datos->>'cliente', p_datos->>'telefono'), v_debe,
          left(upper(public.limpiar(p_datos->>'vendedor')), 80),
          v_cuotas.cuotas, v_cuotas.recargo_pct, public.leer_tarjeta(p_datos))
  returning id into v_id;
  return v_id;
end;
$$;

-- Igual que antes, mas la tarjeta: al cambiar el medio de pago se cambia
-- tambien (y se borra si ya no es con tarjeta).
create or replace function public.editar_comprobante(p_id bigint, p_datos jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_cobro   record;
  v_cuotas  record;
  v_tarjeta text;
  v_cliente bigint;
begin
  perform public.exigir_admin();
  select * into v_cobro from public.leer_cobro(p_datos);
  select * into v_cuotas from public.leer_cuotas(p_datos);
  v_tarjeta := public.leer_tarjeta(p_datos);
  v_cliente := public.cliente_por_nombre(p_datos->>'cliente', p_datos->>'telefono');
  if v_cliente is null and exists (select 1 from public.cuenta_clientes where comprobante_id = p_id) then
    raise exception 'Esta venta dejó una deuda: no se le puede sacar el cliente';
  end if;
  update public.comprobantes
     set cliente = upper(public.limpiar(p_datos->>'cliente')),
         telefono = public.limpiar(p_datos->>'telefono'),
         nota = public.limpiar(coalesce(p_datos->>'nota', nota)),
         medio = case when origen in ('mostrador', 'permuta') then v_cobro.medio else medio end,
         efectivo_ars = case when origen in ('mostrador', 'permuta') then v_cobro.efectivo_ars else efectivo_ars end,
         cuotas = case when origen in ('mostrador', 'permuta') then v_cuotas.cuotas else cuotas end,
         recargo_pct = case when origen in ('mostrador', 'permuta') then v_cuotas.recargo_pct else recargo_pct end,
         tarjeta = case when origen in ('mostrador', 'permuta') then v_tarjeta else tarjeta end,
         cliente_id = case when origen in ('mostrador', 'permuta') then v_cliente else cliente_id end
   where id = p_id;
  if not found then raise exception 'Ese comprobante ya no existe. Actualizá la página.'; end if;
  update public.cuenta_clientes set cliente_id = v_cliente where comprobante_id = p_id and v_cliente is not null;
end;
$$;

-- Igual que antes, mas la tarjeta del comprobante.
create or replace function public.comprobante_datos(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_resultado jsonb;
begin
  perform public.exigir_admin();
  select jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'origen', c.origen, 'cliente', c.cliente, 'telefono', c.telefono,
    'medio', c.medio, 'efectivo_ars', c.efectivo_ars, 'nota', c.nota, 'debe_ars', c.debe_ars,
    'vendedor', c.vendedor, 'cuotas', c.cuotas, 'recargo_pct', c.recargo_pct, 'tarjeta', c.tarjeta,
    'celulares', coalesce((
      select jsonb_agg(f order by f.id) from (
        select id, clave, modelo, capacidad, color, bateria, detalles, imei, precio_usd, permuta_usd,
               cotizacion_venta, garantia_dias, fecha_venta
          from public.celulares where comprobante_id = c.id and estado = 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f order by f.id) from (
        select id, clave, tipo, modelo, color, detalles, precio_usd, cotizacion_venta, garantia_dias, fecha_venta
          from public.accesorios where comprobante_id = c.id and estado = 'vendido') f), '[]'::jsonb))
    into v_resultado
    from public.comprobantes c where c.id = p_id;
  if v_resultado is null then raise exception 'Ese comprobante ya no existe. Actualizá la página.'; end if;
  return v_resultado;
end;
$$;

-- Igual que antes, mas la tarjeta de cada venta.
create or replace function public.ventas_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'celulares', coalesce((
      select jsonb_agg(f) from (
        select id, clave, modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, permuta_usd, revendedor,
               comprobante_id, garantia_dias, fecha_ingreso
          from public.celulares where estado = 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f) from (
        select id, clave, tipo, modelo, color, detalles, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, revendedor,
               comprobante_id, garantia_dias, fecha_ingreso
          from public.accesorios where estado = 'vendido') f), '[]'::jsonb),
    'comprobantes', coalesce((
      select jsonb_agg(f) from (
        select id, fecha, origen, cliente, telefono, medio, efectivo_ars, nota, cliente_id, debe_ars,
               vendedor, cuotas, recargo_pct, tarjeta
          from public.comprobantes) f), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- El catalogo publico, igual que antes, mas las tarjetas con sus cuotas
-- ("cuotas": { ..., tarjetas: [{ nombre, un_pago, planes }] }). Son datos
-- publicos. "planes" sigue siendo el de la primera tarjeta.
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

    'cuotas',
      (select jsonb_build_object('planes', cuotas_planes, 'leyenda', cuotas_leyenda, 'accesorios', cuotas_accesorios,
                            'tarjetas', tarjetas)
         from public.configuracion where id = 1),

    'efectivo',
      (select jsonb_build_object('celulares', descuento_efectivo_celulares, 'accesorios', descuento_efectivo_accesorios)
         from public.configuracion where id = 1),

    'celulares',
      coalesce((
        select jsonb_agg(fila)
          from (
            select celular.clave,
                   (array_agg(modelo order by id))[1]    as modelo,
                   (array_agg(capacidad order by id))[1] as capacidad,
                   (array_agg(color order by id))[1]     as color,
                   (array_agg(bateria order by id))[1]   as bateria,
                   (array_agg(detalles order by id))[1]  as detalles,
                   count(*)::int   as cantidad,
                   sum(precio_usd) as suma_precio,
                   (select imagen.url from public.imagenes imagen
                     where imagen.tabla = 'celulares' and imagen.clave = celular.clave) as imagen
              from public.celulares celular
             where estado = 'disponible' and precio_usd > 0
             group by celular.clave
          ) fila
      ), '[]'::jsonb),

    'accesorios',
      coalesce((
        select jsonb_agg(fila)
          from (
            select accesorio.clave,
                   (array_agg(tipo order by id))[1]     as tipo,
                   (array_agg(modelo order by id))[1]   as modelo,
                   (array_agg(color order by id))[1]    as color,
                   (array_agg(detalles order by id))[1] as detalles,
                   count(*)::int   as cantidad,
                   sum(precio_usd) as suma_precio,
                   (select imagen.url from public.imagenes imagen
                     where imagen.tabla = 'accesorios' and imagen.clave = accesorio.clave) as imagen
              from public.accesorios accesorio
             where estado = 'disponible' and precio_usd > 0
             group by accesorio.clave
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
      ), '[]'::jsonb),

    'combos',
      coalesce((
        select jsonb_agg(fila order by fila.nombre)
          from (
            select 'COMBO|' || combo.id as clave,
                   combo.nombre,
                   string_agg(case when parte.cantidad > 1 then parte.cantidad || ' x ' else '' end || stock.descripcion,
                              ' + ' order by stock.descripcion) as detalle,
                   -- Cuantos combos completos se pueden armar: lo que alcanza la parte mas escasa.
                   min(stock.disponibles / parte.cantidad)::int as cantidad,
                   combo.precio_usd as precio
              from public.combos combo
              join public.combo_partes parte on parte.combo_id = combo.id
              cross join lateral (
                select count(*)::int as disponibles,
                       coalesce((array_agg(concat_ws(' ', accesorio.tipo, nullif(accesorio.modelo, '')) order by accesorio.id))[1], '') as descripcion
                  from public.accesorios accesorio
                 where accesorio.clave = parte.clave and accesorio.estado = 'disponible'
              ) stock
             group by combo.id
            having min(stock.disponibles / parte.cantidad) > 0
          ) fila
      ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
