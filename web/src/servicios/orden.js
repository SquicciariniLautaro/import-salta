// servicios/orden.js
// Orden del stock, igual en el catalogo y en el panel. Jerarquia estricta:
//   1. Marca: primero los iPhone, despues cada marca junta, alfabeticamente.
//   2. Familia en orden natural (13, 13 PRO, 14...). En iPhone, las familias
//      con letras (SE, X, XR, XS) van antes que las numeradas.
//   3. Precio de menor a mayor, solo dentro de cada familia.

import { normalizar } from './texto.js'

// Modelos de iPhone que se escriben sin numero adelante.
const IPHONE_CON_LETRAS = new Set(['SE', 'X', 'XR', 'XS'])

// Compara textos "como una persona": "2" va antes que "10" y "13" antes que
// "13 PRO". Intl.Collator viene con JavaScript, no es una libreria.
const natural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

// La marca es la primera palabra del modelo. Un modelo que empieza con numero,
// con "IPHONE" o con SE, X, XR o XS se considera iPhone.
export function marcaDe(modelo) {
  const primera = normalizar(modelo).split(' ')[0] || ''
  if (primera === 'IPHONE' || /^\d/.test(primera) || IPHONE_CON_LETRAS.has(primera)) return 'IPHONE'
  return primera
}

// La familia de un celular es su modelo sin la palabra "IPHONE":
// "IPHONE 13 PRO" y "13 PRO" son la misma familia, "13 PRO".
// En las demas marcas la familia es el modelo completo ("SAMSUNG S23").
export function familiaDeCelular(modelo) {
  return normalizar(modelo).replace(/^IPHONE\s+/, '')
}

function compararMarcas(a, b) {
  if (a === b) return 0
  if (a === 'IPHONE') return -1
  if (b === 'IPHONE') return 1
  return natural.compare(a, b)
}

function compararFamilias(a, b, marca) {
  if (marca === 'IPHONE') {
    // En iPhone, las familias que empiezan con letra van primero.
    const aConLetra = !/^\d/.test(a)
    const bConLetra = !/^\d/.test(b)
    if (aConLetra !== bConLetra) return aConLetra ? -1 : 1
  }
  return natural.compare(a, b)
}

// Ordena lotes que ya traen { marca, familia, precio_usd }.
// Devuelve una lista nueva; no modifica la que recibe.
export function ordenarLotes(lotes) {
  return [...lotes].sort(
    (a, b) =>
      compararMarcas(a.marca, b.marca) ||
      compararFamilias(a.familia, b.familia, a.marca) ||
      a.precio_usd - b.precio_usd ||
      // Desempate para que el orden sea siempre el mismo entre dos cargas.
      natural.compare(a.clave, b.clave),
  )
}
