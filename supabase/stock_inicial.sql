-- stock_inicial.sql
-- El stock real de Import Salta, tal como lo paso el cliente el 2026-10-22.
-- No es una migracion: se pega UNA SOLA VEZ en el SQL Editor de Supabase,
-- despues de las 9 migraciones y con las tablas vacias. Si se corre dos veces,
-- el stock queda duplicado.
--
-- El cliente no paso costos ni precios: todo entra en 0. Mientras un equipo
-- o accesorio tenga precio 0 NO aparece en el catalogo publico. El precio se
-- carga desde el panel: Celulares (o Accesorios) -> abrir el modelo -> Editar
-- -> Costo y Precio minorista (en dolares) -> Guardar cambios.
--
-- Tampoco vinieron los IMEI: se cargan desde el panel con el boton IMEI de
-- cada lote (con la pistola, la camara o a mano).
--
-- Lo que NO esta aca, a proposito:
--   * El iPhone 13 mini 128 GB rosa: figura como vendido.
--   * El iPhone 14 Pro 128 GB violeta senado: una sena necesita el nombre de
--     quien seno y cuanto dejo. Se carga desde el panel: Ingresar el equipo y
--     despues "Senar" con esos datos.

begin;

-- Celulares: una fila por equipo.
insert into public.celulares (modelo, capacidad, color, bateria, detalles, costo_usd, precio_usd)
values
  ('IPHONE 13 MINI', '128GB', 'AZUL',    '92%',  '',                   0, 0),
  ('IPHONE 13',      '128GB', 'ROSA',    '100%', '',                   0, 0),
  ('IPHONE 13',      '128GB', 'NEGRO',   '100%', '',                   0, 0),
  ('IPHONE 13',      '128GB', 'AZUL',    '88%',  '',                   0, 0),
  ('IPHONE 13',      '128GB', 'NEGRO',   '84%',  'DETALLES ESTÉTICOS', 0, 0),
  ('IPHONE 13 PRO',  '128GB', 'DORADO',  '100%', '',                   0, 0),
  ('IPHONE 13 PRO',  '128GB', 'NEGRO',   '100%', '',                   0, 0),
  ('IPHONE 14 PRO',  '128GB', 'VIOLETA', '100%', '',                   0, 0),
  ('IPHONE 14 PRO',  '128GB', 'NEGRO',   '84%',  '',                   0, 0),
  ('IPHONE 15',      '128GB', 'NEGRO',   '90%',  '',                   0, 0),
  ('IPHONE 15',      '128GB', 'ROSA',    '100%', 'BATERÍA NUEVA',      0, 0),
  ('IPHONE 17 PRO',  '256GB', 'GRIS',    '100%', 'EN CAJA',            0, 0);

-- Accesorios: una fila por unidad. generate_series repite la fila tantas
-- veces como unidades hay.
insert into public.accesorios (tipo, modelo, color, detalles, costo_usd, precio_usd)
select tipo, modelo, '', detalles, 0, 0
  from (values
    ('FUNDA',           'SILICONA IPHONE 13',         'LOGO APPLE', 20),
    ('FUNDA',           'SILICONA IPHONE 13 PRO',     'LOGO APPLE', 10),
    ('FUNDA',           'SILICONA IPHONE 13 PRO MAX', 'LOGO APPLE', 5),
    ('FUNDA',           'SILICONA IPHONE 14 PRO',     'LOGO APPLE', 10),
    ('FUNDA',           'SILICONA IPHONE 14 PRO MAX', 'LOGO APPLE', 5),
    ('FUNDA',           'SILICONA IPHONE 15',         'LOGO APPLE', 10),
    ('FUNDA',           'SILICONA IPHONE 15 PRO',     'LOGO APPLE', 10),
    ('FUNDA',           'SILICONA IPHONE 15 PRO MAX', 'LOGO APPLE', 5),
    ('FUNDA',           'SILICONA IPHONE 16',         'LOGO APPLE', 10),
    ('FUNDA',           'SILICONA IPHONE 16 PRO',     'LOGO APPLE', 10),
    ('FUNDA',           'SILICONA IPHONE 16 PRO MAX', 'LOGO APPLE', 5),
    ('VIDRIO TEMPLADO', 'IPHONE 13',                  '9D', 20),
    ('VIDRIO TEMPLADO', 'IPHONE 13 PRO',              '9D', 10),
    ('VIDRIO TEMPLADO', 'IPHONE 13 PRO MAX',          '9D', 5),
    ('VIDRIO TEMPLADO', 'IPHONE 14 PRO',              '9D', 10),
    ('VIDRIO TEMPLADO', 'IPHONE 14 PRO MAX',          '9D', 5),
    ('VIDRIO TEMPLADO', 'IPHONE 15',                  '9D', 10),
    ('VIDRIO TEMPLADO', 'IPHONE 15 PRO',              '9D', 10),
    ('VIDRIO TEMPLADO', 'IPHONE 15 PRO MAX',          '9D', 5),
    ('VIDRIO TEMPLADO', 'IPHONE 16',                  '9D', 10),
    ('VIDRIO TEMPLADO', 'IPHONE 16 PRO',              '9D', 10),
    ('VIDRIO TEMPLADO', 'IPHONE 16 PRO MAX',          '9D', 5),
    ('AURICULARES',     'EARPODS LIGHTNING',          '', 10),
    ('CARGADOR',        'IPHONE',                     '', 70),
    ('CABLE',           'LIGHTNING',                  '', 30),
    ('CABLE',           'USB-C',                      '', 30)
  ) as lote (tipo, modelo, detalles, cantidad)
  cross join lateral generate_series(1, lote.cantidad);

-- Lo cargado tambien aparece en los desplegables del panel.
insert into public.opciones (lista, valor)
select 'modelo', modelo from public.celulares
union select 'capacidad', capacidad from public.celulares where capacidad <> ''
union select 'color', color from public.celulares where color <> ''
union select 'tipo', tipo from public.accesorios
on conflict (lista, valor) do nothing;

commit;
