# Import Salta

Sistema de stock y ventas para Import Salta (iPhone nuevos y usados, Salta). Dos caras
sobre la misma base:

- **Catálogo público** (`/`): fondo negro, el logo aparece al entrar y el stock va en una
  tabla por modelo (capacidad y color, batería, precio en pesos con tarjeta y en efectivo,
  y WhatsApp), con la mejor
  cuota debajo de cada equipo y *Ver cuotas* para ver todos los planes. Cada consulta va
  a WhatsApp.
- **Panel de administración** (`/admin`): solo para el dueño y quienes atienden.

Parte del sistema de iPhone DOBB (stock con IMEI, ventas, permutas, revendedores, señas,
clientes, caja, proveedores, servicio técnico, garantías, tickets) y le suma lo que pidió
Import Salta:

- **Precio con tarjeta y en efectivo**: el precio cargado en el stock es el precio con
  tarjeta. En `Ajustes` el dueño elige el descuento pagando en efectivo (10 %, 20 %,
  30 %...), uno para celulares y otro para accesorios. El catálogo muestra los dos precios
  y al vender aparece el botón *Efectivo*.
- **Cuotas**: el dueño elige en `Ajustes` los planes (3, 6, 9, 12...) y el recargo de
  cada uno. El catálogo los muestra en cada equipo. Se cobra con el posnet del local o
  mandándole un QR al cliente, y al vender se elige *Tarjeta o QR* y las cuotas.
- **Acta de entrega y garantía**: cada celular vendido lleva un acta con la revisión punto
  por punto (pantalla, Face ID, cámaras, batería...), los días de garantía (30 o lo que
  elija el dueño) y las firmas del cliente y del vendedor en la pantalla. Sin la revisión
  completa y las dos firmas no se guarda. Se imprime en A4.
- **Dólar blue**: un botón en el encabezado del panel trae la cotización del día.
- **Fotos de los productos**: cada celular y accesorio puede llevar una foto, que sale como
  miniatura en el catálogo (al tocarla se ve grande). Se pone desde el panel y se guarda
  en Cloudinary en formato webp.

```
Navegador ── HTTPS ──> Frontend (React, en Vercel)
Navegador ── HTTPS ──> Supabase (Postgres + usuarios + permisos)
Panel     ── HTTPS ──> DolarApi (cotización del blue, solo al tocar el botón)
Panel     ── HTTPS ──> /api/firma-imagen (función de Vercel: firma cada subida de foto)
Panel     ── HTTPS ──> Cloudinary (sube la foto firmada)
Catálogo  ── HTTPS ──> Cloudinary (trae cada foto achicada, en webp)
```

| Carpeta | Qué es |
| --- | --- |
| `web/` | Frontend: React 19, Vite, Tailwind v4. |
| `web/src/Catalogo.jsx` | El catálogo público, con la portada del logo, las fotos y las cuotas. |
| `web/api/` | La única función de servidor: `firma-imagen.js`, que corre en Vercel y firma las subidas de fotos a Cloudinary con la clave secreta. |
| `video/` | El guion que graba el video tutorial (`node video/grabar.mjs`). El video queda en la raíz, fuera de git. |
| `web/src/panel/` | Las pantallas del panel. `Acta.jsx` y `Firma.jsx` son el acta y las firmas. |
| `web/src/servicios/` | Cálculo puro: precios, cuotas, actas y firmas, cuentas, ventas, caja, garantías, ticket y código de barras. |
| `web/public/` | El logo (manzana y nombre por separado para la animación, y la versión para imprimir). |
| `supabase/migrations/` | El esquema de la base y sus permisos, en archivos numerados. |
| `supabase/stock_inicial.sql` | El stock real del cliente, para cargar una sola vez después de las migraciones. |
| `supabase/datos_prueba.sql` | Stock inventado que usan solo las pruebas y el modo prueba de tu PC. Nunca va a Supabase. |

La seguridad vive en la base: un visitante solo puede llamar a `catalogo_publico()`, y las
tablas solo las ven los usuarios cuyo correo figura en `administradores`.

El panel no escribe en las tablas: cada acción del negocio (vender, registrar un pago,
guardar un acta) es una función de la base que se aplica completa o no se aplica.

Los colores: el fondo negro y las letras blancas valen para todo el sitio. El panel usa la
paleta de grises de Tailwind dada vuelta en un solo lugar, `web/src/index.css` (ver el
comentario de arriba de todo); lo que se imprime vuelve a negro sobre blanco.

## Trabajar en local

Hace falta Node 22 o más nuevo y un proyecto de Supabase.

```bash
cd web
npm install
# copiar .env.ejemplo como .env.local y completar los dos valores
npm run dev            # queda en http://localhost:5173
```

## Comandos (en `web/`)

| Comando | Para qué |
| --- | --- |
| `npm run dev:prueba` | Abre el sitio con una base de mentira en el navegador: se puede usar todo el panel sin tocar los datos reales. |
| `npm run probar` | Prueba las funciones de cálculo. No necesita base. |
| `npm run probar-base` | Aplica las migraciones en un Postgres de prueba dentro de tu PC y revisa permisos y reglas de negocio. |
| `npm run probar-seguridad` | Las pruebas de seguridad contra el proyecto real de Supabase. |
| `npm run lint` | Revisa el código. |
| `npm run build` | Compila en `web/dist`. |

## Publicar

Ver [DESPLIEGUE.md](DESPLIEGUE.md).
