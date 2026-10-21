// pruebas/modoPrueba.js
// "Modo prueba" del sitio: en vez de hablar con Supabase, habla con una base
// de mentira que vive en la memoria del navegador (ver baseLocal.js), cargada
// con las migraciones reales y el stock inventado de supabase/datos_prueba.sql.
//
// Sirve para usar y probar el panel entero sin tocar los datos del cliente y
// sin necesitar una contrasena. Cada vez que se recarga la pagina, la base
// vuelve a empezar de cero.
//
// Se prende con:  npm run dev:prueba
// Este archivo solo se carga en desarrollo: no forma parte del sitio publicado.

import { PGlite } from '@electric-sql/pglite'
import { ADMIN_DE_PRUEBA, crearBaseLocal } from './baseLocal.js'
import semilla from '../../../supabase/datos_prueba.sql?raw'

// Vite trae el texto de todas las migraciones; se ordenan por nombre de archivo.
const archivos = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const migraciones = Object.keys(archivos)
  .sort()
  .map((ruta) => archivos[ruta])

// La base se crea una sola vez, la primera vez que alguien la necesita.
let promesa = null
function base() {
  if (!promesa) {
    promesa = crearBaseLocal({
      PGlite,
      migraciones,
      semilla: `
        ${semilla}
        insert into auth.users (id, email, email_confirmed_at)
        values ('${ADMIN_DE_PRUEBA}', 'lautarorodriguezsquicciarini@gmail.com', now());
      `,
    })
  }
  return promesa
}

// Mismo trato que una llamada a Supabase: devuelve el dato o tira un error
// con "code" (codigo de Postgres) y "message".
export async function rpcDePrueba(nombre, argumentos, { anonimo = false } = {}) {
  const { rpc } = await base()
  return rpc(nombre, argumentos, { usuario: anonimo ? null : ADMIN_DE_PRUEBA })
}
