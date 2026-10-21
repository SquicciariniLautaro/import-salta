// panel/pistola.js
// La pistola (lector de codigos de barras USB) funciona como un teclado:
// escribe los digitos muy rapido y termina con Enter. Si el cursor esta en un
// campo de texto, los digitos caen ahi y el campo hace lo suyo. Pero si no hay
// ningun campo elegido (lo mas comun: se dispara sin tocar la pantalla), lo
// leido se perdia. Este archivo escucha el teclado de toda la pagina, reconoce
// la rafaga de la pistola y se la pasa a la pantalla que la quiera.
//
// Uso, en un componente que sabe que hacer con un codigo:
//   const zona = usePistola((codigo) => { ... })
//   <div ref={zona}>...</div>
// Si hay una ventana abierta, solo reciben las zonas que estan adentro de
// ella; si hay varias, la que se anoto ultima.
//
// Los tickets impresos traen su propio codigo ("V000012", "S000007"). Ese se
// reconoce en todo el panel, sin importar la pantalla (usePistolaDeTickets),
// salvo con una ventana abierta.

import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { leerCodigoDeTicket } from '../servicios/comprobante.js'

// Una persona no escribe tan rapido: entre tecla y tecla de la pistola pasan
// unos pocos milisegundos.
const PAUSA_MAXIMA_MS = 60
// Un codigo corto (o una tecla suelta) no es una lectura.
const LARGO_MINIMO = 6
// Hay pistolas configuradas sin Enter al final: si despues de un codigo largo
// no llega nada mas, se toma como terminado.
const ESPERA_SIN_ENTER_MS = 150
const LARGO_SIN_ENTER = 14

const oyentes = []
let instalado = false
// Quien abre los tickets leidos (el panel), o null.
let lectorDeTickets = null

