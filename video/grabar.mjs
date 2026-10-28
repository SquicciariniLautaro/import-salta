// video/grabar.mjs
// Graba el video guia del sistema de Import Salta para el cliente, punto por
// punto, con su stock y precios de ejemplo (video/datos_video.sql).
//
//   node video/grabar.mjs              (desde la carpeta del proyecto)
//   SIN_VIDEO=1 node video/grabar.mjs  (recorre el guion sin grabar, para probarlo)
//
// Levanta el sitio en modo prueba (la base de mentira dentro del navegador:
// no toca datos reales), abre un Chrome invisible, recorre el catalogo y el
// panel con un cursor y subtitulos (video/escena.js), captura la pantalla y la
// codifica a MP4 con el mismo Chrome (video/codificar.html). No necesita
// instalar nada: usa Node, Chrome y el protocolo de DevTools.
// El video queda en la raiz del proyecto (guia-import-salta.mp4), fuera de git.

import { spawn, execSync } from 'node:child_process'
import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.join(AQUI, '..', 'web')
const PUERTO_APP = 5181
const PUERTO_CDP = 9334
const PUERTO_COD = 5191
const APP = `http://localhost:${PUERTO_APP}`
const TMP = process.env.DEMO_TMP || path.join(os.tmpdir(), 'import-salta-video')
const CUADROS = path.join(TMP, 'cuadros')
const SALIDA = path.join(AQUI, '..', 'guia-import-salta')
const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => p && fs.existsSync(p))

// RITMO estira todas las pausas: el video es para el cliente y tiene que dar
// tiempo a leer cada subtitulo con calma.
const RITMO = 1.2
const dormir = (ms) => new Promise((r) => setTimeout(r, ms * RITMO))
const J = JSON.stringify
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ---------------------------------------------------------------------------
// Procesos: Vite y Chrome
// ---------------------------------------------------------------------------
async function esperarUrl(url, ms = 90_000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    try {
      const r = await fetch(url)
      if (r.ok) return r
    } catch {
      // todavia no
    }
    await dormir(400)
  }
  throw new Error(`No respondió ${url}`)
}

const procesos = []
function matar() {
  for (const p of procesos) {
    try {
      execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' })
    } catch {
      // ya cerro
    }
  }
}
process.on('exit', matar)

// ---------------------------------------------------------------------------
// Cliente minimo del protocolo de DevTools
// ---------------------------------------------------------------------------
let ws
let sesion
let siguienteId = 0
const pendientes = new Map()
const oyentes = new Set()

function enviar(method, params = {}, conSesion = true) {
  const id = ++siguienteId
  return new Promise((ok, mal) => {
    pendientes.set(id, { ok, mal, method })
    ws.send(J({ id, method, params, ...(conSesion && sesion ? { sessionId: sesion } : {}) }))
  })
}

function esperarEvento(nombre, ms = 30_000) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => {
      oyentes.delete(f)
      mal(new Error(`No llegó ${nombre}`))
    }, ms)
    const f = (m) => {
      if (m.method === nombre) {
        clearTimeout(t)
        oyentes.delete(f)
        ok(m.params)
      }
    }
    oyentes.add(f)
  })
}

async function conectar() {
  const { webSocketDebuggerUrl } = await (await esperarUrl(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).json()
  ws = new WebSocket(webSocketDebuggerUrl)
  await new Promise((ok, mal) => {
    ws.onopen = ok
    ws.onerror = mal
  })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pendientes.has(m.id)) {
      const p = pendientes.get(m.id)
      pendientes.delete(m.id)
      if (m.error) p.mal(new Error(`${p.method}: ${m.error.message}`))
      else p.ok(m.result)
    } else {
      for (const f of [...oyentes]) f(m)
    }
  }
}

async function abrirPestana(url) {
  const { targetId } = await enviar('Target.createTarget', { url }, false)
  const r = await enviar('Target.attachToTarget', { targetId, flatten: true }, false)
  sesion = r.sessionId
  return targetId
}

