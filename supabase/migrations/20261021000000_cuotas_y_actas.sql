-- 20261021000000_cuotas_y_actas.sql
-- Lo que pidio Import Salta sobre el sistema base:
--   * Cuotas: el administrador elige en que cuotas se puede pagar (3, 6, 9,
--     12...) y con que recargo cada una. El catalogo muestra cuanto queda
--     cada cuota. Se cobra solo en el local, con el posnet bancario (Payway).
--   * Cobro con tarjeta: al vender se puede elegir "Tarjeta (posnet)" y en
--     cuantas cuotas. El ticket dice cuantas cuotas y de cuanto.
--   * Acta de entrega y garantia: cada celular vendido lleva un acta con la
--     revision punto por punto (camara, bateria, pantalla, Face ID...), los
--     dias de garantia y las firmas del cliente y del vendedor. Sin las dos
--     firmas y sin revisar todos los puntos, la base no la guarda.
--
-- Como siempre: el panel no escribe en las tablas, llama a funciones. Todo se
-- puede correr dos veces sin romper nada.

-- ---------------------------------------------------------------------------
-- Ajustes nuevos en la unica fila de "configuracion".
-- ---------------------------------------------------------------------------
alter table public.configuracion
  -- Planes de cuotas que se muestran: [{ "cuotas": 3, "recargo": 0 }, ...].
  -- "recargo" es el porcentaje que se suma al precio de lista (0 = sin interes).
  -- Arranca vacio: el dueno los carga en Ajustes.
  add column if not exists cuotas_planes jsonb not null default '[]'::jsonb,
  -- Texto que acompana las cuotas en el catalogo.
  add column if not exists cuotas_leyenda text not null default
    'Con tarjeta de crédito bancaria. Se abona en el local con posnet Payway.',
  -- Si las cuotas tambien se muestran en los accesorios (si no, solo en celulares).
  add column if not exists cuotas_accesorios boolean not null default false,
  -- Los puntos que se revisan con el cliente antes de entregar un celular.
  add column if not exists revision_puntos jsonb not null default
    '["Pantalla (imagen y táctil)", "Face ID / Touch ID", "Cámara trasera", "Cámara delantera",
      "Batería (condición y porcentaje)", "Carga por cable", "Altavoz y auricular", "Micrófono",
      "Botones y vibración", "Wi-Fi y Bluetooth", "Señal y lectura de SIM", "True Tone",
      "Sin bloqueo de iCloud", "Carcasa y estética"]'::jsonb,
  -- Las condiciones de la garantia que salen impresas en el acta, arriba de las firmas.
  add column if not exists acta_condiciones text not null default
    'El comercio garantiza el correcto funcionamiento del equipo durante el plazo indicado en esta acta, contado desde la fecha de entrega. La garantía cubre fallas de funcionamiento que no hayan sido provocadas por el uso. No cubre golpes, caídas, humedad, pantalla o vidrio dañados, equipos abiertos o reparados por terceros, ni el desgaste normal de la batería. El cliente declara haber revisado el equipo junto al vendedor y recibirlo en las condiciones detalladas en esta acta. Para cualquier reclamo es necesario presentar esta acta.';

alter table public.configuracion drop constraint if exists configuracion_cuotas_y_actas_validas;
alter table public.configuracion add constraint configuracion_cuotas_y_actas_validas check (
      jsonb_typeof(cuotas_planes) = 'array' and jsonb_array_length(cuotas_planes) <= 12
  and jsonb_typeof(revision_puntos) = 'array' and jsonb_array_length(revision_puntos) between 1 and 40
  and char_length(cuotas_leyenda) <= 200
  and char_length(acta_condiciones) between 1 and 2000
);

