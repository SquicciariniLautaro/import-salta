// servicios/escpos.js
// Los tickets y las etiquetas en el idioma propio de las ticketeras
// (ESC/POS), para mandarlos directo por USB sin pasar por el driver de la
// computadora. Funciones puras: arman los renglones y los bytes; quien los
// manda a la impresora es panel/ticketera.js (que tambien prepara el logo).
//
// La ticketera escribe con su propia letra, de ancho fijo: en un rollo de
// 58 mm entran 32 letras por renglon y en uno de 80 mm, 48. Los dibujos (el
// logo y los codigos de barras) van punto por punto: 384 puntos por renglon
// en 58 mm y 576 en 80 mm.

import { fechaDeTicket, diaDeTicket, pesos } from '../formato.js'
import {
  ESTADOS_DE_SERVICIO, codigoDeServicio, codigoDeVenta, numeroDeTicket, repartirCobro, textoDeTarjeta, textoGarantiaDe,
} from './comprobante.js'
import { codificar128 } from './codigo128.js'
import { textoDeGarantia, venceGarantia } from './garantias.js'

export const columnasDe = (anchoMm) => (anchoMm >= 70 ? 48 : 32)
export const puntosDe = (anchoMm) => (anchoMm >= 70 ? 576 : 384)

// Alto de los codigos de barras, en puntos (8 por milimetro).
const ALTO_CODIGO_TICKET = 56
const ALTO_CODIGO_ETIQUETA = 72

// --- Renglones de texto ------------------------------------------------------
// Cada renglon: { texto, centrado, negrita, tamano }, o { imagen } con un
// mapa de bits (ver mas abajo). tamano: 'normal', 'alto' (doble alto, mismo
// ancho) o 'grande' (doble alto y doble ancho).

// Corta un texto en renglones de hasta "columnas" letras sin partir las
// palabras, salvo una mas larga que el renglon (un IMEI en papel angosto).
export function partir(texto, columnas) {
  const renglones = []
  let actual = ''
  for (let palabra of String(texto ?? '').split(/\s+/).filter(Boolean)) {
    if (actual && actual.length + 1 + palabra.length <= columnas) {
      actual += ` ${palabra}`
      continue
    }
    if (actual) renglones.push(actual)
    while (palabra.length > columnas) {
      renglones.push(palabra.slice(0, columnas))
      palabra = palabra.slice(columnas)
    }
    actual = palabra
  }
  if (actual) renglones.push(actual)
  return renglones
}

// Algo a la izquierda y un monto pegado al margen derecho, en el ultimo
// renglon. Si no entra, el monto baja a un renglon propio.
export function fila(izquierda, derecha, columnas) {
  const renglones = partir(izquierda, columnas)
  const monto = String(derecha ?? '')
  if (!monto) return renglones
  const ultimo = renglones.at(-1)
  if (ultimo !== undefined && ultimo.length + 1 + monto.length <= columnas) {
    renglones[renglones.length - 1] = ultimo + monto.padStart(columnas - ultimo.length)
  } else {
    renglones.push(monto.padStart(columnas))
  }
  return renglones
}

const como = (textos, estilo = {}) => textos.map((texto) => ({ texto, ...estilo }))

// Texto con sangria, para lo que va debajo de un renglon del ticket.
const sangria = (texto, columnas, estilo) => como(partir(texto, columnas - 2).map((renglon) => `  ${renglon}`), estilo)

const raya = (columnas) => ({ texto: '-'.repeat(columnas) })
const blanco = { texto: '' }

