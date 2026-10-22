-- video/datos_video.sql
-- Los datos que se ven en el video guia para el cliente: su stock real
-- (supabase/stock_inicial.sql) con precios DE EJEMPLO, planes de cuotas de
-- ejemplo y la sena del 14 Pro violeta. Solo los usa la grabacion del video
-- (node video/grabar.mjs), en la base de mentira del modo prueba. Nunca va a
-- Supabase.

-- Dolar de venta del ejemplo.
update public.configuracion set cotizacion_dolar = 1575, cotizacion_costo = 1555 where id = 1;

-- Planes de cuotas de ejemplo.
update public.configuracion
   set cuotas_planes = '[{"cuotas": 3, "recargo": 0}, {"cuotas": 6, "recargo": 15}, {"cuotas": 9, "recargo": 25}, {"cuotas": 12, "recargo": 35}]'::jsonb
 where id = 1;

-- Celulares, con costo y precio de ejemplo en dolares.
insert into public.celulares (modelo, capacidad, color, bateria, detalles, costo_usd, precio_usd)
values
  ('IPHONE 13 MINI', '128GB', 'AZUL',    '92%',  '',                   300, 0),
  ('IPHONE 13',      '128GB', 'ROSA',    '100%', '',                   360, 440),
  ('IPHONE 13',      '128GB', 'NEGRO',   '100%', '',                   360, 440),
  ('IPHONE 13',      '128GB', 'AZUL',    '88%',  '',                   330, 410),
  ('IPHONE 13',      '128GB', 'NEGRO',   '84%',  'DETALLES ESTÉTICOS', 300, 380),
  ('IPHONE 13 PRO',  '128GB', 'DORADO',  '100%', '',                   430, 520),
  ('IPHONE 13 PRO',  '128GB', 'NEGRO',   '100%', '',                   430, 520),
  ('IPHONE 14 PRO',  '128GB', 'VIOLETA', '100%', '',                   540, 650),
  ('IPHONE 14 PRO',  '128GB', 'NEGRO',   '84%',  '',                   500, 600),
  ('IPHONE 15',      '128GB', 'NEGRO',   '90%',  '',                   520, 620),
  ('IPHONE 15',      '128GB', 'ROSA',    '100%', 'BATERÍA NUEVA',      540, 650),
  ('IPHONE 17 PRO',  '256GB', 'GRIS',    '100%', 'EN CAJA',            1150, 1350);

-- El 14 Pro violeta senado: queda a nombre de quien seno, con lo que dejo.
insert into public.celulares (modelo, capacidad, color, bateria, detalles, costo_usd, precio_usd, estado, revendedor, precio_revendedor, fecha_revendedor)
values ('IPHONE 14 PRO', '128GB', 'VIOLETA', '100%', '', 540, 650, 'senado', 'MARTINA LÓPEZ', 650, now());
insert into public.pagos_sena (revendedor, monto_ars, cotizacion, monto_usd, medio)
values ('MARTINA LÓPEZ', 200000, 1575, round(200000 / 1575.0, 4), 'efectivo');

-- Accesorios, con costo y precio de ejemplo.
insert into public.accesorios (tipo, modelo, color, detalles, costo_usd, precio_usd)
select tipo, modelo, '', detalles, costo, precio
  from (values
    ('FUNDA',           'SILICONA IPHONE 13',         'LOGO APPLE', 20, 3, 9),
    ('FUNDA',           'SILICONA IPHONE 13 PRO',     'LOGO APPLE', 10, 3, 9),
    ('FUNDA',           'SILICONA IPHONE 13 PRO MAX', 'LOGO APPLE', 5,  3, 9),
    ('FUNDA',           'SILICONA IPHONE 14 PRO',     'LOGO APPLE', 10, 3, 9),
    ('FUNDA',           'SILICONA IPHONE 14 PRO MAX', 'LOGO APPLE', 5,  3, 9),
    ('FUNDA',           'SILICONA IPHONE 15',         'LOGO APPLE', 10, 3, 10),
    ('FUNDA',           'SILICONA IPHONE 15 PRO',     'LOGO APPLE', 10, 3, 10),
    ('FUNDA',           'SILICONA IPHONE 15 PRO MAX', 'LOGO APPLE', 5,  3, 10),
    ('FUNDA',           'SILICONA IPHONE 16',         'LOGO APPLE', 10, 3, 11),
    ('FUNDA',           'SILICONA IPHONE 16 PRO',     'LOGO APPLE', 10, 3, 11),
    ('FUNDA',           'SILICONA IPHONE 16 PRO MAX', 'LOGO APPLE', 5,  3, 11),
    ('VIDRIO TEMPLADO', 'IPHONE 13',                  '9D', 20, 1, 5),
    ('VIDRIO TEMPLADO', 'IPHONE 13 PRO',              '9D', 10, 1, 5),
    ('VIDRIO TEMPLADO', 'IPHONE 14 PRO',              '9D', 10, 1, 5),
    ('VIDRIO TEMPLADO', 'IPHONE 15',                  '9D', 10, 1, 5),
    ('VIDRIO TEMPLADO', 'IPHONE 16 PRO',              '9D', 10, 1, 5),
    ('AURICULARES',     'EARPODS LIGHTNING',          '', 10, 6, 16),
    ('CARGADOR',        'IPHONE',                     '', 70, 5, 14),
    ('CABLE',           'LIGHTNING',                  '', 30, 2, 7),
    ('CABLE',           'USB-C',                      '', 30, 2, 7)
  ) as lote (tipo, modelo, detalles, cantidad, costo, precio)
  cross join lateral generate_series(1, lote.cantidad);

-- Precio por cantidad para el vidrio del 13: de 3 en adelante, mas barato.
insert into public.escalas_precio (clave, desde, moneda, precio)
select clave, 3, 'ars', 6000 from public.accesorios
 where tipo = 'VIDRIO TEMPLADO' and modelo = 'IPHONE 13' limit 1;

-- Lo cargado tambien aparece en los desplegables del panel.
insert into public.opciones (lista, valor)
select 'modelo', modelo from public.celulares
union select 'capacidad', capacidad from public.celulares where capacidad <> ''
union select 'color', color from public.celulares where color <> ''
union select 'tipo', tipo from public.accesorios
on conflict (lista, valor) do nothing;
