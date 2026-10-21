// servicios/comprobante.js
// Arma lo que se imprime en un ticket de venta a partir de lo que devuelve
// comprobante_datos(). Funciones puras.

import { diaDeTicket, pesos } from '../formato.js'
import { describir } from './texto.js'
import { textoDeGarantia, venceGarantia } from './garantias.js'
import { textoDeRecargo, totalConRecargo } from './cuotas.js'

export const MEDIOS = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'mixto', nombre: 'Efectivo y transferencia' },
  // Tarjeta de credito o debito en el posnet del local (Payway).
  { id: 'tarjeta', nombre: 'Tarjeta (posnet)' },
]

export function nombreDeMedio(medio) {
  return MEDIOS.find((opcion) => opcion.id === medio)?.nombre || ''
}

// Reparte un total entre efectivo y transferencia segun como se pago.
// Tiene que dar lo mismo que parte_efectivo() en la base. Lo cobrado con
// tarjeta va del lado de la transferencia: es plata que entra al banco.
export function repartirCobro({ medio, efectivo_ars }, total) {
  let efectivo
  if (total < 0 || !medio || medio === 'efectivo') efectivo = total
  else if (medio === 'transferencia' || medio === 'tarjeta') efectivo = 0
  else efectivo = Math.min(Math.max(efectivo_ars ?? 0, 0), total)
  return { efectivo_ars: efectivo, transferencia_ars: total - efectivo }
}

// --- Formularios de cobro ----------------------------------------------------
// En los formularios el cobro se maneja como { medio, efectivo, cuotas,
// recargo }: "efectivo" es lo que se escribio en el campo, y solo cuenta si
// el medio es "mixto"; "cuotas" y "recargo" (%), solo con tarjeta.

export const COBRO_VACIO = { medio: 'efectivo', efectivo: null, cuotas: 1, recargo: 0 }

// Lo que espera la base: { medio, efectivo_ars, cuotas, recargo_pct }.
export function cobroParaLaBase(cobro) {
  const conTarjeta = cobro.medio === 'tarjeta'
  return {
    medio: cobro.medio,
    efectivo_ars: cobro.medio === 'mixto' ? cobro.efectivo : null,
    cuotas: conTarjeta ? cobro.cuotas || 1 : null,
    recargo_pct: conTarjeta ? cobro.recargo || 0 : null,
  }
}

// Lo que se pasa por el posnet al cobrar "monto" con tarjeta: el monto mas el
// recargo de las cuotas, y cuanto queda cada cuota. null si no es con tarjeta.
export function pagoConTarjeta(cobro, monto) {
  if (cobro.medio !== 'tarjeta') return null
  const cuotas = cobro.cuotas || 1
  const total = totalConRecargo(monto, cobro.recargo ?? cobro.recargo_pct ?? 0)
  return { cuotas, recargo: Number(cobro.recargo ?? cobro.recargo_pct ?? 0), total_ars: total, cuota_ars: Math.round(total / cuotas) }
}

// true si falta decir cuanto fue en efectivo, o si es mas que el total.
export function cobroIncompleto(cobro, total) {
  return cobro.medio === 'mixto' && (cobro.efectivo === null || cobro.efectivo > total)
}

const ORIGENES = { revendedor: 'Cuenta de revendedor', sena: 'Seña' }

// datos: { id, fecha, origen, cliente, telefono, medio, efectivo_ars, nota,
//          debe_ars, celulares: [...], accesorios: [...] }
// Devuelve:
//   renglones: uno por equipo con IMEI; las unidades iguales sin IMEI van
//     juntas ("3 x FUNDA"). Cada uno con su precio por unidad y su importe.
//   permuta_ars: lo que se desconto por un equipo recibido en parte de pago.
//   total_ars: lo que se cobra en plata (sin lo que se tomo en permuta).
//   debe_ars: la parte del total que quedo en la cuenta del cliente.
//   pagos: [{ nombre, monto_ars }] como se pago lo que no quedo debiendo
//     (monto null = no se sabe).
export function armarComprobante(datos) {
  const porLlave = new Map()
  let subtotal = 0
  let total = 0

  for (const [tabla, unidades] of [
    ['celulares', datos.celulares || []],
    ['accesorios', datos.accesorios || []],
  ]) {
    for (const unidad of unidades) {
      const precio = Math.round(unidad.precio_usd * unidad.cotizacion_venta)
      // Misma cuenta que hace la caja: la permuta se resta antes de redondear.
      const cobrado = Math.round((unidad.precio_usd - (unidad.permuta_usd ?? 0)) * unidad.cotizacion_venta)
      subtotal += precio
      total += cobrado

      const llave = unidad.imei
        ? `${tabla}|${unidad.id}`
        : `${tabla}|${unidad.clave}|${unidad.precio_usd}|${unidad.garantia_dias ?? 0}`
      let renglon = porLlave.get(llave)
      if (!renglon) {
        renglon = {
          llave,
          tabla,
          cantidad: 0,
          descripcion: describir(unidad, tabla),
          detalle: [unidad.bateria, unidad.detalles].filter(Boolean).join(' · '),
          imei: unidad.imei || '',
          precio_ars: precio,
          importe_ars: 0,
          garantia_dias: unidad.garantia_dias ?? 0,
          vence: venceGarantia(unidad.fecha_venta, unidad.garantia_dias),
        }
        porLlave.set(llave, renglon)
      }
      renglon.cantidad += 1
      renglon.importe_ars += precio
    }
  }

  // Igual que la caja: nunca mas que el total.
  const debe = Math.min(Math.max(datos.debe_ars ?? 0, 0), Math.max(total, 0))

  let pagos
  if (ORIGENES[datos.origen]) {
    pagos = [{ nombre: ORIGENES[datos.origen], monto_ars: null }]
  } else {
    const partes = repartirCobro(datos, total - debe)
    const enCuotas = datos.medio === 'tarjeta' && datos.cuotas > 1
    pagos = [
      { nombre: 'Efectivo', monto_ars: partes.efectivo_ars },
      {
        nombre: datos.medio === 'tarjeta' ? (enCuotas ? `Tarjeta, ${datos.cuotas} cuotas` : 'Tarjeta, 1 pago') : 'Transferencia',
        monto_ars: partes.transferencia_ars,
      },
    ].filter((pago) => pago.monto_ars !== 0)
    // Una venta de solo regalos (o toda a cuenta) no tiene nada que cobrar.
    if (pagos.length === 0 && debe === 0) pagos = [{ nombre: nombreDeMedio(datos.medio || 'efectivo'), monto_ars: null }]
  }

  return {
    numero: datos.id,
    fecha: datos.fecha,
    origen: datos.origen,
    cliente: datos.cliente || '',
    telefono: datos.telefono || '',
    // Quien atendio (vacio en las ventas de antes de anotarlo).
    vendedor: datos.vendedor || '',
    nota: datos.nota || '',
    renglones: [...porLlave.values()],
    subtotal_ars: subtotal,
    permuta_ars: subtotal - total,
    total_ars: total,
    debe_ars: debe,
    pagos,
    // Con tarjeta: lo que se paso por el posnet (con el recargo) y cada cuota.
    tarjeta: ORIGENES[datos.origen] ? null : pagoConTarjeta(datos, total - debe),
  }
}

