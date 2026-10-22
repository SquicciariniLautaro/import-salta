// api.js
// Lo que el frontend le pide a Supabase SIN iniciar sesion: el catalogo.
// Junto con apiAdmin.js son los unicos archivos que hablan con la base; los
// componentes llaman a estas funciones y no arman direcciones ni cabeceras.
//
// Este archivo usa fetch a secas, sin la libreria de Supabase, para que quien
// solo mira el catalogo no tenga que descargarla. La libreria se carga con el
// panel (apiAdmin.js).

import { armarCatalogo } from './servicios/catalogo.js'

// Datos del proyecto de Supabase (ver web/.env.ejemplo). Los dos son
// publicos: viajan dentro del sitio y cualquiera puede verlos. Lo que protege
// los datos son los permisos de la base, no esconder esta clave.
export const SUPABASE = {
  url: (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, ''),
  clave: import.meta.env.VITE_SUPABASE_CLAVE_PUBLICA || '',
}

// Modo prueba: una base de mentira dentro del navegador (ver
// pruebas/modoPrueba.js). Solo existe en desarrollo (npm run dev:prueba); al
// compilar el sitio esto vale false y Vite descarta todo ese codigo.
export const MODO_PRUEBA = import.meta.env.DEV && import.meta.env.VITE_MODO_PRUEBA === '1'

// Error con el mensaje para mostrar y el codigo HTTP (0 = no hubo respuesta).
export class ErrorApi extends Error {
  constructor(mensaje, estado = 0) {
    super(mensaje)
    this.estado = estado
  }
}

export const SIN_CONEXION = 'No hay conexión. Revisá la señal y probá de nuevo.'

export async function obtenerCatalogo() {
  // "import.meta.env.DEV &&" va escrito aca mismo para que, al compilar el
  // sitio, Vite vea un "false" y descarte este bloque con todo lo que importa.
  if (import.meta.env.DEV && MODO_PRUEBA) {
    const { rpcDePrueba } = await import('./pruebas/modoPrueba.js')
    return armarCatalogo(await rpcDePrueba('catalogo_publico', {}, { anonimo: true }))
  }

  if (!SUPABASE.url || !SUPABASE.clave) {
    throw new ErrorApi('Falta configurar la conexión con Supabase.')
  }

  let respuesta
  try {
    // Asi se llama a una funcion de la base desde afuera: /rest/v1/rpc/NOMBRE.
    respuesta = await fetch(`${SUPABASE.url}/rest/v1/rpc/catalogo_publico`, {
      method: 'POST',
      headers: { apikey: SUPABASE.clave, 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {
    // fetch solo tira error cuando no hay red o el servidor no contesta.
    throw new ErrorApi(SIN_CONEXION)
  }

  if (!respuesta.ok) throw new ErrorApi('No se pudo cargar el catálogo.', respuesta.status)
  return armarCatalogo(await respuesta.json())
}
