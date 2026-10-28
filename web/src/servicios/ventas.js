// servicios/ventas.js
// Historial y resumenes de ventas. Funciones puras.
//
// Dos cotizaciones: lo cobrado se pasa a pesos con la de venta y el costo con
// la de costo, las dos del DIA DE LA VENTA (guardadas en cada unidad), asi el
// historial no cambia cuando se mueve el dolar.

import { nombreDeMedio } from './comprobante.js'
import { describir } from './texto.js'
import { comprasPorDia } from './stock.js'

// Numeros de una unidad vendida.
export function calcularUnidad(unidad) {
  const cotizacionVenta = unidad.cotizacion_venta
  const cotizacionCosto = unidad.cotizacion_costo ?? cotizacionVenta
  // Lo cobrado en plata: si hubo permuta, solo la diferencia. El equipo
  // recibido suma cuando se vende; si no, el total se contaria dos veces.
  const cobradoUsd = unidad.precio_usd - (unidad.permuta_usd ?? 0)
  // La ganancia usa el precio completo: la permuta tambien es parte del cobro.
  const gananciaArs = unidad.precio_usd * cotizacionVenta - unidad.costo_usd * cotizacionCosto
  return {
    cobrado_ars: Math.round(cobradoUsd * cotizacionVenta),
    ganancia_ars: Math.round(gananciaArs),
    // La ganancia se muestra en dolares a la cotizacion de venta.
    ganancia_usd: gananciaArs / cotizacionVenta,
  }
}

// "2026-10" a partir de una fecha, en la hora local de quien mira.
export function mesDe(fecha) {
  const dia = new Date(fecha)
  return `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}`
}

// vendidas: { celulares, accesorios, comprobantes } de ventas_datos().
// cuentasAbiertas: cuentas de revendedores y senas (de armarCuentas), para
//   sumar sus pagos a cuenta como cobros con ganancia estimada.
// Devuelve { renglones, meses }:
//   renglones: el historial, lo mas nuevo primero. Las unidades iguales de
//     una misma venta van en un solo renglon ("20 x FUNDA").
//   meses: un resumen por mes. Cuentan unidades, no renglones.
export function armarVentas(vendidas, cuentasAbiertas = []) {
  const porLlave = new Map()
  // Cada unidad apunta a su comprobante: de ahi salen el cliente y el medio de pago.
  const comprobantes = new Map((vendidas.comprobantes || []).map((comprobante) => [comprobante.id, comprobante]))

  for (const [tabla, unidades] of [
    ['celulares', vendidas.celulares],
    ['accesorios', vendidas.accesorios],
  ]) {
    for (const unidad of unidades) {
      // Misma venta (misma fecha exacta), mismo lote, mismo precio.
      const llave = `${unidad.fecha_venta}|${tabla}|${unidad.clave}|${unidad.precio_usd}|${unidad.permuta_usd ?? ''}`
      let renglon = porLlave.get(llave)
      if (!renglon) {
        const comprobante = comprobantes.get(unidad.comprobante_id)
        renglon = {
          llave,
          clase: 'venta',
          tabla,
          comprobante_id: unidad.comprobante_id ?? null,
          // Solo las ventas de mostrador y las permutas tienen medio de pago.
          medio: comprobante && !unidad.revendedor ? comprobante.medio || '' : '',
          // Con tarjeta: en cuantas cuotas (1 = un pago).
          cuotas: comprobante?.medio === 'tarjeta' ? comprobante.cuotas || 1 : null,
          fecha: unidad.fecha_venta,
          descripcion: describir(unidad, tabla),
          detalle: [unidad.bateria, unidad.detalles].filter(Boolean).join(' · '),
          comprador: unidad.revendedor || comprobante?.cliente || '',
          precio_usd: unidad.precio_usd,
          permuta_usd: unidad.permuta_usd ?? null,
          cotizacion_venta: unidad.cotizacion_venta,
          unidades: [],
          cantidad: 0,
          cobrado_ars: 0,
          ganancia_usd: 0,
        }
        porLlave.set(llave, renglon)
      }
      const numeros = calcularUnidad(unidad)
      renglon.unidades.push(unidad)
      renglon.cantidad += 1
      renglon.cobrado_ars += numeros.cobrado_ars
      renglon.ganancia_usd += numeros.ganancia_usd
    }
  }

  const renglones = [...porLlave.values()]

  // Pagos a cuenta: figuran como cobro en el mes en que se cobraron, con una
  // ganancia estimada (monto por el margen de los equipos de esa cuenta).
  // Al cerrarse la cuenta dejan de venir y los reemplazan las ventas reales.
  // Las filas negativas descuentan lo que ya paso a una venta real.
  for (const cuenta of cuentasAbiertas) {
    for (const pago of cuenta.pagos) {
      renglones.push({
        llave: `pago|${cuenta.tipo}|${pago.id}`,
        clase: 'pago',
        fecha: pago.fecha,
        descripcion:
          pago.monto_usd < 0 ? `Descuento por equipos pagados · ${cuenta.nombre}` : `Pago a cuenta · ${cuenta.nombre}`,
        detalle: cuenta.tipo === 'sena' ? 'Seña' : 'Revendedor',
        comprador: cuenta.nombre,
        unidades: [],
        cantidad: 0,
        cobrado_ars: Math.round(pago.monto_ars),
        ganancia_usd: pago.monto_usd * cuenta.margen,
      })
    }
  }

  renglones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const porMes = new Map()
  for (const renglon of renglones) {
    const mes = mesDe(renglon.fecha)
    if (!porMes.has(mes)) porMes.set(mes, { mes, unidades: 0, cobrado_ars: 0, ganancia_usd: 0 })
    const resumen = porMes.get(mes)
    resumen.unidades += renglon.cantidad
    resumen.cobrado_ars += renglon.cobrado_ars
    resumen.ganancia_usd += renglon.ganancia_usd
  }
  const meses = [...porMes.values()].sort((a, b) => b.mes.localeCompare(a.mes))

  return { renglones, meses }
}

