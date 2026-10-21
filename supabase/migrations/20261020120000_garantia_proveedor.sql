-- 20261020120000_garantia_proveedor.sql
-- Lo que pidio el cliente el 20/10:
--   * Garantia con el proveedor: un equipo que vuelve por garantia (o que
--     salio fallado) se anota para mandarselo al proveedor. Su costo se
--     descuenta de lo que se le debe a ese proveedor. Si el proveedor lo
--     devuelve arreglado o lo cambia por otro, el descuento se quita; si se lo
--     queda, el descuento queda.
--   * Revendedores: cada pago se va descontando equipo por equipo, del que se
--     llevo primero al ultimo. Cuando lo entregado cubre un equipo, ese equipo
--     pasa a vendido solo, sin esperar a que la cuenta entera quede saldada.
--
-- Igual que en las migraciones anteriores, el sitio publicado sigue andando
-- aunque no tenga el codigo nuevo: las funciones que ya existian mantienen
-- sus parametros y lo que devuelven.

-- ---------------------------------------------------------------------------
-- Equipos mandados al proveedor por garantia.
--   por_enviar: anotado, todavia esta en el local.
--   enviado:    ya lo tiene el proveedor.
--   volvio:     lo devolvio arreglado o lo cambio: no hay descuento.
--   descontado: el proveedor se lo quedo: el descuento queda.
-- ---------------------------------------------------------------------------
create table if not exists public.envios_proveedor (
  id            bigint generated always as identity primary key,
  fecha         timestamptz   not null default now(),
  proveedor_id  bigint        not null references public.proveedores (id),
  celular_id    bigint references public.celulares (id) on delete set null,
  equipo        text          not null,
  imei          text          not null default '',
  cliente       text          not null default '',
  falla         text          not null default '',
  monto_usd     numeric(18,4) not null default 0,         -- lo que se descuenta de la deuda
  estado        text          not null default 'por_enviar',
  fecha_enviado timestamptz,
  fecha_cierre  timestamptz,
  constraint envios_estado_valido check (estado in ('por_enviar', 'enviado', 'volvio', 'descontado')),
  constraint envios_monto_valido check (monto_usd >= 0),
  constraint envios_largos
    check (char_length(equipo) between 1 and 120 and char_length(imei) <= 20
       and char_length(cliente) <= 80 and char_length(falla) <= 300)
);
create index if not exists envios_proveedor_proveedor on public.envios_proveedor (proveedor_id);
create index if not exists envios_proveedor_celular on public.envios_proveedor (celular_id);

-- El descuento es una fila negativa en la deuda del proveedor, atada al envio:
-- asi la deuda de cada proveedor (panel_datos) ya lo tiene en cuenta.
alter table public.deudas_proveedor
  add column if not exists envio_id bigint references public.envios_proveedor (id) on delete cascade;
alter table public.deudas_proveedor drop constraint if exists deudas_proveedor_monto_positivo;
alter table public.deudas_proveedor add constraint deudas_proveedor_monto_positivo
  check (monto_usd > 0 or (envio_id is not null and monto_usd < 0));
create unique index if not exists deudas_proveedor_envio on public.deudas_proveedor (envio_id);

revoke all on table public.envios_proveedor from public, anon;
grant select, insert, update, delete on table public.envios_proveedor to authenticated;
alter table public.envios_proveedor enable row level security;
drop policy if exists solo_administradores on public.envios_proveedor;
create policy solo_administradores on public.envios_proveedor
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- Anota un equipo para mandar al proveedor.
-- p_datos: { proveedor (nombre), celular_id, equipo, imei, cliente, falla,
--            monto_usd, enviado (true = ya se mando) }.
create or replace function public.anotar_envio(p_datos jsonb)
returns bigint language plpgsql set search_path = '' as $$
declare
  v_proveedor bigint;
  v_celular   bigint := nullif(p_datos->>'celular_id', '')::bigint;
  v_monto     numeric := round(coalesce(nullif(p_datos->>'monto_usd', '')::numeric, 0), 4);
  v_enviado   boolean := coalesce((p_datos->>'enviado')::boolean, false);
  v_equipo    text := upper(public.limpiar(p_datos->>'equipo'));
  v_imei      text := regexp_replace(coalesce(p_datos->>'imei', ''), '\D', '', 'g');
  v_id        bigint;
