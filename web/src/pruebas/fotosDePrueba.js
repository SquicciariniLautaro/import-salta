// pruebas/fotosDePrueba.js
// En el modo prueba las fotos no se suben a Cloudinary: quedan en la memoria
// de la pestana. A la base de mentira se le pasa una direccion con forma de
// Cloudinary (la base no acepta otras) y aca se anota que foto es cada una.
// Al recargar la pagina la base vuelve a empezar y las fotos se pierden.

const fotos = new Map()
let numero = 0

export function guardarFotoDePrueba(foto) {
  numero += 1
  const url = `https://res.cloudinary.com/prueba/image/upload/v1/import-salta/productos/prueba-${numero}.webp`
  fotos.set(url, URL.createObjectURL(foto))
  return url
}

// La foto guardada con esa direccion, o undefined si no es de prueba.
export const fotoDePrueba = (url) => fotos.get(url)
