// panel/fotos.js
// Prepara una foto antes de subirla: la achica a 1600 px de lado como mucho
// y la pasa a webp. Una foto de celular pesa 3 a 5 MB; asi queda en unos
// cientos de KB y sube rapido aunque la senal del local sea mala.
// Si el navegador no sabe hacer webp (Safari viejo), sale en jpg y Cloudinary
// la convierte a webp al recibirla.

import toast from 'react-hot-toast'
import { guardarImagen, subirImagen } from '../apiAdmin.js'

const LADO_MAXIMO = 1600
// Hasta este tamano se sube tal cual si el navegador no la puede abrir.
const PESO_MAXIMO = 10 * 1024 * 1024

// La direccion de la foto del lote (lo que trajo panel_datos), o null si no tiene.
export function fotoDelLote(datos, lote) {
  return (datos.imagenes || []).find((imagen) => imagen.tabla === lote.tabla && imagen.clave === lote.clave)?.url || null
}

// Sube a Cloudinary las fotos elegidas en un formulario, ANTES de cargar el
// stock: si una falla, no se cargo nada y se puede volver a intentar.
// fotos: lista de { archivo } o null. Devuelve las direcciones (null donde no habia).
export async function subirFotos(fotos) {
  const urls = []
  for (const foto of fotos) urls.push(foto ? await subirImagen(foto.archivo) : null)
  return urls
}

// Despues de cargar el stock: le pone a cada lote su foto ya subida.
// pares: [{ clave, url }] (clave null = no se encontro el lote recien cargado).
// Nunca tira error: el stock ya quedo cargado, y si el formulario mostrara un
// error se podria volver a tocar Guardar y cargarlo dos veces. Si algo falla,
// se avisa y la foto se pone despues con "Poner foto en el catalogo".
export async function ponerFotos(tabla, pares, recargar) {
  const conFoto = pares.filter((par) => par.url)
  if (conFoto.length === 0) return
  try {
    for (const { clave, url } of conFoto) {
      if (!clave) throw new Error('No se encontró el producto recién cargado.')
      await guardarImagen(tabla, clave, url)
    }
    await recargar()
  } catch (fallo) {
    toast.error(`El stock se cargó, pero la foto no se guardó: ${fallo.message} Ponela con "Poner foto en el catálogo".`, { duration: 8000 })
  }
}

function aBlob(lienzo, tipo, calidad) {
  return new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad))
}

// Devuelve un Blob listo para subir, o tira un Error con el mensaje para mostrar.
export async function prepararFoto(archivo) {
  if (!archivo.type.startsWith('image/') && !/\.(heic|heif)$/i.test(archivo.name)) {
    throw new Error('Ese archivo no es una foto.')
  }

  let imagen
  try {
    imagen = await createImageBitmap(archivo)
  } catch {
    // Formatos que el navegador no abre (HEIC en Windows): va tal cual.
    if (archivo.size > PESO_MAXIMO) throw new Error('La foto pesa más de 10 MB.')
    return archivo
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()

  const webp = await aBlob(lienzo, 'image/webp', 0.85)
  if (webp?.type === 'image/webp') return webp
  return (await aBlob(lienzo, 'image/jpeg', 0.88)) || archivo
}