// Suma de una lista de renglones (todo el historial o un mes).
export function totalizar(renglones) {
  const total = { unidades: 0, cobrado_ars: 0, ganancia_usd: 0 }
  for (const renglon of renglones) {
    total.unidades += renglon.cantidad
    total.cobrado_ars += renglon.cobrado_ars
    total.ganancia_usd += renglon.ganancia_usd
  }
  return total
}

// Texto CSV del historial, para abrir en Excel. Separado por punto y coma,
// que es lo que espera Excel en espanol.
export function aCsv(renglones) {
  const celda = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`
  const filas = [['Fecha de venta', 'Fecha de compra', 'Detalle', 'Cantidad', 'Precio unidad USD', 'Cobrado ARS', 'Ganancia USD', 'Comprador', 'Medio de pago']]
  const dia = (fecha) => new Date(fecha).toLocaleDateString('es-AR')
  for (const renglon of renglones) {
    // Si las unidades del renglon entraron en dias distintos: "20/10/2026 a 27/10/2026".
    const compras = comprasPorDia(renglon.unidades || [])
    let compra = ''
    if (compras.length === 1) compra = dia(compras[0].fecha)
    else if (compras.length > 1) compra = `${dia(compras[0].fecha)} a ${dia(compras[compras.length - 1].fecha)}`
    filas.push([
      new Date(renglon.fecha).toLocaleString('es-AR'),
      compra,
      [renglon.descripcion, renglon.detalle].filter(Boolean).join(' - '),
      renglon.cantidad || '',
      renglon.precio_usd ?? '',
      renglon.cobrado_ars,
      renglon.ganancia_usd.toFixed(2),
      renglon.comprador,
      nombreDeMedio(renglon.medio),
    ])
  }
  return filas.map((fila) => fila.map(celda).join(';')).join('\r\n')
}
