// scripts/pagina-404.js
// GitHub Pages no sabe que /import-salta/admin es una pagina del sitio: como
// no existe ese archivo, muestra su 404.html. Copiando index.html como
// 404.html, esa "pagina de error" carga el sitio y el sitio muestra el panel.
// Lo corre "npm run build:demo" despues de compilar.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'))
console.log('dist/404.html listo')
