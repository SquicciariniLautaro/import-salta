# Puesta en marcha

Cómo queda repartido:

| Pieza | Dónde vive |
| --- | --- |
| Base de datos, usuarios y permisos | Supabase (proyecto `import-salta`) |
| Frontend (catálogo y panel) | Vercel: `https://import-salta.vercel.app` |

El navegador habla directo con Supabase. No hay servidor propio en el medio: lo que cada
uno puede ver o cambiar lo deciden los permisos escritos en
`supabase/migrations/`.

Los nombres de botones pueden variar según la versión del panel de Supabase y de Vercel.

---

## Paso 1 - Crear el proyecto en Supabase

1. supabase.com → `New project`.
2. *Name*: `import-salta`. *Region*: `South America (São Paulo)`, la más cercana.
3. *Database Password*: usá `Generate a password` y guardala en un gestor de contraseñas.
   No va en el código ni en ningún chat; el sistema no la usa.
4. `Create new project` y esperá un par de minutos.

A tener en cuenta del plan gratuito: admite dos proyectos activos, **pausa el proyecto
si pasa una semana sin uso** y no hace copias de seguridad automáticas. Con el stock real
y las actas firmadas conviene el plan Pro: no se pausa y guarda una copia por día durante
7 días.

## Paso 2 - Crear las tablas y los permisos

Las migraciones están en `supabase/migrations/` y se aplican **en orden**, de a una. Las
ocho primeras son el sistema base (el mismo de iPhone DOBB); la novena trae lo que pidió
Import Salta.

| Orden | Archivo | Qué trae |
| --- | --- | --- |
| 1 | `20261013000000_inicial.sql` | Las tablas, los permisos, el catálogo público y el primer administrador. |
| 2 | `20261013120000_panel.sql` | Las funciones del panel: stock, ventas, permutas, cuentas, IMEI. |
| 3 | `20261013200000_gestion.sql` | Comprobantes (cliente y medio de pago), garantías, caja, proveedores, servicio técnico, avisos de stock y ajustes. |
| 4 | `20261014000000_lotes.sql` | Lotes de compra por proveedor, carga rápida de IMEI, listas de opciones editables y combos de accesorios. |
| 5 | `20261015000000_mayorista.sql` | Precio mayorista por lote (el catálogo sigue mostrando solo el minorista). |
| 6 | `20261017000000_clientes.sql` | Clientes y su deuda, deuda con proveedores, IMEI de equipos que vuelven al local y alto de la hoja del ticket. |
| 7 | `20261020000000_ticket.sql` | Ticket: quién atendió (lista de vendedores), condiciones de garantía y duplicado para el local. |
| 8 | `20261020120000_garantia_proveedor.sql` | Equipos mandados al proveedor por garantía y pagos de revendedores que se descuentan equipo por equipo. |
| 9 | `20261021000000_cuotas_y_actas.sql` | **Import Salta**: planes de cuotas con su recargo (salen en el catálogo), cobro con tarjeta en el posnet y actas de entrega y garantía con revisión y firmas. |

Para cada una:

1. En el proyecto: `SQL Editor` → `New query`.
2. Abrí el archivo, copiá **todo** el contenido y pegalo.
3. `Run`. Tiene que decir *Success. No rows returned*.

Comprobación: en `Table Editor` aparecen veintiuna tablas (entre ellas `actas`) y todas
dicen *RLS enabled*.

Cada migración se puede correr dos veces sin romper nada, pero siempre respetando el orden.

## Paso 3 - Cerrar el registro de usuarios

`Authentication` → `Sign In / Providers`:

- **Allow new users to sign up**: apagado. Nadie puede crearse una cuenta solo.
- **Confirm email**: prendido.

## Paso 4 - Crear los administradores

La migración 1 deja como administrador solo a `lautarorodriguezsquicciarini@gmail.com`.
Para sumar el correo del dueño del local (y de quien más atienda), en el `SQL Editor`:

```sql
insert into public.administradores (correo) values ('correo-del-dueno@ejemplo.com');
```

Después, `Authentication` → `Users` → `Add user` → `Create new user`, una vez por persona:

- *Email*: tiene que ser uno de los correos de la tabla `administradores`.
- *Password*: la escribe cada uno, o se la pasás por un canal privado.
- *Auto Confirm User*: marcado.

Un usuario cuyo correo no figura en `administradores` puede iniciar sesión pero no ve ni
toca nada.

## Paso 5 - Publicar el sitio en Vercel