-- Revisa y ordena una lista de planes de cuotas. Cada plan: cuotas entre 2 y
-- 48, recargo entre 0 y 300 %, sin repetir la cantidad de cuotas.
create or replace function public.limpiar_cuotas(p_planes jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_plan    jsonb;
  v_cuotas  integer;
  v_recargo numeric;
  v_vistos  integer[] := '{}';
  v_lista   jsonb := '[]'::jsonb;
begin
  if p_planes is null or jsonb_typeof(p_planes) <> 'array' then raise exception 'Los planes de cuotas no son válidos'; end if;
  if jsonb_array_length(p_planes) > 12 then raise exception 'Como máximo 12 planes de cuotas'; end if;
  for v_plan in select * from jsonb_array_elements(p_planes) loop
    v_cuotas := (v_plan->>'cuotas')::integer;
    v_recargo := round(coalesce((v_plan->>'recargo')::numeric, 0), 2);
    if v_cuotas is null or v_cuotas < 2 or v_cuotas > 48 then raise exception 'Las cuotas van de 2 a 48'; end if;
    if v_recargo < 0 or v_recargo > 300 then raise exception 'El recargo va de 0 %% a 300 %%'; end if;
    if v_cuotas = any (v_vistos) then raise exception 'El plan de % cuotas está repetido', v_cuotas; end if;
    v_vistos := v_vistos || v_cuotas;
    v_lista := v_lista || jsonb_build_object('cuotas', v_cuotas, 'recargo', v_recargo);
  end loop;
  return coalesce((select jsonb_agg(plan order by (plan->>'cuotas')::integer) from jsonb_array_elements(v_lista) plan), '[]'::jsonb);
end;
$$;

-- Revisa la lista de puntos de la revision: textos de 1 a 60 letras, sin repetir.
create or replace function public.limpiar_puntos(p_puntos jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_punto text;
  v_lista text[] := '{}';
begin
  if p_puntos is null or jsonb_typeof(p_puntos) <> 'array' then raise exception 'La lista de la revisión no es válida'; end if;
  for v_punto in select public.limpiar(valor) from jsonb_array_elements_text(p_puntos) valor loop
    if v_punto = '' then continue; end if;
    if char_length(v_punto) > 60 then raise exception 'Cada punto de la revisión tiene que tener hasta 60 letras'; end if;
    if public.normalizar(v_punto) = any (select public.normalizar(otro) from unnest(v_lista) otro) then continue; end if;
    v_lista := v_lista || v_punto;
  end loop;
  if cardinality(v_lista) = 0 then raise exception 'La revisión tiene que tener al menos un punto'; end if;
  if cardinality(v_lista) > 40 then raise exception 'Como máximo 40 puntos en la revisión'; end if;
  return to_jsonb(v_lista);
end;
$$;

-- Igual que antes, mas las cuotas, la revision y las condiciones del acta.
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
    acta_condiciones         = public.limpiar(coalesce(p_datos->>'acta_condiciones', acta_condiciones))
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobro con tarjeta en el posnet.
-- El precio que se anota en la venta sigue siendo el de lista: el recargo de
-- las cuotas cubre lo que cobra el banco por financiar. Se guarda en cuantas
-- cuotas y con que recargo se paso, para el ticket y para consultarlo despues.
-- En la caja, lo cobrado con tarjeta va junto con las transferencias: es
-- plata que entra al banco y no a la caja del local.
-- ---------------------------------------------------------------------------
alter table public.comprobantes
  add column if not exists cuotas      integer,
  add column if not exists recargo_pct numeric(8,4);

alter table public.comprobantes drop constraint if exists comprobantes_medio_valido;
alter table public.comprobantes add constraint comprobantes_medio_valido
  check (medio is null or medio in ('efectivo', 'transferencia', 'mixto', 'tarjeta'));
alter table public.comprobantes drop constraint if exists comprobantes_cuotas_validas;
alter table public.comprobantes add constraint comprobantes_cuotas_validas check (
  (medio = 'tarjeta' and cuotas between 1 and 48 and recargo_pct between 0 and 300)
  or (medio is distinct from 'tarjeta' and cuotas is null and recargo_pct is null)
);

alter table public.servicios drop constraint if exists servicios_medio_valido;
alter table public.servicios add constraint servicios_medio_valido
  check (medio is null or medio in ('efectivo', 'transferencia', 'mixto', 'tarjeta'));

-- Igual que antes, mas "tarjeta". Con tarjeta no hay parte en efectivo.
create or replace function public.leer_cobro(p_datos jsonb, out medio text, out efectivo_ars numeric)
language plpgsql immutable set search_path = '' as $$
begin
  medio := coalesce(nullif(p_datos->>'medio', ''), 'efectivo');
  if medio not in ('efectivo', 'transferencia', 'mixto', 'tarjeta') then raise exception 'Medio de pago desconocido'; end if;
  if medio = 'mixto' then
    efectivo_ars := round((p_datos->>'efectivo_ars')::numeric, 4);
    if efectivo_ars is null or efectivo_ars < 0 then raise exception 'Falta cuánto pagó en efectivo'; end if;
  end if;
end;
$$;

-- Lo cobrado con tarjeta no es efectivo: va con lo del banco.
create or replace function public.parte_efectivo(p_medio text, p_efectivo numeric, p_total numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when p_total < 0 then p_total
    when coalesce(p_medio, 'efectivo') = 'efectivo' then p_total
    when p_medio in ('transferencia', 'tarjeta') then 0
    else least(greatest(coalesce(p_efectivo, 0), 0), p_total)
  end;
$$;

-- Cuotas y recargo de un cobro con tarjeta. Sin tarjeta, los dos NULL.
-- p_datos: { medio, cuotas, recargo_pct }. Sin cuotas es un pago en 1.
create or replace function public.leer_cuotas(p_datos jsonb, out cuotas integer, out recargo_pct numeric)
language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(p_datos->>'medio', '') <> 'tarjeta' then return; end if;
  cuotas := coalesce((p_datos->>'cuotas')::integer, 1);
  recargo_pct := round(coalesce((p_datos->>'recargo_pct')::numeric, 0), 4);
  if cuotas < 1 or cuotas > 48 then raise exception 'Las cuotas van de 1 a 48'; end if;
  if recargo_pct < 0 or recargo_pct > 300 then raise exception 'El recargo va de 0 %% a 300 %%'; end if;
end;
$$;

-- Igual que antes, mas las cuotas.
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
                                   cuotas, recargo_pct)
  values (p_origen, upper(public.limpiar(p_datos->>'cliente')), public.limpiar(p_datos->>'telefono'),
          v_cobro.medio, v_cobro.efectivo_ars, public.limpiar(p_datos->>'nota'),
          public.cliente_por_nombre(p_datos->>'cliente', p_datos->>'telefono'), v_debe,
          left(upper(public.limpiar(p_datos->>'vendedor')), 80),
          v_cuotas.cuotas, v_cuotas.recargo_pct)
  returning id into v_id;
  return v_id;
end;
$$;

-- Igual que antes, mas las cuotas: al cambiar el medio de pago se cambian
-- tambien (y se borran si ya no es con tarjeta).
create or replace function public.editar_comprobante(p_id bigint, p_datos jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_cobro   record;
  v_cuotas  record;
  v_cliente bigint;
begin
  perform public.exigir_admin();
  select * into v_cobro from public.leer_cobro(p_datos);
  select * into v_cuotas from public.leer_cuotas(p_datos);
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
         cliente_id = case when origen in ('mostrador', 'permuta') then v_cliente else cliente_id end
   where id = p_id;
  if not found then raise exception 'Ese comprobante ya no existe. Actualizá la página.'; end if;
  update public.cuenta_clientes set cliente_id = v_cliente where comprobante_id = p_id and v_cliente is not null;
end;
$$;

-- Igual que antes, mas las cuotas del comprobante.
create or replace function public.comprobante_datos(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_resultado jsonb;
begin
  perform public.exigir_admin();
  select jsonb_build_object(
    'id', c.id, 'fecha', c.fecha, 'origen', c.origen, 'cliente', c.cliente, 'telefono', c.telefono,
    'medio', c.medio, 'efectivo_ars', c.efectivo_ars, 'nota', c.nota, 'debe_ars', c.debe_ars,
    'vendedor', c.vendedor, 'cuotas', c.cuotas, 'recargo_pct', c.recargo_pct,
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

-- Igual que antes, mas quien atendio y las cuotas de cada venta.
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
        select id, fecha, origen, cliente, telefono, medio, efectivo_ars, nota, cliente_id, debe_ars,
               vendedor, cuotas, recargo_pct
          from public.comprobantes) f), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- actas: el acta de entrega y garantia de un celular.
-- Una vez firmada no se edita: es lo que se firmo. Si se cargo mal, se borra
-- y se hace de nuevo con el cliente.
-- Las firmas se guardan como el trazo dibujado (el recorrido del dedo o del
-- mouse en una cuadricula de 600 x 200), no como foto: ocupan poco y se
-- imprimen nitidas. Solo pueden tener letras M y L, numeros y espacios.
-- ---------------------------------------------------------------------------
create table if not exists public.actas (
  id              bigint generated always as identity primary key,
  fecha           timestamptz not null default now(),
  -- El equipo vendido y su venta. Quedan vacios si se borran, pero el acta
  -- conserva la descripcion, el IMEI y el cliente tal como se firmaron.
  celular_id      bigint references public.celulares (id) on delete set null,
  comprobante_id  bigint references public.comprobantes (id) on delete set null,
  equipo          text        not null,
  imei            text        not null default '',
  bateria         text        not null default '',
  cliente         text        not null,
  documento       text        not null default '',
  telefono        text        not null default '',
  vendedor        text        not null,
  garantia_dias   integer     not null,
  -- [{ "punto": "Cámara trasera", "estado": "ok" | "detalle" | "no_aplica", "nota": "" }]
  revision        jsonb       not null,
  observaciones   text        not null default '',
  -- Las condiciones tal como estaban en Ajustes el dia que se firmo.
  condiciones     text        not null,
  firma_cliente   text        not null,
  firma_vendedor  text        not null,
  constraint actas_largos check (
        char_length(equipo) between 1 and 160 and char_length(imei) <= 20 and char_length(bateria) <= 10
    and char_length(cliente) between 1 and 80 and char_length(documento) <= 20 and char_length(telefono) <= 40
    and char_length(vendedor) between 1 and 80 and char_length(observaciones) <= 500
    and char_length(condiciones) <= 2000),
  constraint actas_garantia_valida check (garantia_dias between 0 and 3650),
  constraint actas_revision_valida check (jsonb_typeof(revision) = 'array' and jsonb_array_length(revision) between 1 and 40),
  constraint actas_firmas_validas check (
        firma_cliente ~ '^[ML0-9 ]+$' and firma_vendedor ~ '^[ML0-9 ]+$'
    and char_length(firma_cliente) between 10 and 60000 and char_length(firma_vendedor) between 10 and 60000)
);

create index if not exists actas_celular on public.actas (celular_id);
create index if not exists actas_fecha on public.actas (fecha);

revoke all on table public.actas from public, anon;
grant select, insert, update, delete on table public.actas to authenticated;
alter table public.actas enable row level security;
drop policy if exists solo_administradores on public.actas;
create policy solo_administradores on public.actas
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Una firma de verdad tiene al menos un trazo (una M seguida de una L): un
-- toque solo no alcanza.
create or replace function public.firma_valida(p_firma text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_firma ~ '^[ML0-9 ]+$' and p_firma ~ 'M[0-9 ]+L' and char_length(p_firma) between 10 and 60000, false);
$$;

-- Revisa la lista de la revision: cada punto con su estado, y los que tienen
-- un detalle tienen que decir cual.
create or replace function public.limpiar_revision(p_revision jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_item   jsonb;
  v_punto  text;
  v_estado text;
  v_nota   text;
  v_lista  jsonb := '[]'::jsonb;
begin
  if p_revision is null or jsonb_typeof(p_revision) <> 'array' or jsonb_array_length(p_revision) = 0 then
    raise exception 'Falta la revisión del equipo';
  end if;
  if jsonb_array_length(p_revision) > 40 then raise exception 'Como máximo 40 puntos en la revisión'; end if;
  for v_item in select * from jsonb_array_elements(p_revision) loop
    v_punto := public.limpiar(v_item->>'punto');
    v_estado := coalesce(v_item->>'estado', '');
    v_nota := public.limpiar(v_item->>'nota');
    if v_punto = '' or char_length(v_punto) > 60 then raise exception 'Hay un punto de la revisión sin nombre'; end if;
    if v_estado not in ('ok', 'detalle', 'no_aplica') then raise exception 'Falta revisar: %', v_punto; end if;
    if v_estado = 'detalle' and v_nota = '' then raise exception 'Escribí cuál es el detalle de: %', v_punto; end if;
    if char_length(v_nota) > 120 then raise exception 'La nota de % es muy larga', v_punto; end if;
    v_lista := v_lista || jsonb_build_object('punto', v_punto, 'estado', v_estado, 'nota', v_nota);
  end loop;
  return v_lista;
end;
$$;

-- Guarda un acta firmada. Devuelve su numero.
-- p_datos: { celular_id, cliente, documento, telefono, vendedor, garantia_dias,
--            revision, observaciones, firma_cliente, firma_vendedor }
-- Con celular_id (un equipo vendido) el equipo, el IMEI, la bateria, la venta
-- y los dias de garantia salen de la venta. Sin celular_id (un equipo que no
-- se vendio por el panel) hay que mandar "equipo" y, si se quiere, "imei".
create or replace function public.registrar_acta(p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_celular   public.celulares;
  v_cliente   text := upper(public.limpiar(p_datos->>'cliente'));
  v_vendedor  text := upper(public.limpiar(p_datos->>'vendedor'));
  v_equipo    text;
  v_imei      text;
  v_bateria   text;
  v_garantia  integer;
  v_id        bigint;
begin
  perform public.exigir_admin();

  if (p_datos->>'celular_id') is not null then
    select * into v_celular from public.celulares where id = (p_datos->>'celular_id')::bigint;
    if v_celular.id is null or v_celular.estado <> 'vendido' then
      raise exception 'Ese equipo no figura como vendido. Actualizá la página.';
    end if;
    v_equipo := concat_ws(' ', v_celular.modelo, nullif(v_celular.capacidad, ''), nullif(v_celular.color, ''));
    v_imei := coalesce(v_celular.imei, '');
    v_bateria := v_celular.bateria;
    v_garantia := coalesce((p_datos->>'garantia_dias')::integer, v_celular.garantia_dias, public.garantia_por_defecto('celulares'));
    if v_cliente = '' then
      select upper(public.limpiar(cliente)) into v_cliente from public.comprobantes where id = v_celular.comprobante_id;
      v_cliente := coalesce(v_cliente, '');
    end if;
  else
    v_equipo := upper(public.limpiar(p_datos->>'equipo'));
    v_imei := public.limpiar(p_datos->>'imei');
    v_bateria := public.limpiar(p_datos->>'bateria');
    v_garantia := coalesce((p_datos->>'garantia_dias')::integer, public.garantia_por_defecto('celulares'));
    if v_equipo = '' then raise exception 'Escribí qué equipo se entrega'; end if;
  end if;

  if v_cliente = '' then raise exception 'Falta el nombre del cliente'; end if;
  if v_vendedor = '' then raise exception 'Falta quién entrega el equipo'; end if;
  if v_garantia < 0 or v_garantia > 3650 then raise exception 'Los días de garantía van de 0 a 3650'; end if;
  if not public.firma_valida(p_datos->>'firma_cliente') then raise exception 'Falta la firma del cliente'; end if;
  if not public.firma_valida(p_datos->>'firma_vendedor') then raise exception 'Falta la firma del vendedor'; end if;

  insert into public.actas (celular_id, comprobante_id, equipo, imei, bateria, cliente, documento, telefono, vendedor,
                            garantia_dias, revision, observaciones, condiciones, firma_cliente, firma_vendedor)
  values (v_celular.id, v_celular.comprobante_id, left(v_equipo, 160), left(v_imei, 20), left(v_bateria, 10),
          left(v_cliente, 80), left(public.limpiar(p_datos->>'documento'), 20), left(public.limpiar(p_datos->>'telefono'), 40),
          left(v_vendedor, 80), v_garantia, public.limpiar_revision(p_datos->'revision'),
          left(public.limpiar(p_datos->>'observaciones'), 500),
          (select acta_condiciones from public.configuracion where id = 1),
          p_datos->>'firma_cliente', p_datos->>'firma_vendedor')
  returning id into v_id;
  return v_id;
end;
$$;

-- Las actas, de la mas nueva a la mas vieja, sin las firmas (pesan).
create or replace function public.actas_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    select jsonb_agg(f order by f.fecha desc) from (
      select id, fecha, celular_id, comprobante_id, equipo, imei, cliente, documento, telefono, vendedor, garantia_dias,
             (select count(*) from jsonb_array_elements(revision) item where item->>'estado' = 'detalle')::int as detalles
        from public.actas) f
  ), '[]'::jsonb);
end;
$$;

-- Un acta completa, con las firmas, para verla o imprimirla.
create or replace function public.acta_datos(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_resultado jsonb;
begin
  perform public.exigir_admin();
  select to_jsonb(a) into v_resultado from public.actas a where a.id = p_id;
  if v_resultado is null then raise exception 'Esa acta ya no existe. Actualizá la página.'; end if;
  return v_resultado;
end;
$$;

create or replace function public.eliminar_acta(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.actas where id = p_id;
  if not found then raise exception 'Esa acta ya no existe. Actualizá la página.'; end if;
end;
$$;

-- Igual que antes, y de cada celular: la bateria y el numero de su acta
-- firmada (NULL si todavia no tiene).
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
             coalesce(c.telefono, '') as telefono, u.comprobante_id,
             u.proveedor_id, u.costo_usd,
             (select max(a.id) from public.actas a
               where a.celular_id = u.id and a.comprobante_id is not distinct from u.comprobante_id) as acta_id,
             u.bateria
        from public.celulares u
        left join public.comprobantes c on c.id = u.comprobante_id
       where u.estado = 'vendido' and u.garantia_dias > 0
      union all
      select 'accesorios', u.id,
             concat_ws(' ', u.tipo, nullif(u.modelo, ''), nullif(u.color, '')),
             '', u.fecha_venta, u.garantia_dias,
             u.fecha_venta + u.garantia_dias * interval '1 day',
             coalesce(nullif(c.cliente, ''), u.revendedor, ''),
             coalesce(c.telefono, ''), u.comprobante_id,
             u.proveedor_id, u.costo_usd, null::bigint, ''
        from public.accesorios u
        left join public.comprobantes c on c.id = u.comprobante_id
       where u.estado = 'vendido' and u.garantia_dias > 0
      union all
      select 'servicios', s.id, 'ARREGLO ' || s.equipo, s.imei, s.fecha_entrega, s.garantia_dias,
             s.fecha_entrega + s.garantia_dias * interval '1 day',
             s.cliente, s.telefono, null::bigint,
             null::bigint, null::numeric, null::bigint, ''
        from public.servicios s
       where s.estado = 'entregado' and s.garantia_dias > 0
    ) f
    where f.vence > now() - interval '90 days'
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- El catalogo publico, igual que antes, mas los planes de cuotas y su
-- leyenda (son datos publicos: los ve cualquiera). Ademas, lo que todavia no
-- tiene precio no se publica: asi se puede cargar el stock y ponerle precio
-- despues sin que el catalogo muestre "$ 0".
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
             where estado = 'disponible' and precio_usd > 0
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
             where estado = 'disponible' and precio_usd > 0
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
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
