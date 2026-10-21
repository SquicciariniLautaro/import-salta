-- 20261020000000_ticket.sql
-- Un ticket mas completo, pedido por el cliente despues de probar la ticketera:
--   * "Atendido por": quien hizo la venta o recibio el equipo en el servicio
--     tecnico. Los nombres salen de una lista nueva de Ajustes ("vendedor").
--     Lo llevan las ventas de mostrador, las permutas y las ordenes de
--     servicio; las entregas a revendedores y las senas no.
--   * Condiciones de garantia: la letra chica del pie del ticket, editable en
--     Ajustes.
--   * Duplicado para el local: si se imprime una segunda copia, con lugar para
--     la firma del cliente.
--
-- Igual que en las migraciones anteriores: el sitio publicado sigue andando
-- con la base nueva aunque todavia no tenga el codigo nuevo.

-- ---------------------------------------------------------------------------
-- Lista de vendedores: una lista mas de "opciones".
-- ---------------------------------------------------------------------------
alter table public.opciones drop constraint if exists opciones_lista_valida;
alter table public.opciones add constraint opciones_lista_valida
  check (lista in ('modelo', 'capacidad', 'color', 'tipo', 'vendedor'));

create or replace function public.agregar_opcion(p_lista text, p_valor text)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if public.limpiar(p_valor) = '' then raise exception 'Escribí el valor'; end if;
  if p_lista not in ('modelo', 'capacidad', 'color', 'tipo', 'vendedor') then raise exception 'Lista desconocida'; end if;
  perform public.recordar_opcion(p_lista, p_valor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien atendio. Se guarda el nombre (y no un numero de la lista): sacar a
-- alguien de la lista no cambia los tickets que ya tiene.
-- ---------------------------------------------------------------------------
alter table public.comprobantes add column if not exists vendedor text not null default '';
alter table public.comprobantes drop constraint if exists comprobantes_vendedor_largo;
alter table public.comprobantes add constraint comprobantes_vendedor_largo check (char_length(vendedor) <= 80);

alter table public.servicios add column if not exists vendedor text not null default '';
alter table public.servicios drop constraint if exists servicios_vendedor_largo;
alter table public.servicios add constraint servicios_vendedor_largo check (char_length(vendedor) <= 80);

-- ---------------------------------------------------------------------------
-- Ajustes del ticket.
-- ---------------------------------------------------------------------------
alter table public.configuracion
  add column if not exists ticket_condiciones text not null default
    'La garantía cubre fallas de funcionamiento. No cubre golpes, humedad, pantalla, batería ni equipos abiertos por terceros. Presentar este ticket. Sin el ticket no se puede retirar nada.',
  add column if not exists ticket_duplicado boolean not null default true;

alter table public.configuracion drop constraint if exists configuracion_ticket_condiciones_largo;
alter table public.configuracion add constraint configuracion_ticket_condiciones_largo
  check (char_length(ticket_condiciones) <= 600);

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
    etiqueta_alto_mm         = coalesce((p_datos->>'etiqueta_alto_mm')::integer, etiqueta_alto_mm)
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ventas y permutas: p_datos ahora tambien trae "vendedor".
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
  insert into public.comprobantes (origen, cliente, telefono, medio, efectivo_ars, nota, cliente_id, debe_ars, vendedor)
  values (p_origen, upper(public.limpiar(p_datos->>'cliente')), public.limpiar(p_datos->>'telefono'),
          v_cobro.medio, v_cobro.efectivo_ars, public.limpiar(p_datos->>'nota'),
          public.cliente_por_nombre(p_datos->>'cliente', p_datos->>'telefono'), v_debe,
          left(upper(public.limpiar(p_datos->>'vendedor')), 80))
  returning id into v_id;
  return v_id;
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
    'vendedor', c.vendedor,
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

-- ---------------------------------------------------------------------------
-- Servicio tecnico: quien recibio el equipo se anota al crear la orden y no
-- cambia al editarla.
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
                                  presupuesto_ars, costo_ars, en_garantia, vendedor)
    values (upper(public.limpiar(p_datos->>'cliente')), public.limpiar(p_datos->>'telefono'),
            upper(public.limpiar(p_datos->>'equipo')), public.limpiar(p_datos->>'imei'),
            public.limpiar(p_datos->>'falla'), public.limpiar(p_datos->>'trabajo'),
            public.limpiar(p_datos->>'notas'), v_estado, v_presupuesto, v_costo,
            coalesce((p_datos->>'en_garantia')::boolean, false),
            left(upper(public.limpiar(p_datos->>'vendedor')), 80))
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

create or replace function public.servicios_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    select jsonb_agg(f order by f.id desc) from (
      select id, fecha_ingreso, cliente, telefono, equipo, imei, falla, trabajo, notas, estado,
             presupuesto_ars, costo_ars, en_garantia, cobrado_ars, medio, efectivo_ars,
             fecha_entrega, garantia_dias, vendedor
        from public.servicios) f), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