El proyecto `import-salta` de Vercel ya está creado y conectado al repositorio de GitHub
`SquicciariniLautaro/import-salta` (*Root Directory*: `web`). Cada push a `main` se
publica solo. Falta cargarle las dos variables de abajo: en vercel.com → proyecto
`import-salta` → `Settings` → `Environment Variables`, para *Production* y *Preview*.
Hasta que estén, la página dice "No pudimos cargar el catálogo".

En Supabase: `Project Settings` → `API Keys` (o el botón `Connect`). Copiá:

- **Project URL**: `https://xxxxxxxx.supabase.co`
- **Publishable key** (empieza con `sb_publishable_`). Sirve también la `anon`.

Nunca copies la `secret` ni la `service_role`: saltean todos los permisos.

| Variable | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | La *Project URL*. |
| `VITE_SUPABASE_CLAVE_PUBLICA` | La *publishable key*. |

Si las cargás después del primer deploy: `Deployments` → en el último, `...` → `Redeploy`.
Hace falta porque Vite lee estas variables al compilar, no al abrir la página.

Para trabajar en tu PC: copiá `web/.env.ejemplo` como `web/.env.local` y completá los
mismos dos valores.

## Paso 6 - Lo que carga el dueño en Ajustes

Entrando al panel (`/admin`) → `Ajustes`:

1. **Datos del comercio**: dirección, teléfono y CUIT (salen en el ticket y en el acta).
2. **Cuotas con tarjeta**: un renglón por plan (3, 6, 9, 12...) con su recargo en %. 0 %
   es sin interés. Mientras no haya planes, el catálogo no muestra cuotas. Los recargos
   los define el dueño según lo que le cobra Payway.
3. **Garantías**: días de garantía de los celulares (vienen en 30). Se pueden cambiar en
   cada venta.
4. **Acta de entrega y garantía**: los puntos que se revisan con el cliente (vienen
   cargados: pantalla, Face ID, cámaras, batería, carga, etc.) y las condiciones que firma.
5. **Listas de opciones** → *Vendedores*: quiénes atienden. Sale en el ticket y en el acta.

Y arriba, en el encabezado: el dólar de venta. *Usar el dólar blue de hoy* lo trae de
DolarApi; después hay que tocar `Guardar`.

## Paso 7 - Cargar el stock del cliente

`supabase/stock_inicial.sql` tiene el stock que pasó el cliente el 2026-10-22: 12
celulares y 340 accesorios (fundas, vidrios, EarPods, cargadores y cables). Se pega **una
sola vez** en el `SQL Editor` → `Run`, después de las 9 migraciones. Si se corre dos
veces, el stock queda duplicado.

- Entra todo con costo y precio en 0, porque el cliente no los pasó. **Lo que tiene
  precio 0 no aparece en el catálogo.** El precio se carga en el panel: `Celulares` (o
  `Accesorios`) → abrir el modelo → `Editar` → costo y precio minorista en dólares →
  `Guardar cambios`. Desde ese momento sale en el catálogo.
- No trae IMEI: se cargan con el botón `IMEI` de cada lote.
- No están el 13 mini rosa (vendido) ni el 14 Pro violeta señado: la seña se carga en
  el panel con `+ Ingresar` y después `Señar`, con el nombre de quien señó y lo que dejó.

Comprobación: en `Table Editor` → `celulares` hay 12 filas y en `accesorios`, 340.

## Paso 8 - Comprobaciones

- [ ] La dirección de Vercel muestra el logo al entrar y después el catálogo.
- [ ] `/admin` deja entrar con un administrador y muestra la cotización.
- [ ] Recargar la página estando en `/admin` no da 404 y la sesión sigue abierta.
- [ ] Lo mismo desde un celular.
- [ ] Una venta de prueba con tarjeta en cuotas y su acta firmada (después se anula).
- [ ] Las pruebas de seguridad, desde tu PC, en la carpeta `web`:
  ```bash
  npm run probar-seguridad
  ```

## Probar sin tocar los datos reales

En la carpeta `web`:

```bash
npm run dev:prueba
```

Abre el sitio en modo prueba: en vez de Supabase usa una base de mentira dentro del
navegador, con las mismas migraciones y el stock inventado de `supabase/datos_prueba.sql`.
El ingreso acepta cualquier correo y contraseña, y todo vuelve a cero al recargar la
página. Sirve para mostrar el sistema o probar un cambio sin riesgo. Este modo no existe
en el sitio publicado.

## Cuotas y cobro con tarjeta

- Se cobra **solo en el local**, con el posnet bancario (Payway). El sistema no cobra
  online.
