-- 20261015000000_mayorista.sql
-- Precio mayorista. Hasta ahora cada lote tenia un solo precio de lista, el
-- que ve el publico en el catalogo. Ahora ademas puede tener un precio
-- mayorista, para vender por mayor y entregar a revendedores.
--   * El precio de lista ("precio_usd") sigue siendo el minorista: el del
--     catalogo y el que se propone en una venta comun. No cambia nada de lo
--     que ya esta cargado.
--   * El mayorista es opcional. Nunca sale por el catalogo publico.
--   * Es un precio del lote: el ultimo que se carga vale para todas sus
--     unidades sin vender.

alter table public.celulares  add column if not exists precio_mayorista_usd numeric(18,4);
alter table public.accesorios add column if not exists precio_mayorista_usd numeric(18,4);

alter table public.celulares drop constraint if exists celulares_mayorista_valido;
alter table public.celulares add constraint celulares_mayorista_valido check (precio_mayorista_usd is null or precio_mayorista_usd >= 0);
alter table public.accesorios drop constraint if exists accesorios_mayorista_valido;
alter table public.accesorios add constraint accesorios_mayorista_valido check (precio_mayorista_usd is null or precio_mayorista_usd >= 0);

-- Deja el precio mayorista del lote parejo en todas sus unidades sin vender.
-- Con un precio, ese queda para todas. Sin precio (NULL), las unidades nuevas
-- toman el que ya tenia el lote, si tenia.
create or replace function public.fijar_mayorista(p_tabla text, p_clave text, p_precio_mayorista_usd numeric)
returns void language plpgsql set search_path = '' as $$
begin
  if p_precio_mayorista_usd is not null then
    execute format('update public.%I set precio_mayorista_usd = round($1, 4) where clave = $2 and estado <> ''vendido''',
                   public.tabla_valida(p_tabla)) using p_precio_mayorista_usd, p_clave;
  else
    execute format(
      'update public.%1$I set precio_mayorista_usd =
         (select max(otra.precio_mayorista_usd) from public.%1$I otra where otra.clave = $1 and otra.estado <> ''vendido'')
        where clave = $1 and estado <> ''vendido'' and precio_mayorista_usd is null',
      public.tabla_valida(p_tabla)) using p_clave;
  end if;
end;
$$;

-- Las cargas de stock aceptan el precio mayorista (al final, con valor por
-- defecto: el sitio publicado sigue andando sin el codigo nuevo).
drop function if exists public.ingresar_celulares(text, text, text, text, text, numeric, numeric, integer, text[], text, bigint);
create or replace function public.ingresar_celulares(
  p_modelo text, p_capacidad text, p_color text, p_bateria text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer,
  p_imeis text[] default null, p_proveedor text default null, p_compra bigint default null,
  p_precio_mayorista_usd numeric default null
) returns integer language plpgsql set search_path = '' as $$
declare
  v_imeis     text[] := coalesce(p_imeis, '{}');
  v_proveedor bigint;
  v_clave     text;
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
  v_proveedor := public.proveedor_por_nombre(p_proveedor);

  for i in 1 .. p_cantidad loop
    insert into public.celulares (modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd, proveedor_id, compra_id)
    values (upper(public.limpiar(p_modelo)), upper(public.limpiar(p_capacidad)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_bateria)),
            upper(public.limpiar(p_detalles)),
            -- v_imeis[i] es NULL cuando no hay un IMEI para esa posicion.
            nullif(public.limpiar(v_imeis[i]), ''),
            round(p_costo_usd, 4), round(p_precio_usd, 4), v_proveedor, p_compra)
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

drop function if exists public.ingresar_accesorios(text, text, text, text, numeric, numeric, integer, text, bigint);
create or replace function public.ingresar_accesorios(
  p_tipo text, p_modelo text, p_color text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer,
  p_proveedor text default null, p_compra bigint default null,
  p_precio_mayorista_usd numeric default null
) returns integer language plpgsql set search_path = '' as $$
declare
  v_proveedor bigint;
  v_clave     text;
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
  v_proveedor := public.proveedor_por_nombre(p_proveedor);

  for i in 1 .. p_cantidad loop
    insert into public.accesorios (tipo, modelo, color, detalles, costo_usd, precio_usd, proveedor_id, compra_id)
    values (upper(public.limpiar(p_tipo)), upper(public.limpiar(p_modelo)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_detalles)),
            round(p_costo_usd, 4), round(p_precio_usd, 4), v_proveedor, p_compra)
    returning clave into v_clave;
  end loop;

  perform public.recordar_opcion('tipo', p_tipo);
  perform public.promediar_lote('accesorios', v_clave);
  perform public.fijar_mayorista('accesorios', v_clave, p_precio_mayorista_usd);
  return p_cantidad;
