// servicios/garantias.js
// Garantias de lo vendido y de los arreglos. Funciones puras.

const DIA = 24 * 60 * 60 * 1000

// Fecha en que vence una garantia, o null si no tiene (0 dias).
export function venceGarantia(desde, dias) {
  if (!desde || !(dias > 0)) return null
  return new Date(new Date(desde).getTime() + dias * DIA)
}

// true si la garantia todavia no vencio.
export function garantiaVigente(desde, dias, ahora = new Date()) {
  const vence = venceGarantia(desde, dias)
  return vence !== null && vence > ahora
}

// "30 días", "1 año", "Sin garantía".
export function textoDeGarantia(dias) {
  if (!(dias > 0)) return 'Sin garantía'
  if (dias % 365 === 0) return dias === 365 ? '1 año' : `${dias / 365} años`
  if (dias % 30 === 0 && dias >= 60) return `${dias / 30} meses`
  return dias === 1 ? '1 día' : `${dias} días`
}

// filas: lo que devuelve garantias_datos(). Cada fila es una unidad vendida o
// un arreglo entregado. Las unidades iguales de una misma venta (diez fundas)
// se juntan en un solo renglon.
// Devuelve primero las vigentes (la que vence antes, arriba) y despues las
// vencidas (la que vencio hace menos, arriba).
export function armarGarantias(filas, ahora = new Date()) {
  const porLlave = new Map()

  for (const fila of filas) {
    // Un equipo con IMEI nunca se junta con otro: es unico.
    const llave = fila.imei
      ? `${fila.tabla}|${fila.id}`
      : `${fila.tabla}|${fila.comprobante_id ?? fila.id}|${fila.descripcion}|${fila.desde}|${fila.dias}`
    let renglon = porLlave.get(llave)
    if (!renglon) {
      const vence = venceGarantia(fila.desde, fila.dias)
      const restantes = Math.ceil((vence - ahora) / DIA)
      renglon = {
        llave,
        tabla: fila.tabla,
        ids: [],
        cantidad: 0,
        descripcion: fila.descripcion,
        imei: fila.imei || '',
        bateria: fila.bateria || '',
        // El numero del acta firmada de un celular (null si no tiene).
        acta_id: fila.acta_id ?? null,
        cliente: fila.cliente || '',
        telefono: fila.telefono || '',
        // A quien se le compro y cuanto costo cada unidad: para mandarla al
        // proveedor por garantia. Los arreglos no tienen.
        proveedor_id: fila.proveedor_id ?? null,
        costo_usd: fila.costo_usd ?? null,
        desde: fila.desde,
        dias: fila.dias,
        vence,
        dias_restantes: restantes,
        vigente: vence > ahora,
      }
      porLlave.set(llave, renglon)
    }
    renglon.ids.push(fila.id)
    renglon.cantidad += 1
  }

  return [...porLlave.values()].sort((a, b) => {
    if (a.vigente !== b.vigente) return a.vigente ? -1 : 1
    return a.vigente ? a.vence - b.vence : b.vence - a.vence
  })
}
