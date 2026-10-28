-- 20261028000000_descuento_efectivo.sql
-- Lo que pidio Import Salta:
--   * Precio con tarjeta y precio en efectivo: el precio cargado en el stock
--     es el precio con tarjeta, y pagando en efectivo se le descuenta un
--     porcentaje (10 %, 20 %, 30 %...). El dueno lo elige en Ajustes: uno para
--     los celulares y otro para los accesorios (los combos usan el de los
--     accesorios). 0 = sin descuento. El catalogo muestra los dos precios.
--   * Ya no se cobra solo en el local (va a cobrar tambien enviando un QR):
--     el texto de las cuotas deja de decir "en el local con posnet".
--
-- Como siempre: el panel no escribe en las tablas, llama a funciones. Todo se
-- puede correr dos veces sin romper nada.

-- ---------------------------------------------------------------------------
-- Ajustes nuevos en la unica fila de "configuracion".
-- ---------------------------------------------------------------------------
alter table public.configuracion
  -- Porcentaje que se descuenta del precio pagando en efectivo (0 = sin descuento).
  add column if not exists descuento_efectivo_celulares  integer not null default 0,
  add column if not exists descuento_efectivo_accesorios integer not null default 0;

alter table public.configuracion drop constraint if exists configuracion_descuento_efectivo_valido;
alter table public.configuracion add constraint configuracion_descuento_efectivo_valido check (
      descuento_efectivo_celulares between 0 and 90
  and descuento_efectivo_accesorios between 0 and 90
);

-- El texto de las cuotas ya no dice "en el local". Solo se cambia si sigue el
-- que venia de fabrica: si el dueno escribio otro en Ajustes, queda el suyo.
alter table public.configuracion alter column cuotas_leyenda set default 'Con tarjeta de crédito bancaria.';
update public.configuracion
   set cuotas_leyenda = 'Con tarjeta de crédito bancaria.'
 where cuotas_leyenda = 'Con tarjeta de crédito bancaria. Se abona en el local con posnet Payway.';

-- Revisa un porcentaje de descuento: entero de 0 a 90. NULL = no se cambia.
create or replace function public.leer_descuento(p_valor text)
returns integer language plpgsql immutable set search_path = '' as $$
declare
  v_numero numeric;
begin
  if p_valor is null then return null; end if;
  v_numero := p_valor::numeric;
  if v_numero <> round(v_numero) or v_numero < 0 or v_numero > 90 then
    raise exception 'El descuento en efectivo va de 0 %% a 90 %%, sin decimales';
  end if;
  return v_numero::integer;
exception
  when invalid_text_representation then raise exception 'El descuento en efectivo va de 0 %% a 90 %%, sin decimales';
end;
$$;

-- Igual que antes, mas los descuentos en efectivo.
create or replace function public.guardar_ajustes(p_datos jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
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
    cuotas_planes            = case when p_datos ? 'cuotas_planes'
                                    then public.limpiar_cuotas(p_datos->'cuotas_planes') else cuotas_planes end,
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
-- El catalogo publico, igual que antes, mas los descuentos en efectivo
-- ("efectivo": { celulares, accesorios }, en %). Son datos publicos.
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
      (select jsonb_build_object('planes', cuotas_planes, 'leyenda', cuotas_leyenda, 'accesorios', cuotas_accesorios)
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
