// servicios/cuotas.js
// Cuanto queda cada cuota cuando se paga con tarjeta (en el posnet o con QR).
// Funciones puras.
//
// Un plan es { cuotas, recargo }: "recargo" es el porcentaje que se le suma
// al precio de lista (0 = sin interes). Los planes los elige el dueno en
// Ajustes y la base los guarda ya ordenados (ver limpiar_cuotas()).
//
// Cada tarjeta (o grupo de tarjetas: "Visa / Mastercard", "Naranja") tiene
// sus propios planes: { nombre, un_pago, planes }. "un_pago" es el recargo
// pagando en 1 pago con esa tarjeta. Ver limpiar_tarjetas() en la base.

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

// --- Tarjetas ----------------------------------------------------------------

// Lo mismo que acepta la base (ver limpiar_tarjetas()).
export const TARJETAS_MAXIMAS = 8

// Las tarjetas de la configuracion (panel) o del catalogo ("cuotas"), con los
// numeros como numeros. Si la base todavia no tiene tarjetas pero si planes
// (antes de la migracion de las tarjetas), los planes van como una sola
// tarjeta sin nombre.
export function tarjetasDe(fuente) {
  const tarjetas = fuente?.tarjetas
  if (Array.isArray(tarjetas) && tarjetas.length > 0) {
    return tarjetas.map((tarjeta) => ({
      nombre: tarjeta.nombre || '',
      un_pago: Number(tarjeta.un_pago) || 0,
      planes: (tarjeta.planes || []).map((plan) => ({ cuotas: plan.cuotas, recargo: Number(plan.recargo) || 0 })),
    }))
  }
  const planes = fuente?.cuotas_planes ?? fuente?.planes
  if (!Array.isArray(planes) || planes.length === 0) return []
  return [{ nombre: '', un_pago: 0, planes: planes.map((plan) => ({ cuotas: plan.cuotas, recargo: Number(plan.recargo) || 0 })) }]
}

// Lo que se puede elegir al cobrar con una tarjeta: 1 pago (con su recargo)
// y sus planes. Sin tarjeta, solo 1 pago sin recargo.
export function opcionesDeTarjeta(tarjeta) {
  return [{ cuotas: 1, recargo: Number(tarjeta?.un_pago) || 0 }, ...(tarjeta?.planes || [])]
}

// "Visa / Mastercard" si hay mas de una tarjeta; nada si hay una sola (no
// hace falta decir cual).
export const nombreSiHayVarias = (tarjeta, tarjetas) => (tarjetas.length > 1 ? tarjeta.nombre : '')

// Las tarjetas que muestra cada tabla del catalogo: en los celulares siempre;
// en los accesorios solo si el dueno lo eligio. Una tarjeta sin planes ni
// recargo en 1 pago no tiene nada que mostrar.
export function tarjetasPara(tabla, cuotasDelCatalogo) {
  if (!cuotasDelCatalogo) return []
  if (tabla === 'accesorios' && !cuotasDelCatalogo.accesorios) return []
  return tarjetasDe(cuotasDelCatalogo).filter((tarjeta) => tarjeta.planes.length > 0 || tarjeta.un_pago > 0)
}

// Todos los planes de todas las tarjetas, para el aviso del catalogo ("Pagá
// en hasta 12 cuotas · 3 sin interés").
export const todosLosPlanes = (tarjetas) => tarjetas.flatMap((tarjeta) => tarjeta.planes)

// La cuota que se muestra en cada producto del catalogo: la mas larga sin
// interes de cualquier tarjeta o, si no hay, la mas larga. Con empate gana la
// primera tarjeta. Devuelve la cuota (ver cuotasDe) con el nombre de su
// tarjeta, o null si ninguna tiene planes.
export function cuotaDestacada(precioArs, tarjetas) {
  let mejor = null
  for (const tarjeta of tarjetas) {
    for (const plan of cuotasDe(precioArs, tarjeta.planes)) {
      const gana =
        !mejor ||
        (plan.sin_interes && !mejor.sin_interes) ||
        (plan.sin_interes === mejor.sin_interes && plan.cuotas > mejor.cuotas)
      if (gana) mejor = { ...plan, tarjeta: tarjeta.nombre }
    }
  }
  return mejor
}

// Al cobrar, elegir una tarjeta: si tiene las cuotas que estaban elegidas se
// quedan; si no, vuelve a 1 pago. El recargo sale de esa tarjeta.
// cobro: { medio, efectivo, cuotas, recargo, tarjeta } (ver comprobante.js).
export function cobroConTarjeta(cobro, tarjeta) {
  const opciones = opcionesDeTarjeta(tarjeta)
  const plan = opciones.find((opcion) => opcion.cuotas === (cobro.cuotas || 1)) || opciones[0]
  return { ...cobro, tarjeta: tarjeta?.nombre || '', cuotas: plan.cuotas, recargo: Number(plan.recargo) || 0 }
}

// Al cobrar, elegir las cuotas con la tarjeta ya elegida: el recargo sale del
// plan de esa tarjeta.
export function cobroEnCuotas(cobro, tarjeta, cuotas) {
  const plan = opcionesDeTarjeta(tarjeta).find((opcion) => opcion.cuotas === cuotas)
  return { ...cobro, cuotas, recargo: plan ? Number(plan.recargo) || 0 : 0 }
}

// Revisa las tarjetas que se estan editando en Ajustes. Devuelve el problema,
// o '' si estan bien. Las mismas reglas que limpiar_tarjetas() en la base.
export function problemaDeTarjetas(tarjetas) {
  if (tarjetas.length > TARJETAS_MAXIMAS) return `Como máximo ${TARJETAS_MAXIMAS} tarjetas.`
  const vistos = new Set()
  for (const tarjeta of tarjetas) {
    const nombre = String(tarjeta.nombre ?? '').replace(/\s+/g, ' ').trim()
    if (!nombre) return 'Escribí el nombre de cada tarjeta.'
    if (nombre.length > 40) return `El nombre de ${nombre} es muy largo (hasta 40 letras).`
    if (vistos.has(nombre.toUpperCase())) return `La tarjeta ${nombre} está repetida.`
    vistos.add(nombre.toUpperCase())
    if (typeof tarjeta.un_pago !== 'number' || !(tarjeta.un_pago >= 0) || tarjeta.un_pago > 300) return `${nombre}: el recargo en 1 pago va de 0 % a 300 %.`
    const problema = problemaDePlanes(tarjeta.planes)
    if (problema) return `${nombre}: ${problema.charAt(0).toLowerCase()}${problema.slice(1)}`
  }
  return ''
}
