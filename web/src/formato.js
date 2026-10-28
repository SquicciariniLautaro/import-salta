// formato.js
// Como se muestran los numeros y como se arman los enlaces de WhatsApp.

import { NEGOCIO } from './negocio.js'
import { aDolares, aPesos } from './servicios/precios.js'
import { precioEnEfectivo } from './servicios/efectivo.js'

// Se vuelven a exportar para que las pantallas las tomen de un solo lugar.
export { aDolares, aPesos }
export { normalizar } from './servicios/texto.js'

const miles = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

// 405000 -> "$ 405.000"
export function pesos(numero) {
  return `$ ${miles.format(Math.round(numero))}`
}

// 405000 -> "405.000" (sin el signo, para los campos donde se escribe).
export function conMiles(numero) {
  return miles.format(Math.round(numero))
}

// Precio por unidad, en pesos, de un accesorio segun la cantidad: vale el
// tramo con el mayor "desde" que no supere la cantidad; si ninguno aplica,
// el precio de lista. Los tramos ya llegan de la API con su precio en pesos.
export function precioSegunCantidad(lote, cantidad, cotizacion) {
  let elegido = null
  for (const tramo of lote.escalas || []) {
    if (tramo.desde <= cantidad && (!elegido || tramo.desde > elegido.desde)) elegido = tramo
  }
  return elegido ? elegido.precio_ars : aPesos(lote.precio_usd, cotizacion)
}

// Arma el enlace que abre WhatsApp con el mensaje ya escrito.
// Recibe los renglones del mensaje; los vacios se descartan.
export function enlaceWhatsApp(renglones) {
  const mensaje = renglones.filter(Boolean).join('\n')
  return `https://wa.me/${NEGOCIO.whatsapp}?text=${encodeURIComponent(mensaje)}`
}

// Mensaje que identifica el equipo exacto. descuento: el % pagando en
// efectivo (0 = sin descuento, va un solo precio).
export function enlaceCelular(lote, cotizacion, descuento = 0) {
  const precio = aPesos(lote.precio_usd, cotizacion)
  const efectivo = precioEnEfectivo(precio, descuento)
  return enlaceWhatsApp([
    'Hola! Quiero consultar por este equipo:',
    `*${lote.modelo}${lote.capacidad ? ` ${lote.capacidad}` : ''}*`,
    lote.color && `Color: ${lote.color}`,
    lote.bateria && `Batería: ${lote.bateria}`,
    lote.detalles && `Detalles: ${lote.detalles}`,
    efectivo === null ? `Precio: ${pesos(precio)}` : `Precio con tarjeta: ${pesos(precio)}`,
    efectivo !== null && `En efectivo: ${pesos(efectivo)}`,
  ])
}

// Mensaje de un accesorio con cantidad, precio por unidad y total. El
// descuento en efectivo se aplica sobre el precio que corresponda a la
// cantidad (el de lista o el de su tramo).
export function enlaceAccesorio(lote, cantidad, cotizacion, descuento = 0) {
  const porUnidad = precioSegunCantidad(lote, cantidad, cotizacion)
  const efectivo = precioEnEfectivo(porUnidad, descuento)
  return enlaceWhatsApp([
    'Hola! Quiero consultar por este accesorio:',
    `*${[lote.tipo, lote.modelo].filter(Boolean).join(' ')}*`,
    lote.color && `Color: ${lote.color}`,
    lote.detalles && `Detalles: ${lote.detalles}`,
    `Cantidad: ${cantidad}`,
    `Precio por unidad${efectivo === null ? '' : ' con tarjeta'}: ${pesos(porUnidad)}`,
    efectivo !== null && `En efectivo: ${pesos(efectivo)} c/u`,
    cantidad > 1 && `Total: ${pesos(porUnidad * cantidad)}${efectivo === null ? '' : ` (en efectivo ${pesos(efectivo * cantidad)})`}`,
  ])
}

// --- Solo para el panel ------------------------------------------------------

const conDecimales = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

// 405.5 -> "US$ 405,5"
export function dolares(numero) {
  return `US$ ${conDecimales.format(numero)}`
}

// "13/10/26 11:45", en la hora local de quien mira.
export function fechaCorta(fecha) {
  return new Date(fecha).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // Reloj de 24 horas: "18:30" en vez de "6:30 p. m.".
    hour12: false,
  })
}

// "13/10/26": solo el dia, para vencimientos de garantia.
export function soloFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// "19/10/2026": la fecha de los tickets, con el año completo.
export function diaDeTicket(fecha) {
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// "19/10/2026 20:05": fecha y hora de los tickets.
export function fechaDeTicket(fecha) {
  const hora = new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${diaDeTicket(fecha)} ${hora}`
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// "2026-10" -> "Octubre 2026"
export function nombreDeMes(mes) {
  const [anio, numero] = mes.split('-')
  return `${MESES[Number(numero) - 1]} ${anio}`
}

// Un IMEI son 15 digitos. Devuelve los digitos si el texto es un IMEI, o null.
// Sirve tambien de filtro para la camara: una caja tiene varios codigos de
// barras (serie, modelo, EAN) y solo interesa el que tiene 15 digitos.
export function extraerImei(texto) {
  const digitos = String(texto ?? '').replace(/\D/g, '')
  return digitos.length === 15 ? digitos : null
}

// Todos los IMEI de un texto largo (una lista pegada del proveedor, una
// planilla, un mensaje): cada tira de 15 digitos seguidos, sin repetir.
// "356... 357..." o uno por renglon dan lo mismo.
export function extraerImeis(texto) {
  const tiras = String(texto ?? '').split(/\D+/)
  return [...new Set(tiras.filter((tira) => tira.length === 15))]
}
