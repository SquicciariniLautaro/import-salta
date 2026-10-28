// servicios/efectivo.js
// El descuento por pagar en efectivo. Funciones puras.
//
// El precio que se carga en el stock es el precio con tarjeta (en un pago).
// Pagando en efectivo se le descuenta un porcentaje que el dueno elige en
// Ajustes: uno para los celulares y otro para los accesorios (los combos usan
// el de los accesorios). 0 = sin descuento.

// Lo mismo que acepta la base (ver leer_descuento()).
export const DESCUENTO_MAXIMO = 90

// Los porcentajes como los trae el panel (configuracion) o el catalogo
// ("efectivo"), siempre como { celulares, accesorios }.
export function descuentosDe(configuracion) {
  return {
    celulares: Number(configuracion?.descuento_efectivo_celulares) || 0,
    accesorios: Number(configuracion?.descuento_efectivo_accesorios) || 0,
  }
}

// El porcentaje de una tabla ('celulares' o 'accesorios'). 0 si no hay.
export function descuentoPara(tabla, descuentos) {
  const valor = Number(tabla === 'celulares' ? descuentos?.celulares : descuentos?.accesorios)
  return valor > 0 && valor <= DESCUENTO_MAXIMO ? valor : 0
}

// El precio pagando en efectivo, en pesos enteros. null si no hay descuento.
export function precioEnEfectivo(precioArs, descuento) {
  if (!(descuento > 0) || !(precioArs > 0)) return null
  return Math.round(precioArs * (1 - descuento / 100))
}

// Revisa un porcentaje que se esta escribiendo en Ajustes. Devuelve el
// problema, o '' si esta bien.
export function problemaDeDescuento(texto) {
  const numero = Number(texto)
  if (texto === '' || !Number.isInteger(numero) || numero < 0 || numero > DESCUENTO_MAXIMO) {
    return `El descuento en efectivo va de 0 % a ${DESCUENTO_MAXIMO} %, sin decimales.`
  }
  return ''
}
