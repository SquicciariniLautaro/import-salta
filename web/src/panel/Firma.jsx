// panel/Firma.jsx
// Recuadro para firmar con el dedo (celular o tablet) o con el mouse (PC).
// La firma se guarda como los trazos dibujados (ver servicios/actas.js), no
// como foto: ocupa poco y se imprime nitida.
//
// Uso:
//   const [firma, setFirma] = useState([])
//   <CampoFirma titulo="Firma del cliente" trazos={firma} alCambiar={setFirma} />
//   <FirmaDibujada texto={acta.firma_cliente} />   (para mostrarla o imprimirla)

import { useEffect, useRef } from 'react'
import { LIENZO, hayFirma } from '../servicios/actas.js'

// Grosor del trazo, en puntos del lienzo de 600 x 200.
const GROSOR = 3.2

export function CampoFirma({ titulo, aclaracion, trazos, alCambiar }) {
  const lienzo = useRef(null)
  // El trazo que se esta dibujando ahora (null si no se esta tocando).
  const actual = useRef(null)
  // Los trazos de la ultima vez que se dibujo, para seguir dibujando sin esperar a React.
  const guardados = useRef(trazos)

  // Dibuja todos los trazos. El lienzo se mide de nuevo cada vez: si la
  // ventana cambio de ancho (se giro el celular), la firma se ajusta.
  function dibujar(lista) {
    const elemento = lienzo.current
    if (!elemento) return
    const escala = window.devicePixelRatio || 1
    const ancho = elemento.clientWidth
    const alto = elemento.clientHeight
    if (elemento.width !== Math.round(ancho * escala)) {
      elemento.width = Math.round(ancho * escala)
      elemento.height = Math.round(alto * escala)
    }
    const pincel = elemento.getContext('2d')
    pincel.setTransform(1, 0, 0, 1, 0, 0)
    pincel.clearRect(0, 0, elemento.width, elemento.height)
    const factor = (ancho / LIENZO.ancho) * escala
    pincel.setTransform(factor, 0, 0, factor, 0, 0)
    pincel.lineWidth = GROSOR
    pincel.lineCap = 'round'
    pincel.lineJoin = 'round'
    pincel.strokeStyle = '#000'
    for (const trazo of lista) {
      if (trazo.length === 0) continue
      pincel.beginPath()
      pincel.moveTo(trazo[0].x, trazo[0].y)
      // Un toque solo se ve como un puntito.
      if (trazo.length === 1) pincel.lineTo(trazo[0].x + 0.1, trazo[0].y)
      for (const punto of trazo.slice(1)) pincel.lineTo(punto.x, punto.y)
      pincel.stroke()
    }
  }

  useEffect(() => {
    guardados.current = trazos
    dibujar(trazos)
  }, [trazos])

  useEffect(() => {
    const alCambiarTamano = () => dibujar(guardados.current)
    window.addEventListener('resize', alCambiarTamano)
    return () => window.removeEventListener('resize', alCambiarTamano)
  }, [])

  // De la posicion en pantalla a la cuadricula de 600 x 200.
  function puntoDe(evento) {
    const caja = lienzo.current.getBoundingClientRect()
    return {
      x: ((evento.clientX - caja.left) / caja.width) * LIENZO.ancho,
      y: ((evento.clientY - caja.top) / caja.height) * LIENZO.alto,
    }
  }

  function empezar(evento) {
    evento.preventDefault()
    // Asi el trazo sigue aunque el dedo salga un momento del recuadro. Algun
    // navegador viejo no lo deja: se firma igual, sin eso.
    try {
      lienzo.current.setPointerCapture(evento.pointerId)
    } catch {
      // Sin captura: si el dedo sale del recuadro, el trazo termina ahi.
    }
    actual.current = [puntoDe(evento)]
    dibujar([...guardados.current, actual.current])
  }

  function mover(evento) {
    if (!actual.current) return
    evento.preventDefault()
    actual.current.push(puntoDe(evento))
    dibujar([...guardados.current, actual.current])
  }

  function terminar() {
    if (!actual.current) return
    const lista = [...guardados.current, actual.current]
    actual.current = null
    guardados.current = lista
    alCambiar(lista)
  }

  const firmado = hayFirma(trazos)

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="etiqueta">{titulo}</p>
        <button type="button" className="boton boton-claro boton-chico" onClick={() => alCambiar([])} disabled={trazos.length === 0}>
          Borrar
        </button>
      </div>
      {/* El recuadro es blanco, como el papel: la firma se ve igual que impresa. */}
      <div className={`relative overflow-hidden rounded-xl border-2 bg-blanco ${firmado ? 'border-verde' : 'border-neutral-300'}`}>
        <canvas
          ref={lienzo}
          className="block aspect-[3/1] w-full cursor-crosshair"
          // Sin esto, en el celular el dedo desliza la pagina en vez de firmar.
          style={{ touchAction: 'none' }}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onPointerLeave={terminar}
          aria-label={titulo}
        />
        {/* La linea donde se firma. */}
        <div className="pointer-events-none absolute right-6 bottom-[22%] left-6 border-b border-dashed border-[#9a9aa2]" />
        {trazos.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-[30%] text-center text-xs text-[#9a9aa2]">Firmá acá con el dedo o el mouse</p>
        )}
      </div>
      {aclaracion && <p className="mt-1 truncate text-[11px] text-neutral-500">Aclaración: {aclaracion}</p>}
    </div>
  )
}

// Una firma guardada, dibujada. Se ve igual en la pantalla y en el papel.
export function FirmaDibujada({ texto, alto = '22mm' }) {
  return (
    <svg viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} style={{ height: alto, width: '100%' }} aria-hidden="true">
      <path d={texto} fill="none" stroke="#000" strokeWidth={GROSOR} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
