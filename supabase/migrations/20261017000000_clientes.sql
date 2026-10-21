-- 20261017000000_clientes.sql
-- Lo que pidio el cliente despues de usar el panel en el local:
--   * Clientes: quedan registrados (a mano o solos, al venderles con su
--     nombre), con telefono, documento y notas.
--   * Deuda de clientes: una venta puede quedar debiendo una parte. La deuda
--     y los pagos que la van bajando forman la cuenta del cliente; los pagos
--     entran a la caja.
--   * Deuda con proveedores: un lote de compra puede quedar debiendose. Los
--     pagos que se anotan a nombre del proveedor la van bajando. La deuda es
--     en dolares, como el costo de la mercaderia.
--   * IMEI: un equipo vendido que vuelve (por una permuta o una recompra) se
--     puede cargar otra vez con su IMEI. El IMEI ya no se puede repetir solo
--     entre los equipos que no estan vendidos.
--   * Papel del ticket: ademas del ancho, el alto de la hoja. La impresora de
--     la Mac del local trabaja con hojas de 50 x 60 mm.
--
-- Igual que en las migraciones anteriores, las funciones que cambian sus
-- parametros se borran primero y los parametros nuevos tienen valor por
-- defecto: el sitio publicado sigue andando aunque no tenga el codigo nuevo.

-- ---------------------------------------------------------------------------
-- Papel del ticket. 0 = rollo continuo (el largo lo decide la impresora).
-- ---------------------------------------------------------------------------
alter table public.configuracion add column if not exists ticket_alto_mm integer not null default 0;

alter table public.configuracion drop constraint if exists configuracion_ticket_alto_valido;
alter table public.configuracion add constraint configuracion_ticket_alto_valido
  check (ticket_alto_mm = 0 or ticket_alto_mm between 30 and 600);

-- El papel que usa la impresora del local. Solo la primera vez: despues se
-- cambia desde Ajustes.
update public.configuracion set ticket_ancho_mm = 50, ticket_alto_mm = 60
 where id = 1 and ticket_alto_mm = 0;

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
    garantia_dias_celulares  = coalesce((p_datos->>'garantia_dias_celulares')::integer, garantia_dias_celulares),
    garantia_dias_accesorios = coalesce((p_datos->>'garantia_dias_accesorios')::integer, garantia_dias_accesorios),
    garantia_dias_servicio   = coalesce((p_datos->>'garantia_dias_servicio')::integer, garantia_dias_servicio),
    aviso_celulares          = coalesce((p_datos->>'aviso_celulares')::integer, aviso_celulares),
    aviso_accesorios         = coalesce((p_datos->>'aviso_accesorios')::integer, aviso_accesorios),
    ticket_ancho_mm          = coalesce((p_datos->>'ticket_ancho_mm')::integer, ticket_ancho_mm),
    ticket_alto_mm           = coalesce((p_datos->>'ticket_alto_mm')::integer, ticket_alto_mm),
    etiqueta_ancho_mm        = coalesce((p_datos->>'etiqueta_ancho_mm')::integer, etiqueta_ancho_mm),
    etiqueta_alto_mm         = coalesce((p_datos->>'etiqueta_alto_mm')::integer, etiqueta_alto_mm)
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- IMEI: unico solo entre los equipos que no estan vendidos. Los vendidos
-- guardan el suyo para el historial y para buscarlos.
-- ---------------------------------------------------------------------------
alter table public.celulares drop constraint if exists celulares_imei_key;
create unique index if not exists celulares_imei_activo on public.celulares (imei) where estado <> 'vendido';
create index if not exists celulares_imei on public.celulares (imei);

-- Igual que antes, pero un IMEI de un equipo vendido se puede volver a usar.
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

  select imei into v_repetido from public.celulares
   where imei = any(v_imeis) and estado <> 'vendido' limit 1;
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

  update public.celulares c set imei = v.imei
    from unnest(v_ids, v_imeis) as v(id, imei)
   where c.id = v.id;
  return cardinality(v_imeis);
end;
$$;

-- ---------------------------------------------------------------------------
-- clientes: a quien se le vende. Se crean a mano o solos, la primera vez que
-- se vende a ese nombre.
-- ---------------------------------------------------------------------------
create table if not exists public.clientes (
  id        bigint generated always as identity primary key,
  nombre    text        not null,                         -- siempre en mayusculas
  clave     text        not null unique,                  -- nombre normalizado
  telefono  text        not null default '',
  documento text        not null default '',              -- DNI o CUIT
  notas     text        not null default '',
  creado    timestamptz not null default now(),
  constraint clientes_largos
    check (char_length(nombre) between 1 and 80 and char_length(telefono) <= 40
       and char_length(documento) <= 20 and char_length(notas) <= 500)
);

