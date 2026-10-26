// api/firma-imagen.js
// Funcion de Vercel (corre en el servidor de Vercel, no en el navegador):
// POST /api/firma-imagen
//
// El panel la llama antes de subir una foto a Cloudinary. Revisa que quien
// pide sea un administrador (con su sesion de Supabase) y le devuelve una
// firma para subir fotos a la carpeta de productos. Cloudinary la acepta
// solo durante la hora siguiente.
//
// Necesita estas variables en Vercel (Settings > Environment Variables):
//   CLOUDINARY_URL               cloudinary://API_KEY:API_SECRET@CLOUD_NAME (secreta)
//   VITE_SUPABASE_URL            las mismas del sitio
//   VITE_SUPABASE_CLAVE_PUBLICA

import { datosDeSubida, firmar, leerCredenciales } from './_cloudinary.js'

function responder(estado, cuerpo) {
  return Response.json(cuerpo, { status: estado, headers: { 'Cache-Control': 'no-store' } })
}

// Pregunta a Supabase si la sesion que mando el panel es de un administrador.
// Se usa la misma funcion es_admin() que usa el panel.
async function esAdministrador(sesion) {
  const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const clave = process.env.VITE_SUPABASE_CLAVE_PUBLICA || ''
  if (!url || !clave || !sesion) return false
  const respuesta = await fetch(`${url}/rest/v1/rpc/es_admin`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: `Bearer ${sesion}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  return respuesta.ok && (await respuesta.json()) === true
}

export async function POST(pedido) {
  const credenciales = leerCredenciales(process.env.CLOUDINARY_URL)
  if (!credenciales) return responder(500, { error: 'Falta configurar Cloudinary en Vercel (CLOUDINARY_URL).' })

  const sesion = (pedido.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let permitido = false
  try {
    permitido = await esAdministrador(sesion)
  } catch {
    return responder(502, { error: 'No se pudo revisar la sesión. Probá de nuevo.' })
  }
  if (!permitido) return responder(401, { error: 'No tenés permiso para subir fotos. Volvé a iniciar sesión.' })

  const datos = datosDeSubida(Math.floor(Date.now() / 1000))
  return responder(200, {
    nube: credenciales.nube,
    datos: { ...datos, api_key: credenciales.clave, signature: firmar(datos, credenciales.secreto) },
  })
}
