import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Navegadores mas viejos que se soportan. Tailwind v4 escribe los colores con
// oklch(), que los navegadores anteriores a Chrome 111 no entienden: los
// fondos de color quedan invisibles (ya paso con la PC de un cliente).
// Lightning CSS reescribe el CSS al compilar y agrega el color equivalente en
// un formato que esos navegadores si leen.
// Lightning CSS pide cada version como un numero: (version mayor << 16).
const NAVEGADORES_CSS = {
  chrome: 100 << 16,
  firefox: 100 << 16,
  safari: 15 << 16,
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  css: {
    transformer: 'lightningcss',
    lightningcss: { targets: NAVEGADORES_CSS },
  },

  // El modo prueba (npm run dev:prueba) lee las migraciones de la carpeta
  // supabase/, que esta afuera de web/: hay que darle permiso a Vite.
  server: { fs: { allow: ['..'] } },
  // PGlite trae su propio archivo binario; Vite no tiene que reempaquetarlo.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },

  build: {
    cssMinify: 'lightningcss',
    // Lo mismo para el JavaScript: no usar sintaxis mas nueva que estos navegadores.
    target: ['chrome100', 'firefox100', 'safari15'],
  },
})
