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
ocho primeras son el sistema base (el mismo de iPhone DOBB); de la novena en adelante
traen lo que pidió Import Salta.

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
| 10 | `20261026000000_imagenes.sql` | **Import Salta**: una foto por producto (celulares y accesorios) que sale en el catálogo. Las fotos se guardan en Cloudinary (ver *Fotos de los productos*). |
| 11 | `20261028000000_descuento_efectivo.sql` | **Import Salta**: descuento pagando en efectivo (el catálogo muestra el precio con tarjeta y en efectivo) y el texto de las cuotas sin "en el local con posnet". |
| 12 | `20261029000000_fecha_de_compra.sql` | **Import Salta**: el historial de ventas trae la fecha de compra de cada unidad vendida. |
| 13 | `20261031000000_fechas_a_mano.sql` | **Import Salta**: elegir la fecha de compra al ingresar stock y la de venta al vender, y corregirlas después. |

Para cada una:

1. En el proyecto: `SQL Editor` → `New query`.
2. Abrí el archivo, copiá **todo** el contenido y pegalo.
3. `Run`. Tiene que decir *Success. No rows returned*.

Comprobación: en `Table Editor` aparecen veintidós tablas (entre ellas `actas` e
`imagenes`) y todas dicen *RLS enabled*.

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

Para las fotos de los productos hace falta una tercera variable, `CLOUDINARY_URL`: ver
*Fotos de los productos (Cloudinary)* más abajo.

## Paso 6 - Lo que carga el dueño en Ajustes

Entrando al panel (`/admin`) → `Ajustes`:

1. **Datos del comercio**: dirección, teléfono y CUIT (salen en el ticket y en el acta).
2. **Precio en efectivo**: el descuento pagando en efectivo, en %, para celulares y para
   accesorios (y combos). 0 = sin descuento: el catálogo muestra un solo precio.
3. **Cuotas con tarjeta**: un renglón por plan (3, 6, 9, 12...) con su recargo en %. 0 %
   es sin interés. Mientras no haya planes, el catálogo no muestra cuotas. Los recargos
   los define el dueño según lo que le cobra Payway.
4. **Garantías**: días de garantía de los celulares (vienen en 30). Se pueden cambiar en
   cada venta.
5. **Acta de entrega y garantía**: los puntos que se revisan con el cliente (vienen
   cargados: pantalla, Face ID, cámaras, batería, carga, etc.) y las condiciones que firma.
6. **Listas de opciones** → *Vendedores*: quiénes atienden. Sale en el ticket y en el acta.

Y arriba, en el encabezado: el dólar de venta. *Usar el dólar blue de hoy* lo trae de
DolarApi; después hay que tocar `Guardar`.

## Paso 7 - Cargar el stock del cliente

`supabase/stock_inicial.sql` tiene el stock que pasó el cliente el 2026-10-22: 12
celulares y 340 accesorios (fundas, vidrios, EarPods, cargadores y cables). Se pega **una
sola vez** en el `SQL Editor` → `Run`, después de las migraciones. Si se corre dos
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
- [ ] Una foto puesta desde el panel se ve en el catálogo, y en Cloudinary aparece en la
  carpeta `import-salta/productos` en formato webp.
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

## Precio con tarjeta y en efectivo

- El precio que se carga en el stock (minorista) es el **precio con tarjeta** en un pago.
- En `Ajustes` → *Precio en efectivo* se elige cuánto se descuenta pagando en efectivo:
  un porcentaje para los celulares y otro para los accesorios (los combos usan el de los
  accesorios). Va de 0 % a 90 %, sin decimales; 0 = sin descuento.
- Con descuento, el catálogo avisa arriba "Pagando en efectivo: X % de descuento" y cada
  producto muestra los dos precios: *Tarjeta* arriba y *Efectivo* abajo, en verde. El
  mensaje de WhatsApp también lleva los dos. En los precios por cantidad el descuento se
  aplica sobre el precio que corresponda a la cantidad.
- Al vender, debajo del precio aparece el botón *Efectivo* con el precio ya descontado
  (también en los combos y en el carrito). En la venta queda el precio que se elija.
- Las cuotas se calculan sobre el precio con tarjeta.

## Fecha de compra y fecha de venta