// logo: el mapa de bits del logo, o null para poner el nombre en letras.
function encabezado(configuracion, columnas, logo) {
  const nombre = String(configuracion.negocio_nombre ?? '').trim()
  // Grande ocupa el doble de ancho: solo si el nombre entra.
  const grande = nombre.length <= columnas / 2
  return [
    ...(logo
      ? [{ imagen: logo }]
      : como(partir(nombre, grande ? columnas / 2 : columnas), { centrado: true, negrita: true, tamano: grande ? 'grande' : 'alto' })),
    ...como(partir(configuracion.negocio_direccion, columnas), { centrado: true }),
    ...(configuracion.negocio_telefono ? como(partir(`Tel. ${configuracion.negocio_telefono}`, columnas), { centrado: true }) : []),
    ...(configuracion.negocio_cuit ? como(partir(`CUIT ${configuracion.negocio_cuit}`, columnas), { centrado: true }) : []),
  ]
}

// Lo que va abajo de todo: el pie, la letra chica y el codigo de barras para
// buscar el ticket con la pistola. El duplicado suma la firma del cliente.
function pie(configuracion, columnas, codigo, duplicado) {
  const mapa = mapaDeCodigo(codigo, puntosDe(configuracion.ticket_ancho_mm), ALTO_CODIGO_TICKET)
  return [
    ...como(partir(configuracion.ticket_pie, columnas), { centrado: true }),
    ...como(partir(configuracion.ticket_condiciones, columnas), { centrado: true }),
    // Este ticket es un comprobante interno: no reemplaza a la factura.
    ...como(partir('Documento no válido como factura', columnas), { centrado: true }),
    ...(mapa ? [blanco, { imagen: mapa }, { texto: codigo, centrado: true }] : []),
    ...(duplicado
      ? [blanco, blanco, blanco, { texto: `Firma: ${'_'.repeat(columnas - 7)}` }, blanco, blanco, { texto: `Aclaración: ${'_'.repeat(columnas - 12)}` }]
      : []),
  ]
}

const fuerte = (izquierda, derecha, columnas) => como(fila(izquierda, derecha, columnas), { negrita: true, tamano: 'alto' })

// Numero, fecha, quien atendio y el cliente.
function datosDelTicket({ titulo, numero, fecha, vendedor, cliente, telefono }, columnas) {
  return [
    ...como(partir(`${titulo} N° ${numeroDeTicket(numero)}`, columnas), { negrita: true }),
    ...(fecha ? como(partir(`Fecha: ${fechaDeTicket(fecha)}`, columnas)) : []),
    ...(vendedor ? como(partir(`Atendido por: ${vendedor}`, columnas)) : []),
    ...(cliente ? como(partir(`Cliente: ${cliente}`, columnas)) : []),
    ...(telefono ? como(partir(`Tel.: ${telefono}`, columnas)) : []),
  ]
}

const marcaDeDuplicado = (columnas) => ({ texto: 'DUPLICADO PARA EL LOCAL'.slice(0, columnas), centrado: true, negrita: true })