begin
  perform public.exigir_admin();
  if public.normalizar(p_datos->>'proveedor') = '' then raise exception 'Elegí a qué proveedor se lo mandás'; end if;
  if v_equipo = '' then raise exception 'Escribí qué equipo es'; end if;
  if v_monto < 0 then raise exception 'El descuento no puede ser negativo'; end if;
  if v_celular is not null and exists (
    select 1 from public.envios_proveedor where celular_id = v_celular and estado in ('por_enviar', 'enviado')
  ) then
    raise exception 'Ese equipo ya está anotado para el proveedor';
  end if;

  v_proveedor := public.proveedor_por_nombre(p_datos->>'proveedor');
  insert into public.envios_proveedor (proveedor_id, celular_id, equipo, imei, cliente, falla, monto_usd, estado, fecha_enviado)
  values (v_proveedor, v_celular, v_equipo, v_imei, upper(public.limpiar(p_datos->>'cliente')),
          public.limpiar(p_datos->>'falla'), v_monto,
          case when v_enviado then 'enviado' else 'por_enviar' end,
          case when v_enviado then now() end)
  returning id into v_id;

  if v_monto > 0 then
    insert into public.deudas_proveedor (proveedor_id, monto_usd, detalle, envio_id)
    values (v_proveedor, -v_monto, left('Garantía: ' || v_equipo || coalesce(' · ' || nullif(v_imei, ''), ''), 200), v_id);
  end if;
  return v_id;
end;
$$;

-- Cambia el estado de un envio: 'enviado', 'volvio' o 'descontado'.
create or replace function public.marcar_envio(p_id bigint, p_estado text)
returns void language plpgsql set search_path = '' as $$
declare
  v_actual text;
begin
  perform public.exigir_admin();
  select estado into v_actual from public.envios_proveedor where id = p_id for update;
  if v_actual is null then raise exception 'Ese envío ya no existe. Actualizá la página.'; end if;
  if v_actual not in ('por_enviar', 'enviado') then raise exception 'Ese envío ya está cerrado'; end if;

  if p_estado = 'enviado' then
    update public.envios_proveedor set estado = 'enviado', fecha_enviado = now() where id = p_id;
  elsif p_estado = 'volvio' then
    -- Lo devolvio arreglado o lo cambio: ya no se le descuenta nada.
    delete from public.deudas_proveedor where envio_id = p_id;
    update public.envios_proveedor
       set estado = 'volvio', fecha_cierre = now(), fecha_enviado = coalesce(fecha_enviado, now())
     where id = p_id;
  elsif p_estado = 'descontado' then
    update public.envios_proveedor
       set estado = 'descontado', fecha_cierre = now(), fecha_enviado = coalesce(fecha_enviado, now())
     where id = p_id;
  else
    raise exception 'Estado desconocido';
  end if;
end;
$$;

-- Borra un envio anotado por error, con su descuento.
create or replace function public.eliminar_envio(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  delete from public.envios_proveedor where id = p_id;
  if not found then raise exception 'Ese envío ya no existe. Actualizá la página.'; end if;
end;
$$;

-- Los envios abiertos y los que se cerraron hace menos de 90 dias.
create or replace function public.envios_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    select jsonb_agg(f order by f.fecha desc, f.id desc) from (
      select e.id, e.fecha, e.proveedor_id, p.nombre as proveedor, e.celular_id, e.equipo, e.imei,
             e.cliente, e.falla, e.monto_usd, e.estado, e.fecha_enviado, e.fecha_cierre
        from public.envios_proveedor e
        join public.proveedores p on p.id = e.proveedor_id
       where e.estado in ('por_enviar', 'enviado') or e.fecha_cierre > now() - interval '90 days'
    ) f), '[]'::jsonb);
end;
$$;

-- Igual que antes, y el descuento de una garantia figura como 'garantia'
-- (con el monto en positivo, como un pago: baja la deuda).
create or replace function public.cuenta_proveedor(p_id bigint)
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return coalesce((
    select jsonb_agg(f order by f.fecha desc, f.id desc) from (
      select case when d.envio_id is null then 'deuda' else 'garantia' end as clase,
             d.id, d.fecha, abs(d.monto_usd) as monto_usd, null::numeric as monto_ars, d.detalle, d.compra_id
        from public.deudas_proveedor d where d.proveedor_id = p_id
      union all
      select 'pago', m.id, m.fecha, round(m.monto_ars / m.cotizacion, 4), m.monto_ars,
             concat_ws(' · ', m.categoria, nullif(m.detalle, '')), null
        from public.movimientos_caja m
       where m.proveedor_id = p_id and m.tipo = 'egreso'
    ) f), '[]'::jsonb);
end;
$$;