end;
$$;

-- Un lote de compra: cada modelo puede traer ademas "precio_mayorista_usd".
create or replace function public.ingresar_compra(p_proveedor text, p_nota text, p_celulares jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_compra   bigint;
  v_item     jsonb;
  v_unidades integer := 0;
begin
  perform public.exigir_admin();
  if public.normalizar(p_proveedor) = '' then raise exception 'Elegí el proveedor del lote'; end if;
  if coalesce(jsonb_array_length(p_celulares), 0) = 0 then raise exception 'Agregá al menos un modelo al lote'; end if;

  insert into public.compras (proveedor_id, nota)
  values (public.proveedor_por_nombre(p_proveedor), public.limpiar(p_nota))
  returning id into v_compra;

  for v_item in select value from jsonb_array_elements(p_celulares) loop
    v_unidades := v_unidades + public.ingresar_celulares(
      v_item->>'modelo', v_item->>'capacidad', v_item->>'color', v_item->>'bateria', v_item->>'detalles',
      (v_item->>'costo_usd')::numeric, (v_item->>'precio_usd')::numeric, (v_item->>'cantidad')::integer,
      case when jsonb_typeof(v_item->'imeis') = 'array'
           then array(select jsonb_array_elements_text(v_item->'imeis')) end,
      p_proveedor, v_compra, (v_item->>'precio_mayorista_usd')::numeric);
  end loop;

  return jsonb_build_object('compra', v_compra, 'unidades', v_unidades);
end;
$$;

-- Editar un lote: p_cambiar_mayorista = true para tocar el precio mayorista.
drop function if exists public.editar_lote(text, text, jsonb, numeric, numeric, text);
create or replace function public.editar_lote(
  p_tabla text, p_clave text, p_datos jsonb, p_costo_usd numeric, p_precio_usd numeric,
  p_proveedor text default null, p_precio_mayorista_usd numeric default null,
  p_cambiar_mayorista boolean default false
) returns text language plpgsql set search_path = '' as $$
declare
  v_nueva text;
begin
  perform public.exigir_admin();
  if p_costo_usd is null or p_costo_usd < 0 or p_precio_usd is null or p_precio_usd < 0 then
    raise exception 'El costo y el precio no pueden ser negativos';
  end if;
  if p_precio_mayorista_usd < 0 then raise exception 'El precio mayorista no puede ser negativo'; end if;

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
    perform public.recordar_opcion('modelo', p_datos->>'modelo');
    perform public.recordar_opcion('capacidad', p_datos->>'capacidad');
    perform public.recordar_opcion('color', p_datos->>'color');
  else
    if public.limpiar(p_datos->>'tipo') = '' then raise exception 'Falta el tipo de accesorio'; end if;
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
    perform public.recordar_opcion('tipo', p_datos->>'tipo');

    if v_nueva is distinct from p_clave then
      -- Los precios por cantidad siguen al accesorio si le cambio la clave
      -- (salvo que el lote de destino ya tenga los suyos).
      if not exists (select 1 from public.escalas_precio where clave = v_nueva) then
        update public.escalas_precio set clave = v_nueva where clave = p_clave;
      end if;
      -- Y los combos que lo usan tambien (salvo que el combo ya tenga el de destino).
      update public.combo_partes parte set clave = v_nueva
       where parte.clave = p_clave
         and not exists (select 1 from public.combo_partes otra where otra.combo_id = parte.combo_id and otra.clave = v_nueva);
    end if;
  end if;

  if v_nueva is null then raise exception 'Ese lote ya no existe. Actualizá la página.'; end if;

  if p_proveedor is not null then
    execute format('update public.%I set proveedor_id = $1 where clave = $2 and estado <> ''vendido''', p_tabla)
      using public.proveedor_por_nombre(p_proveedor), v_nueva;
  end if;
  -- El precio mayorista se toca solo si se pidio (NULL = el lote queda sin mayorista).
  if p_cambiar_mayorista then
    execute format('update public.%I set precio_mayorista_usd = round($1, 4) where clave = $2 and estado <> ''vendido''', p_tabla)
      using p_precio_mayorista_usd, v_nueva;
  end if;
  return v_nueva;
end;
$$;

create or replace function public.panel_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'configuracion',
      (select to_jsonb(c) - 'id' from public.configuracion c where id = 1),
    'celulares', coalesce((
      select jsonb_agg(f order by f.id) from (
        select id, clave, modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd,
               estado, fecha_ingreso, revendedor, precio_revendedor, fecha_revendedor, promediado,
               proveedor_id, compra_id, precio_mayorista_usd
          from public.celulares where estado <> 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f order by f.id) from (
        select id, clave, tipo, modelo, color, detalles, costo_usd, precio_usd,
               estado, fecha_ingreso, revendedor, precio_revendedor, fecha_revendedor, promediado,
               proveedor_id, compra_id, precio_mayorista_usd
          from public.accesorios where estado <> 'vendido') f), '[]'::jsonb),
    'escalas', coalesce((
      select jsonb_agg(f order by f.clave, f.desde) from (
        select clave, desde, moneda, precio from public.escalas_precio) f), '[]'::jsonb),
    'revendedores', coalesce((
      select jsonb_agg(f order by f.nombre) from (
        select id, nombre, celular from public.revendedores_lista) f), '[]'::jsonb),
    'pagos_revendedor', coalesce((
      select jsonb_agg(f order by f.fecha) from (
        select id, revendedor, monto_ars, cotizacion, monto_usd, fecha, medio
          from public.pagos_revendedor where not aplicado) f), '[]'::jsonb),
    'pagos_sena', coalesce((
      select jsonb_agg(f order by f.fecha) from (
        select id, revendedor, monto_ars, cotizacion, monto_usd, fecha, medio
          from public.pagos_sena where not aplicado) f), '[]'::jsonb),
    'proveedores', coalesce((
      select jsonb_agg(f order by f.nombre) from (
        select p.id, p.nombre, p.telefono, p.rubro, p.notas,
               (select count(*) from public.celulares u where u.proveedor_id = p.id)::int
               + (select count(*) from public.accesorios u where u.proveedor_id = p.id)::int as unidades,
               coalesce((select sum(m.monto_ars) from public.movimientos_caja m
                          where m.proveedor_id = p.id and m.tipo = 'egreso'), 0) as pagado_ars
          from public.proveedores p) f), '[]'::jsonb),
    'agotados', coalesce((
      select jsonb_agg(f order by f.ultima_venta desc) from (
        select 'celulares' as tabla, clave, null::text as tipo,
               (array_agg(modelo order by id desc))[1] as modelo,
               (array_agg(capacidad order by id desc))[1] as capacidad,
               (array_agg(color order by id desc))[1] as color,
               (array_agg(bateria order by id desc))[1] as bateria,
               (array_agg(detalles order by id desc))[1] as detalles,
               max(fecha_venta) as ultima_venta
          from public.celulares group by clave
        having bool_and(estado = 'vendido') and max(fecha_venta) > now() - interval '30 days'
        union all
        select 'accesorios', clave, (array_agg(tipo order by id desc))[1],
               (array_agg(modelo order by id desc))[1], '',
               (array_agg(color order by id desc))[1], '',
               (array_agg(detalles order by id desc))[1],
               max(fecha_venta)
          from public.accesorios group by clave
        having bool_and(estado = 'vendido') and max(fecha_venta) > now() - interval '30 days') f), '[]'::jsonb),
    'opciones', coalesce((
      select jsonb_agg(f order by f.lista, f.valor) from (
        select lista, valor from public.opciones) f), '[]'::jsonb),
    'combos', coalesce((
      select jsonb_agg(f order by f.nombre) from (
        select c.id, c.nombre, c.precio_usd,
               coalesce((select jsonb_agg(jsonb_build_object('clave', p.clave, 'cantidad', p.cantidad) order by p.clave)
                           from public.combo_partes p where p.combo_id = c.id), '[]'::jsonb) as partes
          from public.combos c) f), '[]'::jsonb),
    -- Las compras de los ultimos 180 dias, la mas nueva primero.
    'compras', coalesce((
      select jsonb_agg(f order by f.id desc) from (
        select c.id, c.fecha, c.proveedor_id, c.nota,
               coalesce((
                 select jsonb_agg(m order by m.modelo, m.capacidad, m.color) from (
                   select u.clave,
                          (array_agg(u.modelo order by u.id))[1] as modelo,
                          (array_agg(u.capacidad order by u.id))[1] as capacidad,
                          (array_agg(u.color order by u.id))[1] as color,
                          (array_agg(u.bateria order by u.id))[1] as bateria,
                          count(*)::int as unidades,
                          count(*) filter (where u.estado <> 'vendido' and u.imei is null)::int as sin_imei,
                          sum(u.costo_usd) as costo_usd
                     from public.celulares u where u.compra_id = c.id
                    group by u.clave) m), '[]'::jsonb) as modelos
          from public.compras c
         where c.fecha > now() - interval '180 days') f), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
