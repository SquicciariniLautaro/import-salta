-- 20261014000000_lotes.sql
-- Lo que pidio el cliente despues de probar el boceto:
--   * Lotes de compra: se elige un proveedor y se cargan de una vez todos los
--     celulares que vinieron en esa compra (cada modelo con su color, bateria,
--     costo y precio). Cada unidad recuerda de que compra vino.
--   * Carga rapida de IMEI: los IMEI de un lote se pueden cargar despues, de
--     corrido o pegando una lista, y la base se los reparte a los equipos que
--     todavia no tienen.
--   * Listas de opciones: los modelos, capacidades, colores y tipos de
--     accesorio de los desplegables pasan a la base, para que el dueno agregue
--     o saque los que quiera (por ejemplo, el iPhone 18).
--   * Editar un lote permite poner o cambiar el proveedor.
--   * Combos: varios accesorios que se venden juntos a un precio (fuente +
--     cable). El catalogo los muestra mientras haya stock de todas sus partes.
--
-- Igual que en la migracion anterior, las funciones que cambian sus
-- parametros se borran primero ("drop function if exists" con la lista
-- vieja). Los parametros nuevos tienen valor por defecto: el sitio publicado
-- sigue andando con esta base aunque todavia no tenga el codigo nuevo.

-- ---------------------------------------------------------------------------
-- compras: un lote que se le compro a un proveedor. Su "id" es el numero de lote.
-- ---------------------------------------------------------------------------
create table if not exists public.compras (
  id           bigint generated always as identity primary key,
  fecha        timestamptz not null default now(),
  proveedor_id bigint references public.proveedores (id) on delete set null,
  nota         text        not null default '',
  constraint compras_largos check (char_length(nota) <= 300)
);

alter table public.celulares  add column if not exists compra_id bigint references public.compras (id) on delete set null;
alter table public.accesorios add column if not exists compra_id bigint references public.compras (id) on delete set null;
create index if not exists celulares_compra on public.celulares (compra_id);
create index if not exists accesorios_compra on public.accesorios (compra_id);

-- ---------------------------------------------------------------------------
-- opciones: lo que aparece en los desplegables de carga. Antes estaba fijo en
-- el codigo; ahora lo maneja el dueno desde Ajustes. Todo en mayusculas.
-- ---------------------------------------------------------------------------
create table if not exists public.opciones (
  id    bigint generated always as identity primary key,
  lista text not null,
  valor text not null,
  constraint opciones_lista_valida check (lista in ('modelo', 'capacidad', 'color', 'tipo')),
  constraint opciones_largo check (char_length(valor) between 1 and 80),
  constraint opciones_unica unique (lista, valor)
);

