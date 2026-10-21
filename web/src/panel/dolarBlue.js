// panel/dolarBlue.js
// La cotizacion del dolar blue de hoy, para cargarla con un toque en el
// encabezado del panel. Sale de DolarApi (dolarapi.com), un servicio gratuito
// y publico que no pide clave. Si no responde, el dueno la escribe a mano
// como siempre.

const DIRECCION = 'https://dolarapi.com/v1/dolares/blue'

// Devuelve { compra, venta, fecha } o tira un error con un mensaje para mostrar.
export async function leerDolarBlue() {
  let respuesta
  try {
    respuesta = await fetch(DIRECCION, { headers: { Accept: 'application/json' } })
  } catch {
    throw new Error('No se pudo consultar el dólar blue. Revisá la conexión o escribilo a mano.')
  }
  if (!respuesta.ok) throw new Error('El servicio del dólar blue no respondió. Escribilo a mano.')
  const datos = await respuesta.json()
  const venta = Number(datos.venta)
  const compra = Number(datos.compra)
  if (!(venta > 0)) throw new Error('El servicio del dólar blue devolvió un valor raro. Escribilo a mano.')
  return { compra, venta, fecha: datos.fechaActualizacion || null }
}
