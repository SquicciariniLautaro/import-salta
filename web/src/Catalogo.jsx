// Catalogo.jsx
// Catalogo publico: lo ve cualquiera, sin iniciar sesion. Muestra el stock
// disponible con precios en pesos, cuanto queda cada cuota si se paga con
// tarjeta en el local, y lleva cada consulta a WhatsApp.
//
// El formato es el que pidio el cliente: una tabla por familia (iPhone 13,
// iPhone 14 Pro...) con un renglon por equipo: capacidad y color, bateria,
// precio y el boton de WhatsApp. Fondo negro y letras blancas.
// Al entrar aparece el logo con una animacion corta (ver "Portada").
// Si algun producto tiene foto, cada renglon lleva una miniatura que, al
// tocarla, muestra la foto grande.
//
// Pensado primero para 360 px de ancho: las tablas son de ancho fijo
// (table-fixed) con columnas chicas de medida conocida, para que nunca haya
// que deslizar hacia los costados.

import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { obtenerCatalogo } from './api.js'
import { NEGOCIO, rutaPublica } from './negocio.js'
import { aPesos, enlaceAccesorio, enlaceCelular, normalizar, pesos, precioSegunCantidad } from './formato.js'
import { agruparPorFamilia, tituloDeFamilia } from './servicios/stock.js'
import { cuotasDe, planMasLargo, planesPara } from './servicios/cuotas.js'
import PuntoColor from './componentes/PuntoColor.jsx'
import Foto from './componentes/Foto.jsx'
import Pie from './componentes/Pie.jsx'

const PESTANAS = [
  { id: 'celulares', nombre: 'Celulares' },
  { id: 'accesorios', nombre: 'Accesorios' },
]

// La portada se muestra una sola vez por visita: si se va al panel y se
// vuelve, no se repite.
let portadaVista = false

// Un lote coincide con la busqueda si contiene TODAS las palabras escritas,
// en cualquier orden y sin importar tildes ni mayusculas.
function coincide(lote, palabras) {
  const texto = normalizar(
    [lote.tipo, lote.modelo, lote.capacidad, lote.color, lote.bateria, lote.detalles].join(' '),
  )
  return palabras.every((palabra) => texto.includes(palabra))
}

// --- Iconos (dibujos de linea, sin emojis) ------------------------------------

function IconoWhatsApp({ clase = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} aria-hidden="true">
      <path
        d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.3 7.6c-.3 0-.7.1-1 .5-.4.5-.9 1.2-.7 2.4.3 1.5 1.4 3.1 3.1 4.3 1.6 1.1 2.9 1.4 3.8 1.1.7-.2 1.3-.8 1.5-1.4.1-.4 0-.7-.3-.9l-1.5-.8c-.3-.2-.7-.1-.9.2l-.5.6c-1.1-.5-2-1.3-2.6-2.4l.5-.6c.2-.3.3-.6.1-.9l-.7-1.6c-.1-.3-.4-.5-.8-.5z"
        fill="currentColor"
      />
    </svg>
  )
}

function IconoTarjeta({ clase = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19M6 15h4" strokeLinecap="round" />
    </svg>
  )
}

function IconoInstagram({ clase = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
    </svg>
  )
}

