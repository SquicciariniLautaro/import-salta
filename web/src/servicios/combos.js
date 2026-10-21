// servicios/combos.js
// Combos: varios accesorios que se venden juntos a un precio (por ejemplo,
// fuente + cable). Funciones puras.

import { describir } from './texto.js'
import { redondear4, sumar } from './lotes.js'

// combos: lo que manda panel_datos() ({ id, nombre, precio_usd, partes: [{ clave, cantidad }] }).
// lotes: los lotes de accesorios armados con armarStock().
// A cada combo le agrega sus partes con su lote, cuantos combos completos se
// pueden armar con lo que hay en el local y lo que suman sus partes a precio
// de lista y de costo.
export function armarCombos(combos, lotes) {
  const porClave = new Map(lotes.map((lote) => [lote.clave, lote]))
  return combos.map((combo) => {
    const partes = combo.partes.map((parte) => ({ ...parte, lote: porClave.get(parte.clave) || null }))
    const completas = partes.every((parte) => parte.lote)
    return {
      ...combo,
      partes,
      // Si falta alguna parte (se borro el lote), el combo no se puede vender.
      disponibles: completas ? Math.min(...partes.map((parte) => Math.floor(parte.lote.cantidad / parte.cantidad))) : 0,
      descripcion: partes
        .map((parte) => `${parte.cantidad > 1 ? `${parte.cantidad} x ` : ''}${parte.lote ? describir(parte.lote, 'accesorios') : 'ACCESORIO BORRADO'}`)
        .join(' + '),
      lista_usd: completas ? sumar(partes.map((parte) => parte.lote.precio_usd * parte.cantidad)) : 0,
      costo_usd: completas ? sumar(partes.map((parte) => parte.lote.costo_usd * parte.cantidad)) : 0,
    }
  })
}

// Arma lo que se le manda a vender() para "cantidad" combos a "precioUsd" cada uno.
// El precio del combo se reparte entre sus unidades en proporcion a su precio
// de lista (asi la ganancia de cada accesorio sigue teniendo sentido). Lo que
// sobra por redondeo va a la primera unidad, para que la suma de exacta.
// Devuelve [{ id, precio_usd }] o null si no alcanza el stock.
export function venderCombo(combo, cantidad, precioUsd) {
  if (cantidad < 1 || cantidad > combo.disponibles) return null

  const unidadesPorCombo = combo.partes.flatMap((parte) => Array(parte.cantidad).fill(parte))
  const pesoTotal = sumar(unidadesPorCombo.map((parte) => parte.lote.precio_usd))
  // Sin precios de lista, todas las unidades valen lo mismo.
  const precios = unidadesPorCombo.map((parte) =>
    redondear4(pesoTotal > 0 ? (precioUsd * parte.lote.precio_usd) / pesoTotal : precioUsd / unidadesPorCombo.length),
  )
  precios[0] = redondear4(precios[0] + precioUsd - sumar(precios))

  // Las unidades se toman en orden de cada lote, sin repetir.
  const usadas = new Map()
  const items = []
  for (let vuelta = 0; vuelta < cantidad; vuelta += 1) {
    unidadesPorCombo.forEach((parte, posicion) => {
      const siguiente = usadas.get(parte.clave) || 0
      items.push({ id: parte.lote.disponibles[siguiente].id, precio_usd: precios[posicion] })
      usadas.set(parte.clave, siguiente + 1)
    })
  }
  return items
}