// El ticket de una venta. comprobante: lo que arma armarComprobante().
// Dice lo mismo que TicketVenta (panel/Impresion.jsx).
// opciones: { logo, duplicado }. El duplicado sale sin logo, para gastar
// menos papel, y con lugar para la firma.
export function renglonesDeVenta(comprobante, configuracion, { logo = null, duplicado = false } = {}) {
  const columnas = columnasDe(configuracion.ticket_ancho_mm)
  const renglones = [
    ...encabezado(configuracion, columnas, duplicado ? null : logo),
    ...(duplicado ? [blanco, marcaDeDuplicado(columnas)] : []),
    raya(columnas),
    ...datosDelTicket({ titulo: 'Comprobante', ...comprobante }, columnas),
    raya(columnas),
  ]

  for (const renglon of comprobante.renglones) {
    renglones.push(
      ...como(fila(`${renglon.cantidad} x ${renglon.descripcion}`, renglon.importe_ars === 0 ? 'Sin cargo' : pesos(renglon.importe_ars), columnas)),
    )
    if (renglon.cantidad > 1 && renglon.precio_ars > 0) renglones.push(...sangria(`${pesos(renglon.precio_ars)} c/u`, columnas))
    if (renglon.detalle) renglones.push(...sangria(renglon.detalle, columnas))
    if (renglon.imei) renglones.push(...sangria(`IMEI ${renglon.imei}`, columnas))
    if (textoGarantiaDe(renglon)) renglones.push(...sangria(textoGarantiaDe(renglon), columnas, { negrita: true }))
  }

  renglones.push(raya(columnas))
  if (comprobante.permuta_ars > 0) {
    renglones.push(...como(fila('Subtotal', pesos(comprobante.subtotal_ars), columnas)))
    renglones.push(...como(fila('Equipo recibido en parte de pago', `- ${pesos(comprobante.permuta_ars)}`, columnas)))
  }
  // Un renglon en blanco antes y despues del total, para que se lea solo.
  renglones.push(blanco, ...fuerte('TOTAL', pesos(comprobante.total_ars), columnas), blanco)
  for (const pago of comprobante.pagos) {
    renglones.push(...como(fila(pago.nombre, pago.monto_ars === null ? '' : pesos(pago.monto_ars), columnas)))
  }
  if (comprobante.tarjeta) renglones.push(...como(partir(textoDeTarjeta(comprobante.tarjeta), columnas)))
  if (comprobante.debe_ars > 0) renglones.push(...fuerte('Queda debiendo', pesos(comprobante.debe_ars), columnas))
  if (comprobante.nota) renglones.push(...como(partir(comprobante.nota, columnas)))

  renglones.push(raya(columnas), ...pie(configuracion, columnas, codigoDeVenta(comprobante.numero), duplicado))
  return renglones
}

// La orden de servicio tecnico. Dice lo mismo que TicketServicio.
export function renglonesDeServicio(orden, configuracion, { logo = null, duplicado = false } = {}) {
  const columnas = columnasDe(configuracion.ticket_ancho_mm)
  const entregada = orden.estado === 'entregado'
  const renglones = [
    ...encabezado(configuracion, columnas, duplicado ? null : logo),
    ...(duplicado ? [blanco, marcaDeDuplicado(columnas)] : []),
    raya(columnas),
    { texto: 'SERVICIO TÉCNICO', centrado: true, negrita: true },
    ...datosDelTicket({ titulo: 'Orden', numero: orden.id, fecha: orden.fecha_ingreso, vendedor: orden.vendedor, cliente: orden.cliente, telefono: orden.telefono }, columnas),
    raya(columnas),
    ...como(partir(orden.equipo, columnas), { negrita: true }),
    ...(orden.imei ? como(partir(`IMEI ${orden.imei}`, columnas)) : []),
    ...(orden.falla ? como(partir(`Falla: ${orden.falla}`, columnas)) : []),
    ...(orden.trabajo ? como(partir(`Trabajo: ${orden.trabajo}`, columnas)) : []),
    ...(orden.en_garantia ? como(partir('Ingresa por garantía', columnas)) : []),
    raya(columnas),
  ]

  if (entregada) {
    const partes = repartirCobro(orden, orden.cobrado_ars)
    const vence = venceGarantia(orden.fecha_entrega, orden.garantia_dias)
    renglones.push(blanco, ...fuerte('TOTAL', orden.cobrado_ars > 0 ? pesos(orden.cobrado_ars) : 'Sin cargo', columnas), blanco)
    if (partes.efectivo_ars > 0) renglones.push(...como(fila('Efectivo', pesos(partes.efectivo_ars), columnas)))
    if (partes.transferencia_ars > 0) {
      renglones.push(...como(fila(orden.medio === 'tarjeta' ? 'Tarjeta' : 'Transferencia', pesos(partes.transferencia_ars), columnas)))
    }
    renglones.push(...como(partir(`Entregado el ${fechaDeTicket(orden.fecha_entrega)}`, columnas)))
    if (vence) {
      renglones.push(...como(partir(`Garantía del arreglo: ${textoDeGarantia(orden.garantia_dias)} (hasta el ${diaDeTicket(vence)})`, columnas)))
    }
  } else {
    renglones.push(...como(fila('Estado', ESTADOS_DE_SERVICIO[orden.estado], columnas)))
    if (orden.presupuesto_ars > 0) renglones.push(...fuerte('Presupuesto', pesos(orden.presupuesto_ars), columnas))
    renglones.push(...como(partir('Presentá este comprobante para retirar el equipo.', columnas)))
  }

  renglones.push(raya(columnas), ...pie(configuracion, columnas, codigoDeServicio(orden.id), duplicado))
  return renglones
}