-- Cada venta sabe a que cliente fue y cuanto quedo debiendo de ella.
alter table public.comprobantes
  add column if not exists cliente_id bigint references public.clientes (id) on delete set null,
  add column if not exists debe_ars   numeric(18,4) not null default 0;

alter table public.comprobantes drop constraint if exists comprobantes_debe_valido;
alter table public.comprobantes add constraint comprobantes_debe_valido check (debe_ars >= 0);
create index if not exists comprobantes_cliente on public.comprobantes (cliente_id);

-- cuenta_clientes: la cuenta corriente de cada cliente. "deuda" suma a lo que
-- debe; "pago" lo baja y entra a la caja. La deuda de una venta queda atada a
-- su comprobante: si la venta se anula entera, la deuda desaparece con el.
create table if not exists public.cuenta_clientes (
  id             bigint generated always as identity primary key,
  cliente_id     bigint        not null references public.clientes (id) on delete cascade,
  fecha          timestamptz   not null default now(),
  tipo           text          not null,
  monto_ars      numeric(18,4) not null,
  medio          text,                                    -- solo en los pagos
  detalle        text          not null default '',
  comprobante_id bigint references public.comprobantes (id) on delete cascade,
  constraint cuenta_clientes_tipo_valido check (tipo in ('deuda', 'pago')),
  constraint cuenta_clientes_monto_positivo check (monto_ars > 0),
  constraint cuenta_clientes_medio_valido
    check ((tipo = 'pago' and medio in ('efectivo', 'transferencia')) or (tipo = 'deuda' and medio is null)),
  constraint cuenta_clientes_largos check (char_length(detalle) <= 200)
);
create index if not exists cuenta_clientes_cliente on public.cuenta_clientes (cliente_id);

-- ---------------------------------------------------------------------------
-- Deuda con proveedores, en dolares. Los pagos son los gastos de la caja a
-- nombre del proveedor: cada uno guarda el dolar de costo del dia en que se
-- anoto, para saber cuantos dolares de deuda cancela. Los pagos anotados
-- antes de esta migracion no tienen cotizacion y no cuentan (la mercaderia de
-- entonces tampoco quedo como deuda).
-- ---------------------------------------------------------------------------
create table if not exists public.deudas_proveedor (
  id           bigint generated always as identity primary key,
  proveedor_id bigint        not null references public.proveedores (id) on delete cascade,
  fecha        timestamptz   not null default now(),
  monto_usd    numeric(18,4) not null,
  detalle      text          not null default '',
  compra_id    bigint references public.compras (id) on delete cascade,
  constraint deudas_proveedor_monto_positivo check (monto_usd > 0),
  constraint deudas_proveedor_largos check (char_length(detalle) <= 200)
);
create index if not exists deudas_proveedor_proveedor on public.deudas_proveedor (proveedor_id);

alter table public.movimientos_caja add column if not exists cotizacion numeric(18,4);
alter table public.movimientos_caja drop constraint if exists movimientos_cotizacion_positiva;
alter table public.movimientos_caja add constraint movimientos_cotizacion_positiva check (cotizacion is null or cotizacion > 0);

-- ---------------------------------------------------------------------------
-- Permisos de las tablas nuevas: igual que las demas.
-- ---------------------------------------------------------------------------
revoke all on table public.clientes, public.cuenta_clientes, public.deudas_proveedor from public, anon;
grant select, insert, update, delete on table public.clientes, public.cuenta_clientes, public.deudas_proveedor to authenticated;

alter table public.clientes         enable row level security;
alter table public.cuenta_clientes  enable row level security;
alter table public.deudas_proveedor enable row level security;

drop policy if exists solo_administradores on public.clientes;
create policy solo_administradores on public.clientes
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.cuenta_clientes;
create policy solo_administradores on public.cuenta_clientes
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.deudas_proveedor;
create policy solo_administradores on public.deudas_proveedor
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------------------
-- Clientes.
-- ---------------------------------------------------------------------------

