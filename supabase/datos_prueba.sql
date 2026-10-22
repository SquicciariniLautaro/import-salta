-- datos_prueba.sql
-- Stock INVENTADO para las pruebas: lo usan "npm run probar-base" y el modo
-- prueba de tu PC ("npm run dev:prueba"), siempre en una base de mentira.
-- NUNCA se pega en Supabase: el stock real esta en stock_inicial.sql.

-- Celulares. generate_series(1, cantidad) repite la fila una vez por unidad.
insert into public.celulares (modelo, capacidad, color, bateria, detalles, costo_usd, precio_usd, estado, revendedor, precio_revendedor, fecha_revendedor, fecha_venta, cotizacion_venta)
select modelo, capacidad, color, bateria, detalles, costo, precio, estado,
       case when estado in ('revendedor', 'senado') then 'PERSONA DE PRUEBA' end,
       case when estado in ('revendedor', 'senado') then precio end,
       case when estado in ('revendedor', 'senado') then now() end,
       case when estado = 'vendido' then now() end,
       case when estado = 'vendido' then 1000 end
  from (values
    ('IPHONE 11',         '64GB',  'NEGRO',           '85%',  '',                 180, 230, 2, 'disponible'),
    ('IPHONE 11',         '128GB', 'BLANCO',          '90%',  'DETALLE EN MARCO', 200, 255, 1, 'disponible'),
    ('IPHONE 13',         '128GB', 'AZUL',            '88%',  '',                 330, 400, 3, 'disponible'),
    -- Mismo lote que el anterior con otro precio: el catalogo muestra el promedio.
    ('IPHONE 13',         '128GB', 'AZUL',            '88%',  '',                 345, 420, 1, 'disponible'),
    ('IPHONE 13 PRO',     '256GB', 'GRAFITO',         '91%',  '',                 450, 540, 1, 'disponible'),
    ('IPHONE 14',         '128GB', 'ROJO',            '100%', 'NUEVO SELLADO',    520, 610, 2, 'disponible'),
    ('IPHONE 15 PRO MAX', '256GB', 'TITANIO NATURAL', '95%',  '',                 850, 980, 1, 'disponible'),
    ('IPHONE XR',         '64GB',  'CORAL',           '80%',  '',                 130, 175, 1, 'disponible'),
    ('IPHONE SE',         '64GB',  'BLANCO',          '82%',  '2020',             100, 140, 1, 'disponible'),
    ('SAMSUNG S23',       '256GB', 'VERDE',           '',     '',                 380, 460, 1, 'disponible'),
    ('MOTOROLA G54',      '256GB', 'AZUL',            '',     'NUEVO',            150, 195, 2, 'disponible'),
    -- Estos tres NO tienen que aparecer en el catalogo publico.
    ('IPHONE 12',         '128GB', 'VIOLETA',         '87%',  '',                 280, 340, 1, 'revendedor'),
    ('IPHONE 12',         '64GB',  'NEGRO',           '84%',  '',                 250, 310, 1, 'senado'),
    ('IPHONE 14 PRO',     '256GB', 'DORADO',          '89%',  '',                 600, 700, 1, 'vendido')
  ) as lote (modelo, capacidad, color, bateria, detalles, costo, precio, cantidad, estado)
  cross join lateral generate_series(1, lote.cantidad);

-- Accesorios.
insert into public.accesorios (tipo, modelo, color, detalles, costo_usd, precio_usd)
select tipo, modelo, color, detalles, costo, precio
  from (values
    ('FUNDA',           'SILICONA IPHONE 13',     'NEGRO',  '',          1.5, 6,   10),
    ('FUNDA',           'TRANSPARENTE IPHONE 14', '',       'ANTIGOLPE', 1.2, 5,   6),
    ('CARGADOR',        '20W USB-C',              'BLANCO', 'ORIGINAL',  8,   18,  5),
    ('VIDRIO TEMPLADO', 'IPHONE 11 / XR',         '',       '',          0.5, 3,   8),
    ('AURICULARES',     'AIRPODS PRO 2',          'BLANCO', 'SELLADOS',  120, 160, 2)
  ) as lote (tipo, modelo, color, detalles, costo, precio, cantidad)
  cross join lateral generate_series(1, lote.cantidad);

-- Precios por cantidad para la funda de silicona: un tramo en pesos fijos y
-- otro en dolares. La clave es tipo|modelo|color|detalles, normalizada.
insert into public.escalas_precio (clave, desde, moneda, precio) values
  ('FUNDA|SILICONA IPHONE 13|NEGRO|', 3,  'ars', 5000),
  ('FUNDA|SILICONA IPHONE 13|NEGRO|', 10, 'usd', 4);

-- Planes de cuotas de ejemplo, para ver como quedan en el catalogo. Los
-- recargos son inventados: el dueno carga los suyos en Ajustes.
update public.configuracion
   set cuotas_planes = '[{"cuotas": 3, "recargo": 0}, {"cuotas": 6, "recargo": 15}, {"cuotas": 9, "recargo": 25}, {"cuotas": 12, "recargo": 35}]'::jsonb
 where id = 1;