-- Las listas de arranque, mas los modelos nuevos. "on conflict do nothing"
-- permite correr la migracion dos veces sin duplicar nada.
insert into public.opciones (lista, valor)
select 'modelo', valor from unnest(array[
  'IPHONE 11', 'IPHONE 11 PRO', 'IPHONE 11 PRO MAX',
  'IPHONE 12', 'IPHONE 12 MINI', 'IPHONE 12 PRO', 'IPHONE 12 PRO MAX',
  'IPHONE 13', 'IPHONE 13 MINI', 'IPHONE 13 PRO', 'IPHONE 13 PRO MAX',
  'IPHONE 14', 'IPHONE 14 PLUS', 'IPHONE 14 PRO', 'IPHONE 14 PRO MAX',
  'IPHONE 15', 'IPHONE 15 PLUS', 'IPHONE 15 PRO', 'IPHONE 15 PRO MAX',
  'IPHONE 16', 'IPHONE 16 PLUS', 'IPHONE 16 PRO', 'IPHONE 16 PRO MAX', 'IPHONE 16E',
  'IPHONE 17', 'IPHONE 17 PRO', 'IPHONE 17 PRO MAX', 'IPHONE AIR',
  'IPHONE 18', 'IPHONE 18 PRO', 'IPHONE 18 PRO MAX',
  'IPHONE SE', 'IPHONE XR', 'IPHONE XS', 'IPHONE XS MAX'
]) as valor
union all
select 'capacidad', valor from unnest(array['64GB', '128GB', '256GB', '512GB', '1TB', '2TB']) as valor
union all
select 'color', valor from unnest(array[
  'NEGRO', 'BLANCO', 'AZUL', 'ROJO', 'VERDE', 'ROSA', 'VIOLETA', 'AMARILLO', 'NARANJA',
  'DORADO', 'PLATA', 'GRAFITO', 'MEDIANOCHE', 'BLANCO ESTELAR',
  'TITANIO NATURAL', 'TITANIO NEGRO', 'TITANIO BLANCO', 'TITANIO AZUL', 'TITANIO DESIERTO'
]) as valor
union all
select 'tipo', valor from unnest(array[
  'FUNDA', 'VIDRIO TEMPLADO', 'FUENTE', 'CARGADOR', 'CABLE USB-C', 'CABLE LIGHTNING',
  'CABLE USB-C A LIGHTNING', 'AURICULARES', 'ADAPTADOR'
]) as valor
on conflict (lista, valor) do nothing;

-- Lo que ya esta cargado en el stock tambien queda en las listas.
insert into public.opciones (lista, valor)
select 'modelo', modelo from public.celulares where modelo <> ''
union select 'capacidad', capacidad from public.celulares where capacidad <> ''
union select 'color', color from public.celulares where color <> ''
union select 'tipo', tipo from public.accesorios where tipo <> ''
on conflict (lista, valor) do nothing;

-- ---------------------------------------------------------------------------
-- combos: accesorios que se venden juntos a un precio. Cada parte apunta a un
-- lote de accesorios por su "clave" (como los precios por cantidad).
-- ---------------------------------------------------------------------------
create table if not exists public.combos (
  id         bigint generated always as identity primary key,
  nombre     text          not null,
  clave      text          not null unique,               -- nombre normalizado
  precio_usd numeric(18,4) not null default 0,
  constraint combos_precio_valido check (precio_usd >= 0),
  constraint combos_largo check (char_length(nombre) between 1 and 80)
);

create table if not exists public.combo_partes (
  combo_id bigint  not null references public.combos (id) on delete cascade,
  clave    text    not null,
  cantidad integer not null default 1,
  primary key (combo_id, clave),
  constraint combo_partes_cantidad_valida check (cantidad between 1 and 99)
);

-- ---------------------------------------------------------------------------
-- Permisos de las tablas nuevas: nada para un visitante, solo administradores.
-- ---------------------------------------------------------------------------
revoke all on table public.compras, public.opciones, public.combos, public.combo_partes from public, anon;
grant select, insert, update, delete on table public.compras, public.opciones, public.combos, public.combo_partes to authenticated;

alter table public.compras      enable row level security;
alter table public.opciones     enable row level security;
alter table public.combos       enable row level security;
alter table public.combo_partes enable row level security;

drop policy if exists solo_administradores on public.compras;
create policy solo_administradores on public.compras
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.opciones;
create policy solo_administradores on public.opciones
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.combos;
create policy solo_administradores on public.combos
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.combo_partes;
create policy solo_administradores on public.combo_partes
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------------------
-- Listas de opciones.
-- ---------------------------------------------------------------------------

-- Suma un valor a una lista si no estaba. Un texto vacio no hace nada.
-- La usan las cargas de stock: lo que se escribe con "Otro (escribir)" queda
-- en el desplegable para la proxima vez.
create or replace function public.recordar_opcion(p_lista text, p_valor text)
returns void language plpgsql set search_path = '' as $$
declare
  v_valor text := upper(public.limpiar(p_valor));