Cada celular y accesorio guarda el día en que entró al stock (la fecha de compra) y el día
en que se vendió. Las dos arrancan en hoy, pero se pueden cambiar:

- Al cargar: `+ Ingresar`, `+ Lote proveedor` y `Permuta` tienen el campo *Fecha de compra*
  (en la permuta, *Fecha de la permuta*: vale para el equipo que entra y el que sale).
- Al vender: la ventana *Vendido* (y la de combos) tiene *Fecha de venta*. Esa fecha queda
  también en el ticket, en la deuda que deje y en la `Caja`. El dólar de la venta es el de
  hoy, el que esté cargado arriba.
- Para corregir: en el stock, `Editar` el modelo → *Fecha de compra* (queda para todas sus
  unidades sin vender). En `Ventas`, abrir la venta → *Fechas*: la de venta cambia todo el
  ticket y la de compra, las unidades de ese renglón.
- No se puede elegir un día futuro ni vender antes del día en que el equipo entró al stock:
  si pasa, primero se corrige la fecha de compra.

Se ven en:

- `Celulares` / `Accesorios` → abrir el modelo: *Comprado: el 22/10/26*. Si las unidades
  entraron en días distintos, cada día con cuántas (*20/10/26 (2 u.) · 27/10/26 (4 u.)*).
  Al vender, cada equipo con IMEI dice cuándo se compró.
- `Ventas`: cada venta dice *Vendido el ...* y *comprado el ...*, también al abrirla. El
  archivo que se descarga desde Ventas trae las dos columnas.
- El buscador de IMEI dice *Ingresó el ...* y *Vendido el ...* de cada equipo.

El stock que se cargó con `stock_inicial.sql` figura comprado el día que se cargó
(2026-10-22). Si el cliente quiere la fecha real, la corrige con `Editar` en cada modelo.

## Cuotas y cobro con tarjeta

- Se cobra con el posnet del local (Payway) o mandándole un QR al cliente. El sistema
  no cobra online: solo anota cómo se pagó.
- El catálogo muestra en cada celular cuánto queda cada cuota de cada plan de `Ajustes`,
  con el recargo ya sumado, y el total cuando hay recargo.
- Al vender, *Cómo paga* → `Tarjeta o QR` → elegir las cuotas. El panel muestra cuánto
  hay que cobrar y cuánto queda cada cuota. El recargo se puede cambiar en
  el momento.
- En la venta queda anotado el precio con tarjeta (el recargo es lo que cobra el banco por
  financiar). En la caja, lo cobrado con tarjeta va junto con las transferencias, en
  *En el banco*. El ticket dice las cuotas y cuánto se cobró con tarjeta.

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

## Fotos de los productos (Cloudinary)

Cada producto del catálogo (celulares y accesorios) puede llevar una foto. Las fotos no se
guardan en Supabase sino en **Cloudinary**, un servicio que las guarda y las entrega
achicadas y en **webp** (pesan poco y el catálogo carga rápido). La base solo guarda la
dirección de cada foto.

```
Panel ──> /api/firma-imagen (Vercel) ── revisa que sea administrador y firma la subida
Panel ──> Cloudinary ── recibe la foto firmada, la guarda en webp
Catálogo ──> Cloudinary ── trae cada foto del tamaño justo
```

La clave secreta de Cloudinary vive solo en Vercel: nunca viaja al navegador. Por eso
nadie que no sea administrador puede subir fotos a la cuenta, aunque mire el código del sitio.

### Conectar Cloudinary (una sola vez)

1. Creá la cuenta en [cloudinary.com](https://cloudinary.com) (el plan gratis alcanza de
   sobra para el catálogo). Conviene hacerla con un correo del negocio.
2. En la consola de Cloudinary: `Settings` (el engranaje) → `API Keys`. Arriba está el
   **API environment variable**, de esta forma:
   `CLOUDINARY_URL=cloudinary://123456789012345:abcdEFGH-ijkl_mnop@nombre-de-tu-nube`.
   Copiá todo lo que va **después** de `CLOUDINARY_URL=` (el botón del ojo muestra la
   parte secreta).
