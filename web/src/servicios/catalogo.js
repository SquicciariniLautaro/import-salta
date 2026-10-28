// servicios/catalogo.js
// Convierte lo que devuelve catalogo_publico() (un renglon por lote, ya
// contado por la base) en el catalogo que dibuja la pantalla: con el precio
// promedio, la marca, la familia y en el orden del stock.
// Funcion pura: no toca la red, se prueba con un script.

import { normalizar } from './texto.js'
import { aDiezmilesimos, promedio } from './lotes.js'
import { familiaDeCelular, marcaDe, ordenarLotes } from './orden.js'
import { resolverTramo } from './precios.js'

export function armarCatalogo(crudo) {
  const cotizacion = Number(crudo.cotizacion)

  const celulares = ordenarLotes(
    crudo.celulares.map((lote) => ({
      clave: lote.clave,
      marca: marcaDe(lote.modelo),
      familia: familiaDeCelular(lote.modelo),
      modelo: lote.modelo,
      capacidad: lote.capacidad,
      color: lote.color,
      bateria: lote.bateria,
      detalles: lote.detalles,
      precio_usd: promedio(aDiezmilesimos(lote.suma_precio), lote.cantidad),
      cantidad: lote.cantidad,
      // La foto en Cloudinary (null si no tiene).
      imagen: lote.imagen || null,
    })),
  )

  // Escalas agrupadas por clave de accesorio, ya traducidas a pesos y dolares.
  const tramosPorClave = new Map()
  for (const escala of crudo.escalas) {
    if (!tramosPorClave.has(escala.clave)) tramosPorClave.set(escala.clave, [])
    tramosPorClave.get(escala.clave).push(resolverTramo(escala, cotizacion))
  }

  // Accesorios: la familia es el tipo y no hay marcas (todos comparten una vacia).
  const accesorios = ordenarLotes(
    crudo.accesorios.map((lote) => ({
      clave: lote.clave,
      marca: '',
      familia: normalizar(lote.tipo),
      tipo: lote.tipo,
      modelo: lote.modelo,
      color: lote.color,
      detalles: lote.detalles,
      precio_usd: promedio(aDiezmilesimos(lote.suma_precio), lote.cantidad),
      cantidad: lote.cantidad,
      imagen: lote.imagen || null,
      escalas:(tramosPorClave.get(lote.clave) || []).sort((a, b) => a.desde - b.desde),
    })),
  )

  // Los combos se muestran con los accesorios, en su propia familia "COMBOS".
  // Llegan de la base solo si hay stock para armarlos.
  const combos = (crudo.combos || []).map((combo) => ({
    clave: combo.clave,
    marca: '',
    familia: 'COMBOS',
    // Sin tipo: el nombre del combo ya lo dice ("COMBO CARGADOR...").
    tipo: '',
    modelo: combo.nombre,
    color: '',
    detalles: combo.detalle,
    precio_usd: Number(combo.precio),
    cantidad: combo.cantidad,
    imagen: null,
    escalas: [],
  }))

  // Los planes de cuotas con tarjeta que eligio el dueno (vacio = no se muestran).
  const cuotas = {
    planes: crudo.cuotas?.planes || [],
    leyenda: crudo.cuotas?.leyenda || '',
    accesorios: Boolean(crudo.cuotas?.accesorios),
  }

  // El descuento pagando en efectivo, en % (0 = sin descuento). Sin la
  // migracion del descuento la base no lo trae: queda en 0.
  const efectivo = {
    celulares: Number(crudo.efectivo?.celulares) || 0,
    accesorios: Number(crudo.efectivo?.accesorios) || 0,
  }

  return { cotizacion, cuotas, efectivo, celulares, accesorios: ordenarLotes([...accesorios, ...combos]) }
}
