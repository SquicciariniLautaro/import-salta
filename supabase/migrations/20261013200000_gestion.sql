-- 20261013200000_gestion.sql
-- Gestion del comercio. Suma al panel:
--   * Comprobantes: cada venta guarda el cliente y con que pago (efectivo,
--     transferencia o las dos cosas), y se puede imprimir como ticket.
--   * Garantias: cada unidad vendida guarda cuantos dias de garantia tiene.
--   * Caja: toda la plata que entra y sale, mas los gastos y los ingresos
--     que se anotan a mano (una "venta aparte", un retiro, el alquiler).
--   * Proveedores: a quien se le compra, y que se le compro y se le pago.
--   * Servicio tecnico: ordenes de reparacion, de que entra el equipo a que
--     se entrega y se cobra.
--   * Avisos de stock: lotes que se quedaron sin unidades hace poco.
--   * Ajustes: los datos del comercio para el ticket, los dias de garantia,
--     desde cuantas unidades avisar y el tamano del papel de la impresora.
--
-- Sigue la misma idea que la migracion anterior: el panel no escribe en las
-- tablas, llama a funciones. Varias funciones que ya existian cambian su
-- lista de parametros; como Postgres las distingue por esa lista, primero se
-- borra la version vieja ("drop function if exists") y despues se crea la nueva.

-- ---------------------------------------------------------------------------
-- Ajustes: columnas nuevas en la unica fila de "configuracion".
-- ---------------------------------------------------------------------------
alter table public.configuracion
  -- Lo que sale impreso arriba y abajo de cada ticket.
  add column if not exists negocio_nombre           text    not null default 'Import Salta',
  add column if not exists negocio_direccion        text    not null default '',
  add column if not exists negocio_telefono         text    not null default '',
  add column if not exists negocio_cuit             text    not null default '',
  add column if not exists ticket_pie               text    not null default '',
  -- Dias de garantia que se proponen al vender (0 = sin garantia).
  add column if not exists garantia_dias_celulares  integer not null default 30,
  add column if not exists garantia_dias_accesorios integer not null default 0,
  add column if not exists garantia_dias_servicio   integer not null default 30,
  -- "Queda poco" cuando en el local hay esta cantidad o menos (0 = no avisar).
  add column if not exists aviso_celulares          integer not null default 0,
  add column if not exists aviso_accesorios         integer not null default 3,
  -- Papel de la impresora, en milimetros.
  add column if not exists ticket_ancho_mm          integer not null default 80,
  add column if not exists etiqueta_ancho_mm        integer not null default 50,
  add column if not exists etiqueta_alto_mm         integer not null default 30;

alter table public.configuracion drop constraint if exists configuracion_ajustes_validos;
alter table public.configuracion add constraint configuracion_ajustes_validos check (
      char_length(negocio_nombre) between 1 and 80 and char_length(negocio_direccion) <= 120
  and char_length(negocio_telefono) <= 40 and char_length(negocio_cuit) <= 20
  and char_length(ticket_pie) <= 300
  and garantia_dias_celulares between 0 and 3650 and garantia_dias_accesorios between 0 and 3650
  and garantia_dias_servicio between 0 and 3650
  and aviso_celulares between 0 and 999 and aviso_accesorios between 0 and 999
  and ticket_ancho_mm between 40 and 120
  and etiqueta_ancho_mm between 20 and 120 and etiqueta_alto_mm between 15 and 120
);

-- ---------------------------------------------------------------------------
-- proveedores: a quien se le compra la mercaderia.
-- ---------------------------------------------------------------------------
create table if not exists public.proveedores (
  id       bigint generated always as identity primary key,
  nombre   text        not null,                          -- siempre en mayusculas
  clave    text        not null unique,                   -- nombre normalizado
  telefono text        not null default '',
  rubro    text        not null default '',               -- que vende
  notas    text        not null default '',
  creado   timestamptz not null default now(),
  constraint proveedores_largos
    check (char_length(nombre) between 1 and 80 and char_length(telefono) <= 40
       and char_length(rubro) <= 80 and char_length(notas) <= 500)
);

-- ---------------------------------------------------------------------------
-- comprobantes: una fila por venta. Junta todas las unidades que se fueron
-- juntas y guarda quien compro y como pago. Su "id" es el numero de ticket.
-- El total NO se guarda: se calcula sumando sus unidades, asi no puede quedar
-- distinto de lo vendido cuando se corrige un precio o se anula una unidad.
-- ---------------------------------------------------------------------------
create table if not exists public.comprobantes (
  id           bigint generated always as identity primary key,
  fecha        timestamptz   not null default now(),
  -- De donde salio la venta. Las de revendedores y senas se cobran por los
  -- pagos de la cuenta, asi que no llevan medio de pago.
  origen       text          not null default 'mostrador',
  cliente      text          not null default '',
  telefono     text          not null default '',
  medio        text,
  -- Solo para "mixto": cuanto del total fue en efectivo. El resto, transferencia.
  efectivo_ars numeric(18,4),
  nota         text          not null default '',
  constraint comprobantes_origen_valido check (origen in ('mostrador', 'permuta', 'revendedor', 'sena')),
  constraint comprobantes_medio_valido check (medio is null or medio in ('efectivo', 'transferencia', 'mixto')),
  constraint comprobantes_largos
    check (char_length(cliente) <= 80 and char_length(telefono) <= 40 and char_length(nota) <= 300)
);