3. En vercel.com → proyecto `import-salta` → `Settings` → `Environment Variables` →
   `Add New`:
   - *Key*: `CLOUDINARY_URL`
   - *Value*: lo que copiaste (`cloudinary://...`).
   - *Environments*: *Production* y *Preview*.
   - Marcá **Sensitive**: así ni siquiera se puede volver a leer desde Vercel.
4. `Deployments` → en el último, `...` → `Redeploy`. Sin esto la variable no se usa.
5. No hay que configurar nada más en Cloudinary (ni "upload presets"): el sistema crea
   solo la carpeta `import-salta/productos` con la primera foto.

### Poner una foto

Se puede poner en el momento de cargar el stock o después:

- **Al ingresar**: en `+ Ingresar` (celulares o accesorios) está *Foto para el catálogo* →
  `Subir foto`. Si se ingresan varias unidades, la foto es para todas.
- **En un lote de proveedor**: en `+ Lote proveedor` cada modelo tiene su propia *Foto
  para el catálogo*.
- **Al editar**: en `Editar` se ve la foto actual y se puede cambiar.
- **Después**: `Celulares` (o `Accesorios`) → abrir el modelo → tocar el producto →
  `Poner foto en el catálogo` → `Elegir foto` (desde el celular abre la cámara o la
  galería) → `Guardar foto`.

Al ingresar, la foto se sube antes que el stock: si la subida falla, no se carga nada y se
puede volver a intentar. Si el stock se cargó pero la foto no llegó a guardarse, el panel
lo avisa y la foto se pone después con el botón del producto.

- La foto es del producto (modelo, capacidad, color...), no de cada unidad: si entran más
  equipos iguales, ya salen con la foto. Si se edita el producto (otro color, por
  ejemplo), la foto lo acompaña.
- Antes de subirla, el panel la achica a 1600 px y la pasa a webp. Si el navegador no sabe
  hacer webp, Cloudinary la convierte al recibirla: en Cloudinary quedan siempre en webp.
- En el catálogo sale una miniatura a la izquierda de cada producto, y al tocarla se ve
  grande. Los que no tienen foto muestran un cuadro vacío, para que la tabla quede pareja.
- `Cambiar la foto del catálogo` la reemplaza; `Quitar foto` la saca del catálogo. La foto
  vieja queda en Cloudinary (no molesta; se puede borrar a mano desde `Media Library`).
- En el panel, los productos sin foto llevan la marca *Sin foto*.

Las fotos solo se pueden subir desde el sitio publicado en Vercel (ahí corre la función
que firma). Con `npm run dev:prueba` también se puede probar: las fotos quedan en la
memoria del navegador, sin tocar Cloudinary.

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
| "Falta configurar Cloudinary en Vercel" al guardar una foto | Falta la variable `CLOUDINARY_URL` en Vercel, o falta el `Redeploy` después de cargarla. |
| "Cloudinary no aceptó la foto: Invalid Signature" | `CLOUDINARY_URL` está mal copiada (o se regeneró la clave en Cloudinary): copiarla de nuevo y `Redeploy`. |
| "La subida de fotos funciona en el sitio publicado..." | Se está usando `npm run dev`: la función que firma solo corre en Vercel. Probar en el sitio publicado o con `npm run dev:prueba`. |
| "Algo falló" al guardar una foto | Falta aplicar la migración 10: volver al paso 2. |
| En `Ventas` no aparece "comprado el" | Falta aplicar la migración 12: volver al paso 2. |
| Al ingresar o vender con otra fecha sale "Algo falló" (o la venta queda con la fecha de hoy) | Falta aplicar la migración 13: volver al paso 2. |
| El catálogo no muestra el precio en efectivo | En `Ajustes` → *Precio en efectivo* el descuento está en 0, o falta la migración 11. Sin la migración 11, el descuento que se guarda en Ajustes vuelve a 0. |
| *Usar el dólar blue de hoy* no trae nada | DolarApi no respondió: escribir la cotización a mano y `Guardar`. |
| El ticket sale cortado, muy chico o con una hoja en blanco | En `Ajustes` → *Impresora*, corregir el ancho del rollo; en la ventana de impresión, márgenes en "Ninguno". |
| Todo dejó de andar después de varios días | El proyecto gratuito se pausó: entrar a Supabase y `Restore project`. |
| `/admin` da 404 al recargar | En Vercel, que *Root Directory* sea `web` (ahí está `vercel.json`). |