-- Igual que antes, pero el descuento de una garantia no se borra desde aca.
create or replace function public.eliminar_deuda_proveedor(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if exists (select 1 from public.deudas_proveedor where id = p_id and envio_id is not null) then
    raise exception 'Ese descuento es de una garantía: se cambia desde la pestaña Garantías';
  end if;
  delete from public.deudas_proveedor where id = p_id;
  if not found then raise exception 'Esa deuda ya no existe. Actualizá la página.'; end if;
end;
$$;

-- Igual que antes, contando tambien los envios por garantia.
create or replace function public.eliminar_proveedor(p_id bigint)
returns void language plpgsql set search_path = '' as $$
begin
  perform public.exigir_admin();
  if exists (select 1 from public.celulares where proveedor_id = p_id)
     or exists (select 1 from public.accesorios where proveedor_id = p_id)
     or exists (select 1 from public.movimientos_caja where proveedor_id = p_id)
     or exists (select 1 from public.deudas_proveedor where proveedor_id = p_id)
     or exists (select 1 from public.envios_proveedor where proveedor_id = p_id) then
    raise exception 'No se puede eliminar: tiene mercadería, pagos o deudas registrados';
  end if;
  delete from public.proveedores where id = p_id;
end;
$$;

-- Igual que antes, y de cada celular: a que proveedor se le compro y cuanto
-- costo (para mandarlo por garantia).
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
             u.proveedor_id, u.costo_usd
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
             u.proveedor_id, u.costo_usd
        from public.accesorios u
        left join public.comprobantes c on c.id = u.comprobante_id
       where u.estado = 'vendido' and u.garantia_dias > 0
      union all
      select 'servicios', s.id, 'ARREGLO ' || s.equipo, s.imei, s.fecha_entrega, s.garantia_dias,
             s.fecha_entrega + s.garantia_dias * interval '1 day',
             s.cliente, s.telefono, null::bigint,
             null::bigint, null::numeric
        from public.servicios s
       where s.estado = 'entregado' and s.garantia_dias > 0
    ) f
    where f.vence > now() - interval '90 days'
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Revendedores: lo entregado se va descontando equipo por equipo.
-- ---------------------------------------------------------------------------

-- Recorre los equipos del revendedor del que se llevo primero al ultimo y
-- pasa a vendido los que lo entregado ya cubre (al precio acordado). Para en
-- el primero que no alcanza: la plata que sobra queda a cuenta de ese.
-- Si alcanza para todos no hace nada: de eso se encarga cerrar_si_cubierto,
-- que ademas cierra la cuenta. Devuelve cuantos equipos pasaron a vendido.
create or replace function public.aplicar_a_equipos(p_nombre text)
returns integer language plpgsql set search_path = '' as $$
declare
  v_entregado   numeric := public.entregado_de_cuenta('revendedor', p_nombre);
  v_total       integer;
  v_fila        record;
  v_celulares   jsonb := '[]'::jsonb;
  v_accesorios  jsonb := '[]'::jsonb;
  v_valor       numeric := 0;
  v_cubiertos   integer := 0;
  v_venta       numeric;
  v_comprobante bigint;
begin
  if v_entregado <= 0 then return 0; end if;

  select (select count(*) from public.celulares where estado = 'revendedor' and revendedor = p_nombre)
       + (select count(*) from public.accesorios where estado = 'revendedor' and revendedor = p_nombre)
    into v_total;

  for v_fila in
    select 'celulares' as tabla, id, precio_revendedor as precio, fecha_revendedor
      from public.celulares where estado = 'revendedor' and revendedor = p_nombre
    union all
    select 'accesorios', id, precio_revendedor, fecha_revendedor
      from public.accesorios where estado = 'revendedor' and revendedor = p_nombre
    order by fecha_revendedor nulls first, tabla, id
  loop
    -- Igual que al cerrar la cuenta: falta menos de medio centavo = cubierto.
    exit when v_valor + v_fila.precio - v_entregado >= 0.005;
    v_valor := v_valor + v_fila.precio;
    v_cubiertos := v_cubiertos + 1;
    if v_fila.tabla = 'celulares' then
      v_celulares := v_celulares || jsonb_build_object('id', v_fila.id, 'precio_usd', v_fila.precio);
    else
      v_accesorios := v_accesorios || jsonb_build_object('id', v_fila.id, 'precio_usd', v_fila.precio);
    end if;
  end loop;

  if v_cubiertos = 0 or v_cubiertos = v_total then return 0; end if;

  -- Lo mismo que "Pagado" cuando lo entregado ya alcanza: una fila negativa
  -- por el valor de los equipos y un comprobante a nombre del revendedor.
  if v_valor > 0 then
    select cotizacion_dolar into strict v_venta from public.configuracion where id = 1;
    insert into public.pagos_revendedor (revendedor, monto_ars, cotizacion, monto_usd)
    values (p_nombre, -round(v_valor * v_venta, 4), v_venta, -round(v_valor, 4));
  end if;
  insert into public.comprobantes (origen, cliente) values ('revendedor', left(p_nombre, 80))
  returning id into v_comprobante;
  perform public.pasar_a_vendido('celulares', v_celulares, 'revendedor', v_comprobante);
  perform public.pasar_a_vendido('accesorios', v_accesorios, 'revendedor', v_comprobante);
  return v_cubiertos;
end;
$$;

-- Igual que antes, pero en las cuentas de revendedores primero se descuentan
-- los equipos que ya estan cubiertos. Se llama despues de cada pago, de cada
-- entrega con pago y de cada correccion de un pago.
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
  if p_tipo = 'revendedor' then perform public.aplicar_a_equipos(p_nombre); end if;

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

-- ---------------------------------------------------------------------------
-- Permisos de las funciones. Hay que repetirlo en cada migracion que crea
-- funciones: Postgres deja que cualquiera ejecute una funcion recien creada.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