// Evalua codigo en la pagina con el ayudante de la demo a mano (D).
async function d(codigo) {
  const r = await enviar('Runtime.evaluate', {
    expression: `(async () => { const D = window.__demo; D.preparar(); ${codigo} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.exceptionDetails) {
    throw new Error(`En la página: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n${codigo}`)
  }
  return r.result.value
}

async function ir(url) {
  const cargada = esperarEvento('Page.loadEventFired')
  await enviar('Page.navigate', { url })
  await cargada
  await dormir(150)
}

async function escribir(texto, ms = 75) {
  for (const letra of texto) {
    await enviar('Input.insertText', { text: letra })
    await dormir(ms)
  }
}

async function tecla(nombre, codigo) {
  await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: nombre, code: nombre, windowsVirtualKeyCode: codigo })
  await enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: nombre, code: nombre, windowsVirtualKeyCode: codigo })
}

// ---------------------------------------------------------------------------
// Atajos del guion
// ---------------------------------------------------------------------------
const leyenda = (texto, etiqueta = '') => d(`D.leyenda(${J(texto)}, ${J(etiqueta)})`)
const clic = (expr) => d(`await D.clic(() => ${expr})`)
const foco = (expr) => d(`await D.foco(() => ${expr})`)
const irA = (expr) => d(`await D.irA(() => ${expr})`)
const elegir = (expr, valor) => d(`await D.elegir(() => ${expr}, ${J(valor)})`)
const esperar = (expr, ms) => d(`await D.esperar(() => ${expr}, ${ms ?? 10000})`)
const marcar = (expr) => d(`D.marcar(${expr})`)
const sinMarca = () => d(`D.sinMarca()`)
const cartel = (t, s = '', c = '') => d(`D.cartel(${J(t)}, ${J(s)}, ${J(c)})`)
const sinCartel = () => d(`D.sinCartel()`)
const scroll = (top) => d(`await D.scroll(${top})`)
const bajar = (cuanto) => d(`await D.scroll(${cuanto}, { relativo: true })`)
const bajarVentana = (cuanto) => d(`await D.scroll(${cuanto}, { relativo: true, enVentana: true })`)

const VENTANA = 'D.dlg()'
const boton = (texto, raiz = 'document') => `D.el("button", ${J(texto)}, ${raiz})`
const campo = (etiqueta) => `D.campo(${J(etiqueta)})`
const pestana = (nombre) => `D.pestana(${J(nombre)})`
const cerrarVentana = () => clic(`${VENTANA}.querySelector('button[aria-label="Cerrar"]')`)
// Escribe en el campo de una etiqueta de la ventana abierta.
async function completar(etiqueta, texto, ms) {
  await foco(campo(etiqueta))
  await escribir(texto, ms)
}
async function irAPestana(nombre, texto, titulo) {
  await leyenda(texto, titulo)
  await clic(pestana(nombre))
  await dormir(1200)
  await scroll(0)
}

// ---------------------------------------------------------------------------
// Guion
// ---------------------------------------------------------------------------
async function guion() {
  // ---- Presentacion ----
  await ir(`${APP}/`)
  await cartel('Import Salta', 'Guía del sistema, paso a paso', 'El catálogo para tus clientes y el panel del local. Los precios de este video son de ejemplo')
  await dormir(6000)
  await sinCartel()

  // ---- 1. El catalogo ----
  await ir(`${APP}/`)
  await leyenda('Al entrar al catálogo aparece el logo con una animación corta', '1 · El catálogo')
  await dormir(3200)
  await esperar(`document.querySelector('table')`, 20000)
  await leyenda('Es lo que ven los clientes desde el celular o la compu: <b>todo el stock disponible</b>, ordenado por modelo', '1 · El catálogo')
  await dormir(3500)
  await marcar(`document.querySelector('thead')`)
  await leyenda('Cada renglón es un equipo: <b>capacidad y color</b>, la <b>batería</b> y el <b>precio en pesos</b>', '1 · El catálogo')
  await dormir(4200)
  await sinMarca()
  await leyenda('El precio en pesos sale del precio en dólares y del <b>dólar venta</b> del panel: si cambia el dólar, cambia solo', '1 · El catálogo')
  await dormir(4500)
  await marcar(`D.el('p', 'Pagá en hasta').closest('div.flex')`)
  await leyenda('Arriba avisa que se puede pagar <b>en cuotas con tarjeta</b>', 'Cuotas')
  await dormir(4200)
  await sinMarca()
  await leyenda('Debajo de cada equipo se ve la mejor cuota. Con <b>Ver cuotas</b> se ven todos los planes', 'Cuotas')
  await clic(`[...document.querySelectorAll('button')].filter((b) => b.textContent === 'Ver cuotas')[2]`)
  await dormir(4500)
  await leyenda('Cuánto queda cada cuota y el total cuando tiene recargo. Los planes y los recargos los elige el dueño en <b>Ajustes</b>', 'Cuotas')
  await dormir(4500)
  await clic(boton('Ocultar cuotas'))
  await dormir(500)

  await leyenda('El botón verde abre WhatsApp con el mensaje ya escrito: el equipo exacto, la batería y el precio', 'Consultas')
  await clic(`document.querySelectorAll('tbody a[href^="https://wa.me"]')[3]`)
  await dormir(5500)
  await d(`D.sinWhatsapp()`)

  await leyenda('Se puede buscar por modelo, capacidad o color', 'Buscador')
  await foco(`document.querySelector('input[type=search]')`)
  await escribir('13 128', 140)
  await dormir(2500)
  await d(`const c = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, ''); c.dispatchEvent(new Event('input', { bubbles: true }))`)
  await leyenda('En <b>Accesorios</b> están las fundas, cargadores y demás, con precio por cantidad si lo tienen', 'Accesorios')
  await clic(pestana('Accesorios'))
  await dormir(1500)
  await clic(boton('Ver precios por cantidad'))
  await dormir(3500)
  await clic(pestana('Celulares'))
  await dormir(600)
  await leyenda('Abajo: los medios de pago, el WhatsApp y el Instagram del local', 'Catálogo')
  await irA(`D.el('section', 'Medios de pago')`)
  await dormir(3500)
  await leyenda('El candado del pie lleva al panel. Entra solo el dueño (y quien él habilite)', 'Al panel')
  await clic(`document.querySelector('footer a[href$="/admin"]')`)
  await dormir(1500)

  // ---- 2. Ingreso ----
  await esperar(`document.querySelector('input[type=email]')`)
  await leyenda('Se entra con el <b>correo y la contraseña</b> del administrador. En este video es una cuenta de prueba', '2 · Ingreso')
  await foco(`document.querySelector('input[type=email]')`)
  await escribir('facundo@importsalta.test', 45)
  await foco(`document.querySelector('input[type=password]')`)
  await escribir('********', 60)
  await dormir(500)
  await clic(boton('Entrar'))
  await esperar(`${pestana('Celulares')}`, 20000)
  await esperar(`D.el('p', 'TOTAL DE CELULARES') || D.el('p', 'Total de celulares')`, 20000)
  await dormir(1200)

  // ---- 3. Encabezado: el dolar ----
  await marcar(`document.querySelector('header form')`)
  await leyenda('Arriba de todo están las dos cotizaciones del dólar. Los precios se cargan en dólares y el sistema los pasa a pesos', '3 · El dólar')
  await dormir(5500)
  await leyenda('<b>Dólar venta</b>: con este se pasan a pesos los precios del catálogo, las cuotas y lo que se cobra', '3 · El dólar')
  await dormir(5500)
  await leyenda('<b>Dólar costo</b>: el que pagaste al comprar la mercadería. Sirve para ver lo que te costó el stock y la ganancia en pesos. Vacío = igual al de venta', '3 · El dólar')
  await dormir(7000)
  await sinMarca()
  await leyenda('<b>Usar el dólar blue de hoy</b> trae la cotización del día. Después se toca <b>Guardar</b> y todo el catálogo se actualiza', '3 · El dólar')
  await clic(boton('Usar el dólar blue de hoy'))
  await dormir(2500)
  await clic(`document.querySelector('header form button[type=submit]')`)
  await dormir(2500)
  await marcar(`document.querySelector('nav[role=tablist]')`)
  await leyenda('Debajo, las secciones del panel. Vamos una por una, empezando por lo que se configura una sola vez', 'Secciones')
  await dormir(4500)
  await sinMarca()

  // ---- 4. Ajustes ----
  await irAPestana('Ajustes', 'En <b>Ajustes</b> se configura el negocio', '4 · Ajustes')
  await leyenda('Los datos del comercio: salen en cada ticket y en las actas de garantía', '4 · Ajustes')
  await completar('Dirección', 'Av. Belgrano 1234, Salta')
  await completar('Teléfono', '387 479-6029')
  await dormir(1200)
  await leyenda('Los <b>días de garantía</b> que se proponen al vender. Los celulares vienen en 30 días y se pueden cambiar en cada venta', '4 · Ajustes')
  await irA(`D.el('h3', 'Garantías')`)
  await dormir(4500)
  await leyenda('<b>Cuotas con tarjeta</b>: un renglón por plan, con su recargo. 0 % es sin interés. Mientras no haya planes, el catálogo no muestra cuotas', 'Cuotas')
  await irA(`D.el('h3', 'Cuotas con tarjeta')`)
  await dormir(5500)
  await leyenda('Para sumar un plan se toca, por ejemplo, <b>+ 18 cuotas</b> y se escribe el recargo', 'Cuotas')
  await clic(boton('+ 18 cuotas'))
  await dormir(700)
  await d(`window.__plan = [...document.querySelectorAll('li')].find((li) => li.querySelector('input[min="2"]')?.value === '18')`)
  await foco(`window.__plan.querySelector('input[step="0.01"]')`)
  await d(`document.execCommand('selectAll')`)
  await escribir('50', 200)
  await dormir(2200)
  await leyenda('Debajo de cada plan se ve un ejemplo de cuánto queda la cuota', 'Cuotas')
  await dormir(3500)
  await leyenda('<b>Acta de entrega y garantía</b>: los puntos que se revisan con el cliente al entregar un celular. Se suben, se bajan, se sacan o se agregan', 'Acta')
  await irA(`D.el('h3', 'Acta de entrega y garantía')`)
  await bajar(260)
  await dormir(5000)
  await foco(`document.querySelector('input[aria-label="Punto nuevo de la revisión"]')`)
  await escribir('Linterna')
  await clic(`document.querySelector('input[aria-label="Punto nuevo de la revisión"]').nextElementSibling`)
  await dormir(1500)
  await leyenda('Y las <b>condiciones de la garantía</b> que firma el cliente. Cada acta guarda las del día en que se firmó', 'Acta')
  await irA(`D.campo('Condiciones de la garantía (salen', document)`)
  await dormir(5000)
  await leyenda('También: avisos de poco stock y el tamaño del papel de la impresora, con un ticket de prueba', '4 · Ajustes')
  await irA(`D.el('h3', 'Impresora')`)
  await dormir(4500)
  await leyenda('Todo se guarda con <b>Guardar ajustes</b>', '4 · Ajustes')
  await clic(boton('Guardar ajustes'))
  await dormir(2500)
  await leyenda('Abajo están las <b>listas de los desplegables</b>: modelos, capacidades, colores y quiénes atienden', 'Listas')
  await irA(`D.el('h3', 'Listas de opciones')`)
  await dormir(2500)
  await clic(`D.el('[role=tablist] button', 'Vendedores') || D.el('[role=tablist] button', 'Quién')`)
  await dormir(800)
  await leyenda('En <b>Vendedores</b> se carga quién atiende: sale en el ticket y en el acta', 'Listas')
  await foco(`document.querySelector('input[aria-label="Opción nueva"]')`)
  await escribir('FACUNDO')
  await clic(boton('Agregar', `document.querySelector('input[aria-label="Opción nueva"]').closest('form')`))
  await dormir(2500)

  // ---- 5. Stock ----
  await irAPestana('Celulares', 'En <b>Celulares</b> está el stock. Arriba, cuántos equipos hay y cuánto vale el local, al costo y a precio de venta', '5 · Stock')
  await marcar(`D.el('p', 'Costo del local').closest('.tarjeta')`)
  await dormir(3500)
  await leyenda('El <b>costo</b> se pasa a pesos con el dólar costo; el <b>minorista</b>, con el dólar venta', '5 · Stock')
  await dormir(4500)
  await sinMarca()

  // Lo que mas va a usar al principio: ponerle precio a lo que ya esta cargado.
  await leyenda('Lo más importante: <b>el precio</b>. Un equipo con precio 0 <b>no aparece en el catálogo</b>, como este iPhone 13 mini', 'Poner precio')
  await clic(`D.el('button', 'iPhone 13 MINI')`)
  await dormir(900)
  await clic(`D.el('button', 'iPhone 13 MINI').parentElement.querySelectorAll('button')[1]`)
  await dormir(1500)
  await leyenda('Se abre el modelo y se toca <b>Editar</b>', 'Poner precio')
  await clic(`[...D.el('button', 'iPhone 13 MINI').parentElement.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Editar')`)
  await esperar(VENTANA)
  await dormir(1000)
  await leyenda('Se escribe el <b>precio en dólares</b> (y el costo, si cambió). Debajo se ve cuánto da en pesos', 'Poner precio')
  await foco(campo('Precio minorista (USD)'))
  await d(`document.execCommand('selectAll')`)
  await escribir('400', 220)
  await dormir(2500)
  await clic(boton('Guardar cambios', VENTANA))
  await dormir(1800)
  await leyenda('Listo: desde ahora <b>aparece en el catálogo</b>, con su precio en pesos y sus cuotas', 'Poner precio')
  await dormir(4500)

  await leyenda('Para cargar equipos nuevos: <b>+ Ingresar</b>', 'Cargar stock')
  await scroll(0)
  await clic(boton('+ Ingresar'))
  await esperar(VENTANA)
  await dormir(800)
  await leyenda('Se elige el modelo, la capacidad y el color de las listas, o se escribe uno nuevo con <b>Otro</b>', 'Cargar stock')
  await elegir(campo('Modelo'), 'IPHONE 15 PRO')
  await elegir(campo('Capacidad'), '256GB')
  await elegir(campo('Color'), 'Otro (escribir)')
  await foco(`D.dlg().querySelector('input[aria-label="Otro valor"]')`)
  await escribir('TITANIO AZUL')
  await completar('Batería', '92%')
  await dormir(500)
  await leyenda('El costo y el precio van <b>en dólares</b>. Debajo de cada uno se ve cuánto da en pesos', 'Cargar stock')
  await completar('Costo por unidad (USD)', '720')
  await completar('Precio minorista (USD)', '850')
  await dormir(1800)
  await leyenda('Cada equipo puede llevar su <b>IMEI</b>: se escribe o se lee con la pistola o la cámara del celular', 'Cargar stock')
  await foco(`D.dlg().querySelector('input[aria-label="IMEI"]') || D.dlg().querySelector('input[inputmode="numeric"]:not([aria-label="Cantidad"])')`)
  await escribir('356789104455661', 45)
  await tecla('Enter', 13)
  await dormir(1500)
  await leyenda('Y de qué proveedor vino, para las garantías y las cuentas', 'Cargar stock')
  await elegir(campo('Proveedor'), 'Otro (escribir)')
  await foco(`[...D.dlg().querySelectorAll('input[aria-label="Otro valor"]')].at(-1)`)
  await escribir('MAYORISTA CENTRO')
  await dormir(800)
  await clic(`D.dlg().querySelector('button[type=submit]')`)
  await dormir(2500)

  await leyenda('Cada modelo se abre para ver sus equipos', '5 · Stock')
  await clic(`D.el('button', 'iPhone 15 PRO')`)
  await dormir(1000)
  await clic(`D.el('button', 'iPhone 15 PRO').parentElement.querySelectorAll('button')[1]`)
  await dormir(1200)
  await leyenda('Costo, precio y <b>ganancia por equipo</b>. Desde acá se vende, se seña, se edita, se cargan IMEI y se imprimen etiquetas', '5 · Stock')
  await marcar(`D.el('button', 'Vendido').parentElement.parentElement`)
  await dormir(5500)
  await sinMarca()

  // ---- 6. Vender con tarjeta en cuotas ----
  await leyenda('Para vender: <b>Vendido</b>', '6 · Vender')
  await clic(boton('Vendido'))
  await esperar(VENTANA)
  await dormir(900)
  await leyenda('El precio arranca en el publicado y se puede cambiar. También se suman los accesorios que se lleva', '6 · Vender')
  await dormir(3500)
  await completar('Cliente', 'Lucía Gómez')
  await completar('Teléfono', '387 555-1234')
  await leyenda('La <b>garantía</b>: 30 días o la que se elija', '6 · Vender')
  await irA(boton('30 días', VENTANA))
  await dormir(2500)
  await leyenda('Cómo paga: efectivo, transferencia, las dos, o <b>tarjeta o QR</b>', '6 · Vender')
  await elegir(campo('Cómo paga'), 'tarjeta')
  await dormir(800)
  await leyenda('Con tarjeta se eligen las cuotas: el panel dice <b>cuánto cobrar con tarjeta o QR</b> y de cuánto queda cada cuota', '6 · Vender')
  await elegir(campo('Cuotas'), '6')
  await irA(`D.el('p', 'Cobrar con tarjeta o QR', D.dlg())`)
  await dormir(5500)
  await leyenda('En la venta queda el precio de lista: el recargo es lo que cobra el banco por financiar', '6 · Vender')
  await dormir(4500)
  await clic(boton('Registrar venta', VENTANA))
  await esperar(`D.el('h2', 'Venta registrada')`)
  await dormir(1000)
  await leyenda('Venta registrada. Se puede imprimir el <b>ticket</b>, que dice las cuotas…', '6 · Vender')
  await clic(boton('Ticket', VENTANA))
  await esperar(`D.dlg()?.querySelector('.ticket')`)
  await dormir(4500)
  await clic(boton('Cerrar', VENTANA))
  await dormir(800)

  // ---- 7. Acta de entrega y garantia ----
  await marcar(`D.el('p', 'Antes de entregar', D.dlg()).parentElement`)
  await leyenda('…y antes de entregar el equipo se hace el <b>acta de garantía</b>, con el cliente adelante', '7 · Acta firmada')
  await dormir(4000)
  await sinMarca()
  await clic(boton('Hacer el acta', VENTANA))
  await esperar(`D.el('h2', 'Acta de entrega y garantía')`)
  await dormir(1500)
  await leyenda('El equipo, el IMEI y la garantía salen de la venta. Se completan los datos del cliente', '7 · Acta firmada')
  await completar('DNI', '35123456')
  await dormir(1000)
  await leyenda('Se revisa cada punto junto al cliente: <b>Funciona</b>, <b>Con detalle</b> o <b>No aplica</b>', '7 · Acta firmada')
  await irA(`D.dlg().querySelector('[role=radiogroup]')`)
  await clic(`D.dlg().querySelector('[role=radiogroup] [role=radio]')`)
  await clic(`[...D.dlg().querySelectorAll('[role=radiogroup]')][1].querySelector('[role=radio]')`)
  await clic(`[...D.dlg().querySelectorAll('[role=radiogroup]')][2].querySelector('[role=radio]')`)
  await dormir(600)
  await leyenda('Si algo tiene un detalle, <b>hay que escribir cuál</b>: queda por escrito para evitar problemas después', '7 · Acta firmada')
  await clic(`[...D.dlg().querySelectorAll('[role=radiogroup]')].find((g) => g.getAttribute('aria-label').startsWith('Batería')).querySelectorAll('[role=radio]')[1]`)
  await foco(`D.dlg().querySelector('input[aria-label^="Detalle de Batería"]')`)
  await escribir('Condición 92 %, con un ciclo de carga')
  await dormir(1500)
  await leyenda('Con <b>Marcar el resto como Funciona</b> se completan los que quedan', '7 · Acta firmada')
  await clic(boton('Marcar el resto como Funciona', VENTANA))
  await dormir(2000)
  await leyenda('Sin la revisión completa y <b>sin las dos firmas</b>, el acta no se puede guardar', '7 · Acta firmada')
  await irA(`D.dlg().querySelector('canvas')`)
  await dormir(3000)
  await leyenda('Firma el cliente con el dedo en el celular, o con el mouse en la compu…', '7 · Acta firmada')
  await d(`await D.firmar(() => D.dlg().querySelectorAll('canvas')[0], 1)`)
  await dormir(800)
  await leyenda('…y firma el vendedor', '7 · Acta firmada')
  await d(`await D.firmar(() => D.dlg().querySelectorAll('canvas')[1], 2)`)
  await dormir(1200)
  await clic(boton('Guardar acta firmada', VENTANA))
  await esperar(`D.dlg()?.querySelector('.acta')`)
  await dormir(1500)
  await leyenda('El acta se imprime en una hoja A4 (o se guarda en PDF): una copia para el cliente y otra para el local', '7 · Acta firmada')
  await dormir(4500)
  await d(`const c = D.dlg().querySelector('.overflow-auto'); c.scrollTo({ top: c.scrollHeight / 2, behavior: 'smooth' })`)
  await dormir(3500)
  await d(`const c = D.dlg().querySelector('.overflow-auto'); c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })`)
  await leyenda('Con la revisión punto por punto, las condiciones y las <b>dos firmas</b>. Una vez guardada no se puede cambiar', '7 · Acta firmada')
  await dormir(5500)
  await cerrarVentana()
  await dormir(800)
  await clic(boton('Listo', VENTANA))
  await dormir(1500)

  // ---- 8. Garantias ----
  await irAPestana('Garantías', 'En <b>Garantías</b> están todos los equipos vendidos que siguen en garantía', '8 · Garantías')
  await marcar(`D.el('p', 'Sin acta firmada').closest('.tarjeta')`)
  await leyenda('Arriba se cuentan los celulares vendidos que <b>todavía no tienen su acta firmada</b>', '8 · Garantías')
  await dormir(4500)
  await sinMarca()
  await leyenda('Cada uno dice cuántos días le quedan. Desde acá se ve o se reimprime el acta, se abre un reclamo o se manda al proveedor', '8 · Garantías')
  await irA(`D.el('button', 'Ver e imprimir el acta')`)
  await dormir(6000)
  await leyenda('Si se vendió un equipo por fuera del panel, igual se le puede hacer el acta desde acá', '8 · Garantías')
  await irA(boton('Acta de un equipo que no se vendió por el panel'))
  await dormir(4000)

  // ---- 9. Ventas ----
  await irAPestana('Ventas', 'En <b>Ventas</b>: lo cobrado y la ganancia de cada mes, con un gráfico', '9 · Ventas')
  await esperar(`D.el('h2, h3, p', 'Historial')`, 15000)
  await dormir(4500)
  await leyenda('La ganancia de cada venta: el precio al <b>dólar venta</b> menos el costo al <b>dólar costo</b>, los dos del día en que se vendió', '9 · Ventas')
  await dormir(5000)
  await leyenda('Abajo, el historial: cada venta con su cliente y cómo pagó. Se busca por IMEI o cliente y se baja a Excel', '9 · Ventas')
  await irA(`D.el('h2, h3, p', 'Historial')`)
  await bajar(250)
  await dormir(5000)

  // ---- 10. Caja ----
  await irAPestana('Caja', 'En <b>Caja</b> está toda la plata que entra y sale', '10 · Caja')
  await marcar(`D.el('p', 'Efectivo en caja').closest('.grid')`)
  await leyenda('Lo que tendría que haber en efectivo y lo que entró <b>al banco</b>: transferencias y tarjeta', '10 · Caja')
  await dormir(5000)
  await sinMarca()
  await leyenda('Las ventas entran solas. Los gastos y otros ingresos se anotan con <b>+ Gasto</b> e <b>+ Ingreso</b>', '10 · Caja')
  await clic(boton('+ Gasto'))
  await esperar(VENTANA)
  await elegir(campo('Categoría'), 'Otro (escribir)')
  await foco(`D.dlg().querySelector('input[aria-label="Otro valor"]')`)
  await escribir('ALQUILER')
  await completar('Monto ($)', '350000')
  await dormir(1000)
  await clic(`D.dlg().querySelector('button[type=submit]')`)
  await dormir(2500)
  await leyenda('Se filtra por día, semana o mes, y se exporta para Excel', '10 · Caja')
  await clic(boton('Este mes'))
  await dormir(3500)

  // ---- 11. Clientes ----
  await irAPestana('Clientes', 'En <b>Clientes</b> queda registrado cada comprador, con sus compras y lo que debe', '11 · Clientes')
  await dormir(4000)
  await leyenda('Si una venta queda debiendo una parte, la deuda pasa a la cuenta del cliente y se registran los pagos', '11 · Clientes')
  await dormir(4500)

  // ---- 12. Revendedores y senas ----
  await irAPestana('Revendedores', 'En <b>Revendedores</b>: los equipos que se llevan para vender, lo que entregaron y lo que deben', '12 · Revendedores y señas')
  await dormir(4500)
  await irAPestana('Señas', 'En <b>Señas</b>: los equipos reservados con una seña y lo que falta pagar', '12 · Revendedores y señas')
  await dormir(4000)

  // ---- 13. Servicio tecnico ----
  await irAPestana('Servicio', 'En <b>Servicio técnico</b> se anotan los equipos que entran a reparar', '13 · Servicio técnico')
  await clic(boton('+ Orden'))
  await esperar(VENTANA)
  await completar('Cliente', 'Martín Ruiz')
  await completar('Equipo', 'IPHONE 12 NEGRO')
  await completar('Falla que cuenta el cliente', 'No carga')
  await dormir(800)
  await leyenda('La orden lleva presupuesto, estado y se imprime para el cliente. Al entregarla se cobra y queda en la caja', '13 · Servicio técnico')
  await dormir(4000)
  await clic(boton('Crear orden', VENTANA))
  await dormir(2500)

  // ---- 14. Proveedores ----
  await irAPestana('Proveedores', 'En <b>Proveedores</b>: a quién se le compra, qué se le compró y cuánto se le debe', '14 · Proveedores')
  await dormir(4500)

  // ---- 15. Otras cargas ----
  await irAPestana('Celulares', 'Por último, en Celulares hay dos cargas más', '15 · Más')
  await leyenda('<b>+ Lote proveedor</b>: varios modelos de una misma compra de una vez, con los IMEI', '15 · Más')
  await irA(boton('+ Lote proveedor'))
  await dormir(4000)
  await leyenda('<b>Permuta</b>: el cliente entrega su equipo como parte de pago. El usado entra al stock y se cobra la diferencia', '15 · Más')
  await irA(boton('Permuta'))
  await dormir(4500)
  await d(`D.sinLeyenda()`)

  await cartel('import-salta.vercel.app', 'Catálogo: la dirección de siempre · Panel: /admin', 'Cualquier duda, escribinos. Desarrollado por Lambda Soluciones Digitales')
  await dormir(7000)
}

// ---------------------------------------------------------------------------
// Codificacion: los cuadros pasan por un canvas y MediaRecorder
// ---------------------------------------------------------------------------
function servidorCodificador(lista, alTerminar) {
  return createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (req.method === 'POST') {
      const partes = []
      req.on('data', (p) => partes.push(p))
      req.on('end', () => {
        res.end('ok')
        alTerminar(u.pathname, Buffer.concat(partes), u.searchParams.get('tipo'))
      })
      return
    }
    if (u.pathname === '/codificar.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.end(fs.readFileSync(path.join(AQUI, 'codificar.html')))
    }
    if (u.pathname === '/cuadros.json') {
      res.setHeader('Content-Type', 'application/json')
      return res.end(J(lista))
    }
    if (u.pathname.startsWith('/cuadros/')) {
      res.setHeader('Content-Type', 'image/jpeg')
      return res.end(fs.readFileSync(path.join(CUADROS, path.basename(u.pathname))))
    }
    res.statusCode = 404
    res.end()
  })
}