// true si la tecla va a un lugar donde se escribe: ahi la pistola escribe sola.
function esCampo(elemento) {
  if (!elemento || elemento === document.body) return false
  if (elemento.isContentEditable) return true
  const etiqueta = elemento.tagName
  if (etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return true
  if (etiqueta !== 'INPUT') return false
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(elemento.type)
}

// A quien le toca: la ultima zona anotada que este dentro de la ventana de
// arriba (o la ultima de todas, si no hay ventanas abiertas).
function elegirOyente() {
  const ventanas = document.querySelectorAll('[role="dialog"]')
  const arriba = ventanas[ventanas.length - 1]
  for (let i = oyentes.length - 1; i >= 0; i -= 1) {
    const zona = oyentes[i].zona.current
    if (!zona || !zona.isConnected) continue
    if (!arriba || arriba.contains(zona)) return oyentes[i]
  }
  return null
}

function instalar() {
  if (instalado) return
  instalado = true

  let leido = ''
  let ultima = 0
  let espera = null

  function entregar() {
    clearTimeout(espera)
    const codigo = leido.trim()
    leido = ''
    if (codigo.length < LARGO_MINIMO) return false
    if (!document.querySelector('[role="dialog"]') && abrirTicketLeido(codigo)) return true
    const oyente = elegirOyente()
    if (!oyente) return false
    oyente.leer(codigo)
    return true
  }

  // "true" al final: se escucha antes que nadie, asi el Enter de la pistola
  // no llega a apretar el boton que tenga el foco.
  window.addEventListener(
    'keydown',
    (evento) => {
      if ((oyentes.length === 0 && !lectorDeTickets) || esCampo(evento.target)) {
        leido = ''
        return
      }
      const ahora = performance.now()
      if (evento.key === 'Enter' || evento.key === 'Tab') {
        if (leido.length >= LARGO_MINIMO && ahora - ultima <= PAUSA_MAXIMA_MS * 2 && entregar()) {
          evento.preventDefault()
          evento.stopPropagation()
        }
        leido = ''
        return
      }
      if (evento.key.length !== 1 || evento.ctrlKey || evento.metaKey || evento.altKey) {
        leido = ''
        return
      }
      // Muy lento para ser la pistola: arranca de nuevo con esta tecla.
      if (ahora - ultima > PAUSA_MAXIMA_MS) leido = ''
      leido += evento.key
      ultima = ahora
      clearTimeout(espera)
      espera = setTimeout(() => {
        if (leido.length >= LARGO_SIN_ENTER) entregar()
        leido = ''
      }, ESPERA_SIN_ENTER_MS)
    },
    true,
  )
}

export function usePistola(alLeer, activa = true) {
  const zona = useRef(null)
  // La ultima version de alLeer, sin tener que volver a anotarse cada vez.
  const funcion = useRef(alLeer)
  useEffect(() => {
    funcion.current = alLeer
  })

  useEffect(() => {
    if (!activa) return undefined
    instalar()
    const oyente = { zona, leer: (codigo) => funcion.current(codigo) }
    oyentes.push(oyente)
    return () => {
      const posicion = oyentes.indexOf(oyente)
      if (posicion >= 0) oyentes.splice(posicion, 1)
    }
  }, [activa])

  return zona
}

// alLeer({ tipo: 'venta' | 'servicio', numero }): se llama al leer el codigo
// de un ticket. Lo usa el panel, una sola vez.
export function usePistolaDeTickets(alLeer) {
  const funcion = useRef(alLeer)
  useEffect(() => {
    funcion.current = alLeer
  })
  useEffect(() => {
    instalar()
    lectorDeTickets = (ticket) => funcion.current(ticket)
    return () => {
      lectorDeTickets = null
    }
  }, [])
}

// Si el codigo es de un ticket, lo abre y devuelve true. Sirve tambien para
// los campos de busqueda, donde la pistola escribe el codigo.
export function abrirTicketLeido(codigo) {
  const ticket = leerCodigoDeTicket(codigo)
  if (!ticket || !lectorDeTickets) return false
  lectorDeTickets(ticket)
  return true
}

// Lo que se dice cuando la pistola o la camara leen un codigo que no es un
// IMEI (una caja trae varios: serie, modelo, codigo de producto).
export function textoNoEsImei(codigo) {
  const texto = String(codigo ?? '').trim()
  const digitos = texto.replace(/\D/g, '').length
  return `Eso no es un IMEI: se leyó "${texto.slice(0, 30)}" (${digitos} dígitos). Apuntá al código de barras que dice IMEI.`
}

export function avisarNoEsImei(codigo) {
  sonar('error')
  toast.error(textoNoEsImei(codigo))
}

// Un pitido para saber sin mirar la pantalla si la lectura entro ('ok': uno
// corto y agudo) o no ('error': dos graves). La pistola pita sola al leer,
// pero eso no dice si el panel acepto el codigo. Si el navegador no deja
// sonar, no pasa nada.
let audio = null
export function sonar(tipo) {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext
    if (!Contexto) return
    audio ??= new Contexto()
    if (audio.state === 'suspended') audio.resume()
    const ahora = audio.currentTime
    // [frecuencia, desde, duracion] en Hz y segundos.
    const tonos = tipo === 'ok' ? [[1400, 0, 0.08]] : [[260, 0, 0.16], [200, 0.2, 0.22]]
    for (const [frecuencia, desde, duracion] of tonos) {
      const oscilador = audio.createOscillator()
      const volumen = audio.createGain()
      oscilador.type = tipo === 'ok' ? 'sine' : 'square'
      oscilador.frequency.value = frecuencia
      volumen.gain.setValueAtTime(0.0001, ahora + desde)
      volumen.gain.exponentialRampToValueAtTime(0.12, ahora + desde + 0.01)
      volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + desde + duracion)
      oscilador.connect(volumen).connect(audio.destination)
      oscilador.start(ahora + desde)
      oscilador.stop(ahora + desde + duracion + 0.02)
    }
  } catch {
    // Sin sonido.
  }
}

// La camara solo sirve en celulares y tablets. En una computadora abre la
// webcam, que no lee codigos de barras: ahi se usa la pistola.
export const HAY_CAMARA_UTIL = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)
