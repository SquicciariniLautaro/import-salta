// servicios/lista.js
// Las opciones de la lista que se comparte por WhatsApp desde el catalogo:
// el texto de arriba, el de abajo y que datos van. Las elige el dueno en
// Ajustes (ver limpiar_lista_compartir() en la base). Funciones puras.

import { NEGOCIO } from '../negocio.js'

// Lo mismo que acepta la base.
export const LARGO_ENCABEZADO = 300
export const LARGO_PIE = 500

// Que datos se pueden prender o apagar, en el orden en que se muestran en Ajustes.
export const DATOS_DE_LISTA = [
  { id: 'color', nombre: 'Color' },
  { id: 'bateria', nombre: 'Batería (celulares)' },
  { id: 'detalles', nombre: 'Detalles' },
  { id: 'efectivo', nombre: 'Precio en efectivo' },
  { id: 'cuotas', nombre: 'Hasta cuántas cuotas (al final)' },
  { id: 'enlace', nombre: 'Link al catálogo (al final)' },
]

// Como viene de fabrica: el nombre del local arriba, nada abajo y todos los datos.
export const LISTA_DE_FABRICA = {
  encabezado: `*${NEGOCIO.nombre}* · Lista de precios`,
  pie: '',
  color: true,
  bateria: true,
  detalles: true,
  efectivo: true,
  cuotas: true,
  enlace: true,
}

// Las opciones como las trae la base (o el catalogo), con lo que falte en su
// valor de fabrica. Sin la migracion de la lista, todo de fabrica.
export function opcionesDeLista(fuente) {
  const opciones = { ...LISTA_DE_FABRICA }
  if (!fuente || typeof fuente !== 'object') return opciones
  if (typeof fuente.encabezado === 'string') opciones.encabezado = fuente.encabezado
  if (typeof fuente.pie === 'string') opciones.pie = fuente.pie
  for (const { id } of DATOS_DE_LISTA) if (typeof fuente[id] === 'boolean') opciones[id] = fuente[id]
  return opciones
}

// Revisa lo que se esta escribiendo en Ajustes. Devuelve el problema, o ''.
export function problemaDeLista(opciones) {
  if (opciones.encabezado.trim().length > LARGO_ENCABEZADO) return `El texto de arriba es muy largo (hasta ${LARGO_ENCABEZADO} letras).`
  if (opciones.pie.trim().length > LARGO_PIE) return `El texto de abajo es muy largo (hasta ${LARGO_PIE} letras).`
  return ''
}
