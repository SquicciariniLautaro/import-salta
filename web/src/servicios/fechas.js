// servicios/fechas.js
// La fecha de compra y la de venta que se eligen a mano. Funciones puras.
//
// Los campos de fecha trabajan con el dia ("2026-10-28", en la hora local de
// quien mira). A la base se le manda la fecha completa, o null para que use
// el momento en que se guarda.

import { diaDe } from './caja.js'

// Lo que se le manda a la base por un dia elegido: null si no se eligio o es
// el mismo que "original" (hoy, al cargar; el que tenia, al corregir). Si es
// otro dia, el mediodia de ese dia: asi no cambia de dia por la hora.
export function fechaParaLaBase(dia, original) {
  if (!dia || dia === original) return null
  return new Date(`${dia}T12:00:00`).toISOString()
}

// El dia en que entro al stock la unidad mas nueva ('' si ninguna tiene
// fecha). Una venta no puede ser de antes de ese dia.
export function diaDeLaCompraMasNueva(unidades) {
  let mayor = ''
  for (const unidad of unidades) {
    if (!unidad?.fecha_ingreso) continue
    const dia = diaDe(unidad.fecha_ingreso)
    if (dia > mayor) mayor = dia
  }
  return mayor
}

// Si un dia elegido sirve: no vacio, no futuro, no antes de "minimo" (la
// compra, para una venta) y no despues de "maximo" (la venta, para una compra).
// Devuelve el problema en texto, o '' si esta bien.
export function problemaDeDia(dia, { hoy, minimo = '', maximo = '' }) {
  if (!dia) return 'Elegí la fecha'
  if (dia > hoy) return 'La fecha no puede ser futura'
  if (minimo && dia < minimo) return 'No puede ser antes de la fecha de compra'
  if (maximo && dia > maximo) return 'No puede ser después de la fecha de venta'
  return ''
}
