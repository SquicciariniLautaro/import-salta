-- 20261117000000_lista_compartir.sql
-- Lo que pidio Import Salta: un boton en el catalogo que arme la lista
-- completa (celulares o accesorios) para mandar por WhatsApp, y que el dueno
-- pueda elegir que dice ese mensaje.
--
--   * En Ajustes el dueno escribe el texto de arriba y el de abajo de la
--     lista, y elige que datos van en cada renglon (color, bateria, detalles,
--     precio en efectivo) y si al final van las cuotas y el link del catalogo.
--   * El catalogo publico trae esas opciones ("lista") para armar el mensaje.
--     Antes de mandarlo, quien toca el boton lo puede retocar.
--
-- Como siempre: el panel no escribe en las tablas, llama a funciones. Todo se
-- puede correr dos veces sin romper nada.

-- ---------------------------------------------------------------------------
-- Las opciones de la lista, en la unica fila de "configuracion".
-- { "encabezado": texto de arriba, "pie": texto de abajo,
--   "color", "bateria", "detalles", "efectivo", "cuotas", "enlace": true/false }
-- ---------------------------------------------------------------------------
alter table public.configuracion
  add column if not exists lista_compartir jsonb not null default
    '{"encabezado": "*Import Salta* · Lista de precios", "pie": "", "color": true, "bateria": true,
      "detalles": true, "efectivo": true, "cuotas": true, "enlace": true}'::jsonb;

alter table public.configuracion drop constraint if exists configuracion_lista_compartir_valida;
alter table public.configuracion add constraint configuracion_lista_compartir_valida check (
  jsonb_typeof(lista_compartir) = 'object'
);

-- Un texto de varios renglones: sin espacios de mas, pero respetando los
-- renglones (como mucho uno en blanco seguido).
create or replace function public.limpiar_renglones(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(replace(coalesce(p_texto, ''), E'\r', ''), E'[ \t]+', ' ', 'g'),
        E' *\n *', E'\n', 'g'),
      E'\n{3,}', E'\n\n', 'g'),
    E' \n');
$$;

-- Revisa las opciones de la lista. Lo que no viene queda en su valor de
-- fabrica: textos vacios y todos los datos prendidos.
create or replace function public.limpiar_lista_compartir(p_lista jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_encabezado text;
  v_pie        text;
begin
  if p_lista is null or jsonb_typeof(p_lista) <> 'object' then raise exception 'Las opciones de la lista no son válidas'; end if;
  v_encabezado := public.limpiar_renglones(p_lista->>'encabezado');
  v_pie := public.limpiar_renglones(p_lista->>'pie');
  if char_length(v_encabezado) > 300 then raise exception 'El texto de arriba de la lista es muy largo (hasta 300 letras)'; end if;
  if char_length(v_pie) > 500 then raise exception 'El texto de abajo de la lista es muy largo (hasta 500 letras)'; end if;
  return jsonb_build_object(
    'encabezado', v_encabezado,
    'pie', v_pie,
    'color', coalesce((p_lista->>'color')::boolean, true),
    'bateria', coalesce((p_lista->>'bateria')::boolean, true),
    'detalles', coalesce((p_lista->>'detalles')::boolean, true),
    'efectivo', coalesce((p_lista->>'efectivo')::boolean, true),
    'cuotas', coalesce((p_lista->>'cuotas')::boolean, true),
    'enlace', coalesce((p_lista->>'enlace')::boolean, true));
exception
  when invalid_text_representation then raise exception 'Las opciones de la lista no son válidas';
end;
$$;

-- Igual que antes, mas las opciones de la lista para compartir.
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
    lista_compartir          = case when p_datos ? 'lista_compartir'
                                    then public.limpiar_lista_compartir(p_datos->'lista_compartir') else lista_compartir end,
    descuento_efectivo_celulares  = coalesce(public.leer_descuento(p_datos->>'descuento_efectivo_celulares'), descuento_efectivo_celulares),
    descuento_efectivo_accesorios = coalesce(public.leer_descuento(p_datos->>'descuento_efectivo_accesorios'), descuento_efectivo_accesorios)
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- El catalogo publico, igual que antes, mas las opciones de la lista para
-- compartir ("lista"). Son datos publicos: es lo que se manda por WhatsApp.
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

    'lista',
      (select lista_compartir from public.configuracion where id = 1),

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