-- Cada unidad sabe en que comprobante se vendio, cuantos dias de garantia
-- tiene y a que proveedor se le compro. "references" impide apuntar a algo
-- que no existe; "on delete set null" deja el dato vacio si eso se borra.
alter table public.celulares
  add column if not exists comprobante_id bigint references public.comprobantes (id) on delete set null,
  add column if not exists garantia_dias  integer,
  add column if not exists proveedor_id   bigint references public.proveedores (id) on delete set null;

alter table public.accesorios
  add column if not exists comprobante_id bigint references public.comprobantes (id) on delete set null,
  add column if not exists garantia_dias  integer,
  add column if not exists proveedor_id   bigint references public.proveedores (id) on delete set null;

create index if not exists celulares_comprobante on public.celulares (comprobante_id);
create index if not exists accesorios_comprobante on public.accesorios (comprobante_id);

-- Los pagos de revendedores y senas ahora dicen como se pago.
alter table public.pagos_revendedor add column if not exists medio text not null default 'efectivo';
alter table public.pagos_sena       add column if not exists medio text not null default 'efectivo';

alter table public.pagos_revendedor drop constraint if exists pagos_revendedor_medio_valido;
alter table public.pagos_revendedor add constraint pagos_revendedor_medio_valido check (medio in ('efectivo', 'transferencia'));
alter table public.pagos_sena drop constraint if exists pagos_sena_medio_valido;
alter table public.pagos_sena add constraint pagos_sena_medio_valido check (medio in ('efectivo', 'transferencia'));

-- ---------------------------------------------------------------------------
-- movimientos_caja: plata que entra o sale y que se anota a mano. Un gasto,
-- un pago a un proveedor, un retiro, una venta de algo que no esta en el stock.
-- Las ventas, los pagos de cuentas y el servicio tecnico NO se copian aca: la
-- caja los lee de donde ya estan (ver caja_datos).
-- ---------------------------------------------------------------------------
create table if not exists public.movimientos_caja (
  id           bigint generated always as identity primary key,
  fecha        timestamptz   not null default now(),
  tipo         text          not null,                    -- ingreso o egreso
  categoria    text          not null,                    -- ALQUILER, RETIRO, VENTA APARTE...
  detalle      text          not null default '',
  cliente      text          not null default '',
  monto_ars    numeric(18,4) not null,
  medio        text          not null default 'efectivo',
  proveedor_id bigint references public.proveedores (id) on delete set null,
  constraint movimientos_tipo_valido check (tipo in ('ingreso', 'egreso')),
  constraint movimientos_medio_valido check (medio in ('efectivo', 'transferencia')),
  constraint movimientos_monto_positivo check (monto_ars > 0),
  constraint movimientos_largos
    check (char_length(categoria) between 1 and 60 and char_length(detalle) <= 200 and char_length(cliente) <= 80)
);
create index if not exists movimientos_caja_fecha on public.movimientos_caja (fecha);

-- ---------------------------------------------------------------------------
-- servicios: ordenes de servicio tecnico. Su "id" es el numero de orden.
-- ---------------------------------------------------------------------------
create table if not exists public.servicios (
  id              bigint generated always as identity primary key,
  fecha_ingreso   timestamptz   not null default now(),
  cliente         text          not null,
  telefono        text          not null default '',
  equipo          text          not null,                 -- IPHONE 11 NEGRO
  imei            text          not null default '',
  falla           text          not null default '',      -- lo que cuenta el cliente
  trabajo         text          not null default '',      -- lo que se le hizo
  notas           text          not null default '',
  estado          text          not null default 'recibido',
  presupuesto_ars numeric(18,4) not null default 0,       -- lo que se le dijo al cliente
  costo_ars       numeric(18,4) not null default 0,       -- repuestos
  en_garantia     boolean       not null default false,   -- reclamo por una venta o un arreglo anterior
  -- Se completan al entregar.
  cobrado_ars     numeric(18,4),
  medio           text,
  efectivo_ars    numeric(18,4),
  fecha_entrega   timestamptz,
  garantia_dias   integer       not null default 0,       -- garantia del arreglo
  constraint servicios_estado_valido
    check (estado in ('recibido', 'reparando', 'listo', 'entregado', 'cancelado')),
  constraint servicios_medio_valido check (medio is null or medio in ('efectivo', 'transferencia', 'mixto')),
  constraint servicios_montos_validos
    check (presupuesto_ars >= 0 and costo_ars >= 0 and (cobrado_ars is null or cobrado_ars >= 0)
       and garantia_dias between 0 and 3650),
  constraint servicios_largos
    check (char_length(cliente) between 1 and 80 and char_length(telefono) <= 40
       and char_length(equipo) between 1 and 120 and char_length(imei) <= 20
       and char_length(falla) <= 500 and char_length(trabajo) <= 500 and char_length(notas) <= 500)
);
create index if not exists servicios_estado on public.servicios (estado);

-- ---------------------------------------------------------------------------
-- Permisos de las tablas nuevas: igual que las demas. Nada para un visitante;
-- los usuarios con sesion pasan solo si son administradores.
-- ---------------------------------------------------------------------------
revoke all on table public.proveedores, public.comprobantes, public.movimientos_caja, public.servicios
from public, anon;

grant select, insert, update, delete on table
  public.proveedores, public.comprobantes, public.movimientos_caja, public.servicios
to authenticated;

alter table public.proveedores      enable row level security;
alter table public.comprobantes     enable row level security;
alter table public.movimientos_caja enable row level security;
alter table public.servicios        enable row level security;

drop policy if exists solo_administradores on public.proveedores;
create policy solo_administradores on public.proveedores
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.comprobantes;
create policy solo_administradores on public.comprobantes
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.movimientos_caja;
create policy solo_administradores on public.movimientos_caja
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists solo_administradores on public.servicios;
create policy solo_administradores on public.servicios
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------------------
-- Ayudas internas.
-- ---------------------------------------------------------------------------

