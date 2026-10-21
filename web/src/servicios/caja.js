// servicios/caja.js
// La caja: plata que entra y sale. Funciones puras.
//
// caja_datos() devuelve una fila por movimiento, con cuanto fue en efectivo y
// cuanto por transferencia. Los montos tienen signo: positivo entra, negativo
// sale. Aca solo se filtra y se suma.

// "2026-10-13" a partir de una fecha, en la hora local de quien mira.
export function diaDe(fecha) {
  const dia = new Date(fecha)
  return `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`
}

// Le agrega a cada fila su total y una llave unica para las listas.
export function armarCaja(filas) {
  return filas.map((fila) => ({
    ...fila,
    llave: `${fila.origen}|${fila.id ?? fila.fecha}`,
    total_ars: fila.efectivo_ars + fila.transferencia_ars,
  }))
}

export const PERIODOS = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: 'semana', nombre: '7 días' },
  { id: 'mes', nombre: 'Este mes' },
  { id: 'todo', nombre: 'Todo' },
]

// Los movimientos de un periodo: 'hoy', 'semana' (hoy y los 6 dias
// anteriores), 'mes' (el mes en curso) o 'todo'.
export function filtrarCaja(movimientos, periodo, ahora = new Date()) {
  if (periodo === 'todo') return movimientos
  const hoy = diaDe(ahora)
  if (periodo === 'hoy') return movimientos.filter((movimiento) => diaDe(movimiento.fecha) === hoy)
  if (periodo === 'mes') return movimientos.filter((movimiento) => diaDe(movimiento.fecha).slice(0, 7) === hoy.slice(0, 7))

  const desde = new Date(ahora)
  desde.setDate(desde.getDate() - 6)
  const primerDia = diaDe(desde)
  return movimientos.filter((movimiento) => {
    const dia = diaDe(movimiento.fecha)
    return dia >= primerDia && dia <= hoy
  })
}

// Suma una lista de movimientos.
//   ingresos / egresos: lo que entro y lo que salio (los dos en positivo).
//   efectivo / transferencia: el neto de cada medio. Sobre TODOS los
//     movimientos, "efectivo" es la plata que tendria que haber en la caja.
export function resumirCaja(movimientos) {
  const resumen = { ingresos: 0, egresos: 0, resultado: 0, efectivo: 0, transferencia: 0 }
  for (const movimiento of movimientos) {
    if (movimiento.total_ars >= 0) resumen.ingresos += movimiento.total_ars
    else resumen.egresos -= movimiento.total_ars
    resumen.efectivo += movimiento.efectivo_ars
    resumen.transferencia += movimiento.transferencia_ars
  }
  resumen.resultado = resumen.ingresos - resumen.egresos
  return resumen
}

// Texto CSV de los movimientos, para abrir en Excel.
export function cajaACsv(movimientos) {
  const celda = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`
  const filas = [['Fecha', 'Concepto', 'Detalle', 'Persona', 'Efectivo', 'Banco (transferencia y tarjeta)', 'Total']]
  for (const movimiento of movimientos) {
    filas.push([
      new Date(movimiento.fecha).toLocaleString('es-AR'),
      movimiento.concepto,
      movimiento.detalle,
      movimiento.persona || movimiento.proveedor || '',
      Math.round(movimiento.efectivo_ars),
      Math.round(movimiento.transferencia_ars),
      Math.round(movimiento.total_ars),
    ])
  }
  return filas.map((fila) => fila.map(celda).join(';')).join('\r\n')
}
