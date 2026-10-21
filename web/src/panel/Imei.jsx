// panel/Imei.jsx
// Todo lo que tiene que ver con leer y buscar IMEI.
//
// Hay dos formas de leer un codigo:
//   * La pistola (lector USB): funciona como un teclado. Si el cursor esta en
//     un campo, escribe ahi y aprieta Enter; si no, la lectura la recibe la
//     pantalla abierta (ver pistola.js). En una computadora es la unica forma.
//   * La camara del celular: se abre el video y una libreria busca codigos de
//     barras en la imagen. Solo se ofrece en celulares y tablets.

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../componentes/Modal.jsx'
import { buscarImei, cargarImeis } from '../apiAdmin.js'
import { aPesos, extraerImei, extraerImeis, fechaCorta, pesos, soloFecha } from '../formato.js'
import { garantiaVigente, textoDeGarantia, venceGarantia } from '../servicios/garantias.js'
import { describir } from '../servicios/texto.js'
import { usePanel } from './contexto.js'
import { HAY_CAMARA_UTIL, abrirTicketLeido, avisarNoEsImei, sonar, textoNoEsImei, usePistola } from './pistola.js'
import { useAccion } from './useAccion.js'

// Un renglon que explica como cargar con la pistola.
export function AyudaPistola({ texto }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 7h12l3 3v3h-5l-2 6H7l1-6H3z" strokeLinejoin="round" />
      </svg>
      {texto}
    </p>
  )
}

function IconoCamara() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

// Ventana con el video de la camara. Llama a "alLeer" con cada IMEI que ve.
// seguir = true deja la camara abierta para leer varios equipos seguidos.
export function LectorCamara({ alLeer, alCerrar, seguir = false, leidos = 0 }) {
  const video = useRef(null)
  const [error, setError] = useState('')
  // Se guarda en un ref para que el lector use siempre la ultima version de
  // "alLeer" sin tener que reiniciar la camara cada vez que cambia.
  const avisar = useRef(alLeer)
  useEffect(() => {
    avisar.current = alLeer
  })

  useEffect(() => {
    let controles = null
    let vigente = true
    // Para no avisar veinte veces por segundo el mismo codigo.
    let ultimo = { imei: '', momento: 0 }

    async function prender() {
      try {
        // La libreria pesa: se descarga recien cuando alguien abre la camara.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        // Se le dice que tipos de codigo buscar (el IMEI viene en Code 128)
        // para que no pierda tiempo con los demas.
        const pistas = new Map([
          [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF]],
          [DecodeHintType.TRY_HARDER, true],
        ])
        const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 120 })
        const iniciados = await lector.decodeFromConstraints(
          // "environment" = la camara de atras del celular.
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          video.current,
          (resultado) => {
            if (!resultado) return
            // Una caja tiene varios codigos: solo interesa el de 15 digitos.
            const imei = extraerImei(resultado.getText())
            const ahora = Date.now()
            if (!imei || (imei === ultimo.imei && ahora - ultimo.momento < 2500)) return
            ultimo = { imei, momento: ahora }
            navigator.vibrate?.(80)
            avisar.current(imei)
          },
        )
        // Si la ventana se cerro mientras la camara arrancaba, se apaga.
        if (vigente) controles = iniciados
        else iniciados.stop()
      } catch (fallo) {
        if (!vigente) return
        setError(
          fallo?.name === 'NotAllowedError'
            ? 'No hay permiso para usar la cámara. Habilitalo en el navegador y volvé a probar.'
            : 'No se pudo abrir la cámara en este dispositivo.',
        )
      }
    }
    prender()

    return () => {
      vigente = false
      controles?.stop()
    }
  }, [])

  return (
    <Modal titulo="Leer IMEI con la cámara" alCerrar={alCerrar}>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl bg-negro">
            {/* playsInline evita que el iPhone abra el video a pantalla completa. */}
            <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Apuntá al código de barras del IMEI, con buena luz y sin acercar demasiado.
            {seguir && leidos > 0 && ` Llevás ${leidos} leído${leidos === 1 ? '' : 's'}.`}
          </p>
        </>
      )}
      <button type="button" className="boton boton-oscuro mt-4 w-full" onClick={alCerrar}>
        {seguir ? 'Listo' : 'Cerrar'}
      </button>
    </Modal>
  )
}