-- Devuelve el id del cliente con ese nombre; si no existe lo crea. Si ya
-- existia sin telefono, le deja el que vino. Con el nombre vacio devuelve NULL.
create or replace function public.cliente_por_nombre(p_nombre text, p_telefono text default '')
returns bigint language plpgsql set search_path = '' as $$
declare
  v_clave text := public.normalizar(p_nombre);
  v_id    bigint;
begin
  if v_clave = '' then return null; end if;
  select id into v_id from public.clientes where clave = v_clave;
  if v_id is null then
    insert into public.clientes (nombre, clave, telefono)
    values (left(upper(public.limpiar(p_nombre)), 80), v_clave, left(public.limpiar(p_telefono), 40))
    returning id into v_id;
  elsif public.limpiar(p_telefono) <> '' then
    update public.clientes set telefono = left(public.limpiar(p_telefono), 40) where id = v_id and telefono = '';
  end if;
  return v_id;
end;
$$;

-- Los clientes de las ventas que ya estaban hechas. Se puede correr dos veces.
insert into public.clientes (nombre, clave, telefono)
select distinct on (public.normalizar(c.cliente))
       left(c.cliente, 80), public.normalizar(c.cliente), left(c.telefono, 40)
  from public.comprobantes c
 where c.origen in ('mostrador', 'permuta') and public.normalizar(c.cliente) <> ''
 order by public.normalizar(c.cliente), (c.telefono <> '') desc, c.id desc
on conflict (clave) do nothing;

update public.comprobantes c set cliente_id = cl.id
  from public.clientes cl
 where c.cliente_id is null and c.origen in ('mostrador', 'permuta')
   and cl.clave = public.normalizar(c.cliente);

