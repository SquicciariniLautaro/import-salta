// servicios/precios.js
// Conversion entre dolares y pesos, y precios por cantidad de accesorios.
// Todo se guarda en USD; los pesos se calculan al mostrar, redondeados a entero.

import { redondear4 } from './lotes.js'

export function aPesos(usd, cotizacion) {
  return Math.round(Number(usd) * Number(cotizacion))
}

export function aDolares(pesos, cotizacion) {
  return redondear4(Number(pesos) / Number(cotizacion))
}

// Traduce un tramo { desde, moneda, precio } a sus dos precios por unidad.
// Un tramo en pesos es fijo; uno en dolares sigue la cotizacion.
export function resolverTramo(tramo, cotizacion) {
  if (tramo.moneda === 'ars') {
    return {
      desde: tramo.desde,
      precio_ars: Math.round(tramo.precio),
      precio_usd: aDolares(tramo.precio, cotizacion),
    }
  }
  return {
    desde: tramo.desde,
    precio_ars: aPesos(tramo.precio, cotizacion),
    precio_usd: redondear4(tramo.precio),
  }
}

// Precio por unidad para una cantidad: vale el tramo con el mayor "desde" que
// no supere la cantidad. Si ninguno aplica, el precio de lista.
// Devuelve { precio_ars, precio_usd } por unidad.
export function precioPorCantidad({ tramos, cantidad, precioListaUsd, cotizacion }) {
  let elegido = null
  for (const tramo of tramos) {
    if (tramo.desde <= cantidad && (!elegido || tramo.desde > elegido.desde)) elegido = tramo
  }

  if (!elegido) {
    return { precio_ars: aPesos(precioListaUsd, cotizacion), precio_usd: redondear4(precioListaUsd) }
  }

  const resuelto = resolverTramo(elegido, cotizacion)
  return { precio_ars: resuelto.precio_ars, precio_usd: resuelto.precio_usd }
}