// Etiquetas con codigo de barras: [{ titulo, detalle, codigo }], las mismas
// de HojaEtiquetas. Salen una abajo de la otra en el rollo, separadas por
// una linea para cortar. No llevan precio (cambia con el dolar).
export function renglonesDeEtiquetas(etiquetas, configuracion, logo = null) {
  const columnas = columnasDe(configuracion.ticket_ancho_mm)
  const puntos = puntosDe(configuracion.ticket_ancho_mm)
  return etiquetas.flatMap((etiqueta, indice) => {
    const mapa = etiqueta.codigo ? mapaDeCodigo(etiqueta.codigo, puntos, ALTO_CODIGO_ETIQUETA) : null
    return [
      ...(indice > 0 ? [blanco, { texto: '- '.repeat(columnas / 2).trim(), centrado: true }, blanco] : []),
      ...(logo ? [{ imagen: logo }] : []),
      ...como(partir(etiqueta.titulo, columnas), { centrado: true, negrita: true, tamano: 'alto' }),
      ...como(partir(etiqueta.detalle, columnas), { centrado: true }),
      ...(mapa ? [{ imagen: mapa }, { texto: etiqueta.codigo, centrado: true }] : []),
    ]
  })
}

// --- Dibujos -----------------------------------------------------------------
// Un mapa de bits: { ancho, alto, bytes }. Ocupa siempre todo el ancho del
// papel, con el dibujo centrado: asi no depende de como centre cada ticketera.
// Cada fila son ancho / 8 bytes; cada bit es un punto (1 = negro) y el de la
// izquierda es el bit mas alto.

function mapaVacio(anchoPapel, alto) {
  return { ancho: anchoPapel, alto, bytes: new Uint8Array((anchoPapel / 8) * alto) }
}

function pintar(mapa, x, y) {
  mapa.bytes[y * (mapa.ancho / 8) + (x >> 3)] |= 0x80 >> (x & 7)
}

// rgba: los pixeles de una imagen (los de un canvas), de ancho x alto. Lo
// oscuro queda negro y lo claro (o transparente), blanco.
export function mapaDeImagen(rgba, ancho, alto, anchoPapel) {
  const mapa = mapaVacio(anchoPapel, alto)
  const margen = Math.max(0, Math.floor((anchoPapel - ancho) / 2))
  const visible = Math.min(ancho, anchoPapel - margen)
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < visible; x += 1) {
      const i = (y * ancho + x) * 4
      const luz = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000
      if (rgba[i + 3] > 127 && luz < 128) pintar(mapa, margen + x, y)
    }
  }
  return mapa
}

// Un Code 128 centrado, con cada modulo de 2 o 3 puntos (lo que entre): mas
// angosto la pistola lo lee mal. null si el texto no se puede codificar.
export function mapaDeCodigo(valor, anchoPapel, alto) {
  const modulos = codificar128(valor)
  if (!modulos) return null
  // El lector necesita un margen blanco de 10 modulos a cada lado.
  const punto = Math.max(1, Math.min(3, Math.floor(anchoPapel / (modulos.length + 20))))
  const mapa = mapaVacio(anchoPapel, alto)
  const inicio = Math.floor((anchoPapel - modulos.length * punto) / 2)
  for (let i = 0; i < modulos.length; i += 1) {
    if (modulos[i] !== '1') continue
    for (let x = inicio + i * punto; x < inicio + (i + 1) * punto; x += 1) {
      for (let y = 0; y < alto; y += 1) pintar(mapa, x, y)
    }
  }
  return mapa
}

// --- Bytes -------------------------------------------------------------------

