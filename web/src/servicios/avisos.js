// servicios/avisos.js
// Avisos de stock: que se quedo sin unidades, de que queda poco y de los
// celulares que todavia no tienen el IMEI cargado. Funcion pura.

import { describir } from './texto.js'

// stock: { celulares, accesorios } armado con armarStock().
// agotados: lotes que ya no tienen ninguna unidad (panel_datos los manda si
//   la ultima se vendio hace menos de 30 dias).
// configuracion: usa aviso_celulares y aviso_accesorios ("avisar cuando en el
//   local queden N o menos"; 0 = no avisar por poco stock).
// Devuelve, para cada tabla:
//   sinStock: lotes con 0 en el local. "afuera" dice cuantas unidades tienen
//     revendedores o clientes con sena.
//   poco: lotes que siguen en el local pero llegaron al limite.
//   sinImei: (solo celulares) lotes con equipos sin IMEI, esten en el local o
//     afuera. "faltan" dice cuantos; "equipos" es el total de la tabla.
export function armarAvisos({ stock, agotados = [], configuracion }) {
  const avisos = {}

  for (const tabla of ['celulares', 'accesorios']) {
    const limite = tabla === 'celulares' ? configuracion.aviso_celulares : configuracion.aviso_accesorios
    const sinStock = []
    const poco = []
    const sinImei = []

    for (const lote of stock[tabla]) {
      const aviso = {
        clave: lote.clave,
        descripcion: describir(lote, tabla),
        detalle: [lote.bateria, lote.detalles].filter(Boolean).join(' · '),
        cantidad: lote.cantidad,
        afuera: lote.conRevendedores.length + lote.senadas.length,
        ultima_venta: null,
      }
      if (lote.cantidad === 0) sinStock.push(aviso)
      else if (limite > 0 && lote.cantidad <= limite) poco.push(aviso)

      if (tabla === 'celulares') {
        const unidades = [...(lote.disponibles ?? []), ...(lote.conRevendedores ?? []), ...(lote.senadas ?? [])]
        const faltan = unidades.filter((unidad) => !unidad.imei).length
        if (faltan > 0) sinImei.push({ ...aviso, faltan })
      }
    }

    for (const lote of agotados) {
      if (lote.tabla !== tabla) continue
      sinStock.push({
        clave: lote.clave,
        descripcion: describir(lote, tabla),
        detalle: [lote.bateria, lote.detalles].filter(Boolean).join(' · '),
        cantidad: 0,
        afuera: 0,
        ultima_venta: lote.ultima_venta,
      })
    }

    // Lo que menos tiene, arriba.
    poco.sort((a, b) => a.cantidad - b.cantidad)
    sinImei.sort((a, b) => b.faltan - a.faltan)
    avisos[tabla] = {
      sinStock,
      poco,
      sinImei: { lotes: sinImei, equipos: sinImei.reduce((suma, aviso) => suma + aviso.faltan, 0) },
      total: sinStock.length + poco.length + sinImei.length,
    }
  }

  return avisos
}