-- Medio de pago de un solo tipo. Vacio = efectivo.
create or replace function public.medio_simple(p_medio text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_medio text := coalesce(nullif(p_medio, ''), 'efectivo');
begin
  if v_medio not in ('efectivo', 'transferencia') then raise exception 'Medio de pago desconocido'; end if;
  return v_medio;
end;
$$;

-- Lee como se cobro algo desde { medio, efectivo_ars }. "mixto" es parte en
-- efectivo y parte por transferencia, y obliga a decir cuanto fue en efectivo.
create or replace function public.leer_cobro(p_datos jsonb, out medio text, out efectivo_ars numeric)
language plpgsql immutable set search_path = '' as $$
begin
  medio := coalesce(nullif(p_datos->>'medio', ''), 'efectivo');
  if medio not in ('efectivo', 'transferencia', 'mixto') then raise exception 'Medio de pago desconocido'; end if;
  if medio = 'mixto' then
    efectivo_ars := round((p_datos->>'efectivo_ars')::numeric, 4);
    if efectivo_ars is null or efectivo_ars < 0 then raise exception 'Falta cuánto pagó en efectivo'; end if;
  end if;
end;
$$;

-- De un total cobrado, cuanto fue en efectivo. El resto es transferencia.
-- Un total negativo (en una permuta, cuando el comercio paga la diferencia)
-- se toma entero como efectivo que sale.
create or replace function public.parte_efectivo(p_medio text, p_efectivo numeric, p_total numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when p_total < 0 then p_total
    when coalesce(p_medio, 'efectivo') = 'efectivo' then p_total
    when p_medio = 'transferencia' then 0
    else least(greatest(coalesce(p_efectivo, 0), 0), p_total)
  end;
$$;

-- Dias de garantia que estan cargados en Ajustes para cada cosa.
create or replace function public.garantia_por_defecto(p_tabla text)
returns integer language sql stable set search_path = '' as $$
  select case p_tabla
           when 'celulares' then garantia_dias_celulares
           when 'accesorios' then garantia_dias_accesorios
           else garantia_dias_servicio
         end
    from public.configuracion where id = 1;
$$;

-- Devuelve el id del proveedor con ese nombre. Si no existe lo crea: asi se
-- puede escribir un proveedor nuevo en el mismo momento de cargar stock o un
-- gasto. Con el nombre vacio devuelve NULL (sin proveedor).
create or replace function public.proveedor_por_nombre(p_nombre text)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_clave text := public.normalizar(p_nombre);
  v_id    bigint;
begin
  if v_clave = '' then return null; end if;
  select id into v_id from public.proveedores where clave = v_clave;
  if v_id is null then
    insert into public.proveedores (nombre, clave)
    values (upper(public.limpiar(p_nombre)), v_clave)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Crea el comprobante de una venta de mostrador o de una permuta.
-- p_datos: { cliente, telefono, medio, efectivo_ars, nota }. Todo es opcional.
create or replace function public.crear_comprobante(p_origen text, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_cobro record;
  v_id    bigint;
begin
  select * into v_cobro from public.leer_cobro(p_datos);
  insert into public.comprobantes (origen, cliente, telefono, medio, efectivo_ars, nota)
  values (p_origen, upper(public.limpiar(p_datos->>'cliente')), public.limpiar(p_datos->>'telefono'),
          v_cobro.medio, v_cobro.efectivo_ars, public.limpiar(p_datos->>'nota'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Igual que antes, y ademas deja en cada unidad su comprobante y sus dias de
-- garantia. Sin p_garantia usa los dias cargados en Ajustes.
drop function if exists public.pasar_a_vendido(text, jsonb, text);
create or replace function public.pasar_a_vendido(
  p_tabla text, p_items jsonb, p_origen text, p_comprobante bigint default null, p_garantia integer default null
) returns integer language plpgsql set search_path = '' as $$
declare
  v_items    jsonb := coalesce(p_items, '[]'::jsonb);
  v_garantia integer := coalesce(p_garantia, public.garantia_por_defecto(p_tabla));
  v_venta    numeric;
  v_costo    numeric;
  v_hechas   integer;
begin
  if jsonb_array_length(v_items) = 0 then return 0; end if;

  if exists (
    select 1 from jsonb_array_elements(v_items) e
     where (e->>'precio_usd') is null or (e->>'precio_usd')::numeric < 0
  ) then
    raise exception 'El precio no puede ser negativo';
  end if;
  if v_garantia < 0 or v_garantia > 3650 then
    raise exception 'La garantía tiene que estar entre 0 y 3650 días';
  end if;

  -- Cotizaciones de hoy: quedan guardadas en cada unidad vendida.
  select cotizacion_dolar, coalesce(cotizacion_costo, cotizacion_dolar)
    into strict v_venta, v_costo
    from public.configuracion where id = 1;

  execute format(
    'update public.%I u
        set estado = ''vendido'', precio_usd = round((e->>''precio_usd'')::numeric, 4),
            fecha_venta = now(), cotizacion_venta = $2, cotizacion_costo = $3,
            comprobante_id = $5, garantia_dias = $6
       from jsonb_array_elements($1) e
      where u.id = (e->>''id'')::bigint and u.estado = $4',
    public.tabla_valida(p_tabla)) using v_items, v_venta, v_costo, p_origen, p_comprobante, v_garantia;
  get diagnostics v_hechas = row_count;

  if v_hechas <> jsonb_array_length(v_items) then
    raise exception 'El stock cambió. Actualizá la página y probá de nuevo.';
  end if;
  return v_hechas;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ajustes. p_datos trae los campos que se quieren cambiar; los que no vienen
-- quedan como estaban. Los limites los revisa la tabla.
-- ---------------------------------------------------------------------------
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
    etiqueta_ancho_mm        = coalesce((p_datos->>'etiqueta_ancho_mm')::integer, etiqueta_ancho_mm),
    etiqueta_alto_mm         = coalesce((p_datos->>'etiqueta_alto_mm')::integer, etiqueta_alto_mm)
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Carga de stock: ahora se puede decir a que proveedor se le compro.
-- ---------------------------------------------------------------------------
drop function if exists public.ingresar_celulares(text, text, text, text, text, numeric, numeric, integer, text[]);
create or replace function public.ingresar_celulares(
  p_modelo text, p_capacidad text, p_color text, p_bateria text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer,
  p_imeis text[] default null, p_proveedor text default null
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
    insert into public.celulares (modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd, proveedor_id)
    values (upper(public.limpiar(p_modelo)), upper(public.limpiar(p_capacidad)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_bateria)),
            upper(public.limpiar(p_detalles)),
            -- v_imeis[i] es NULL cuando no hay un IMEI para esa posicion.
            nullif(public.limpiar(v_imeis[i]), ''),
            round(p_costo_usd, 4), round(p_precio_usd, 4), v_proveedor)
    returning clave into v_clave;
  end loop;

  perform public.promediar_lote('celulares', v_clave);
  return p_cantidad;
end;
$$;

drop function if exists public.ingresar_accesorios(text, text, text, text, numeric, numeric, integer);
create or replace function public.ingresar_accesorios(
  p_tipo text, p_modelo text, p_color text, p_detalles text,
  p_costo_usd numeric, p_precio_usd numeric, p_cantidad integer, p_proveedor text default null
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
    insert into public.accesorios (tipo, modelo, color, detalles, costo_usd, precio_usd, proveedor_id)
    values (upper(public.limpiar(p_tipo)), upper(public.limpiar(p_modelo)),
            upper(public.limpiar(p_color)), upper(public.limpiar(p_detalles)),
            round(p_costo_usd, 4), round(p_precio_usd, 4), v_proveedor)
    returning clave into v_clave;
  end loop;

  perform public.promediar_lote('accesorios', v_clave);
  return p_cantidad;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ventas.
-- ---------------------------------------------------------------------------

-- Una venta de mostrador. p_datos (todo opcional):
--   { cliente, telefono, medio, efectivo_ars, nota,
--     garantia_celulares, garantia_accesorios }   <- dias; sin dato, los de Ajustes
-- Devuelve { unidades, comprobante }: el comprobante es el numero de ticket.
drop function if exists public.vender(jsonb, jsonb);
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
  return jsonb_build_object('unidades', v_total, 'comprobante', v_comprobante);
end;
$$;

-- Corrige los datos de un comprobante: quien compro y como pago. El medio de
-- pago solo aplica a ventas de mostrador y permutas.
create or replace function public.editar_comprobante(p_id bigint, p_datos jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_cobro record;
begin
  perform public.exigir_admin();
  select * into v_cobro from public.leer_cobro(p_datos);
  update public.comprobantes
     set cliente = upper(public.limpiar(p_datos->>'cliente')),
         telefono = public.limpiar(p_datos->>'telefono'),
         nota = public.limpiar(coalesce(p_datos->>'nota', nota)),
         medio = case when origen in ('mostrador', 'permuta') then v_cobro.medio else medio end,
         efectivo_ars = case when origen in ('mostrador', 'permuta') then v_cobro.efectivo_ars else efectivo_ars end
   where id = p_id;
  if not found then raise exception 'Ese comprobante ya no existe. Actualizá la página.'; end if;
end;
$$;

-- Igual que antes, y ademas la unidad pierde su comprobante y su garantia.
-- Un comprobante que se queda sin unidades se borra.
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
            fecha_revendedor = null, comprobante_id = null, garantia_dias = null %2$s,
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

  delete from public.comprobantes c
   where not exists (select 1 from public.celulares u where u.comprobante_id = c.id)
     and not exists (select 1 from public.accesorios u where u.comprobante_id = c.id);
  return v_hechas;
end;
$$;

-- Permuta. p_datos es lo mismo que en vender(): quien se lleva el equipo y
-- como paga la diferencia. Devuelve { comprobante } (NULL si no se llevo nada).
drop function if exists public.registrar_permuta(jsonb, bigint, numeric);
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

  -- Primero se vende el equipo entregado: asi el recibido no puede caer en el
  -- mismo lote y cambiarle el precio antes de la venta.
  if p_entregado_id is not null then
    -- Si no se escribio una nota, el ticket dice que equipo se recibio.
    if public.limpiar(v_datos->>'nota') = '' then
      v_datos := v_datos || jsonb_build_object('nota', left('Recibido en parte de pago: ' || upper(public.limpiar(
        concat_ws(' ', p_recibido->>'modelo', p_recibido->>'capacidad', p_recibido->>'color'))), 300));
    end if;
    v_comprobante := public.crear_comprobante('permuta', v_datos);
    perform public.pasar_a_vendido(
      'celulares',
      jsonb_build_array(jsonb_build_object('id', p_entregado_id, 'precio_usd', p_entregado_precio_usd)),
      'disponible', v_comprobante, (v_datos->>'garantia_celulares')::integer);
    update public.celulares set permuta_usd = round(v_valor, 4) where id = p_entregado_id;
  end if;

  perform public.ingresar_celulares(
    p_recibido->>'modelo', p_recibido->>'capacidad', p_recibido->>'color',
    p_recibido->>'bateria', p_recibido->>'detalles',
    v_valor, coalesce((p_recibido->>'precio_usd')::numeric, v_valor), 1,
    case when public.limpiar(p_recibido->>'imei') = '' then null else array[p_recibido->>'imei'] end);
  return jsonb_build_object('comprobante', v_comprobante);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuentas de revendedores y senas: cada pago dice como se pago, y cada vez
-- que sus unidades pasan a vendido queda un comprobante a nombre de la persona.
-- ---------------------------------------------------------------------------
drop function if exists public.anotar_pago(text, text, numeric);
create or replace function public.anotar_pago(p_tipo text, p_nombre text, p_monto_ars numeric, p_medio text default 'efectivo')
returns void language plpgsql set search_path = '' as $$
declare
  v_venta numeric;
begin
  select cotizacion_dolar into strict v_venta from public.configuracion where id = 1;
  execute format('insert into public.%I (revendedor, monto_ars, cotizacion, monto_usd, medio) values ($1, $2, $3, $4, $5)',
                 (public.datos_de_cuenta(p_tipo)).tabla_pagos)
    using p_nombre, round(p_monto_ars, 4), v_venta, round(p_monto_ars / v_venta, 4), public.medio_simple(p_medio);
end;
$$;

create or replace function public.cerrar_si_cubierto(p_tipo text, p_nombre text)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_cuenta      record;
  v_celulares   jsonb;
  v_accesorios  jsonb;
  v_valor       numeric;
  v_comprobante bigint;
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

  insert into public.comprobantes (origen, cliente) values (p_tipo, left(p_nombre, 80))
  returning id into v_comprobante;
  perform public.pasar_a_vendido('celulares', v_celulares, v_cuenta.estado, v_comprobante);
  perform public.pasar_a_vendido('accesorios', v_accesorios, v_cuenta.estado, v_comprobante);
  execute format('update public.%I set aplicado = true where revendedor = $1 and not aplicado',
                 v_cuenta.tabla_pagos) using p_nombre;
  return true;
end;
$$;

drop function if exists public.entregar_a_cuenta(text, text, jsonb, jsonb, numeric);
create or replace function public.entregar_a_cuenta(
  p_tipo text, p_nombre text, p_celulares jsonb, p_accesorios jsonb,
  p_pago_ars numeric default 0, p_medio text default 'efectivo'
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
    perform public.anotar_pago(p_tipo, v_nombre, p_pago_ars, p_medio);
  end if;
  perform public.cerrar_si_cubierto(p_tipo, v_nombre);
  return v_nombre;
end;
$$;

drop function if exists public.registrar_pago(text, text, numeric);
create or replace function public.registrar_pago(p_tipo text, p_nombre text, p_monto_ars numeric, p_medio text default 'efectivo')
returns boolean language plpgsql set search_path = '' as $$
declare
  v_nombre text;
begin
  perform public.exigir_admin();
  if p_monto_ars is null or p_monto_ars <= 0 then raise exception 'El pago tiene que ser mayor que cero'; end if;
  v_nombre := public.nombre_de_cuenta(p_tipo, p_nombre);
  perform public.anotar_pago(p_tipo, v_nombre, p_monto_ars, p_medio);
  return public.cerrar_si_cubierto(p_tipo, v_nombre);
end;
$$;

-- "Pagado". Antes, lo que faltaba cobrar se daba por cobrado en el momento
-- sin dejar rastro. Ahora ese resto queda anotado como un pago mas (con su
-- medio de pago), para que la caja lo vea. Despues se descuenta el valor
-- completo de los equipos con una fila negativa: la cuenta da lo mismo que
-- antes, porque (resto) - (valor) = -(lo que ya habia entregado).
drop function if exists public.marcar_pagado(text, text, bigint[], bigint[]);
create or replace function public.marcar_pagado(
  p_tipo text, p_nombre text, p_celulares bigint[], p_accesorios bigint[], p_medio text default 'efectivo'
) returns void language plpgsql set search_path = '' as $$
declare
  v_cuenta      record;
  v_celulares   jsonb;
  v_accesorios  jsonb;
  v_valor       numeric;
  v_resto       numeric;
  v_venta       numeric;
  v_medio       text;
  v_quedan      boolean;
  v_comprobante bigint;
begin
  perform public.exigir_admin();
  select * into v_cuenta from public.datos_de_cuenta(p_tipo);
  v_medio := public.medio_simple(p_medio);

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

  if v_valor > 0 then
    select cotizacion_dolar into strict v_venta from public.configuracion where id = 1;
    -- Lo que falta despues de usar lo ya entregado se cobra ahora.
    v_resto := round(v_valor - least(v_valor, greatest(public.entregado_de_cuenta(p_tipo, p_nombre), 0)), 4);
    if v_resto > 0 then
      execute format('insert into public.%I (revendedor, monto_ars, cotizacion, monto_usd, medio) values ($1, $2, $3, $4, $5)',
                     v_cuenta.tabla_pagos)
        using p_nombre, round(v_resto * v_venta, 4), v_venta, v_resto, v_medio;
    end if;
    execute format('insert into public.%I (revendedor, monto_ars, cotizacion, monto_usd) values ($1, $2, $3, $4)',
                   v_cuenta.tabla_pagos)
      using p_nombre, -round(v_valor * v_venta, 4), v_venta, -round(v_valor, 4);
  end if;

  insert into public.comprobantes (origen, cliente) values (p_tipo, left(p_nombre, 80))
  returning id into v_comprobante;
  perform public.pasar_a_vendido('celulares', v_celulares, v_cuenta.estado, v_comprobante);
  perform public.pasar_a_vendido('accesorios', v_accesorios, v_cuenta.estado, v_comprobante);

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

-- Corrige un pago: el monto (0 o NULL lo elimina) y, si viene, el medio.
drop function if exists public.editar_pago(text, bigint, numeric);
create or replace function public.editar_pago(p_tipo text, p_id bigint, p_monto_ars numeric, p_medio text default null)
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
      'update public.%I set monto_ars = round($2, 4), monto_usd = round($2 / cotizacion, 4), medio = coalesce($3, medio)
        where id = $1 and not aplicado and monto_usd > 0 returning revendedor',
      v_cuenta.tabla_pagos) into v_nombre
      using p_id, p_monto_ars, case when p_medio is null then null else public.medio_simple(p_medio) end;
  end if;
  if v_nombre is null then raise exception 'Ese pago ya no se puede cambiar. Actualizá la página.'; end if;

  if public.entregado_de_cuenta(p_tipo, v_nombre) < -0.00005 then
    raise exception 'No se puede: parte de esa plata ya se usó en equipos marcados como pagados';
  end if;
  return public.cerrar_si_cubierto(p_tipo, v_nombre);
end;
$$;

-- ---------------------------------------------------------------------------
-- Proveedores. p_datos: { nombre, telefono, rubro, notas }.
-- Con p_id NULL crea uno nuevo; con un id, lo modifica. Devuelve el id.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_proveedor(p_id bigint, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_clave text := public.normalizar(p_datos->>'nombre');
  v_id    bigint;
begin
  perform public.exigir_admin();
  if v_clave = '' then raise exception 'Falta el nombre'; end if;
  if exists (select 1 from public.proveedores where clave = v_clave and id is distinct from p_id) then
    raise exception 'Ya hay un proveedor con ese nombre';
  end if;

  if p_id is null then
    insert into public.proveedores (nombre, clave, telefono, rubro, notas)
    values (upper(public.limpiar(p_datos->>'nombre')), v_clave, public.limpiar(p_datos->>'telefono'),
            upper(public.limpiar(p_datos->>'rubro')), public.limpiar(p_datos->>'notas'))
    returning id into v_id;
  else
    update public.proveedores
       set nombre = upper(public.limpiar(p_datos->>'nombre')), clave = v_clave,
           telefono = public.limpiar(p_datos->>'telefono'),
           rubro = upper(public.limpiar(p_datos->>'rubro')), notas = public.limpiar(p_datos->>'notas')
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Ese proveedor ya no existe. Actualizá la página.'; end if;
  end if;
  return v_id;
end;
$$;

-- No se elimina un proveedor que tiene mercaderia cargada o pagos anotados:
-- se perderia de donde vino cada cosa.
create or replace function public.eliminar_proveedor(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if exists (select 1 from public.celulares where proveedor_id = p_id)
     or exists (select 1 from public.accesorios where proveedor_id = p_id)
     or exists (select 1 from public.movimientos_caja where proveedor_id = p_id) then
    raise exception 'No se puede eliminar: tiene mercadería o pagos registrados';
  end if;
  delete from public.proveedores where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Caja: movimientos anotados a mano.
-- p_datos: { tipo, categoria, detalle, cliente, monto_ars, medio, proveedor, fecha }
--   tipo: 'ingreso' o 'egreso'. proveedor: el nombre (se crea si es nuevo).
--   fecha: opcional, para anotar algo de otro dia.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_movimiento(p_id bigint, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_tipo      text := p_datos->>'tipo';
  v_categoria text := upper(public.limpiar(p_datos->>'categoria'));
  v_monto     numeric;
  v_medio     text;
  v_proveedor bigint;
  v_id        bigint;
begin
  perform public.exigir_admin();
  if v_tipo is null or v_tipo not in ('ingreso', 'egreso') then raise exception 'Tipo de movimiento desconocido'; end if;
  if v_categoria = '' then raise exception 'Falta la categoría'; end if;
  v_monto := round((p_datos->>'monto_ars')::numeric, 4);
  if v_monto is null or v_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;
  v_medio := public.medio_simple(p_datos->>'medio');
  v_proveedor := public.proveedor_por_nombre(p_datos->>'proveedor');

  if p_id is null then
    insert into public.movimientos_caja (fecha, tipo, categoria, detalle, cliente, monto_ars, medio, proveedor_id)
    values (coalesce(nullif(p_datos->>'fecha', '')::timestamptz, now()), v_tipo, v_categoria,
            public.limpiar(p_datos->>'detalle'), upper(public.limpiar(p_datos->>'cliente')),
            v_monto, v_medio, v_proveedor)
    returning id into v_id;
  else
    update public.movimientos_caja
       set fecha = coalesce(nullif(p_datos->>'fecha', '')::timestamptz, fecha), tipo = v_tipo,
           categoria = v_categoria, detalle = public.limpiar(p_datos->>'detalle'),
           cliente = upper(public.limpiar(p_datos->>'cliente')),
           monto_ars = v_monto, medio = v_medio, proveedor_id = v_proveedor
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Ese movimiento ya no existe. Actualizá la página.'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.eliminar_movimiento(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.movimientos_caja where id = p_id;
  if not found then raise exception 'Ese movimiento ya no existe. Actualizá la página.'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Servicio tecnico.
-- p_datos: { cliente, telefono, equipo, imei, falla, trabajo, notas, estado,
--            presupuesto_ars, costo_ars, en_garantia }
-- Una orden entregada no se modifica: primero hay que reabrirla.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_servicio(p_id bigint, p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_estado      text := coalesce(nullif(p_datos->>'estado', ''), 'recibido');
  v_presupuesto numeric;
  v_costo       numeric;
  v_actual      text;
  v_id          bigint;
begin
  perform public.exigir_admin();
  if public.limpiar(p_datos->>'cliente') = '' then raise exception 'Falta el nombre del cliente'; end if;
  if public.limpiar(p_datos->>'equipo') = '' then raise exception 'Falta el equipo'; end if;
  if v_estado not in ('recibido', 'reparando', 'listo', 'cancelado') then
    raise exception 'Para entregar una orden usá el botón "Entregar"';
  end if;
  v_presupuesto := round(coalesce((p_datos->>'presupuesto_ars')::numeric, 0), 4);
  v_costo := round(coalesce((p_datos->>'costo_ars')::numeric, 0), 4);
  if v_presupuesto < 0 or v_costo < 0 then raise exception 'Los montos no pueden ser negativos'; end if;

  if p_id is null then
    insert into public.servicios (cliente, telefono, equipo, imei, falla, trabajo, notas, estado,
                                  presupuesto_ars, costo_ars, en_garantia)
    values (upper(public.limpiar(p_datos->>'cliente')), public.limpiar(p_datos->>'telefono'),
            upper(public.limpiar(p_datos->>'equipo')), public.limpiar(p_datos->>'imei'),
            public.limpiar(p_datos->>'falla'), public.limpiar(p_datos->>'trabajo'),
            public.limpiar(p_datos->>'notas'), v_estado, v_presupuesto, v_costo,
            coalesce((p_datos->>'en_garantia')::boolean, false))
    returning id into v_id;
    return v_id;
  end if;

  select estado into v_actual from public.servicios where id = p_id;
  if v_actual is null then raise exception 'Esa orden ya no existe. Actualizá la página.'; end if;
  if v_actual = 'entregado' then raise exception 'Esa orden ya fue entregada. Reabrila para cambiarla.'; end if;

  update public.servicios
     set cliente = upper(public.limpiar(p_datos->>'cliente')), telefono = public.limpiar(p_datos->>'telefono'),
         equipo = upper(public.limpiar(p_datos->>'equipo')), imei = public.limpiar(p_datos->>'imei'),
         falla = public.limpiar(p_datos->>'falla'), trabajo = public.limpiar(p_datos->>'trabajo'),
         notas = public.limpiar(p_datos->>'notas'), estado = v_estado,
         presupuesto_ars = v_presupuesto, costo_ars = v_costo,
         en_garantia = coalesce((p_datos->>'en_garantia')::boolean, false)
   where id = p_id;
  return p_id;
end;
$$;

-- Entrega el equipo y anota el cobro (0 si fue por garantia o sin cargo).
-- p_datos: { cobrado_ars, medio, efectivo_ars, garantia_dias }.
create or replace function public.entregar_servicio(p_id bigint, p_datos jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_cobro   record;
  v_cobrado numeric;
begin
  perform public.exigir_admin();
  select * into v_cobro from public.leer_cobro(p_datos);
  v_cobrado := round(coalesce((p_datos->>'cobrado_ars')::numeric, 0), 4);
  if v_cobrado < 0 then raise exception 'El cobro no puede ser negativo'; end if;

  update public.servicios
     set estado = 'entregado', cobrado_ars = v_cobrado, medio = v_cobro.medio,
         efectivo_ars = v_cobro.efectivo_ars, fecha_entrega = now(),
         garantia_dias = coalesce((p_datos->>'garantia_dias')::integer, public.garantia_por_defecto('servicios'))
   where id = p_id and estado not in ('entregado', 'cancelado');
  if not found then raise exception 'Esa orden ya fue entregada o cancelada. Actualizá la página.'; end if;
end;
$$;

-- Deshace una entrega o una cancelacion: la orden vuelve a "listo" y su
-- cobro desaparece de la caja.
create or replace function public.reabrir_servicio(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  update public.servicios
     set estado = 'listo', cobrado_ars = null, medio = null, efectivo_ars = null,
         fecha_entrega = null, garantia_dias = 0
   where id = p_id and estado in ('entregado', 'cancelado');
  if not found then raise exception 'Esa orden no está entregada ni cancelada. Actualizá la página.'; end if;
end;
$$;

-- Borra una orden cargada por error. Una entregada no se borra: tiene un cobro.
create or replace function public.eliminar_servicio(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.servicios where id = p_id and estado <> 'entregado';
  if not found then raise exception 'No se puede borrar una orden entregada. Reabrila primero.'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecturas.
-- ---------------------------------------------------------------------------

-- Igual que antes, mas: todos los ajustes, los proveedores (con cuantas
-- unidades se les compraron y cuanto se les pago) y los lotes que se quedaron
-- sin ninguna unidad en los ultimos 30 dias ("agotados").
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
        -- bool_and(...) es true solo si TODAS las unidades del lote estan vendidas.
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
        having bool_and(estado = 'vendido') and max(fecha_venta) > now() - interval '30 days') f), '[]'::jsonb)
  );
end;
$$;

-- El historial: las unidades vendidas, cada una con su comprobante y su
-- garantia, y la lista de comprobantes (quien compro y como pago).
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
        select id, fecha, origen, cliente, telefono, medio, efectivo_ars, nota
          from public.comprobantes) f), '[]'::jsonb)
  );
end;
$$;

-- Un comprobante con todas sus unidades: lo que hace falta para el ticket.
create or replace function public.comprobante_datos(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_resultado jsonb;
begin
  perform public.exigir_admin();
  select jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'origen', c.origen, 'cliente', c.cliente, 'telefono', c.telefono,
    'medio', c.medio, 'efectivo_ars', c.efectivo_ars, 'nota', c.nota,
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

-- Igual que antes, mas la garantia, quien lo compro y a que proveedor se le compro.
create or replace function public.buscar_imei(p_imei text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_imei text := public.limpiar(p_imei);
begin
  perform public.exigir_admin();
  if char_length(v_imei) < 4 then raise exception 'Escribí al menos 4 dígitos del IMEI'; end if;
  return coalesce((
    select jsonb_agg(f) from (
      select u.id, u.clave, u.modelo, u.capacidad, u.color, u.bateria, u.detalles, u.imei, u.estado,
             u.precio_usd, u.fecha_ingreso, u.fecha_venta, u.cotizacion_venta, u.revendedor,
             u.precio_revendedor, u.garantia_dias, u.comprobante_id,
             c.cliente, c.telefono, p.nombre as proveedor
        from public.celulares u
        left join public.comprobantes c on c.id = u.comprobante_id
        left join public.proveedores p on p.id = u.proveedor_id
       -- strpos busca el texto tal cual: no interpreta % ni _ como comodines.
       where strpos(u.imei, v_imei) > 0
       order by u.fecha_ingreso desc limit 20) f), '[]'::jsonb);
end;
$$;

-- La caja: una lista con TODA la plata que entro o salio, venga de donde venga.
-- Cada fila trae cuanto fue en efectivo y cuanto por transferencia, con signo:
-- positivo entra, negativo sale.
--   * venta: ventas de mostrador y permutas (por la diferencia cobrada).
--   * pago_revendedor / pago_sena: la plata que entregan a cuenta. Las ventas
--     que salen de esas cuentas no figuran: se cobraron con estos pagos.
--   * servicio: arreglos entregados y cobrados.
--   * movimiento: lo anotado a mano (gastos, retiros, ventas aparte).
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
    -- Una fila por venta. Las ventas viejas, de antes de que existieran los
    -- comprobantes, se juntan por su fecha exacta y cuentan como efectivo.
    ventas as (
      select u.comprobante_id, u.fecha_venta as fecha, sum(u.cobrado) as total,
             count(*) as cantidad, min(u.nombre) as nombre
        from unidades u
        left join public.comprobantes c on c.id = u.comprobante_id
       where (c.id is null and u.revendedor is null) or c.origen in ('mostrador', 'permuta')
       group by u.comprobante_id, u.fecha_venta
    ),
    filas as (
      select 'venta' as origen, v.comprobante_id as id, v.fecha,
             case when c.origen = 'permuta' then 'Venta con permuta' else 'Venta' end as concepto,
             case when v.cantidad = 1 then v.nombre else v.cantidad || ' productos' end as detalle,
             coalesce(c.cliente, '') as persona,
             public.parte_efectivo(c.medio, c.efectivo_ars, v.total) as efectivo_ars,
             v.total - public.parte_efectivo(c.medio, c.efectivo_ars, v.total) as transferencia_ars,
             null::text as tipo, null::text as categoria, null::text as medio, null::text as proveedor
        from ventas v
        left join public.comprobantes c on c.id = v.comprobante_id
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

-- Todas las ordenes de servicio tecnico, la mas nueva primero.
create or replace function public.servicios_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    select jsonb_agg(f order by f.id desc) from (
      select id, fecha_ingreso, cliente, telefono, equipo, imei, falla, trabajo, notas, estado,
             presupuesto_ars, costo_ars, en_garantia, cobrado_ars, medio, efectivo_ars,
             fecha_entrega, garantia_dias
        from public.servicios) f), '[]'::jsonb);
end;
$$;

-- Todo lo que se vendio o se arreglo con garantia: las vigentes y las que
-- vencieron hace menos de 90 dias.
create or replace function public.garantias_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    select jsonb_agg(f order by f.vence) from (
      select 'celulares' as tabla, u.id,
             concat_ws(' ', u.modelo, nullif(u.capacidad, ''), nullif(u.color, '')) as descripcion,
             coalesce(u.imei, '') as imei, u.fecha_venta as desde, u.garantia_dias as dias,
             u.fecha_venta + u.garantia_dias * interval '1 day' as vence,
             coalesce(nullif(c.cliente, ''), u.revendedor, '') as cliente,
             coalesce(c.telefono, '') as telefono, u.comprobante_id
        from public.celulares u
        left join public.comprobantes c on c.id = u.comprobante_id
       where u.estado = 'vendido' and u.garantia_dias > 0
      union all
      select 'accesorios', u.id,
             concat_ws(' ', u.tipo, nullif(u.modelo, ''), nullif(u.color, '')),
             '', u.fecha_venta, u.garantia_dias,
             u.fecha_venta + u.garantia_dias * interval '1 day',
             coalesce(nullif(c.cliente, ''), u.revendedor, ''),
             coalesce(c.telefono, ''), u.comprobante_id
        from public.accesorios u
        left join public.comprobantes c on c.id = u.comprobante_id
       where u.estado = 'vendido' and u.garantia_dias > 0
      union all
      select 'servicios', s.id, 'ARREGLO ' || s.equipo, s.imei, s.fecha_entrega, s.garantia_dias,
             s.fecha_entrega + s.garantia_dias * interval '1 day',
             s.cliente, s.telefono, null::bigint
        from public.servicios s
       where s.estado = 'entregado' and s.garantia_dias > 0
    ) f
    where f.vence > now() - interval '90 days'
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones. Hay que repetirlo en cada migracion que crea
-- funciones: Postgres deja que cualquiera ejecute una funcion recien creada.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
