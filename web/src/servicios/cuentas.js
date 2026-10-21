// servicios/cuentas.js
// Cuentas de revendedores y de senas: son el mismo mecanismo con dos nombres.
// Funciones puras.

import { redondear4, sumar } from './lotes.js'
import { describir } from './texto.js'

// tipo: 'revendedor' o 'sena'.
// lista: los revendedores guardados (para las senas va vacia).
// cotizaciones: { venta, costo } de hoy (costo puede ser null = igual a venta).
// Devuelve una cuenta por persona con:
//   unidades (de la que se llevo primero a la ultima, cada una con pagado_usd:
//   la parte de lo entregado que le toca), renglones (unidades iguales
//   juntas; cada celular en el suyo), pagos,
//   valor_usd (equipos a su nombre, al precio acordado),
//   entregado_usd (pagos sin aplicar) y saldo_usd (lo que debe).
export function armarCuentas({ tipo, celulares, accesorios, pagos, lista = [], cotizaciones }) {
  // El estado que llevan las unidades de este tipo de cuenta.
  const estado = tipo === 'sena' ? 'senado' : 'revendedor'

  const porNombre = new Map()
  const cuentaDe = (nombre) => {
    if (!porNombre.has(nombre)) {
      porNombre.set(nombre, { tipo, nombre, id: null, celular: '', unidades: [], pagos: [] })
    }
    return porNombre.get(nombre)
  }

  // Los revendedores guardados existen aunque no tengan equipos ni deuda.
  for (const persona of lista) {
    const cuenta = cuentaDe(persona.nombre)
    cuenta.id = persona.id
    cuenta.celular = persona.celular
  }
  for (const [tabla, unidades] of [
    ['celulares', celulares],
    ['accesorios', accesorios],
  ]) {
    for (const unidad of unidades) {
      if (unidad.estado === estado) cuentaDe(unidad.revendedor).unidades.push({ ...unidad, tabla })
    }
  }
  for (const pago of pagos) cuentaDe(pago.revendedor).pagos.push(pago)

  // El costo se pasa a "dolares de venta" para poder compararlo con el precio.
  const factorCosto = (cotizaciones.costo || cotizaciones.venta) / cotizaciones.venta

  return [...porNombre.values()]
    .map((cuenta) => {
      const valor = sumar(cuenta.unidades.map((unidad) => unidad.precio_revendedor))
      const entregado = sumar(cuenta.pagos.map((pago) => pago.monto_usd))
      const costo = sumar(cuenta.unidades.map((unidad) => unidad.costo_usd)) * factorCosto

      // Lo entregado se reparte equipo por equipo, del que se llevo primero al
      // ultimo (el mismo orden que usa la base para darlos por pagados).
      const unidades = repartir(ordenarPorEntrega(cuenta.unidades), entregado)

      // Unidades iguales al mismo precio acordado van en un solo renglon. Los
      // celulares van cada uno en el suyo: cada equipo lleva su propia cuenta.
      const renglones = new Map()
      for (const unidad of unidades) {
        const llave =
          unidad.tabla === 'celulares' ? `celulares|${unidad.id}` : `${unidad.tabla}|${unidad.clave}|${unidad.precio_revendedor}`
        if (!renglones.has(llave)) {
          renglones.set(llave, {
            llave,
            tabla: unidad.tabla,
            descripcion: describir(unidad, unidad.tabla),
            detalle: [unidad.bateria, unidad.detalles].filter(Boolean).join(' · '),
            precio_usd: unidad.precio_revendedor,
            pagado_usd: 0,
            unidades: [],
          })
        }
        const renglon = renglones.get(llave)
        renglon.unidades.push(unidad)
        renglon.pagado_usd = redondear4(renglon.pagado_usd + unidad.pagado_usd)
      }

      return {
        ...cuenta,
        unidades,
        renglones: [...renglones.values()],
        valor_usd: valor,
        entregado_usd: entregado,
        saldo_usd: redondear4(valor - entregado),
        // Que parte de cada dolar cobrado es ganancia, segun sus equipos.
        margen: valor > 0 ? (valor - costo) / valor : 0,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// Del que se llevo primero al ultimo; a la misma hora, accesorios antes que
// celulares y despues por id (como ordena la base).
function ordenarPorEntrega(unidades) {
  const momento = (unidad) => (unidad.fecha_revendedor ? new Date(unidad.fecha_revendedor).getTime() : -Infinity)
  return [...unidades].sort(
    (a, b) => momento(a) - momento(b) || (a.tabla < b.tabla ? -1 : a.tabla > b.tabla ? 1 : 0) || a.id - b.id,
  )
}

// A cada unidad le pone pagado_usd: la parte de lo entregado que le toca.
function repartir(unidades, entregado) {
  let resto = Math.max(0, entregado)
  return unidades.map((unidad) => {
    const pagado = redondear4(Math.min(unidad.precio_revendedor, resto))
    resto = redondear4(resto - pagado)
    return { ...unidad, pagado_usd: pagado }
  })
}

// Cuantos equipos de la cuenta quedan pagados con un pago nuevo de pagoUsd:
// los primeros que lo entregado mas el pago cubre enteros (falta menos de
// medio centavo, igual que en la base).
export function equiposCubiertos(cuenta, pagoUsd) {
  let resto = Math.max(0, cuenta.entregado_usd) + pagoUsd
  let cubiertos = 0
  for (const unidad of cuenta.unidades) {
    if (unidad.precio_revendedor - resto >= 0.005) break
    resto -= unidad.precio_revendedor
    cubiertos += 1
  }
  return cubiertos
}
