// api/_cloudinary.js
// Lo que necesita la funcion firma-imagen.js para hablar con Cloudinary.
// (El guion bajo del nombre hace que Vercel no lo publique como funcion.)
//
// Una subida "firmada" lleva una firma: los datos de la subida mas la clave
// secreta, pasados por SHA-1. Cloudinary la recalcula con su copia de la
// clave y, si no coincide, rechaza la foto. Asi solo puede subir fotos quien
// pase por nuestra funcion, y la clave secreta nunca sale de Vercel.
// https://cloudinary.com/documentation/authentication_signatures

import { createHash } from 'node:crypto'

// Carpeta de Cloudinary donde quedan las fotos de los productos.
export const CARPETA = 'import-salta/productos'

// Cloudinary muestra los tres datos juntos como "API environment variable":
//   cloudinary://API_KEY:API_SECRET@CLOUD_NAME
// Devuelve { nube, clave, secreto } o null si falta o esta mal escrita.
export function leerCredenciales(texto) {
  if (!texto) return null
  try {
    const direccion = new URL(texto.trim())
    const credenciales = {
      nube: direccion.hostname,
      clave: decodeURIComponent(direccion.username),
      secreto: decodeURIComponent(direccion.password),
    }
    if (direccion.protocol !== 'cloudinary:' || !credenciales.nube || !credenciales.clave || !credenciales.secreto) return null
    return credenciales
  } catch {
    return null
  }
}

// La firma: los datos ordenados por nombre, "nombre=valor" unidos con "&",
// la clave secreta pegada al final, y todo por SHA-1.
export function firmar(datos, secreto) {
  const texto = Object.keys(datos)
    .sort()
    .map((nombre) => `${nombre}=${datos[nombre]}`)
    .join('&')
  return createHash('sha1').update(texto + secreto).digest('hex')
}

// Los datos de una subida: a la carpeta de productos, guardada en webp
// (aunque llegue en jpg o png, Cloudinary la convierte) y solo si es una foto.
export function datosDeSubida(segundos) {
  return {
    allowed_formats: 'webp,jpg,jpeg,png,heic,heif',
    folder: CARPETA,
    format: 'webp',
    timestamp: segundos,
  }
}