begin
  if v_valor = '' then return; end if;
  insert into public.opciones (lista, valor) values (p_lista, v_valor)
  on conflict (lista, valor) do nothing;
end;
$$;

create or replace function public.agregar_opcion(p_lista text, p_valor text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if public.limpiar(p_valor) = '' then raise exception 'Escribí el valor'; end if;
  if p_lista not in ('modelo', 'capacidad', 'color', 'tipo') then raise exception 'Lista desconocida'; end if;
  perform public.recordar_opcion(p_lista, p_valor);
end;
$$;

-- Saca un valor del desplegable. Lo que ya esta cargado con ese valor no cambia.
create or replace function public.quitar_opcion(p_lista text, p_valor text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.opciones where lista = p_lista and valor = p_valor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Carga de stock: ahora cada unidad puede saber de que compra vino, y los
-- datos nuevos quedan en las listas de opciones.
-- ---------------------------------------------------------------------------
drop function if exists public.ingresar_celulares(text, text, text, text, text, numeric, numeric, integer, text[], text);
create or replace function public.ingresar_celulares(
  p_modelo text, p_capacidad text, p_color text, p_bateria text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer,
  p_imeis text[] default null, p_proveedor text default null, p_compra bigint default null
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
  return p_cantidad;
end;
$$;

drop function if exists public.ingresar_accesorios(text, text, text, text, numeric, numeric, integer, text);
create or replace function public.ingresar_accesorios(
  p_tipo text, p_modelo text, p_color text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer,
  p_proveedor text default null, p_compra bigint default null
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
  return p_cantidad;
end;
$$;

-- Un lote de compra completo: el proveedor y la lista de modelos que vinieron.
-- p_celulares: [{ modelo, capacidad, color, bateria, detalles, costo_usd,
--                 precio_usd, cantidad, imeis: [...] }]
-- Todo entra junto o no entra nada. Devuelve { compra, unidades }.
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
      p_proveedor, v_compra);
  end loop;

  return jsonb_build_object('compra', v_compra, 'unidades', v_unidades);
end;
$$;

-- Carga rapida de IMEI: reparte una lista de IMEI entre los equipos de un
-- lote que todavia no tienen (los mas viejos primero). Como los equipos de un
-- lote son iguales, da lo mismo cual recibe cada IMEI. Con p_compra solo usa
-- los de esa compra. Devuelve cuantos se cargaron.
create or replace function public.cargar_imeis(p_clave text, p_imeis text[], p_compra bigint default null)
returns integer language plpgsql set search_path = '' as $$
declare
  v_imeis    text[];
  v_ids      bigint[];
  v_repetido text;
begin
  perform public.exigir_admin();
  select coalesce(array_agg(limpio), '{}') into v_imeis
    from (select public.limpiar(valor) as limpio from unnest(coalesce(p_imeis, '{}')) valor) l
   where limpio <> '';
  if cardinality(v_imeis) = 0 then raise exception 'No hay IMEI para cargar'; end if;
  if cardinality(v_imeis) <> (select count(distinct valor) from unnest(v_imeis) valor) then
    raise exception 'Hay un IMEI repetido en la lista';
  end if;

  select imei into v_repetido from public.celulares where imei = any(v_imeis) limit 1;
  if v_repetido is not null then
    raise exception 'El IMEI % ya está cargado en otro equipo', v_repetido;
  end if;

  select array_agg(id order by id) into v_ids
    from (select id from public.celulares
           where clave = p_clave and estado <> 'vendido' and imei is null
             and (p_compra is null or compra_id = p_compra)
           order by id limit cardinality(v_imeis)) libres;
  if coalesce(cardinality(v_ids), 0) < cardinality(v_imeis) then
    raise exception 'Hay % IMEI y solo % equipos sin IMEI en ese lote', cardinality(v_imeis), coalesce(cardinality(v_ids), 0);
  end if;

  -- unnest con dos listas las recorre juntas: el primer id con el primer IMEI...
  update public.celulares c set imei = v.imei
    from unnest(v_ids, v_imeis) as v(id, imei)
   where c.id = v.id;
  return cardinality(v_imeis);
end;
$$;

-- Editar un lote, como antes, y ademas el proveedor de todas sus unidades que
-- no estan vendidas. p_proveedor NULL = no tocarlo; '' = sacarlo; un nombre =
-- ese proveedor (se crea si es nuevo).
drop function if exists public.editar_lote(text, text, jsonb, numeric, numeric);
create or replace function public.editar_lote(
  p_tabla text, p_clave text, p_datos jsonb, p_costo_usd numeric, p_precio_usd numeric,
  p_proveedor text default null
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
  return v_nueva;
end;
$$;

-- ---------------------------------------------------------------------------
-- Combos. p_datos: { nombre, precio_usd, partes: [{ clave, cantidad }] }.
-- Con p_id NULL crea uno nuevo; con un id, lo reemplaza. Devuelve el id.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_combo(p_id bigint, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_clave  text := public.normalizar(p_datos->>'nombre');
  v_precio numeric := round((p_datos->>'precio_usd')::numeric, 4);
  v_partes jsonb := coalesce(p_datos->'partes', '[]'::jsonb);
  v_id     bigint;
begin
  perform public.exigir_admin();
  if v_clave = '' then raise exception 'Falta el nombre del combo'; end if;
  if v_precio is null or v_precio < 0 then raise exception 'El precio no puede ser negativo'; end if;
  if jsonb_array_length(v_partes) = 0 then raise exception 'Agregá al menos un accesorio al combo'; end if;
  if exists (select 1 from public.combos where clave = v_clave and id is distinct from p_id) then
    raise exception 'Ya hay un combo con ese nombre';
  end if;
  if exists (select 1 from jsonb_array_elements(v_partes) e
              where not exists (select 1 from public.accesorios a where a.clave = e->>'clave')) then
    raise exception 'Uno de los accesorios del combo ya no existe. Actualizá la página.';
  end if;

  if p_id is null then
    insert into public.combos (nombre, clave, precio_usd)
    values (upper(public.limpiar(p_datos->>'nombre')), v_clave, v_precio)
    returning id into v_id;
  else
    update public.combos set nombre = upper(public.limpiar(p_datos->>'nombre')), clave = v_clave, precio_usd = v_precio
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Ese combo ya no existe. Actualizá la página.'; end if;
    delete from public.combo_partes where combo_id = v_id;
  end if;

  insert into public.combo_partes (combo_id, clave, cantidad)
  select v_id, e->>'clave', coalesce((e->>'cantidad')::integer, 1)
    from jsonb_array_elements(v_partes) e;
  return v_id;
exception
  when unique_violation then raise exception 'Un accesorio está dos veces en el combo';
  when check_violation then raise exception 'Revisá el combo: nombre de hasta 80 letras y cantidades de 1 a 99';
end;
$$;

create or replace function public.eliminar_combo(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.combos where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas.
-- ---------------------------------------------------------------------------

-- Igual que antes, mas: el proveedor y la compra de cada unidad, las listas de
-- opciones, los combos y los lotes de compra (con cuantos equipos de cada
-- modelo trajeron y cuantos siguen sin IMEI).
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
               proveedor_id, compra_id
          from public.celulares where estado <> 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f order by f.id) from (
        select id, clave, tipo, modelo, color, detalles, costo_usd, precio_usd,
               estado, fecha_ingreso, revendedor, precio_revendedor, fecha_revendedor, promediado,
               proveedor_id, compra_id
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

-- El catalogo publico, igual que antes, mas los combos que se pueden armar con
-- lo que hay en el local. De cada combo solo sale lo publico: nombre, de que
-- esta hecho, cuantos se pueden vender y el precio.
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
-- Permisos de las funciones (ver la migracion anterior).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
