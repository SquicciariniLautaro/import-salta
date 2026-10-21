// servicios/stock.js
// Arma lo que muestra el panel en las pestanas de stock: las unidades que
// devuelve panel_datos() (todas las no vendidas) juntadas por lote.
// Funciones puras.

import { normalizar } from './texto.js'
import { promediar, sumar } from './lotes.js'
import { familiaDeCelular, marcaDe, ordenarLotes } from './orden.js'

// tabla: 'celulares' o 'accesorios'.
// Cada lote separa sus unidades segun donde estan:
//   disponibles (en el local), conRevendedores y senadas.
// Un lote sin unidades en el local sigue figurando, con cantidad 0.
export function armarStock(unidades, tabla) {
  const porClave = new Map()

  for (const unidad of unidades) {
    let lote = porClave.get(unidad.clave)
    if (!lote) {
      lote = { disponibles: [], conRevendedores: [], senadas: [] }
      porClave.set(unidad.clave, lote)
    }
    if (unidad.estado === 'disponible') lote.disponibles.push(unidad)
    else if (unidad.estado === 'revendedor') lote.conRevendedores.push(unidad)
    else if (unidad.estado === 'senado') lote.senadas.push(unidad)
  }

  const lotes = [...porClave.entries()].map(([clave, lote]) => {
    // Los datos y precios se leen de las unidades del local; si no queda
    // ninguna, de las que estan afuera.
    const base = lote.disponibles.length > 0 ? lote.disponibles : [...lote.conRevendedores, ...lote.senadas]
    const muestra = base[0]
    const esCelular = tabla === 'celulares'

    return {
      tabla,
      clave,
      marca: esCelular ? marcaDe(muestra.modelo) : '',
      familia: esCelular ? familiaDeCelular(muestra.modelo) : normalizar(muestra.tipo),
      tipo: muestra.tipo,
      modelo: muestra.modelo,
      capacidad: muestra.capacidad,
      color: muestra.color,
      bateria: muestra.bateria,
      detalles: muestra.detalles,
      disponibles: lote.disponibles,
      conRevendedores: lote.conRevendedores,
      senadas: lote.senadas,
      cantidad: lote.disponibles.length,
      costo_usd: promediar(base.map((unidad) => unidad.costo_usd)),
      precio_usd: promediar(base.map((unidad) => unidad.precio_usd)),
      // Precio por mayor: es del lote (todas sus unidades tienen el mismo). null = no tiene.
      precio_mayorista_usd: base.find((unidad) => unidad.precio_mayorista_usd != null)?.precio_mayorista_usd ?? null,
      promediado: lote.disponibles.some((unidad) => unidad.promediado),
    }
  })

  return ordenarLotes(lotes)
}

// Totales del stock. La plata cuenta solo lo que esta en el local, con las
// sumas reales de cada unidad (no con el promedio redondeado del lote).
//   unidades: en el local. conRevendedores / senadas: las que estan afuera.
//   total: todas las que son del negocio y no se vendieron.
export function resumirStock(lotes) {
  const disponibles = lotes.flatMap((lote) => lote.disponibles)
  const conRevendedores = lotes.reduce((suma, lote) => suma + lote.conRevendedores.length, 0)
  const senadas = lotes.reduce((suma, lote) => suma + lote.senadas.length, 0)
  return {
    total: disponibles.length + conRevendedores + senadas,
    unidades: disponibles.length,
    conRevendedores,
    senadas,
    costo_usd: sumar(disponibles.map((unidad) => unidad.costo_usd)),
    venta_usd: sumar(disponibles.map((unidad) => unidad.precio_usd)),
  }
}

// A que proveedores se les compraron las unidades de un lote (las que no
// estan vendidas). proveedores: la lista de panel_datos().
// Devuelve { lista: [{ nombre, cantidad }], texto }; texto es "MAYORISTA" si
// son todas del mismo, o "MAYORISTA (2) · SIN PROVEEDOR (1)" si hay varios.
export function proveedoresDelLote(lote, proveedores) {
  const nombres = new Map(proveedores.map((proveedor) => [proveedor.id, proveedor.nombre]))
  const cuenta = new Map()
  for (const unidad of [...lote.disponibles, ...lote.conRevendedores, ...lote.senadas]) {
    const nombre = nombres.get(unidad.proveedor_id) || 'SIN PROVEEDOR'
    cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1)
  }
  const lista = [...cuenta.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad)
  const texto = lista.length === 1 ? lista[0].nombre : lista.map((item) => `${item.nombre} (${item.cantidad})`).join(' · ')
  return { lista, texto }
}

// Corta una lista de lotes (ya ordenada) en grupos por familia.
export function agruparPorFamilia(lotes) {
  const grupos = []
  for (const lote of lotes) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.marca === lote.marca && ultimo.familia === lote.familia) {
      ultimo.lotes.push(lote)
    } else {
      grupos.push({ marca: lote.marca, familia: lote.familia, lotes: [lote] })
    }
  }
  return grupos
}

// "13 PRO" se muestra como "iPhone 13 PRO"; las demas familias, tal cual.
export function tituloDeFamilia(grupo) {
  return grupo.marca === 'IPHONE' ? `iPhone ${grupo.familia}` : grupo.familia
}
