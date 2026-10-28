-- 20261029000000_fecha_de_compra.sql
-- Lo que pidio Import Salta: ver la fecha de compra y la fecha de venta de
-- cada celular y accesorio.
--
-- Las dos fechas ya se guardaban (fecha_ingreso, el dia que entro al stock, y
-- fecha_venta). Lo que faltaba es que el historial de ventas trajera tambien
-- la fecha de compra de cada unidad vendida.
--
-- Como siempre: el panel no escribe en las tablas, llama a funciones. Todo se
-- puede correr dos veces sin romper nada.

-- Igual que antes, mas la fecha de compra (fecha_ingreso) de cada unidad.
create or replace function public.ventas_datos()
returns jsonb language plpgsql stable set search_path = '' as $$
begin
  perform public.exigir_admin();
  return jsonb_build_object(
    'celulares', coalesce((
      select jsonb_agg(f) from (
        select id, clave, modelo, capacidad, color, bateria, detalles, imei, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, permuta_usd, revendedor,
               comprobante_id, garantia_dias, fecha_ingreso
          from public.celulares where estado = 'vendido') f), '[]'::jsonb),
    'accesorios', coalesce((
      select jsonb_agg(f) from (
        select id, clave, tipo, modelo, color, detalles, costo_usd, precio_usd,
               fecha_venta, cotizacion_venta, cotizacion_costo, revendedor,
               comprobante_id, garantia_dias, fecha_ingreso
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
-- Permisos de las funciones (ver la migracion 20261013120000_panel.sql).
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.catalogo_publico() to anon;
