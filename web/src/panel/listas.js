// panel/listas.js
// Opciones de los desplegables. Los modelos, capacidades, colores, tipos de
// accesorio y vendedores estan en la base (tabla "opciones") y el dueno los
// maneja desde Ajustes. A cada lista se le suman las que ya existan en el
// stock, y siempre queda "Otro (escribir)".

// Las listas que se editan en Ajustes, con su nombre para mostrar.
export const LISTAS = [
  { id: 'modelo', nombre: 'Modelos de celular' },
  { id: 'capacidad', nombre: 'Capacidades' },
  { id: 'color', nombre: 'Colores' },
  { id: 'tipo', nombre: 'Tipos de accesorio' },
  // Quienes atienden: salen en el ticket como "Atendido por".
  { id: 'vendedor', nombre: 'Vendedores' },
]

// Las opciones de una lista (de panel_datos) mas las usadas en el stock.
export function opcionesDe(datos, lista, usadas = []) {
  return conLasUsadas(
    datos.opciones.filter((opcion) => opcion.lista === lista).map((opcion) => opcion.valor),
    usadas,
  )
}

// Categorias de la caja. El dueno puede escribir otras: quedan en la lista.
export const CATEGORIAS_DE_GASTO = [
  'ALQUILER', 'SERVICIOS', 'SUELDOS', 'PROVEEDOR', 'REPUESTOS', 'ENVIOS', 'PUBLICIDAD', 'IMPUESTOS', 'RETIRO',
]
export const CATEGORIAS_DE_INGRESO = ['VENTA APARTE', 'SALDO INICIAL', 'APORTE']

// Junta las opciones fijas con las que ya estan en uso, sin repetir y en orden.
export function conLasUsadas(fijas, usadas) {
  const orden = new Intl.Collator('es', { numeric: true })
  return [...new Set([...fijas, ...usadas.filter(Boolean)])].sort(orden.compare)
}
