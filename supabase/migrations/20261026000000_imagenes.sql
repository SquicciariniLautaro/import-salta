-- 20261026000000_imagenes.sql
-- Lo que pidio Import Salta: una foto para cada producto del catalogo, tanto
-- en celulares como en accesorios.
--
-- Las fotos no viven en la base: se suben a Cloudinary (un servicio que
-- guarda imagenes y las entrega achicadas y en formato webp) y aca se guarda
-- solo la direccion. La foto es del LOTE (modelo + capacidad + color...), no
-- de cada unidad: si entra otro equipo igual, ya sale con la foto.
--
-- Como siempre: el panel no escribe en las tablas, llama a funciones. Todo se
-- puede correr dos veces sin romper nada.

-- ---------------------------------------------------------------------------
-- imagenes: la foto de cada lote. Una por lote como mucho.
-- "clave" es la clave del lote (la misma de celulares.clave o accesorios.clave).
-- La fila queda aunque el lote se agote: si vuelve a entrar, ya tiene foto.
-- ---------------------------------------------------------------------------
create table if not exists public.imagenes (
  tabla  text        not null,
  clave  text        not null,
  url    text        not null,
  fecha  timestamptz not null default now(),
  primary key (tabla, clave),
  constraint imagenes_tabla_valida check (tabla in ('celulares', 'accesorios')),
  -- Solo fotos de Cloudinary: el sitio no deja mostrar imagenes de otro lado.
  constraint imagenes_url_valida check (
    char_length(url) <= 400 and url ~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/')
);

revoke all on table public.imagenes from public, anon;
grant select, insert, update, delete on table public.imagenes to authenticated;
alter table public.imagenes enable row level security;
drop policy if exists solo_administradores on public.imagenes;
create policy solo_administradores on public.imagenes
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------------------
-- Poner, cambiar o quitar la foto de un lote. p_url NULL o vacia = quitarla.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_imagen(p_tabla text, p_clave text, p_url text)
returns void language plpgsql set search_path = '' as $$
declare
  v_existe boolean;
begin
  perform public.exigir_admin();
  execute format('select exists (select 1 from public.%I where clave = $1)', public.tabla_valida(p_tabla))
    into v_existe using p_clave;
  if not v_existe then raise exception 'Ese lote ya no existe. Actualizá la página.'; end if;

  if coalesce(trim(p_url), '') = '' then
    delete from public.imagenes where tabla = p_tabla and clave = p_clave;
    return;
  end if;

  insert into public.imagenes (tabla, clave, url)
  values (p_tabla, p_clave, trim(p_url))
  on conflict (tabla, clave) do update set url = excluded.url, fecha = now();
exception
  when check_violation then raise exception 'Esa foto no es de Cloudinary. Subila de nuevo desde el panel.';
end;
$$;

-- ---------------------------------------------------------------------------
-- La foto sigue al lote: si al editarlo cambia la clave (otro color, otra
-- capacidad...), el lote nuevo se queda con una copia de la foto, salvo que ya
-- tuviera una. El lote viejo conserva la suya por si quedaron unidades.
-- ---------------------------------------------------------------------------
create or replace function public.copiar_imagen_al_lote_nuevo()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.imagenes (tabla, clave, url)
  select imagen.tabla, new.clave, imagen.url
    from public.imagenes imagen
   where imagen.tabla = tg_table_name and imagen.clave = old.clave
  on conflict (tabla, clave) do nothing;
  return null;
end;
$$;

drop trigger if exists imagen_sigue_al_lote on public.celulares;
create trigger imagen_sigue_al_lote
  after update on public.celulares
  for each row when (old.clave is distinct from new.clave)
  execute function public.copiar_imagen_al_lote_nuevo();

drop trigger if exists imagen_sigue_al_lote on public.accesorios;
create trigger imagen_sigue_al_lote
  after update on public.accesorios
  for each row when (old.clave is distinct from new.clave)
  execute function public.copiar_imagen_al_lote_nuevo();

-- ---------------------------------------------------------------------------
-- El catalogo publico, igual que antes, mas la foto de cada lote ("imagen",
-- NULL si no tiene).
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
-- Lecturas del panel.
-- ---------------------------------------------------------------------------

-- Igual que antes, mas las fotos de los lotes.
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
    'imagenes', coalesce((
      select jsonb_agg(f order by f.tabla, f.clave) from (
        select tabla, clave, url from public.imagenes) f), '[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
