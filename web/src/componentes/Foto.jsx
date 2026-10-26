// componentes/Foto.jsx
// La foto de un producto, pedida a Cloudinary del tamano justo (ver
// servicios/imagenes.js). Con alto, sale recortada en cuadro (miniatura).
// Si la foto no carga, queda el cuadro vacio en vez del icono de roto.

import { useState } from 'react'
import { MODO_PRUEBA } from '../api.js'
import { fotoDePrueba } from '../pruebas/fotosDePrueba.js'
import { urlImagen } from '../servicios/imagenes.js'

export default function Foto({ url, ancho, alto, alt = '', className = '' }) {
  const [rota, setRota] = useState(false)
  // Ver la nota sobre import.meta.env.DEV en api.js.
  const fuente = (import.meta.env.DEV && MODO_PRUEBA && fotoDePrueba(url)) || urlImagen(url, { ancho, alto })
  if (!url || rota) return <span className={`block bg-superficie ${className}`} aria-hidden="true" />
  return (
    <img
      src={fuente}
      alt={alt}
      width={ancho}
      height={alto}
      loading="lazy"
      decoding="async"
      onError={() => setRota(true)}
      className={`block bg-superficie ${alto ? 'object-cover' : 'object-contain'} ${className}`}
    />
  )
}
