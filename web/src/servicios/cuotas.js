// servicios/cuotas.js
// Cuanto queda cada cuota cuando se paga con tarjeta en el posnet del local.
// Funciones puras.
//
// Un plan es { cuotas, recargo }: "recargo" es el porcentaje que se le suma
// al precio de lista (0 = sin interes). Los planes los elige el dueno en
// Ajustes y la base los guarda ya ordenados (ver limpiar_cuotas()).

// Precio de lista mas el recargo, en pesos enteros.
export function totalConRecargo(precioArs, recargo) {
  return Math.round(precioArs * (1 + (Number(recargo) || 0) / 100))
}

// Cada plan con su total y lo que queda cada cuota, en pesos enteros.
export function cuotasDe(precioArs, planes) {
  return (planes || []).map((plan) => {
    const total = totalConRecargo(precioArs, plan.recargo)
    return {
      cuotas: plan.cuotas,
      recargo: Number(plan.recargo) || 0,
      total_ars: total,
      cuota_ars: Math.round(total / plan.cuotas),
      sin_interes: !(Number(plan.recargo) > 0),
    }
  })
}

// "3 cuotas sin interés", "6 cuotas".
export function nombreDePlan(plan) {
  return `${plan.cuotas} cuotas${Number(plan.recargo) > 0 ? '' : ' sin interés'}`
}

// "12,5 %" o "Sin interés".
export function textoDeRecargo(recargo) {
  const numero = Number(recargo) || 0
  return numero > 0 ? `${numero.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %` : 'Sin interés'
}

// La cuota mas larga de la lista, para el resumen ("Hasta 12 cuotas").
// null si no hay planes.
export function planMasLargo(planes) {
  if (!planes || planes.length === 0) return null
  return planes.reduce((largo, plan) => (plan.cuotas > largo.cuotas ? plan : largo))
}

// Los planes que muestra cada tabla del catalogo. Los celulares siempre; los
// accesorios solo si el dueno lo eligio.
export function planesPara(tabla, configuracionCuotas) {
  if (!configuracionCuotas) return []
  if (tabla === 'accesorios' && !configuracionCuotas.accesorios) return []
  return configuracionCuotas.planes || []
}

// Revisa los planes que se estan editando en Ajustes. Devuelve el problema,
// o '' si estan bien. Las mismas reglas que limpiar_cuotas() en la base.
export function problemaDePlanes(planes) {
  if (planes.length > 12) return 'Como máximo 12 planes de cuotas.'
  const vistos = new Set()
  for (const plan of planes) {
    if (!Number.isInteger(plan.cuotas) || plan.cuotas < 2 || plan.cuotas > 48) return 'Las cuotas van de 2 a 48.'
    if (!(plan.recargo >= 0) || plan.recargo > 300) return 'El recargo va de 0 % a 300 %.'
    if (vistos.has(plan.cuotas)) return `El plan de ${plan.cuotas} cuotas está repetido.`
    vistos.add(plan.cuotas)
  }
  return ''
}

// Los planes en orden, como los guarda la base.
export function ordenarPlanes(planes) {
  return [...planes].sort((a, b) => a.cuotas - b.cuotas)
}