// Si el campo queda con un IMEI entero y no llega nada mas en este tiempo, se
// toma igual: hay pistolas que terminan con Tab o sin nada en vez de Enter.
const ESPERA_IMEI_MS = 150

// Campo para cargar los IMEI de los equipos que se ingresan.
// Cada lectura (lector de mano, camara o teclado + Enter) suma uno a la lista.
// Un IMEI que ya esta en el local no se puede cargar de nuevo.
// Debajo del campo queda escrito que paso con la ultima lectura, y suena un
// pitido distinto si entro o no: con la pistola no hace falta mirar.
// lector = false si la pantalla maneja la pistola por su cuenta.
export function CampoImeis({ imeis, alCambiar, maximo = 500, lector = true }) {
  const { datos } = usePanel()
  const [texto, setTexto] = useState('')
  const [camara, setCamara] = useState(false)
  // La ultima lectura: { ok, texto }.
  const [aviso, setAviso] = useState(null)
  const espera = useRef(null)
  const zona = usePistola((codigo) => agregar(codigo), lector)
  // Los IMEI actuales, a mano para la camara (que avisa desde afuera de React).
  const actuales = useRef(imeis)
  useEffect(() => {
    actuales.current = imeis
  })
  useEffect(() => () => clearTimeout(espera.current), [])

  function rechazar(mensaje) {
    setAviso({ ok: false, texto: mensaje })
    sonar('error')
    // Un solo aviso que se va pisando, igual que los leidos.
    toast.error(mensaje, { id: 'imei-error' })
    return false
  }

  function agregar(crudo) {
    const imei = extraerImei(crudo)
    if (!imei) return rechazar(textoNoEsImei(crudo))
    if (actuales.current.includes(imei)) return rechazar(`El IMEI terminado en ${imei.slice(-4)} ya está en la lista: ese equipo ya se leyó.`)
    const enStock = datos.celulares.find((unidad) => unidad.imei === imei)
    if (enStock) return rechazar(`El IMEI terminado en ${imei.slice(-4)} ya está cargado en el stock: ${describir(enStock, 'celulares')}.`)
    if (actuales.current.length >= maximo) return rechazar('Ya hay un IMEI por cada equipo.')

    const lista = [...actuales.current, imei]
    actuales.current = lista
    alCambiar(lista)
    setAviso({ ok: true, texto: `Leído el terminado en ${imei.slice(-4)}. Van ${lista.length}: disparale al próximo.` })
    sonar('ok')
    // Un solo aviso que se va pisando: con la pistola llegan de a muchos.
    toast.success(`${lista.length} ${lista.length === 1 ? 'IMEI leído' : 'IMEI leídos'}`, { id: 'imei-leido', duration: 1500 })
    return true
  }

  // Lo escrito en el campo se toma de una (entre o no) y el campo queda
  // vacio para la proxima lectura: el aviso de abajo dice que paso.
  function leerCampo(valor) {
    clearTimeout(espera.current)
    if (!valor.trim()) return
    agregar(valor)
    setTexto('')
  }

  // Pegar una lista entera (la que manda el proveedor, una planilla): se
  // agregan todos los IMEI que tenga. Un solo IMEI se pega como siempre.
  function alPegar(evento) {
    const pegados = extraerImeis(evento.clipboardData.getData('text'))
    if (pegados.length < 2) return
    evento.preventDefault()
    const nuevos = pegados.filter((imei) => !actuales.current.includes(imei))
    const entran = nuevos.slice(0, Math.max(0, maximo - actuales.current.length))
    if (entran.length > 0) {
      const lista = [...actuales.current, ...entran]
      actuales.current = lista
      alCambiar(lista)
    }
    const sobran = nuevos.length - entran.length
    toast.success(`Se agregaron ${entran.length} IMEI${sobran > 0 ? `. ${sobran} no entraron: hay más IMEI que equipos` : ''}`)
  }

  return (
    <div ref={zona}>
      <div className="flex gap-2">
        <input
          className="campo"
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          onChange={(evento) => {
            const valor = evento.target.value
            setTexto(valor)
            clearTimeout(espera.current)
            if (/^\s*\d{15}\s*$/.test(valor)) espera.current = setTimeout(() => leerCampo(valor), ESPERA_IMEI_MS)
          }}
          onPaste={alPegar}
          onKeyDown={(evento) => {
            // El lector de mano termina cada lectura con Enter (algunos con
            // Tab). Se frena para que no envie el formulario ni salte de
            // campo. Se lee lo que tiene el campo en este momento: con la
            // pistola las teclas llegan tan rapido que el estado puede venir
            // atrasado.
            if (evento.key === 'Enter' || (evento.key === 'Tab' && evento.currentTarget.value.trim())) {
              evento.preventDefault()
              leerCampo(evento.currentTarget.value)
            }
          }}
          placeholder={maximo > 1 ? 'Leé con la pistola, o pegá una lista' : 'Leé con la pistola o escribilo'}
          aria-label="IMEI"
        />
        {HAY_CAMARA_UTIL && (
          <button
            type="button"
            className="boton boton-claro shrink-0"
            onClick={() => setCamara(true)}
            aria-label="Leer con la cámara"
          >
            <IconoCamara />
          </button>
        )}
      </div>
      {lector && maximo > 1 && <AyudaPistola texto="Con la pistola: disparale a cada caja, una atrás de otra. No hace falta tocar nada." />}
      {aviso && (
        <p role="status" className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${aviso.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {aviso.texto}
        </p>
      )}

      {imeis.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {imeis.map((imei) => (
            <li key={imei} className="flex items-center gap-1 rounded-full bg-neutral-100 py-1 pr-1 pl-2.5 text-xs">
              <span className="font-mono">{imei}</span>
              <button
                type="button"
                className="rounded-full px-1.5 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                onClick={() => alCambiar(imeis.filter((otro) => otro !== imei))}
                aria-label={`Quitar ${imei}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {camara && <LectorCamara alLeer={agregar} alCerrar={() => setCamara(false)} seguir leidos={imeis.length} />}
    </div>
  )
}

const ESTADOS = {
  disponible: 'En el local',
  vendido: 'Vendido',
  revendedor: 'Lo tiene un revendedor',
  senado: 'Señado',
}

// Buscador de IMEI: dice donde esta un equipo, en cualquier estado, y desde
// el resultado se lo vende, se lo sena o se le imprime la etiqueta.
// alElegir(accion, equipo): accion es 'vender', 'sena', 'revendedor',
// 'etiquetas', 'ver' o 'cuenta'.
export function BuscadorImei({ cotizacion, alElegir }) {
  const { datos } = usePanel()
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState(null)
  const [camara, setCamara] = useState(false)
  const [ocupado, ejecutar] = useAccion()
  // La ultima busqueda, para repetirla cuando cambian los datos (por ejemplo,
  // despues de vender el equipo encontrado).
  const ultima = useRef('')
  // Lo que lee la pistola en esta pantalla se busca solo.
  const zona = usePistola((codigo) => {
    const imei = extraerImei(codigo)
    if (!imei) {
      avisarNoEsImei(codigo)
      return
    }
    setTexto(imei)
    buscar(imei)
  })

  useEffect(() => {
    if (!ultima.current) return
    let vigente = true
    buscarImei(ultima.current)
      .then((encontrados) => vigente && setResultados(encontrados))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [datos])

  function buscar(valor) {
    // El codigo de un ticket abre ese ticket.
    if (abrirTicketLeido(valor)) {
      setTexto('')
      return
    }
    const limpio = valor.replace(/\D/g, '')
    if (limpio.length < 4) {
      toast.error('Escribí al menos 4 dígitos del IMEI')
      return
    }
    ultima.current = limpio
    ejecutar(async () => setResultados(await buscarImei(limpio)))
  }

  return (
    <div ref={zona} className="tarjeta p-3">
      <form
        className="flex gap-2"
        onSubmit={(evento) => {
          evento.preventDefault()
          buscar(texto)
        }}
      >
        <input
          className="campo"
          inputMode="numeric"
          autoComplete="off"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Buscar por IMEI o disparar la pistola"
          aria-label="Buscar por IMEI"
        />
        {HAY_CAMARA_UTIL && (
          <button type="button" className="boton boton-claro shrink-0" onClick={() => setCamara(true)} aria-label="Leer con la cámara">
            <IconoCamara />
          </button>
        )}
        <button type="submit" className="boton boton-oscuro shrink-0" disabled={ocupado}>
          Buscar
        </button>
      </form>

      {resultados && (
        <div className="mt-3">
          {resultados.length === 0 && <p className="text-sm text-neutral-600">No hay ningún equipo con ese IMEI.</p>}
          <ul className="space-y-2">
            {resultados.map((equipo) => (
              <li key={equipo.id} className="rounded-lg bg-neutral-50 p-3 text-sm">
                <p className="font-semibold break-words">{describir(equipo, 'celulares')}</p>
                <p className="font-mono text-xs text-neutral-600">{equipo.imei}</p>
                <p className="mt-1 text-neutral-700">
                  {ESTADOS[equipo.estado]}
                  {equipo.revendedor && equipo.estado !== 'disponible' && ` · ${equipo.revendedor}`}
                </p>
                <p className="text-xs text-neutral-500">
                  Ingresó el {fechaCorta(equipo.fecha_ingreso)}
                  {equipo.fecha_venta &&
                    ` · Vendido el ${fechaCorta(equipo.fecha_venta)} a ${pesos(aPesos(equipo.precio_usd, equipo.cotizacion_venta))}`}
                  {equipo.estado === 'disponible' && ` · Lista ${pesos(aPesos(equipo.precio_usd, cotizacion))}`}
                </p>
                <DatosExtra equipo={equipo} />
                {alElegir && <AccionesDeEquipo equipo={equipo} alElegir={alElegir} />}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-xs text-neutral-500 underline"
            onClick={() => {
              ultima.current = ''
              setResultados(null)
            }}
          >
            Limpiar
          </button>
        </div>
      )}

      {camara && (
        <LectorCamara
          alLeer={(imei) => {
            setCamara(false)
            setTexto(imei)
            buscar(imei)
          }}
          alCerrar={() => setCamara(false)}
        />
      )}
    </div>
  )
}

// Lo que se sabe de mas sobre un equipo: a quien se le vendio, si le queda
// garantia y a que proveedor se le compro.
function DatosExtra({ equipo }) {
  const vence = venceGarantia(equipo.fecha_venta, equipo.garantia_dias)
  const vigente = garantiaVigente(equipo.fecha_venta, equipo.garantia_dias)
  const contacto = [equipo.cliente, equipo.telefono].filter(Boolean).join(' · ')

  if (!contacto && !equipo.fecha_venta && !equipo.proveedor) return null

  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {contacto && <p className="text-neutral-700">Cliente: {contacto}</p>}
      {equipo.fecha_venta &&
        (vence ? (
          <p className={vigente ? 'font-medium text-green-700' : 'text-neutral-500'}>
            Garantía de {textoDeGarantia(equipo.garantia_dias)}: {vigente ? 'vigente hasta el' : 'venció el'} {soloFecha(vence)}
          </p>
        ) : (
          <p className="text-neutral-500">Sin garantía</p>
        ))}
      {equipo.proveedor && <p className="text-neutral-500">Proveedor: {equipo.proveedor}</p>}
    </div>
  )
}

// Lo que se puede hacer con un equipo encontrado. Vender va a la vista; lo
// demas se despliega con "Más opciones".
function AccionesDeEquipo({ equipo, alElegir }) {
  const [abierto, setAbierto] = useState(false)

  if (equipo.estado === 'revendedor' || equipo.estado === 'senado') {
    return (
      <button type="button" className="boton boton-claro boton-chico mt-2 w-full" onClick={() => alElegir('cuenta', equipo)}>
        {equipo.estado === 'senado' ? 'Ver la seña' : 'Ver la cuenta del revendedor'}
      </button>
    )
  }
  if (equipo.estado !== 'disponible') return null

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton boton-verde boton-chico" onClick={() => alElegir('vender', equipo)}>
          Vender
        </button>
        <button type="button" className="boton boton-claro boton-chico" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
          Más opciones
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {abierto && (
        <div className="animate-aparecer grid grid-cols-2 gap-2">
          <button type="button" className="boton boton-claro boton-chico" onClick={() => alElegir('sena', equipo)}>
            Señar
          </button>
          <button type="button" className="boton boton-claro boton-chico" onClick={() => alElegir('revendedor', equipo)}>
            Al carrito revendedor
          </button>
          <button type="button" className="boton boton-claro boton-chico" onClick={() => alElegir('etiquetas', equipo)}>
            Imprimir etiqueta
          </button>
          <button type="button" className="boton boton-claro boton-chico" onClick={() => alElegir('ver', equipo)}>
            Ver en el stock
          </button>
        </div>
      )}
    </div>
  )
}

// Campo de busqueda con un boton para leer el IMEI con la camara. Lo que se
// lee queda escrito en el campo, como si se hubiera tipeado (el lector de
// mano ya escribe solo donde esta el cursor).
export function CampoBusqueda({ valor, alCambiar, placeholder, etiqueta }) {
  const [camara, setCamara] = useState(false)
  return (
    <div className="flex gap-2">
      <input
        type="search"
        className="campo"
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        // El Enter del lector no tiene que hacer nada mas: el filtro ya se aplico.
        onKeyDown={(evento) => evento.key === 'Enter' && evento.preventDefault()}
        placeholder={placeholder}
        aria-label={etiqueta}
      />
      {HAY_CAMARA_UTIL && (
        <button type="button" className="boton boton-claro shrink-0" onClick={() => setCamara(true)} aria-label="Buscar un IMEI con la cámara">
          <IconoCamara />
        </button>
      )}
      {camara && (
        <LectorCamara
          alLeer={(imei) => {
            setCamara(false)
            alCambiar(imei)
          }}
          alCerrar={() => setCamara(false)}
        />
      )}
    </div>
  )
}

// Carga rapida de IMEI para equipos que ya estan en el stock: se leen todos
// de corrido (lector, camara o lista pegada) y se guardan juntos. La base los
// reparte entre los equipos del lote que todavia no tienen.
// compra: opcional, para usar solo los equipos de ese lote de compra.
export function CargaRapidaImeis({ clave, compra = null, faltan }) {
  const { recargar } = usePanel()
  const [imeis, setImeis] = useState([])
  const [ocupado, ejecutar] = useAccion()

  if (faltan <= 0) return <p className="text-xs font-medium text-green-700">Todos los equipos tienen IMEI.</p>

  function guardar() {
    ejecutar(
      async () => {
        await cargarImeis(clave, imeis, compra)
        setImeis([])
        await recargar()
      },
      { exito: imeis.length === 1 ? 'IMEI guardado' : `${imeis.length} IMEI guardados` },
    )
  }

  return (
    <div className="space-y-2">
      <CampoImeis imeis={imeis} alCambiar={setImeis} maximo={faltan} />
      <button type="button" className="boton boton-oscuro w-full" disabled={ocupado || imeis.length === 0} onClick={guardar}>
        {ocupado ? 'Guardando...' : imeis.length === 0 ? (faltan === 1 ? 'Falta 1 IMEI' : `Faltan ${faltan} IMEI`) : `Guardar ${imeis.length} de ${faltan} IMEI`}
      </button>
    </div>
  )
}
