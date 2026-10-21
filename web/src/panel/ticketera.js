// panel/ticketera.js
// Imprime directo en la ticketera por USB, sin driver: el navegador le habla
// a la impresora (WebUSB) y le manda el ticket en su idioma (ESC/POS, ver
// servicios/escpos.js). Sirve para las ticketeras que no traen driver para
// Mac. Anda en Google Chrome y en Edge; Safari no lo tiene.
//
// La primera vez el navegador muestra la lista de impresoras USB para elegir
// la ticketera. Despues la recuerda y no vuelve a preguntar.

import { etiquetasEnEscPos, mapaDeImagen, puntosDe } from '../servicios/escpos.js'
import { rutaPublica } from '../negocio.js'

export const hayUsb = typeof navigator !== 'undefined' && Boolean(navigator.usb)

// El logo del local para imprimir (public/logo-ticket.png): la manzana y el
// nombre en negro sobre blanco, uno al lado del otro, para que ocupe poco
// papel. Se usa la imagen entera. Lo comparten las etiquetas en pantalla
// (LogoImpreso) y la ticketera.
export const ARCHIVO_DEL_LOGO = rutaPublica('logo-ticket.png')
export const RECORTE_DEL_LOGO = { x: 0, y: 0, ancho: 847, alto: 170, lado: 847 }

const logos = new Map()

// El logo como mapa de bits para la ticketera. ancho: en puntos (8 por mm).
// null si no se pudo cargar: el ticket sale igual, con el nombre en letras.
export function cargarLogo(ancho, anchoMm) {
  const llave = `${ancho}|${anchoMm}`
  if (!logos.has(llave)) {
    const promesa = new Promise((resolver) => {
      const imagen = new Image()
      imagen.onload = () => {
        const { x, y, ancho: anchoRecorte, alto: altoRecorte } = RECORTE_DEL_LOGO
        const alto = Math.round((ancho * altoRecorte) / anchoRecorte)
        const lienzo = document.createElement('canvas')
        lienzo.width = ancho
        lienzo.height = alto
        const dibujo = lienzo.getContext('2d')
        dibujo.fillStyle = '#fff'
        dibujo.fillRect(0, 0, ancho, alto)
        dibujo.drawImage(imagen, x, y, anchoRecorte, altoRecorte, 0, 0, ancho, alto)
        resolver(mapaDeImagen(dibujo.getImageData(0, 0, ancho, alto).data, ancho, alto, puntosDe(anchoMm)))
      }
      imagen.onerror = () => resolver(null)
      imagen.src = ARCHIVO_DEL_LOGO
    })
    // Si fallo, la proxima vez se vuelve a intentar.
    promesa.then((logo) => logo || logos.delete(llave))
    logos.set(llave, promesa)
  }
  return logos.get(llave)
}

// El logo de los tickets ocupa tres cuartos del papel; el de las etiquetas, algo menos.
export const logoDeTicket = (configuracion) =>
  cargarLogo((puntosDe(configuracion.ticket_ancho_mm) * 3) / 4, configuracion.ticket_ancho_mm)
export const logoDeEtiqueta = (configuracion) =>
  cargarLogo(puntosDe(configuracion.ticket_ancho_mm) / 2 + 32, configuracion.ticket_ancho_mm)

// Las etiquetas (las de HojaEtiquetas), para mandarlas directo a la ticketera
// en el rollo del ticket, una abajo de la otra. Va como "escpos" de VentanaImpresion.
export const etiquetasParaTicketera = (etiquetas, configuracion) => async () =>
  etiquetasEnEscPos(etiquetas, configuracion, await logoDeEtiqueta(configuracion))

// Las impresoras USB se anuncian con la clase 7.
const CLASE_IMPRESORA = 7

// La parte de la impresora por donde se le mandan datos: { interfaz, alternativa, salida }.
function buscarSalida(dispositivo) {
  let encontrada = null
  for (const interfaz of dispositivo.configuration.interfaces) {
    for (const alternativa of interfaz.alternates) {
      const salida = alternativa.endpoints.find((punto) => punto.direction === 'out' && punto.type === 'bulk')
      if (!salida) continue
      // Si hay varias, la que dice ser de impresora.
      if (alternativa.interfaceClass === CLASE_IMPRESORA) return { interfaz, alternativa, salida }
      encontrada ??= { interfaz, alternativa, salida }
    }
  }
  return encontrada
}

async function elegirTicketera() {
  const conocidas = await navigator.usb.getDevices()
  if (conocidas.length > 0) return conocidas[0]
  try {
    return await navigator.usb.requestDevice({ filters: [{ classCode: CLASE_IMPRESORA }] })
  } catch (error) {
    if (error.name === 'NotFoundError') {
      throw new Error('No se eligió la ticketera. Fijate que esté prendida y conectada por USB, y probá de nuevo.')
    }
    throw error
  }
}

// bytes: lo que arma servicios/escpos.js.
export async function imprimirEnTicketera(bytes) {
  if (!hayUsb) throw new Error('Este navegador no puede imprimir directo en la ticketera. Abrí el panel en Google Chrome.')
  const dispositivo = await elegirTicketera()

  try {
    if (!dispositivo.opened) await dispositivo.open()
    if (dispositivo.configuration === null) await dispositivo.selectConfiguration(1)
    const encontrada = buscarSalida(dispositivo)
    if (!encontrada) throw new Error('Lo elegido no parece una ticketera.')
    const { interfaz, alternativa, salida } = encontrada

    try {
      await dispositivo.claimInterface(interfaz.interfaceNumber)
    } catch {
      throw new Error(
        'La ticketera está ocupada. Cerrá las otras pestañas del panel y, si la Mac la tiene instalada como impresora, quitala (Ajustes → Impresora).',
      )
    }
    if (interfaz.alternate?.alternateSetting !== alternativa.alternateSetting) {
      await dispositivo.selectAlternateInterface(interfaz.interfaceNumber, alternativa.alternateSetting)
    }

    // En pedazos: algunas ticketeras tienen poca memoria.
    for (let desde = 0; desde < bytes.length; desde += 4096) {
      await dispositivo.transferOut(salida.endpointNumber, bytes.subarray(desde, desde + 4096))
    }
    await dispositivo.releaseInterface(interfaz.interfaceNumber)
  } catch (error) {
    if (error.name === 'NetworkError' || error.name === 'NotFoundError') {
      throw new Error('Se perdió la conexión con la ticketera. Fijate el cable USB y que esté prendida.')
    }
    throw error
  } finally {
    // Se suelta para que la pueda usar otra pestana.
    if (dispositivo.opened) await dispositivo.close().catch(() => {})
  }
}