-- p_datos: { nombre, telefono, documento, notas }. Con p_id NULL crea uno
-- nuevo; con un id, lo modifica. Devuelve el id.
create or replace function public.guardar_cliente(p_id bigint, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_clave text := public.normalizar(p_datos->>'nombre');
  v_id    bigint;
begin
  perform public.exigir_admin();
  if v_clave = '' then raise exception 'Falta el nombre'; end if;
  if exists (select 1 from public.clientes where clave = v_clave and id is distinct from p_id) then
    raise exception 'Ya hay un cliente con ese nombre';
  end if;

  if p_id is null then
    insert into public.clientes (nombre, clave, telefono, documento, notas)
    values (upper(public.limpiar(p_datos->>'nombre')), v_clave, public.limpiar(p_datos->>'telefono'),
            upper(public.limpiar(p_datos->>'documento')), public.limpiar(p_datos->>'notas'))
    returning id into v_id;
  else
    update public.clientes
       set nombre = upper(public.limpiar(p_datos->>'nombre')), clave = v_clave,
           telefono = public.limpiar(p_datos->>'telefono'),
           documento = upper(public.limpiar(p_datos->>'documento')),
           notas = public.limpiar(p_datos->>'notas')
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Ese cliente ya no existe. Actualizá la página.'; end if;
    -- Sus ventas muestran el nombre corregido.
    update public.comprobantes set cliente = left(upper(public.limpiar(p_datos->>'nombre')), 80) where cliente_id = v_id;
  end if;
  return v_id;
end;
$$;

-- No se elimina un cliente con movimientos en su cuenta: se perderia la deuda.
-- Sus ventas quedan, sin el cliente atado.
create or replace function public.eliminar_cliente(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if exists (select 1 from public.cuenta_clientes where cliente_id = p_id) then
    raise exception 'No se puede eliminar: tiene deudas o pagos en su cuenta';
  end if;
  delete from public.clientes where id = p_id;
  if not found then raise exception 'Ese cliente ya no existe. Actualizá la página.'; end if;
end;
$$;

-- Anota una deuda o un pago en la cuenta de un cliente.
-- p_tipo: 'deuda' o 'pago'. p_medio: solo para los pagos.
create or replace function public.anotar_cuenta_cliente(
  p_cliente bigint, p_tipo text, p_monto_ars numeric, p_medio text default null, p_detalle text default ''
) returns bigint language plpgsql set search_path = '' as $$
declare
  v_id bigint;
begin
  perform public.exigir_admin();
  if p_tipo is null or p_tipo not in ('deuda', 'pago') then raise exception 'Tipo de movimiento desconocido'; end if;
  if p_monto_ars is null or p_monto_ars <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;
  if not exists (select 1 from public.clientes where id = p_cliente) then
    raise exception 'Ese cliente ya no existe. Actualizá la página.';
  end if;
  insert into public.cuenta_clientes (cliente_id, tipo, monto_ars, medio, detalle)
  values (p_cliente, p_tipo, round(p_monto_ars, 4),
          case when p_tipo = 'pago' then public.medio_simple(p_medio) end,
          public.limpiar(p_detalle))
  returning id into v_id;
  return v_id;
end;
$$;

-- Borra un movimiento anotado a mano. La deuda que dejo una venta no se borra
-- desde aca: desaparece al anular la venta.
create or replace function public.eliminar_cuenta_cliente(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.cuenta_clientes where id = p_id and comprobante_id is null;
  if not found then raise exception 'Ese movimiento no se puede borrar. Si es el saldo de una venta, anulá la venta.'; end if;
end;
$$;

-- La cuenta de un cliente y sus compras.
create or replace function public.cuenta_cliente(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'movimientos', coalesce((
      select jsonb_agg(f order by f.fecha desc, f.id desc) from (
        select id, fecha, tipo, monto_ars, medio, detalle, comprobante_id
          from public.cuenta_clientes where cliente_id = p_id) f), '[]'::jsonb),
    'compras', coalesce((
      select jsonb_agg(f order by f.fecha desc) from (
        select c.id, c.fecha, c.origen, c.debe_ars,
               coalesce((select sum(round((u.precio_usd - coalesce(u.permuta_usd, 0)) * u.cotizacion_venta))
                           from public.celulares u where u.comprobante_id = c.id and u.estado = 'vendido'), 0)
             + coalesce((select sum(round(u.precio_usd * u.cotizacion_venta))
                           from public.accesorios u where u.comprobante_id = c.id and u.estado = 'vendido'), 0) as total_ars,
               (select count(*) from public.celulares u where u.comprobante_id = c.id)::int
             + (select count(*) from public.accesorios u where u.comprobante_id = c.id)::int as unidades
          from public.comprobantes c where c.cliente_id = p_id) f), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ventas: el cliente queda registrado y la venta puede quedar debiendo.
-- p_datos ahora tambien trae "debe_ars": cuanto del total queda en la cuenta
-- del cliente (hace falta su nombre).
-- ---------------------------------------------------------------------------
create or replace function public.crear_comprobante(p_origen text, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_cobro record;
  v_debe  numeric := round(coalesce((p_datos->>'debe_ars')::numeric, 0), 4);
  v_id    bigint;
begin
  select * into v_cobro from public.leer_cobro(p_datos);
  if v_debe < 0 then raise exception 'Lo que queda debiendo no puede ser negativo'; end if;
  if v_debe > 0 and public.normalizar(p_datos->>'cliente') = '' then
    raise exception 'Para dejar una deuda hace falta el nombre del cliente';
  end if;
  insert into public.comprobantes (origen, cliente, telefono, medio, efectivo_ars, nota, cliente_id, debe_ars)
  values (p_origen, upper(public.limpiar(p_datos->>'cliente')), public.limpiar(p_datos->>'telefono'),
          v_cobro.medio, v_cobro.efectivo_ars, public.limpiar(p_datos->>'nota'),
          public.cliente_por_nombre(p_datos->>'cliente', p_datos->>'telefono'), v_debe)
  returning id into v_id;
  return v_id;
end;
$$;

-- Lo que se cobra de un comprobante: sus unidades vendidas, sin lo que se
-- tomo en permuta. Es la misma cuenta que hace la caja.
create or replace function public.total_de_comprobante(p_id bigint)
returns numeric language sql stable set search_path = '' as $$
  select coalesce((select sum(round((precio_usd - coalesce(permuta_usd, 0)) * cotizacion_venta))
                     from public.celulares where comprobante_id = p_id and estado = 'vendido'), 0)
       + coalesce((select sum(round(precio_usd * cotizacion_venta))
                     from public.accesorios where comprobante_id = p_id and estado = 'vendido'), 0);
$$;

-- Despues de vender: si quedo debiendo, la deuda pasa a la cuenta del cliente.
-- El panel manda los precios en dolares y aca se vuelven a pasar a pesos: si
-- por el redondeo la deuda pasa el total por unos pocos pesos, queda en el total.
create or replace function public.anotar_deuda_de_venta(p_comprobante bigint)
returns void language plpgsql set search_path = '' as $$
declare
  v_debe    numeric;
  v_cliente bigint;
  v_total   numeric;
begin
  select debe_ars, cliente_id into v_debe, v_cliente from public.comprobantes where id = p_comprobante;
  if coalesce(v_debe, 0) <= 0 then return; end if;
  v_total := public.total_de_comprobante(p_comprobante);
  if v_debe > v_total + 10 then
    raise exception 'Lo que queda debiendo no puede ser más que el total';
  end if;
  if v_debe > v_total then
    if v_total <= 0 then raise exception 'Lo que queda debiendo no puede ser más que el total'; end if;
    v_debe := v_total;
    update public.comprobantes set debe_ars = v_debe where id = p_comprobante;
  end if;
  insert into public.cuenta_clientes (cliente_id, tipo, monto_ars, detalle, comprobante_id)
  values (v_cliente, 'deuda', v_debe, 'Saldo de la venta N° ' || lpad(p_comprobante::text, 6, '0'), p_comprobante);
end;
$$;

create or replace function public.vender(p_celulares jsonb, p_accesorios jsonb, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_datos       jsonb := coalesce(p_datos, '{}'::jsonb);
  v_comprobante bigint;
  v_total       integer;
begin
  perform public.exigir_admin();
  if coalesce(jsonb_array_length(p_celulares), 0) + coalesce(jsonb_array_length(p_accesorios), 0) = 0 then
    raise exception 'No hay nada para vender';
  end if;

  v_comprobante := public.crear_comprobante('mostrador', v_datos);
  v_total := public.pasar_a_vendido('celulares', p_celulares, 'disponible', v_comprobante,
                                    (v_datos->>'garantia_celulares')::integer)
           + public.pasar_a_vendido('accesorios', p_accesorios, 'disponible', v_comprobante,
                                    (v_datos->>'garantia_accesorios')::integer);
  perform public.anotar_deuda_de_venta(v_comprobante);
  return jsonb_build_object('unidades', v_total, 'comprobante', v_comprobante);
end;
$$;

create or replace function public.registrar_permuta(
  p_recibido jsonb, p_entregado_id bigint default null, p_entregado_precio_usd numeric default null,
  p_datos jsonb default '{}'::jsonb
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_valor       numeric := (p_recibido->>'valor_usd')::numeric;
  v_datos       jsonb := coalesce(p_datos, '{}'::jsonb);
  v_comprobante bigint;
begin
  perform public.exigir_admin();
  if v_valor is null or v_valor < 0 then raise exception 'Falta el valor de toma del equipo recibido'; end if;

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
  end if;

  perform public.ingresar_celulares(
    p_recibido->>'modelo', p_recibido->>'capacidad', p_recibido->>'color',
    p_recibido->>'bateria', p_recibido->>'detalles',
    v_valor, coalesce((p_recibido->>'precio_usd')::numeric, v_valor), 1,
    case when public.limpiar(p_recibido->>'imei') = '' then null else array[p_recibido->>'imei'] end);
  return jsonb_build_object('comprobante', v_comprobante);
end;
$$;

-- Corregir quien compro tambien mueve la venta (y su deuda) al cliente nuevo.
create or replace function public.editar_comprobante(p_id bigint, p_datos jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_cobro   record;
  v_cliente bigint;
begin
  perform public.exigir_admin();
  select * into v_cobro from public.leer_cobro(p_datos);
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
         cliente_id = case when origen in ('mostrador', 'permuta') then v_cliente else cliente_id end
   where id = p_id;
  if not found then raise exception 'Ese comprobante ya no existe. Actualizá la página.'; end if;
  update public.cuenta_clientes set cliente_id = v_cliente where comprobante_id = p_id and v_cliente is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Proveedores: deuda.
-- ---------------------------------------------------------------------------

-- Un lote de compra; p_deuda_usd es lo que queda debiendose de ese lote
-- (NULL o 0 = se pago en el momento).
drop function if exists public.ingresar_compra(text, text, jsonb);
create or replace function public.ingresar_compra(
  p_proveedor text, p_nota text, p_celulares jsonb, p_deuda_usd numeric default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_compra    bigint;
  v_proveedor bigint;
  v_item      jsonb;
  v_unidades  integer := 0;
begin
  perform public.exigir_admin();
  if public.normalizar(p_proveedor) = '' then raise exception 'Elegí el proveedor del lote'; end if;
  if coalesce(jsonb_array_length(p_celulares), 0) = 0 then raise exception 'Agregá al menos un modelo al lote'; end if;
  if p_deuda_usd < 0 then raise exception 'La deuda no puede ser negativa'; end if;

  v_proveedor := public.proveedor_por_nombre(p_proveedor);
  insert into public.compras (proveedor_id, nota)
  values (v_proveedor, public.limpiar(p_nota))
  returning id into v_compra;

  for v_item in select value from jsonb_array_elements(p_celulares) loop
    v_unidades := v_unidades + public.ingresar_celulares(
      v_item->>'modelo', v_item->>'capacidad', v_item->>'color', v_item->>'bateria', v_item->>'detalles',
      (v_item->>'costo_usd')::numeric, (v_item->>'precio_usd')::numeric, (v_item->>'cantidad')::integer,
      case when jsonb_typeof(v_item->'imeis') = 'array'
           then array(select jsonb_array_elements_text(v_item->'imeis')) end,
      p_proveedor, v_compra, (v_item->>'precio_mayorista_usd')::numeric);
  end loop;

  if coalesce(p_deuda_usd, 0) > 0 then
    insert into public.deudas_proveedor (proveedor_id, monto_usd, detalle, compra_id)
    values (v_proveedor, round(p_deuda_usd, 4), 'Lote N° ' || lpad(v_compra::text, 6, '0'), v_compra);
  end if;

  return jsonb_build_object('compra', v_compra, 'unidades', v_unidades);
end;
$$;

-- Una deuda anotada a mano (mercaderia de antes, un saldo que se arrastra).
create or replace function public.anotar_deuda_proveedor(p_proveedor bigint, p_monto_usd numeric, p_detalle text default '')
returns bigint language plpgsql set search_path = '' as $$
declare
  v_id bigint;
begin
  perform public.exigir_admin();
  if p_monto_usd is null or p_monto_usd <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor) then
    raise exception 'Ese proveedor ya no existe. Actualizá la página.';
  end if;
  insert into public.deudas_proveedor (proveedor_id, monto_usd, detalle)
  values (p_proveedor, round(p_monto_usd, 4), public.limpiar(p_detalle))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.eliminar_deuda_proveedor(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.deudas_proveedor where id = p_id;
  if not found then raise exception 'Esa deuda ya no existe. Actualizá la página.'; end if;
end;
$$;

-- La cuenta de un proveedor: sus deudas y sus pagos, lo mas nuevo primero.
-- Un pago sin cotizacion (anotado antes de llevar la deuda) no descuenta.
create or replace function public.cuenta_proveedor(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    select jsonb_agg(f order by f.fecha desc, f.id desc) from (
      select 'deuda' as clase, d.id, d.fecha, d.monto_usd, null::numeric as monto_ars, d.detalle, d.compra_id
        from public.deudas_proveedor d where d.proveedor_id = p_id
      union all
      select 'pago', m.id, m.fecha, round(m.monto_ars / m.cotizacion, 4), m.monto_ars,
             concat_ws(' · ', m.categoria, nullif(m.detalle, '')), null
        from public.movimientos_caja m
       where m.proveedor_id = p_id and m.tipo = 'egreso'
    ) f), '[]'::jsonb);
end;
$$;

-- No se elimina un proveedor que tiene mercaderia, pagos o deudas anotadas.
create or replace function public.eliminar_proveedor(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if exists (select 1 from public.celulares where proveedor_id = p_id)
     or exists (select 1 from public.accesorios where proveedor_id = p_id)
     or exists (select 1 from public.movimientos_caja where proveedor_id = p_id)
     or exists (select 1 from public.deudas_proveedor where proveedor_id = p_id) then
    raise exception 'No se puede eliminar: tiene mercadería, pagos o deudas registrados';
  end if;
  delete from public.proveedores where id = p_id;
end;
$$;

-- Igual que antes, y un gasto a nombre de un proveedor guarda el dolar de
-- costo del dia: con eso se sabe cuanto de la deuda cancela. Al corregirlo se
-- mantiene el dolar con el que se anoto.
create or replace function public.guardar_movimiento(p_id bigint, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_tipo       text := p_datos->>'tipo';
  v_categoria  text := upper(public.limpiar(p_datos->>'categoria'));
  v_monto      numeric;
  v_medio      text;
  v_proveedor  bigint;
  v_cotizacion numeric;
  v_id         bigint;
begin
  perform public.exigir_admin();
  if v_tipo is null or v_tipo not in ('ingreso', 'egreso') then raise exception 'Tipo de movimiento desconocido'; end if;
  if v_categoria = '' then raise exception 'Falta la categoría'; end if;
  v_monto := round((p_datos->>'monto_ars')::numeric, 4);
  if v_monto is null or v_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;
  v_medio := public.medio_simple(p_datos->>'medio');
  v_proveedor := public.proveedor_por_nombre(p_datos->>'proveedor');
  if v_tipo = 'egreso' and v_proveedor is not null then
    select coalesce(cotizacion_costo, cotizacion_dolar) into strict v_cotizacion from public.configuracion where id = 1;
  end if;

  if p_id is null then
    insert into public.movimientos_caja (fecha, tipo, categoria, detalle, cliente, monto_ars, medio, proveedor_id, cotizacion)
    values (coalesce(nullif(p_datos->>'fecha', '')::timestamptz, now()), v_tipo, v_categoria,
            public.limpiar(p_datos->>'detalle'), upper(public.limpiar(p_datos->>'cliente')),
            v_monto, v_medio, v_proveedor, v_cotizacion)
    returning id into v_id;
  else
    update public.movimientos_caja
       set fecha = coalesce(nullif(p_datos->>'fecha', '')::timestamptz, fecha), tipo = v_tipo,
           categoria = v_categoria, detalle = public.limpiar(p_datos->>'detalle'),
           cliente = upper(public.limpiar(p_datos->>'cliente')),
           monto_ars = v_monto, medio = v_medio, proveedor_id = v_proveedor,
           cotizacion = case when v_cotizacion is null then null else coalesce(cotizacion, v_cotizacion) end
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Ese movimiento ya no existe. Actualizá la página.'; end if;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas.
-- ---------------------------------------------------------------------------

-- Igual que antes, mas: la deuda de cada proveedor y los clientes con su saldo.
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
                          where m.proveedor_id = p.id and m.tipo = 'egreso'), 0) as pagado_ars,
               coalesce((select sum(d.monto_usd) from public.deudas_proveedor d where d.proveedor_id = p.id), 0) as deuda_usd,
               coalesce((select sum(round(m.monto_ars / m.cotizacion, 4)) from public.movimientos_caja m
                          where m.proveedor_id = p.id and m.tipo = 'egreso' and m.cotizacion is not null), 0) as pagado_usd
          from public.proveedores p) f), '[]'::jsonb),
    'clientes', coalesce((
      select jsonb_agg(f order by f.nombre) from (
        select cl.id, cl.nombre, cl.telefono, cl.documento, cl.notas,
               coalesce((select sum(case when m.tipo = 'deuda' then m.monto_ars else -m.monto_ars end)
                           from public.cuenta_clientes m where m.cliente_id = cl.id), 0) as saldo_ars,
               (select count(*) from public.comprobantes c where c.cliente_id = cl.id)::int as compras,
               greatest(cl.creado,
                        (select max(c.fecha) from public.comprobantes c where c.cliente_id = cl.id),
                        (select max(m.fecha) from public.cuenta_clientes m where m.cliente_id = cl.id)) as ultimo
          from public.clientes cl) f), '[]'::jsonb),
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
    'compras', coalesce((
      select jsonb_agg(f order by f.id desc) from (
        select c.id, c.fecha, c.proveedor_id, c.nota,
               coalesce((select sum(d.monto_usd) from public.deudas_proveedor d where d.compra_id = c.id), 0) as deuda_usd,
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

-- Igual que antes, mas lo que quedo debiendo cada venta.
create or replace function public.ventas_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'celulares', coalesce((
      select jsonb_agg(f) from (
        select id, clave, modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, permuta_usd, revendedor,
               comprobante_id, garantia_dias
          from public.celulares where estado = 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f) from (
        select id, clave, tipo, modelo, color, detalles, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, revendedor,
               comprobante_id, garantia_dias
          from public.accesorios where estado = 'vendido') f), '[]'::jsonb),
    'comprobantes', coalesce((
      select jsonb_agg(f) from (
        select id, fecha, origen, cliente, telefono, medio, efectivo_ars, nota, cliente_id, debe_ars
          from public.comprobantes) f), '[]'::jsonb)
  );
end;
$$;

create or replace function public.comprobante_datos(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_resultado jsonb;
begin
  perform public.exigir_admin();
  select jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'origen', c.origen, 'cliente', c.cliente, 'telefono', c.telefono,
    'medio', c.medio, 'efectivo_ars', c.efectivo_ars, 'nota', c.nota, 'debe_ars', c.debe_ars,
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

-- La caja, como antes, con dos cambios:
--   * una venta que quedo debiendo entra por lo que se cobro en el momento;
--   * los pagos de los clientes a su cuenta entran como "pago_cliente".
create or replace function public.caja_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    with unidades as (
      select comprobante_id, fecha_venta, revendedor,
             round((precio_usd - coalesce(permuta_usd, 0)) * cotizacion_venta) as cobrado,
             concat_ws(' ', modelo, nullif(capacidad, '')) as nombre
        from public.celulares where estado = 'vendido'
      union all
      select comprobante_id, fecha_venta, revendedor, round(precio_usd * cotizacion_venta),
             concat_ws(' ', tipo, nullif(modelo, ''))
        from public.accesorios where estado = 'vendido'
    ),
    ventas as (
      select u.comprobante_id, u.fecha_venta as fecha, sum(u.cobrado) as total,
             count(*) as cantidad, min(u.nombre) as nombre
        from unidades u
        left join public.comprobantes c on c.id = u.comprobante_id
       where (c.id is null and u.revendedor is null) or c.origen in ('mostrador', 'permuta')
       group by u.comprobante_id, u.fecha_venta
    ),
    -- Lo que se cobro en el momento: el total menos lo que quedo debiendo.
    cobradas as (
      select v.*, c.medio, c.efectivo_ars, coalesce(c.cliente, '') as cliente, c.origen,
             v.total - least(coalesce(c.debe_ars, 0), greatest(v.total, 0)) as cobrado
        from ventas v
        left join public.comprobantes c on c.id = v.comprobante_id
    ),
    filas as (
      select 'venta' as origen, v.comprobante_id as id, v.fecha,
             case when v.origen = 'permuta' then 'Venta con permuta'
                  when v.cobrado < v.total then 'Venta (parte a cuenta)'
                  else 'Venta' end as concepto,
             case when v.cantidad = 1 then v.nombre else v.cantidad || ' productos' end as detalle,
             v.cliente as persona,
             public.parte_efectivo(v.medio, v.efectivo_ars, v.cobrado) as efectivo_ars,
             v.cobrado - public.parte_efectivo(v.medio, v.efectivo_ars, v.cobrado) as transferencia_ars,
             null::text as tipo, null::text as categoria, null::text as medio, null::text as proveedor
        from cobradas v
      union all
      select 'pago_revendedor', id, fecha, 'Pago de revendedor', '', revendedor,
             case when medio = 'efectivo' then monto_ars else 0 end,
             case when medio = 'transferencia' then monto_ars else 0 end,
             null, null, medio, null
        from public.pagos_revendedor where monto_usd > 0
      union all
      select 'pago_sena', id, fecha, 'Seña', '', revendedor,
             case when medio = 'efectivo' then monto_ars else 0 end,
             case when medio = 'transferencia' then monto_ars else 0 end,
             null, null, medio, null
        from public.pagos_sena where monto_usd > 0
      union all
      select 'pago_cliente', m.id, m.fecha, 'Pago de cliente', m.detalle, cl.nombre,
             case when m.medio = 'efectivo' then m.monto_ars else 0 end,
             case when m.medio = 'transferencia' then m.monto_ars else 0 end,
             null, null, m.medio, null
        from public.cuenta_clientes m
        join public.clientes cl on cl.id = m.cliente_id
       where m.tipo = 'pago'
      union all
      select 'servicio', id, fecha_entrega, 'Servicio técnico', equipo, cliente,
             public.parte_efectivo(medio, efectivo_ars, cobrado_ars),
             cobrado_ars - public.parte_efectivo(medio, efectivo_ars, cobrado_ars),
             null, null, medio, null
        from public.servicios where estado = 'entregado' and cobrado_ars > 0
      union all
      select 'movimiento', m.id, m.fecha, m.categoria, m.detalle, m.cliente,
             case when m.medio = 'efectivo' then m.monto_ars else 0 end * case when m.tipo = 'egreso' then -1 else 1 end,
             case when m.medio = 'transferencia' then m.monto_ars else 0 end * case when m.tipo = 'egreso' then -1 else 1 end,
             m.tipo, m.categoria, m.medio, p.nombre
        from public.movimientos_caja m
        left join public.proveedores p on p.id = m.proveedor_id
    )
    select jsonb_agg(f order by f.fecha desc, f.origen, f.id) from filas f
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
