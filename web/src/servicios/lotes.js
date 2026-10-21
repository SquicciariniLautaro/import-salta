// servicios/lotes.js
// Sumas y promedios de plata sin errores de redondeo.

// Los numeric(18,4) llegan como numeros con hasta 4 decimales. Sumar decimales
// en JavaScript arrastra errores minimos (0.1 + 0.2 = 0.30000000000000004),
// asi que se suma en enteros: diezmilesimos de dolar.
const ESCALA = 10000

export function aDiezmilesimos(numero) {
  return Math.round(Number(numero) * ESCALA)
}

export function redondear4(numero) {
  return Math.round(Number(numero) * ESCALA) / ESCALA
}

// Suma exacta de una lista de montos.
export function sumar(montos) {
  let total = 0
  for (const monto of montos) total += aDiezmilesimos(monto ?? 0)
  return total / ESCALA
}

// Promedio de un lote. Como cada fila es una unidad, suma / cantidad ya es
// ponderado: 3 a 700 y 1 a 720 da 705.
export function promedio(sumaDiezmilesimos, cantidad) {
  if (!cantidad) return 0
  return Math.round(sumaDiezmilesimos / cantidad) / ESCALA
}

// Promedio de una lista de montos, redondeado a 4 decimales.
export function promediar(montos) {
  return promedio(aDiezmilesimos(sumar(montos)), montos.length)
}