function IconoEscudo({ clase = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconoFoto({ clase = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={clase} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" strokeLinejoin="round" />
    </svg>
  )
}

// Boton redondo verde que abre WhatsApp con el mensaje armado.
function BotonWhatsApp({ enlace, descripcion }) {
  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Consultar por WhatsApp: ${descripcion}`}
      className="boton boton-verde h-9 w-9 rounded-full p-0"
    >
      <IconoWhatsApp />
    </a>
  )
}

// --- Fotos -------------------------------------------------------------------

// Cuadro chico al principio del renglon. Sin foto queda un cuadro vacio, para
// que los nombres de la tabla sigan alineados.
function Miniatura({ url, titulo }) {
  const [abierta, setAbierta] = useState(false)
  if (!url) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-borde bg-superficie text-neutral-300" aria-hidden="true">
        <IconoFoto />
      </span>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={`Ver la foto: ${titulo}`}
        className="h-11 w-11 shrink-0 cursor-zoom-in overflow-hidden rounded-lg border border-borde"
      >
        <Foto url={url} ancho={44} alto={44} className="h-full w-full" />
      </button>
      {abierta && <VisorDeFoto url={url} titulo={titulo} alCerrar={() => setAbierta(false)} />}
    </>
  )
}

// La foto grande sobre fondo negro. Se cierra tocando en cualquier lado o con Escape.
function VisorDeFoto({ url, titulo, alCerrar }) {
  useEffect(() => {
    const alTeclear = (evento) => evento.key === 'Escape' && alCerrar()
    document.addEventListener('keydown', alTeclear)
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = anterior
    }
  }, [alCerrar])

  // Se dibuja colgada de <body> (ver la nota de componentes/Modal.jsx).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={alCerrar}
      className="animate-aparecer fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center bg-negro/95 p-4"
    >
      <button type="button" aria-label="Cerrar" className="absolute top-3 right-3 rounded-full p-2 text-neutral-500 hover:text-blanco">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <Foto url={url} ancho={800} alt={titulo} className="h-auto max-h-[78vh] w-auto max-w-full rounded-xl" />
      <p className="mt-3 max-w-full text-center text-sm font-medium break-words text-blanco">{titulo}</p>
    </div>,
    document.body,
  )
}

// --- Portada ------------------------------------------------------------------

// El logo aparece al entrar: la manzana sube apenas y crece un poco, despues el
// nombre, y en un segundo y medio la portada se desvanece (ver index.css).
// Mientras tanto el catalogo ya se esta cargando por debajo.
function Portada() {
  const [visible, setVisible] = useState(!portadaVista)

  useEffect(() => {
    portadaVista = true
    // La animacion la esconde sola; esto la saca de la pagina cuando termina.
    const reloj = setTimeout(() => setVisible(false), 2200)
    return () => clearTimeout(reloj)
  }, [])

  if (!visible) return null
  return (
    <div className="portada fixed inset-0 z-50 flex flex-col items-center justify-center bg-negro" aria-hidden="true">
      <img src={rutaPublica('logo-manzana.png')} alt="" className="portada-manzana h-24 w-auto sm:h-28" />
      <img src={rutaPublica('logo-texto.png')} alt="" className="portada-nombre mt-6 h-7 w-auto sm:h-8" />
    </div>
  )
}

// --- Encabezado ---------------------------------------------------------------

function Encabezado({ conRetraso }) {
  return (
    <header className={`border-b border-borde px-4 pt-4 pb-3 text-center ${conRetraso ? 'encabezado-logo' : ''}`}>
      <h1 className="flex flex-col items-center gap-2">
        <img src={rutaPublica('logo-manzana.png')} alt="" className="h-11 w-auto" />
        <img src={rutaPublica('logo-texto.png')} alt={NEGOCIO.nombre} className="h-5 w-auto" />
      </h1>
      <p className="mt-2 text-xs text-neutral-500">
        {NEGOCIO.lema} · {NEGOCIO.ubicacion}
      </p>
    </header>
  )
}

// Aviso de que se puede pagar en cuotas. Solo aparece si el dueno cargo planes.
function AvisoCuotas({ cuotas }) {
  const largo = planMasLargo(cuotas.planes)
  if (!largo) return null
  const largoSinInteres = planMasLargo(cuotas.planes.filter((plan) => !(plan.recargo > 0)))

  return (
    <div className="flex items-start gap-3 border-b border-borde px-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-oro/40 text-oro">
        <IconoTarjeta />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-blanco">
          Pagá en hasta {largo.cuotas} cuotas
          {largoSinInteres && <span className="text-verde"> · {largoSinInteres.cuotas} sin interés</span>}
        </p>
        <p className="text-xs break-words text-neutral-500">
          {cuotas.leyenda || `Con tarjeta de crédito, en el local, con posnet ${NEGOCIO.posnet}.`}
        </p>
      </div>
    </div>
  )
}

// --- Cuotas de un renglon -----------------------------------------------------

// Lo que se ve debajo del equipo: la mejor cuota a la vista (la mas larga sin
// interes o, si no hay, la mas larga) y "Ver cuotas" para ver todas.
function ResumenCuotas({ precioArs, planes, abierto, alAlternar }) {
  if (planes.length === 0 || !(precioArs > 0)) return null
  const lista = cuotasDe(precioArs, planes)
  const sinInteres = lista.filter((plan) => plan.sin_interes)
  const destacada = sinInteres.length > 0 ? sinInteres[sinInteres.length - 1] : lista[lista.length - 1]

  return (
    <p className="mt-0.5 text-[11px] leading-snug">
      <span className={destacada.sin_interes ? 'text-verde' : 'text-neutral-600'}>
        {destacada.cuotas} cuotas{destacada.sin_interes ? ' sin interés' : ''} de{' '}
        <span className="whitespace-nowrap">{pesos(destacada.cuota_ars)}</span>
      </span>
      {lista.length > 1 && (
        <>
          {' · '}
          <button type="button" onClick={alAlternar} aria-expanded={abierto} className="enlace-raya font-medium text-azul">
            {abierto ? 'Ocultar cuotas' : 'Ver cuotas'}
          </button>
        </>
      )}
    </p>
  )
}

// Todas las cuotas de un precio: cuanto queda cada una y el total con recargo.
function DetalleCuotas({ precioArs, planes }) {
  return (
    <div className="animate-aparecer rounded-lg border border-borde bg-superficie px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] text-neutral-500 uppercase">
        <IconoTarjeta clase="h-3.5 w-3.5" />
        Cuotas con tarjeta · en el local
      </p>
      <ul className="mt-1.5 space-y-1">
        {cuotasDe(precioArs, planes).map((plan) => (
          <li key={plan.cuotas} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 text-neutral-700">
              {plan.cuotas} cuotas
              {plan.sin_interes && <span className="ml-1.5 text-xs font-medium text-verde">sin interés</span>}
            </span>
            <span className="shrink-0 text-right whitespace-nowrap">
              <span className="font-semibold text-blanco">{pesos(plan.cuota_ars)}</span>
              {!plan.sin_interes && <span className="ml-2 text-[11px] text-neutral-500">total {pesos(plan.total_ars)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- Tablas -------------------------------------------------------------------

// Renglon que separa una familia de la siguiente.
function Separador({ titulo, columnas }) {
  return (
    <tr>
      <th
        colSpan={columnas}
        scope="colgroup"
        className="border-y border-borde bg-superficie px-3 py-1.5 text-left text-sm font-semibold break-words text-blanco shadow-[inset_3px_0_0_var(--color-oro)]"
      >
        {titulo}
      </th>
    </tr>
  )
}

function TablaCelulares({ lotes, catalogo }) {
  const grupos = agruparPorFamilia(lotes)
  const planes = planesPara('celulares', catalogo.cuotas)
  const conFotos = lotes.some((lote) => lote.imagen)

  return (
    <table className="w-full table-fixed border-collapse">
      {/* Anchos fijos para bateria, precio y boton; el equipo usa lo que sobra. */}
      <colgroup>
        <col />
        <col className="w-[52px]" />
        <col className="w-[98px]" />
        <col className="w-[48px]" />
      </colgroup>
      <thead>
        <tr className="text-[11px] tracking-wide text-neutral-500 uppercase">
          <th scope="col" className="py-2 pr-1 pl-3 text-left font-medium">Equipo</th>
          <th scope="col" className="px-1 py-2 text-center font-medium">Bat.</th>
          <th scope="col" className="px-1 py-2 text-right font-medium">Precio</th>
          <th scope="col" className="py-2"><span className="sr-only">Consultar</span></th>
        </tr>
      </thead>
      <tbody>
        {grupos.map((grupo) => (
          <Fragment key={`${grupo.marca}|${grupo.familia}`}>
            <Separador titulo={tituloDeFamilia(grupo)} columnas={4} />
            {grupo.lotes.map((lote) => (
              <FilaCelular key={lote.clave} lote={lote} cotizacion={catalogo.cotizacion} planes={planes} conFotos={conFotos} />
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function FilaCelular({ lote, cotizacion, planes, conFotos }) {
  const [abierto, setAbierto] = useState(false)
  const precioArs = aPesos(lote.precio_usd, cotizacion)

  return (
    <>
      <tr className={`renglon ${abierto ? '' : 'border-b border-borde'}`}>
        <td className="py-2 pr-1 pl-3 align-middle">
          <div className="flex items-center gap-2.5">
            {conFotos && <Miniatura url={lote.imagen} titulo={[lote.modelo, lote.capacidad, lote.color].filter(Boolean).join(' ')} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-sm font-semibold text-blanco">{lote.capacidad || lote.modelo}</span>
                <PuntoColor color={lote.color} />
              </div>
              {lote.detalles && <p className="text-xs break-words text-neutral-500">{lote.detalles}</p>}
              {lote.cantidad > 1 && <p className="text-[11px] text-neutral-500">{lote.cantidad} disponibles</p>}
              <ResumenCuotas precioArs={precioArs} planes={planes} abierto={abierto} alAlternar={() => setAbierto(!abierto)} />
            </div>
          </div>
        </td>
        <td className="px-1 py-2 text-center align-middle text-sm text-neutral-700">{lote.bateria || '-'}</td>
        <td className="px-1 py-2 text-right align-middle text-sm font-semibold whitespace-nowrap text-blanco">{pesos(precioArs)}</td>
        <td className="py-2 pr-2 text-right align-middle">
          <BotonWhatsApp enlace={enlaceCelular(lote, cotizacion)} descripcion={`${lote.modelo} ${lote.capacidad}`} />
        </td>
      </tr>
      {abierto && (
        <tr className="border-b border-borde">
          <td colSpan={4} className="px-3 pb-3">
            <DetalleCuotas precioArs={precioArs} planes={planes} />
          </td>
        </tr>
      )}
    </>
  )
}

function TablaAccesorios({ lotes, catalogo }) {
  const grupos = agruparPorFamilia(lotes)
  const planes = planesPara('accesorios', catalogo.cuotas)
  const conFotos = lotes.some((lote) => lote.imagen)

  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col />
        <col className="w-[98px]" />
        <col className="w-[48px]" />
      </colgroup>
      <thead>
        <tr className="text-[11px] tracking-wide text-neutral-500 uppercase">
          <th scope="col" className="py-2 pr-1 pl-3 text-left font-medium">Accesorio</th>
          <th scope="col" className="px-1 py-2 text-right font-medium">Precio</th>
          <th scope="col" className="py-2"><span className="sr-only">Consultar</span></th>
        </tr>
      </thead>
      <tbody>
        {grupos.map((grupo) => (
          <Fragment key={grupo.familia}>
            <Separador titulo={grupo.familia} columnas={3} />
            {grupo.lotes.map((lote) => (
              <FilaAccesorio key={lote.clave} lote={lote} cotizacion={catalogo.cotizacion} planes={planes} conFotos={conFotos} />
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function FilaAccesorio({ lote, cotizacion, planes, conFotos }) {
  // Que se ve abajo del renglon: nada, los precios por cantidad o las cuotas.
  const [abierto, setAbierto] = useState(null) // null | 'escalas' | 'cuotas'
  const tieneEscalas = lote.escalas.length > 0
  const precioArs = aPesos(lote.precio_usd, cotizacion)
  const alternar = (que) => setAbierto(abierto === que ? null : que)

  return (
    <>
      <tr className={`renglon ${abierto ? '' : 'border-b border-borde'}`}>
        <td className="py-2 pr-1 pl-3 align-middle">
          <div className="flex items-center gap-2.5">
            {conFotos && <Miniatura url={lote.imagen} titulo={[lote.tipo, lote.modelo, lote.color].filter(Boolean).join(' ')} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="min-w-0 text-sm font-semibold break-words text-blanco">{lote.modelo || lote.tipo}</span>
                <PuntoColor color={lote.color} />
              </div>
              {lote.detalles && <p className="text-xs break-words text-neutral-500">{lote.detalles}</p>}
              {lote.cantidad > 1 && <p className="text-[11px] text-neutral-500">{lote.cantidad} disponibles</p>}
              <ResumenCuotas precioArs={precioArs} planes={planes} abierto={abierto === 'cuotas'} alAlternar={() => alternar('cuotas')} />
              {tieneEscalas && (
                <button
                  type="button"
                  onClick={() => alternar('escalas')}
                  aria-expanded={abierto === 'escalas'}
                  className="enlace-raya mt-1 text-left text-xs font-medium text-verde"
                >
                  {abierto === 'escalas' ? 'Ocultar precios por cantidad' : 'Ver precios por cantidad'}
                </button>
              )}
            </div>
          </div>
        </td>
        <td className="px-1 py-2 text-right align-middle text-sm font-semibold whitespace-nowrap text-blanco">{pesos(precioArs)}</td>
        <td className="py-2 pr-2 text-right align-middle">
          <BotonWhatsApp enlace={enlaceAccesorio(lote, 1, cotizacion)} descripcion={`${lote.tipo} ${lote.modelo}`} />
        </td>
      </tr>
      {abierto && (
        <tr className="border-b border-borde">
          <td colSpan={3} className="px-3 pb-3">
            {abierto === 'escalas' ? <EscalaDePrecios lote={lote} cotizacion={cotizacion} /> : <DetalleCuotas precioArs={precioArs} planes={planes} />}
          </td>
        </tr>
      )}
    </>
  )
}

// Panel de precios por cantidad: la escala completa, atajos de cantidad, el
// total y un enlace de WhatsApp que lleva cantidad, precio por unidad y total.
function EscalaDePrecios({ lote, cotizacion }) {
  const [cantidad, setCantidad] = useState(1)

  const lista = aPesos(lote.precio_usd, cotizacion)
  const porUnidad = precioSegunCantidad(lote, cantidad, cotizacion)
  const primerTramo = lote.escalas[0].desde

  // Atajos: 1 unidad y el arranque de cada tramo.
  const atajos = [...new Set([1, ...lote.escalas.map((tramo) => tramo.desde)])]

  function cambiar(valor) {
    // Entre 1 y 999, siempre entero.
    setCantidad(Math.min(999, Math.max(1, Math.round(Number(valor)) || 1)))
  }

  return (
    <div className="animate-aparecer rounded-lg border border-borde bg-superficie p-3">
      <ul className="space-y-0.5 text-xs text-neutral-700">
        {primerTramo > 1 && (
          <li className="flex justify-between gap-2">
            <span>{primerTramo === 2 ? '1 unidad' : `1 a ${primerTramo - 1} unidades`}</span>
            <span className="font-medium whitespace-nowrap">{pesos(lista)} c/u</span>
          </li>
        )}
        {lote.escalas.map((tramo) => (
          <li key={tramo.desde} className="flex justify-between gap-2">
            <span>{tramo.desde} o más</span>
            <span className="font-medium whitespace-nowrap">{pesos(tramo.precio_ars)} c/u</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {atajos.map((atajo) => (
          <button
            key={atajo}
            type="button"
            onClick={() => cambiar(atajo)}
            className={`boton h-9 min-w-9 border px-2 font-medium ${
              cantidad === atajo ? 'border-blanco bg-blanco text-negro' : 'border-neutral-300 bg-transparent text-neutral-800'
            }`}
          >
            {atajo}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-600">
          Cantidad
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="999"
            value={cantidad}
            onChange={(evento) => cambiar(evento.target.value)}
            // text-base (16 px) en celular: con menos, iOS agranda la pagina al tocar el campo.
            className="campo w-16 px-2 py-1.5 text-center"
          />
        </label>
      </div>

      <p className="mt-3 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-neutral-600">
          {cantidad} x {pesos(porUnidad)}
        </span>
        <span className="text-base font-bold whitespace-nowrap text-blanco">{pesos(porUnidad * cantidad)}</span>
      </p>

      <a
        href={enlaceAccesorio(lote, cantidad, cotizacion)}
        target="_blank"
        rel="noopener noreferrer"
        className="boton boton-verde mt-2 w-full"
      >
        <IconoWhatsApp />
        Consultar por {cantidad} {cantidad === 1 ? 'unidad' : 'unidades'}
      </a>
    </div>
  )
}

// Renglones grises que laten mientras llega el catalogo.
function Cargando() {
  return (
    <div className="space-y-2 p-3" role="status" aria-label="Cargando el catálogo">
      {[0, 1, 2, 3, 4, 5].map((numero) => (
        <div key={numero} className="h-11 animate-pulse rounded-lg bg-superficie" />
      ))}
    </div>
  )
}

function Aviso({ children }) {
  return <p className="px-4 py-10 text-center text-sm text-neutral-500">{children}</p>
}

// Datos de contacto y como se paga, arriba del pie.
function Contacto() {
  return (
    <section className="mx-auto mt-8 w-full max-w-2xl px-3 pb-8">
      <div className="grid gap-4 rounded-2xl border border-borde bg-superficie p-4">
        <div className="flex items-start gap-3">
          <IconoTarjeta clase="mt-0.5 h-5 w-5 shrink-0 text-oro" />
          <p className="text-xs text-neutral-600">
            <span className="block text-sm font-semibold text-blanco">Medios de pago</span>
            Efectivo, transferencia y tarjeta en cuotas. Los pagos se hacen en el local, con posnet {NEGOCIO.posnet}.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <IconoEscudo clase="mt-0.5 h-5 w-5 shrink-0 text-oro" />
          <p className="text-xs text-neutral-600">
            <span className="block text-sm font-semibold text-blanco">Equipos testeados</span>
            Cada equipo se revisa con vos antes de entregarlo y se va con su garantía firmada.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href={`https://wa.me/${NEGOCIO.whatsapp}`} target="_blank" rel="noopener noreferrer" className="boton boton-verde">
            <IconoWhatsApp clase="h-4 w-4" />
            Escribinos
          </a>
          <a href={NEGOCIO.instagram} target="_blank" rel="noopener noreferrer" className="boton boton-claro">
            <IconoInstagram />
            Instagram
          </a>
        </div>
      </div>
    </section>
  )
}

export default function Catalogo() {
  // fase: 'cargando' | 'listo' | 'error'
  const [carga, setCarga] = useState({ fase: 'cargando', datos: null })
  // Cada vez que cambia "intento" se vuelve a pedir el catalogo.
  const [intento, setIntento] = useState(0)
  const [pestana, setPestana] = useState('celulares')
  const [busqueda, setBusqueda] = useState('')
  // La primera vez que se entra, el encabezado espera a que se vaya la portada.
  const [conRetraso] = useState(() => !portadaVista)

  useEffect(() => {
    // Si el componente se desmonta antes de que llegue la respuesta, se ignora.
    let vigente = true
    obtenerCatalogo()
      .then((datos) => vigente && setCarga({ fase: 'listo', datos }))
      .catch(() => vigente && setCarga({ fase: 'error', datos: null }))
    return () => {
      vigente = false
    }
  }, [intento])

  function reintentar() {
    setCarga({ fase: 'cargando', datos: null })
    setIntento(intento + 1)
  }

  // Lotes de la pestana elegida que coinciden con la busqueda.
  const visibles = useMemo(() => {
    if (!carga.datos) return []
    const palabras = normalizar(busqueda).split(' ').filter(Boolean)
    return carga.datos[pestana].filter((lote) => coincide(lote, palabras))
  }, [carga.datos, pestana, busqueda])

  return (
    <div className="flex min-h-screen flex-col bg-negro text-blanco">
      <Portada />
      <Encabezado conRetraso={conRetraso} />

      {/* Pestanas y buscador quedan pegados arriba al deslizar. */}
      <div className="sticky top-0 z-10 border-b border-borde bg-negro/90 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-3 py-2">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-borde bg-superficie p-1" role="tablist">
            {PESTANAS.map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                role="tab"
                aria-selected={pestana === opcion.id}
                onClick={() => setPestana(opcion.id)}
                className={`min-w-0 cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  pestana === opcion.id ? 'bg-blanco text-negro shadow-sm' : 'text-neutral-500 hover:text-blanco'
                }`}
              >
                {opcion.nombre}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder={pestana === 'celulares' ? 'Buscar: 13 pro 256...' : 'Buscar: funda, cargador...'}
            aria-label="Buscar en el catálogo"
            // text-base (16 px) en celular: con menos, iOS agranda la pagina al tocar el campo.
            className="campo mt-2 border-borde bg-superficie"
          />
        </div>
      </div>

      <main className="mx-auto w-full max-w-2xl flex-1">
        {carga.datos && <AvisoCuotas cuotas={carga.datos.cuotas} />}

        {carga.fase === 'cargando' && <Cargando />}

        {/* Si falla la carga se dice que fallo: nunca "no hay stock". */}
        {carga.fase === 'error' && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-neutral-700">No pudimos cargar el catálogo. Revisá tu conexión.</p>
            <button type="button" onClick={reintentar} className="boton boton-oscuro mt-3 px-5">
              Reintentar
            </button>
          </div>
        )}

        {carga.fase === 'listo' && visibles.length === 0 && (
          <Aviso>
            {busqueda.trim()
              ? `No encontramos ${pestana} con "${busqueda.trim()}".`
              : `Por ahora no hay ${pestana} cargados.`}
          </Aviso>
        )}

        {carga.fase === 'listo' && visibles.length > 0 && (
          // key hace que la animacion de aparicion se repita al cambiar de pestana.
          <div key={pestana} className="animate-aparecer">
            {pestana === 'celulares' ? (
              <TablaCelulares lotes={visibles} catalogo={carga.datos} />
            ) : (
              <TablaAccesorios lotes={visibles} catalogo={carga.datos} />
            )}
            <p className="px-3 py-4 text-center text-xs text-neutral-500">
              Precios en pesos. Recibimos efectivo, transferencia y tarjeta en el local.
            </p>
          </div>
        )}
      </main>

      <Contacto />
      <Pie conCandado />
    </div>
  )
}
