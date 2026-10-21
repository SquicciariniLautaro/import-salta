// video/escena.js
// Se inyecta en cada pagina durante la grabacion del tutorial: un cursor
// visible, subtitulos, carteles de titulo, un WhatsApp de demostracion y un
// menu desplegable dibujado (los <select> del sistema no salen en la captura).
// Todo va en "popovers" para quedar por encima de las ventanas del panel.
(() => {
  if (window.__demo) return
  const D = (window.__demo = {})
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
  D.pausa = pausa

  // En la grabacion no se abre la ventana de impresion ni otra pestana.
  window.print = () => {}
  window.open = (url) => {
    if (url) D.whatsapp(url)
    return null
  }
  // Los botones de WhatsApp del catalogo muestran el mensaje dentro de la pagina.
  document.addEventListener(
    'click',
    (evento) => {
      const enlace = evento.target.closest?.('a[href^="https://wa.me"]')
      if (!enlace) return
      evento.preventDefault()
      D.whatsapp(enlace.href)
    },
    true,
  )

  const ESTILOS = `
    .demo-pop { position: fixed; inset: auto; top: 0; left: 0; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; color: inherit; pointer-events: none; }
    #demo-cursor { width: 28px; height: 28px; transition-property: transform; transition-timing-function: cubic-bezier(.45,.05,.3,1); will-change: transform; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
    #demo-onda { width: 46px; height: 46px; border-radius: 50%; border: 4px solid #c9a96e; opacity: 0; }
    #demo-onda.activa { animation: demo-onda .5s ease-out; }
    @keyframes demo-onda { from { opacity: .9; transform: var(--pos) scale(.3); } to { opacity: 0; transform: var(--pos) scale(1.4); } }
    #demo-leyenda { top: auto; bottom: 22px; left: 50%; transform: translateX(-50%); width: max-content; max-width: 1060px; font-family: Poppins, sans-serif; }
    #demo-leyenda .caja { background: rgba(10,10,12,.94); color: #f5f5f7; padding: 13px 24px 15px; border-radius: 16px; border: 1px solid #c9a96e66; box-shadow: 0 10px 30px rgba(0,0,0,.6); text-align: center; animation: demo-sube .35s ease-out; }
    #demo-leyenda .etiqueta { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #c9a96e; margin-bottom: 4px; }
    #demo-leyenda .texto { font-size: 21px; line-height: 1.38; font-weight: 500; }
    #demo-leyenda b { color: #ffffff; font-weight: 700; text-decoration: underline; text-decoration-color: #c9a96e; text-underline-offset: 4px; }
    #demo-leyenda.lado { bottom: auto; top: 50%; transform: translateY(-50%); }
    #demo-leyenda.lado .caja { text-align: left; padding: 16px 20px; }
    #demo-leyenda.lado .texto { font-size: 18px; }
    @keyframes demo-sube { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    #demo-cartel { inset: 0; width: 100vw; height: 100vh; display: none; place-items: center; text-align: center; background: #000; color: #f5f5f7; font-family: Poppins, sans-serif; }
    #demo-cartel.visible { display: grid; animation: demo-aparece .5s ease-out; }
    #demo-cartel img { height: 92px; margin: 0 auto 22px; display: block; }
    #demo-cartel .titulo { font-size: 54px; font-weight: 600; letter-spacing: -.01em; }
    #demo-cartel .sub { margin-top: 8px; font-size: 24px; font-weight: 500; color: #c9a96e; }
    #demo-cartel .chico { margin-top: 20px; font-size: 16px; color: #9a9aa2; max-width: 820px; }
    @keyframes demo-aparece { from { opacity: 0; } to { opacity: 1; } }
    #demo-wa { inset: 0; width: 100vw; height: 100vh; display: none; place-items: center; background: rgba(0,0,0,.6); font-family: Poppins, sans-serif; }
    #demo-wa.visible { display: grid; place-items: start center; padding-top: 34px; animation: demo-aparece .3s ease-out; }
    #demo-wa .tel { width: 430px; height: 520px; border-radius: 28px; overflow: hidden; background: #0b141a; box-shadow: 0 20px 60px rgba(0,0,0,.6); display: flex; flex-direction: column; border: 8px solid #1b1b1b; }
    #demo-wa .cab { background: #202c33; color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
    #demo-wa .avatar { width: 38px; height: 38px; border-radius: 50%; background: #000; border: 1px solid #444; display: grid; place-items: center; overflow: hidden; }
    #demo-wa .avatar img { width: 22px; }
    #demo-wa .chat { flex: 1; padding: 16px; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; }
    #demo-wa .burbuja { align-self: flex-end; max-width: 92%; background: #005c4b; border-radius: 12px 2px 12px 12px; padding: 10px 12px 20px; font-size: 13.5px; line-height: 1.45; color: #e9edef; white-space: pre-wrap; position: relative; }
    #demo-wa .hora { position: absolute; right: 10px; bottom: 4px; font-size: 11px; color: #9fb3ad; }
    #demo-wa .pie { background: #202c33; padding: 10px; display: flex; gap: 8px; align-items: center; }
    #demo-wa .campo-wa { flex: 1; background: #2a3942; border-radius: 20px; padding: 9px 14px; color: #8696a0; font-size: 14px; }
    #demo-menu { background: #1c1c1f; border: 1px solid #3d3d43; border-radius: 10px; box-shadow: 0 12px 30px rgba(0,0,0,.6); padding: 4px; font-family: Poppins, sans-serif; font-size: 14px; color: #f0f0f2; }
    #demo-menu div { padding: 7px 12px; border-radius: 6px; white-space: nowrap; }
    #demo-menu div.actual { font-weight: 700; }
    #demo-menu div.hover { background: #f5f5f7; color: #000; }
    #demo-marco { border: 3px solid #c9a96e; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(0,0,0,.45); transition: opacity .3s; }
  `

  let cursor, onda, leyenda, cartel, wa, menu, marco
  let x = 640
  let y = 400

  function nuevo(id, html = '') {
    const el = document.createElement('div')
    el.id = id
    el.className = 'demo-pop'
    el.setAttribute('popover', 'manual')
    el.innerHTML = html
    document.body.appendChild(el)
    return el
  }
  const abierto = (el) => el.matches(':popover-open')
  const mostrar = (el) => {
    el.dataset.activo = '1'
    if (!abierto(el)) el.showPopover()
  }
  const ocultar = (el) => {
    el.dataset.activo = '0'
    if (abierto(el)) el.hidePopover()
  }

  function preparar() {
    if (cursor) return
    const estilo = document.createElement('style')
    estilo.textContent = ESTILOS
    document.head.appendChild(estilo)
    menu = nuevo('demo-menu')
    marco = nuevo('demo-marco')
    wa = nuevo('demo-wa')
    cartel = nuevo('demo-cartel')
    leyenda = nuevo('demo-leyenda')
    onda = nuevo('demo-onda')
    cursor = nuevo(
      'demo-cursor',
      `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l15 10.5-6.6 1.3 3.8 7.6-3 1.5-3.8-7.7L4 20z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    )
    cursor.style.transform = `translate(${x}px, ${y}px)`
    mostrar(cursor)
    // Cuando el panel abre una ventana, nuestras capas vuelven a quedar arriba.
    new MutationObserver(() => D.alFrente()).observe(document.body, { childList: true })
  }
  D.preparar = preparar

  // La ventana abierta del panel (la de mas arriba), o null.
  D.dlg = () => [...document.querySelectorAll('[role="dialog"]')].at(-1) || null

  // El subtitulo va al costado de la ventana abierta si hay lugar; si no, abajo.
  function ubicar() {
    if (!leyenda) return
    const ventana = D.dlg()
    const libre = ventana ? ventana.getBoundingClientRect().left - 36 : 0
    const alLado = Boolean(ventana) && libre >= 250
    leyenda.classList.toggle('lado', alLado)
    if (alLado) Object.assign(leyenda.style, { left: '18px', width: `${Math.min(libre, 380)}px`, maxWidth: `${Math.min(libre, 380)}px` })
    else Object.assign(leyenda.style, { left: '', width: '', maxWidth: '' })
  }

  D.alFrente = () => {
    ubicar()
    for (const el of [menu, marco, wa, cartel, leyenda, onda, cursor]) {
      if (el?.dataset.activo === '1') {
        el.hidePopover()
        el.showPopover()
      }
    }
  }

  D.moverA = async (nx, ny, ms) => {
    preparar()
    const d = Math.hypot(nx - x, ny - y)
    const duracion = ms ?? Math.round(Math.min(1000, Math.max(320, 240 + d * 0.65)))
    cursor.style.transitionDuration = `${duracion}ms`
    x = nx
    y = ny
    cursor.style.transform = `translate(${x - 4}px, ${y - 2}px)`
    await pausa(duracion + 50)
  }

  D.onda = () => {
    onda.style.setProperty('--pos', `translate(${x - 23}px, ${y - 23}px)`)
    onda.style.transform = `translate(${x - 23}px, ${y - 23}px)`
    mostrar(onda)
    onda.classList.remove('activa')
    void onda.offsetWidth
    onda.classList.add('activa')
    D.alFrente()
  }

  const buscar = (objetivo) => {
    const el = typeof objetivo === 'function' ? objetivo() : objetivo
    if (!el) throw new Error('No encontré el elemento para la demo')
    return el
  }

  // Lleva el elemento a la vista (dentro de la ventana, si esta en una).
  D.verEn = async (objetivo) => {
    const el = buscar(objetivo)
    const r = el.getBoundingClientRect()
    if (r.top < 90 || r.bottom > innerHeight - 130) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      await pausa(750)
    }
    return el
  }

  D.irA = async (objetivo) => {
    preparar()
    const el = await D.verEn(objetivo)
    const r = el.getBoundingClientRect()
    await D.moverA(r.left + Math.min(r.width / 2, 120), r.top + r.height / 2)
    return el
  }

  D.clic = async (objetivo) => {
    const el = await D.irA(objetivo)
    await pausa(120)
    D.onda()
    el.click()
    await pausa(450)
    return true
  }

  D.foco = async (objetivo) => {
    const el = await D.irA(objetivo)
    D.onda()
    el.focus()
    if ('selectionStart' in el && el.type !== 'number' && el.type !== 'email') el.selectionStart = el.selectionEnd = el.value.length
    await pausa(250)
    return true
  }

  // Desliza la pagina (o la ventana abierta) hasta "top", o "cuanto" mas.
  D.scroll = async (top, { relativo = false, enVentana = false } = {}) => {
    const caja = enVentana ? D.dlg()?.querySelector('.overflow-y-auto') : null
    const destino = caja ?? window
    const actual = caja ? caja.scrollTop : scrollY
    destino.scrollTo({ top: relativo ? actual + top : top, behavior: 'smooth' })
    await pausa(900)
  }

  D.leyenda = (texto, etiqueta = '') => {
    preparar()
    leyenda.innerHTML = `<div class="caja">${etiqueta ? `<div class="etiqueta">${etiqueta}</div>` : ''}<div class="texto">${texto}</div></div>`
    mostrar(leyenda)
    D.alFrente()
  }
  D.sinLeyenda = () => leyenda && ocultar(leyenda)

  D.cartel = (titulo, sub = '', chico = '') => {
    preparar()
    const logo = `${location.origin}/logo-manzana.png`
    cartel.innerHTML = `<div><img src="${logo}" alt=""><div class="titulo">${titulo}</div>${sub ? `<div class="sub">${sub}</div>` : ''}${chico ? `<div class="chico">${chico}</div>` : ''}</div>`
    cartel.classList.add('visible')
    cursor.style.opacity = '0'
    mostrar(cartel)
    D.alFrente()
  }
  D.sinCartel = () => {
    cursor.style.opacity = '1'
    cartel.classList.remove('visible')
    ocultar(cartel)
  }

  D.marcar = (objetivo, margen = 8) => {
    preparar()
    const r = buscar(objetivo).getBoundingClientRect()
    Object.assign(marco.style, {
      transform: `translate(${r.left - margen}px, ${r.top - margen}px)`,
      width: `${r.width + margen * 2}px`,
      height: `${r.height + margen * 2}px`,
    })
    mostrar(marco)
    D.alFrente()
  }
  D.sinMarca = () => marco && ocultar(marco)

  D.whatsapp = (url) => {
    preparar()
    const texto = decodeURIComponent(new URL(url).searchParams.get('text') ?? '')
    const html = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    wa.innerHTML = `<div class="tel">
      <div class="cab"><div class="avatar"><img src="${location.origin}/logo-manzana.png" alt=""></div><div><div style="font-weight:600">Import Salta</div><div style="font-size:12px;opacity:.7">WhatsApp del local</div></div></div>
      <div class="chat"><div class="burbuja">${html}<span class="hora">${hora}</span></div></div>
      <div class="pie"><div class="campo-wa">Mensaje</div></div></div>`
    wa.classList.add('visible')
    mostrar(wa)
    D.alFrente()
  }
  D.sinWhatsapp = () => {
    wa.classList.remove('visible')
    ocultar(wa)
  }

  const valorNativo = (el, valor) => {
    const proto =
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  }
  D.ponerValor = async (objetivo, valor) => {
    const el = await D.irA(objetivo)
    D.onda()
    valorNativo(el, valor)
    await pausa(400)
  }

  // Abre un menu dibujado debajo del <select>, va a la opcion y la elige.
  // "valor" puede ser el value o una parte del texto de la opcion.
  D.elegir = async (objetivo, valor) => {
    const el = await D.irA(objetivo)
    const todas = [...el.options]
    const buscada = todas.find((o) => o.value === String(valor)) || todas.find((o) => o.textContent.includes(String(valor)))
    if (!buscada) throw new Error(`No está la opción ${valor}`)
    D.onda()
    await pausa(150)
    const r = el.getBoundingClientRect()
    let opciones = todas
    if (opciones.length > 9) {
      const i = opciones.indexOf(buscada)
      const desde = Math.max(0, Math.min(i - 4, opciones.length - 9))
      opciones = opciones.slice(desde, desde + 9)
    }
    menu.innerHTML = opciones.map((o, i) => `<div class="${o.value === el.value ? 'actual' : ''}" data-i="${i}">${o.textContent}</div>`).join('')
    const alto = opciones.length * 34 + 10
    const abajo = r.bottom + alto < innerHeight - 10
    Object.assign(menu.style, { transform: `translate(${r.left}px, ${abajo ? r.bottom + 4 : r.top - alto - 4}px)`, minWidth: `${r.width}px` })
    mostrar(menu)
    D.alFrente()
    await pausa(500)
    const fila = menu.querySelector(`[data-i="${opciones.indexOf(buscada)}"]`)
    const rf = fila.getBoundingClientRect()
    await D.moverA(rf.left + 40, rf.top + rf.height / 2)
    fila.classList.add('hover')
    await pausa(250)
    D.onda()
    await pausa(150)
    ocultar(menu)
    valorNativo(el, buscada.value)
    await pausa(500)
  }

  // Firma en un recuadro: el cursor dibuja un garabato y el recuadro recibe
  // los mismos eventos que con el dedo.
  D.firmar = async (objetivo, semilla = 1) => {
    const lienzo = await D.verEn(objetivo)
    const caja = lienzo.getBoundingClientRect()
    const punto = (t) => ({
      x: caja.left + caja.width * (0.12 + t * 0.72),
      y: caja.top + caja.height * (0.5 + 0.2 * Math.sin(t * (9 + semilla * 2)) * (1 - t * 0.4) - 0.08 * Math.sin(t * 3)),
    })
    const enviar = (tipo, p) =>
      lienzo.dispatchEvent(new PointerEvent(tipo, { bubbles: true, cancelable: true, pointerId: 50 + semilla, clientX: p.x, clientY: p.y }))
    const inicio = punto(0)
    await D.moverA(inicio.x, inicio.y)
    enviar('pointerdown', inicio)
    for (let i = 1; i <= 40; i++) {
      const p = punto(i / 40)
      cursor.style.transitionDuration = '0ms'
      x = p.x
      y = p.y
      cursor.style.transform = `translate(${x - 4}px, ${y - 2}px)`
      enviar('pointermove', p)
      await pausa(28)
    }
    enviar('pointerup', punto(1))
    await pausa(300)
  }

  // Busca un elemento visible por su texto: D.el("button", "Agregar", raiz)
  const visible = (e) => e.getClientRects().length > 0
  D.el = (css, texto, raiz = document) =>
    [...(raiz || document).querySelectorAll(css)].find((e) => visible(e) && e.textContent.replace(/\s+/g, ' ').trim().includes(texto))
  // El campo (input, select o textarea) de una etiqueta, dentro de la ventana abierta.
  D.campo = (texto, raiz = D.dlg() || document) => {
    const etiqueta = [...raiz.querySelectorAll('label')].find((l) => visible(l) && l.textContent.replace(/\s+/g, ' ').trim().startsWith(texto))
    return etiqueta?.querySelector('input, select, textarea') || null
  }
  D.pestana = (nombre) => [...document.querySelectorAll('[role="tab"]')].find((b) => visible(b) && b.textContent.includes(nombre))

  D.esperar = async (condicion, ms = 8000) => {
    const fin = Date.now() + ms
    while (Date.now() < fin) {
      try {
        if (condicion()) return true
      } catch {
        // todavia no
      }
      await pausa(100)
    }
    throw new Error('La demo esperó algo que no apareció')
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preparar)
  else preparar()
})()