// --- Queda debiendo ----------------------------------------------------------
// En los formularios de venta la deuda se maneja como { activa, monto }. Lo
// que queda debiendo pasa a la cuenta del cliente y se cobra despues; la caja
// ve solo lo que se pago en el momento.

// Lo que dice el ticket de un pago con tarjeta (ver pagoConTarjeta):
// "Posnet: 6 cuotas de $ 112.500 (total $ 675.000, recargo 12,5 %)".
export function textoDeTarjeta(tarjeta) {
  const recargo = tarjeta.recargo > 0 ? `recargo ${textoDeRecargo(tarjeta.recargo)}` : ''
  if (tarjeta.cuotas <= 1) return `Posnet: 1 pago de ${pesos(tarjeta.total_ars)}${recargo ? ` (${recargo})` : ''}`
  return recargo
    ? `Posnet: ${tarjeta.cuotas} cuotas de ${pesos(tarjeta.cuota_ars)} (total ${pesos(tarjeta.total_ars)}, ${recargo})`
    : `Posnet: ${tarjeta.cuotas} cuotas sin interés de ${pesos(tarjeta.cuota_ars)}`
}

export const DEUDA_VACIA = { activa: false, monto: null }

// Cuanto queda debiendo, en pesos (0 si no hay deuda).
export const montoDeDeuda = (deuda) => (deuda.activa ? (deuda.monto ?? 0) : 0)

// Que falta para poder dejar la deuda, o '' si esta todo bien.
export function problemaDeDeuda(deuda, total, cliente) {
  if (!deuda.activa) return ''
  if (!(deuda.monto > 0)) return 'Escribí cuánto queda debiendo'
  if (deuda.monto > total) return 'No puede deber más que el total'
  if (!String(cliente ?? '').trim()) return 'Para dejar una deuda escribí el nombre del cliente'
  return ''
}

// Que dice el ticket de la garantia de un renglon. Un celular siempre la
// muestra, aunque sea para decir que no tiene.
export function textoGarantiaDe(renglon) {
  if (renglon.vence) return `Garantía: ${textoDeGarantia(renglon.garantia_dias)}, hasta el ${diaDeTicket(renglon.vence)}`
  return renglon.tabla === 'celulares' ? 'Sin garantía' : ''
}

// Como figura en la orden de servicio tecnico cada estado.
export const ESTADOS_DE_SERVICIO = {
  recibido: 'Recibido',
  reparando: 'En reparación',
  listo: 'Listo para retirar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

// El tamano de la hoja de un ticket, en milimetros, para la ventana de
// impresion. Sin alto (0 en Ajustes) es un rollo continuo.
export const paginaDeTicket = (configuracion) => ({
  ancho: configuracion.ticket_ancho_mm,
  alto: configuracion.ticket_alto_mm || undefined,
})

// "000012": el numero de ticket con ceros adelante.
export function numeroDeTicket(numero) {
  return String(numero ?? '').padStart(6, '0')
}

// El codigo de barras de cada ticket, para buscarlo despues con la pistola:
// "V000012" es la venta 12 y "S000007", la orden de servicio 7.
export const codigoDeVenta = (numero) => `V${numeroDeTicket(numero)}`
export const codigoDeServicio = (numero) => `S${numeroDeTicket(numero)}`

// Lo contrario: { tipo: 'venta' | 'servicio', numero }, o null si el codigo
// no es de un ticket (un IMEI, por ejemplo).
export function leerCodigoDeTicket(codigo) {
  const partes = /^([VS])(\d{1,12})$/i.exec(String(codigo ?? '').trim())
  if (!partes) return null
  return { tipo: partes[1].toUpperCase() === 'V' ? 'venta' : 'servicio', numero: Number(partes[2]) }
}