// Las letras con tilde van en la tabla 850 (la de Europa occidental), que
// traen casi todas las ticketeras. Lo que no esta en la tabla sale sin
// tilde ("ç" -> "c"), o como "?" si no hay con que reemplazarlo.
const TABLA_850 = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, ü: 0x81,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, Ñ: 0xa5, Ü: 0x9a,
  '°': 0xf8, º: 0xa7, ª: 0xa6, '¿': 0xa8, '¡': 0xad, '·': 0xfa,
}

export function codificar(texto) {
  const bytes = []
  for (const letra of String(texto ?? '')) {
    const codigo = letra.charCodeAt(0)
    if (codigo >= 0x20 && codigo < 0x7f) bytes.push(codigo)
    else if (TABLA_850[letra]) bytes.push(TABLA_850[letra])
    else if (/\s/.test(letra)) bytes.push(0x20)
    else {
      const simple = letra.normalize('NFD').replace(/[̀-ͯ]/g, '')
      bytes.push(...(/^[\x20-\x7e]+$/.test(simple) ? [...simple].map((parte) => parte.charCodeAt(0)) : [0x3f]))
    }
  }
  return bytes
}

const ESC = 0x1b
const GS = 0x1d
const FS = 0x1c
const TAMANOS = { normal: 0x00, alto: 0x01, grande: 0x11 }

// Un dibujo, en tiras de hasta 128 filas: algunas ticketeras no aceptan uno
// muy alto de una sola vez.
function agregarImagen(bytes, mapa) {
  const porFila = mapa.ancho / 8
  for (let desde = 0; desde < mapa.alto; desde += 128) {
    const filas = Math.min(128, mapa.alto - desde)
    bytes.push(GS, 0x76, 0x30, 0, porFila & 0xff, porFila >> 8, filas & 0xff, filas >> 8)
    for (const byte of mapa.bytes.subarray(desde * porFila, (desde + filas) * porFila)) bytes.push(byte)
  }
}

// Los renglones, listos para mandar a la ticketera.
export function aEscPos(renglones) {
  const bytes = [
    ESC, 0x40, // empieza de cero
    FS, 0x2e, // apaga el modo chino que traen de fabrica muchas ticketeras
    ESC, 0x74, 2, // tabla de letras 850
  ]
  for (const renglon of renglones) {
    if (renglon.imagen) {
      bytes.push(ESC, 0x61, 0)
      agregarImagen(bytes, renglon.imagen)
      continue
    }
    bytes.push(ESC, 0x61, renglon.centrado ? 1 : 0)
    bytes.push(ESC, 0x45, renglon.negrita ? 1 : 0)
    bytes.push(GS, 0x21, TAMANOS[renglon.tamano] ?? 0)
    bytes.push(...codificar(renglon.texto), 0x0a)
  }
  // Deja todo como estaba y avanza el papel hasta el filo donde se corta.
  bytes.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0, ESC, 0x64, 4)
  return Uint8Array.from(bytes)
}

// El original y, si esta prendido en Ajustes, el duplicado para el local.
function conDuplicado(configuracion, armar) {
  const original = aEscPos(armar(false))
  if (!configuracion.ticket_duplicado) return original
  const duplicado = aEscPos(armar(true))
  const juntos = new Uint8Array(original.length + duplicado.length)
  juntos.set(original)
  juntos.set(duplicado, original.length)
  return juntos
}

export const ticketDeVenta = (comprobante, configuracion, logo = null) =>
  conDuplicado(configuracion, (duplicado) => renglonesDeVenta(comprobante, configuracion, { logo, duplicado }))

export const ticketDeServicio = (orden, configuracion, logo = null) =>
  conDuplicado(configuracion, (duplicado) => renglonesDeServicio(orden, configuracion, { logo, duplicado }))

export const etiquetasEnEscPos = (etiquetas, configuracion, logo = null) => aEscPos(renglonesDeEtiquetas(etiquetas, configuracion, logo))