- El catálogo muestra en cada celular cuánto queda cada cuota de cada plan de `Ajustes`,
  con el recargo ya sumado, y el total cuando hay recargo.
- Al vender, *Cómo paga* → `Tarjeta (posnet)` → elegir las cuotas. El panel muestra cuánto
  hay que pasar por el posnet y cuánto queda cada cuota. El recargo se puede cambiar en
  el momento.
- En la venta queda anotado el precio de lista (el recargo es lo que cobra el banco por
  financiar). En la caja, lo cobrado con tarjeta va junto con las transferencias, en
  *En el banco*. El ticket dice las cuotas y cuánto se pasó por el posnet.

## Actas de entrega y garantía

Cada celular vendido lleva un acta que firman el cliente y el vendedor:

1. Al registrar la venta aparece *Hacer el acta*. También se puede hacer después, desde
   la pestaña `Garantías` (los celulares sin acta salen marcados y se cuentan arriba).
2. Se revisa cada punto con el cliente: *Funciona*, *Con detalle* (hay que escribir cuál)
   o *No aplica*.
3. Firman los dos en la pantalla, con el dedo o el mouse.
4. Sin todos los puntos revisados y sin las dos firmas, no se puede guardar.
5. Se imprime en una hoja A4 (o se guarda como PDF desde la ventana de impresión).

Una vez guardada no se edita: es lo que se firmó. Guarda las condiciones de garantía del
día en que se firmó, aunque después se cambien en `Ajustes`.

## Impresora de tickets y etiquetas

El panel imprime con la ventana de impresión del navegador: no hace falta instalar ningún
programa, pero la impresora tiene que estar instalada en el equipo desde el que se usa
el panel (con su controlador, como cualquier impresora).

1. En el panel: `Ajustes` → *Impresora*. Elegí el ancho del rollo (58 u 80 mm) y el
   tamaño de la etiqueta.
2. `Probar ticket` y `Probar etiqueta` abren una vista previa con datos inventados.
3. `Imprimir` abre la ventana del navegador: ahí se elige la impresora. Conviene sacar
   los márgenes y los encabezados y pies de página que agrega el navegador.

Si la ticketera no tiene driver (pasa con algunas en Mac), el panel puede mandarle el
ticket directo por USB desde Google Chrome: la guía está en `Ajustes`, en *Ticketera sin
driver, o que imprime sin parar*.

Cada ticket lleva el logo del local (`web/public/logo-ticket.png`), quién atendió, las
condiciones de garantía, un código de barras con el número (leído con la pistola en el
panel, abre ese ticket) y, si se pagó con tarjeta, las cuotas.

El ticket es un comprobante interno ("Documento no válido como factura"). El sistema no
emite facturas electrónicas de ARCA.

## Publicar cambios después

- **Código**: cada push a `main` lo despliega Vercel solo.
- **Base**: cada cambio es un archivo nuevo en `supabase/migrations/`. Antes de aplicarlo
  se prueba en tu PC con `npm run probar-base` (carpeta `web`), y después se pega en el
  `SQL Editor`. Una migración ya aplicada no se edita: se agrega otra.
- **Orden**: cuando un cambio trae migración y código, **primero la migración y después
  el push**.

## Errores típicos

| Lo que se ve | Qué revisar |
| --- | --- |
| "No pudimos cargar el catálogo" | Las dos variables en Vercel, y que se haya hecho `Redeploy` después de cargarlas. |
| Lo mismo, y en la consola del navegador dice `Content Security Policy` | La dirección del proyecto no termina en `.supabase.co`; hay que agregarla en `connect-src` de `web/vercel.json`. |
| "Correo o contraseña incorrectos" con la contraseña bien | El correo no está en `administradores`, o el usuario se creó sin *Auto Confirm User*. |
| El catálogo no muestra cuotas | No hay planes cargados en `Ajustes` → *Cuotas con tarjeta*, o falta la migración 9. |
| "Algo falló" al guardar un acta o al cobrar con tarjeta | Falta aplicar la migración 9: volver al paso 2. |
| *Usar el dólar blue de hoy* no trae nada | DolarApi no respondió: escribir la cotización a mano y `Guardar`. |
| El ticket sale cortado, muy chico o con una hoja en blanco | En `Ajustes` → *Impresora*, corregir el ancho del rollo; en la ventana de impresión, márgenes en "Ninguno". |
| Todo dejó de andar después de varios días | El proyecto gratuito se pausó: entrar a Supabase y `Restore project`. |
| `/admin` da 404 al recargar | En Vercel, que *Root Directory* sea `web` (ahí está `vercel.json`). |