// ---------------------------------------------------------------------------
async function principal() {
  if (!CHROME) throw new Error('No encontré Chrome ni Edge instalados.')
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(CUADROS, { recursive: true })

  log('Levantando el sitio en modo prueba…')
  // VITE_SEMILLA=video: la base de mentira arranca con el stock del cliente (ver pruebas/modoPrueba.js).
  const vite = spawn(`npx vite --mode prueba --port ${PUERTO_APP} --strictPort`, {
    cwd: WEB,
    shell: true,
    stdio: 'ignore',
    env: { ...process.env, VITE_SEMILLA: 'video' },
  })
  procesos.push(vite)
  await esperarUrl(APP)

  log('Abriendo Chrome invisible…')
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PUERTO_CDP}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${path.join(TMP, 'perfil')}`,
      '--window-size=1280,720',
      '--hide-scrollbars',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=es-AR',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  procesos.push(chrome)
  await conectar()

  const pestanaApp = await abrirPestana('about:blank')
  await enviar('Page.enable')
  await enviar('Runtime.enable')
  await enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await enviar('Emulation.setTimezoneOverride', { timezoneId: 'America/Argentina/Buenos_Aires' })
  await enviar('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(AQUI, 'escena.js'), 'utf8') })

  // Una primera carga para que Vite prepare todo (la primera vez tarda).
  await ir(`${APP}/`)
  await dormir(6000)

  // Captura de pantalla continua.
  const cuadros = []
  oyentes.add((m) => {
    if (m.method !== 'Page.screencastFrame') return
    const { data, metadata, sessionId } = m.params
    const f = `${String(cuadros.length).padStart(6, '0')}.jpg`
    fs.writeFileSync(path.join(CUADROS, f), Buffer.from(data, 'base64'))
    cuadros.push({ f, t: metadata.timestamp })
    enviar('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  if (!process.env.SIN_VIDEO) await enviar('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 })

  log('Grabando el recorrido…')
  const inicio = Date.now()
  try {
    await guion()
  } finally {
    await enviar('Page.stopScreencast').catch(() => {})
  }
  const fin = Date.now()
  if (process.env.SIN_VIDEO) return log(`Recorrido OK en ${((fin - inicio) / 1000).toFixed(0)} s (sin video).`)
  if (cuadros.length === 0) throw new Error('No se capturó ningún cuadro.')
  const t0 = cuadros[0].t
  const lista = { cuadros: cuadros.map((c) => ({ f: c.f, t: c.t - t0 })), fin: (fin - inicio) / 1000 }
  lista.fin = Math.max(lista.fin, lista.cuadros.at(-1).t + 0.5)
  log(`Capturados ${cuadros.length} cuadros (${lista.fin.toFixed(1)} s). Codificando en tiempo real…`)
  await enviar('Target.closeTarget', { targetId: pestanaApp }, false)

  const resultado = await new Promise((ok, mal) => {
    const servidor = servidorCodificador(lista, (ruta, cuerpo, tipo) => {
      servidor.close()
      if (ruta === '/error') mal(new Error(`Codificador: ${cuerpo}`))
      else ok({ cuerpo, tipo })
    })
    servidor.listen(PUERTO_COD, () => abrirPestana(`http://127.0.0.1:${PUERTO_COD}/codificar.html`).catch(mal))
  })
  const extension = resultado.tipo.includes('mp4') ? 'mp4' : 'webm'
  const archivo = `${SALIDA}.${extension}`
  fs.writeFileSync(archivo, resultado.cuerpo)
  // MediaRecorder deja la duracion en 0: se escribe para que se vea la barra de tiempo.
  if (extension === 'mp4') execSync(`node "${path.join(AQUI, 'fijar-duracion.mjs')}" "${archivo}"`, { stdio: 'inherit' })
  log(`Listo: ${archivo} (${(resultado.cuerpo.length / 1e6).toFixed(1)} MB, ${resultado.tipo})`)
}

principal()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => {
    try {
      ws?.close()
    } catch {
      // nada
    }
    matar()
    setTimeout(() => process.exit(), 500)
  })
