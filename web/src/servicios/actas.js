// servicios/actas.js
// El acta de entrega y garantia de un celular: la revision punto por punto y
// las firmas del cliente y del vendedor. Funciones puras.

export const ESTADOS_DE_PUNTO = [
  { id: 'ok', nombre: 'Funciona' },
  { id: 'detalle', nombre: 'Con detalle' },
  { id: 'no_aplica', nombre: 'No aplica' },
]

export function nombreDeEstado(estado) {
  return ESTADOS_DE_PUNTO.find((opcion) => opcion.id === estado)?.nombre || 'Sin revisar'
}

// La revision vacia, a partir de los puntos cargados en Ajustes.
export function revisionInicial(puntos) {
  return (puntos || []).map((punto) => ({ punto, estado: '', nota: '' }))
}

// Marca todos los puntos que todavia no se revisaron como "Funciona".
export function marcarRestantes(revision) {
  return revision.map((item) => (item.estado ? item : { ...item, estado: 'ok' }))
}

// Cuantos puntos faltan revisar.
export function faltanRevisar(revision) {
  return revision.filter((item) => !item.estado).length
}

// --- Firmas ------------------------------------------------------------------
// Una firma es una lista de trazos; cada trazo, los puntos por donde paso el
// dedo o el mouse, en una cuadricula de ANCHO x ALTO. Se guarda como texto:
// "M x y L x y L x y M x y L x y" (M empieza un trazo, L sigue la linea). Es
// el mismo formato de los dibujos SVG, asi que se muestra y se imprime tal cual.

export const LIENZO = { ancho: 600, alto: 200 }

// Con menos de esta cantidad de puntos no es una firma: es un toque.
const PUNTOS_MINIMOS = 8

// Pasa los trazos a texto. Los puntos casi pegados al anterior se saltean
// (no cambian el dibujo y la firma ocupa menos). Un trazo de un solo punto
// se guarda como una linea minima, para que se vea.
export function firmaATexto(trazos) {
  const partes = []
  for (const trazo of trazos || []) {
    if (!trazo || trazo.length === 0) continue
    const puntos = [trazo[0]]
    for (const punto of trazo.slice(1)) {
      const ultimo = puntos[puntos.length - 1]
      if (Math.hypot(punto.x - ultimo.x, punto.y - ultimo.y) >= 2) puntos.push(punto)
    }
    if (puntos.length === 1) puntos.push(puntos[0])
    const [primero, ...resto] = puntos.map(redondear)
    partes.push(`M ${primero.x} ${primero.y}`, ...resto.map((punto) => `L ${punto.x} ${punto.y}`))
  }
  return partes.join(' ')
}

function redondear(punto) {
  return {
    x: Math.min(LIENZO.ancho, Math.max(0, Math.round(punto.x))),
    y: Math.min(LIENZO.alto, Math.max(0, Math.round(punto.y))),
  }
}

// true si los trazos alcanzan para ser una firma.
export function hayFirma(trazos) {
  const puntos = (trazos || []).reduce((suma, trazo) => suma + trazo.length, 0)
  return puntos >= PUNTOS_MINIMOS
}

// --- Antes de guardar --------------------------------------------------------

// Lo primero que falta para poder guardar el acta, o '' si esta completa.
// acta: { cliente, vendedor, revision, firmaCliente, firmaVendedor } (las
// firmas como trazos).
export function problemaDeActa(acta) {
  if (!acta.cliente?.trim()) return 'Falta el nombre del cliente.'
  if (!acta.vendedor?.trim()) return 'Falta quién entrega el equipo.'
  const faltan = faltanRevisar(acta.revision)
  if (faltan > 0) return faltan === 1 ? 'Falta revisar 1 punto.' : `Faltan revisar ${faltan} puntos.`
  const sinNota = acta.revision.find((item) => item.estado === 'detalle' && !item.nota.trim())
  if (sinNota) return `Escribí cuál es el detalle de: ${sinNota.punto}.`
  if (!hayFirma(acta.firmaCliente)) return 'Falta la firma del cliente.'
  if (!hayFirma(acta.firmaVendedor)) return 'Falta la firma del vendedor.'
  return ''
}
