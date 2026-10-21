// panel/Impresion.jsx
// Todo lo que sale por la impresora: el ticket de una venta, la orden de
// servicio tecnico y las etiquetas con codigo de barras.
//
// Se imprime con la ventana de impresion del navegador (window.print). No
// hace falta ningun programa extra: alcanza con que la impresora este
// instalada en la PC o el celular. El tamano del papel se carga en Ajustes.
//
// Los tickets y las etiquetas tambien se pueden mandar directo a la ticketera
// por USB, sin driver (panel/ticketera.js): es lo que se usa en la Mac del
// local, donde la ticketera no tiene driver.
//
// El acta de entrega y garantia (con la revision y las firmas) esta en
// panel/Acta.jsx y usa esta misma ventana, en una hoja A4.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Modal from '../componentes/Modal.jsx'
import { leerComprobante } from '../apiAdmin.js'
import { diaDeTicket, fechaDeTicket, pesos } from '../formato.js'
import { codificar128 } from '../servicios/codigo128.js'
import {
  ESTADOS_DE_SERVICIO, armarComprobante, codigoDeServicio, codigoDeVenta, numeroDeTicket, paginaDeTicket, repartirCobro,
  textoDeTarjeta, textoGarantiaDe,
} from '../servicios/comprobante.js'
import { ticketDeServicio, ticketDeVenta } from '../servicios/escpos.js'
import { textoDeGarantia, venceGarantia } from '../servicios/garantias.js'
import { usePanel } from './contexto.js'
import { ARCHIVO_DEL_LOGO, RECORTE_DEL_LOGO, hayUsb, imprimirEnTicketera, logoDeTicket } from './ticketera.js'
import { useAccion } from './useAccion.js'

// Ventana con la vista previa y el boton Imprimir.
// pagina: { ancho, alto } en milimetros. Sin alto es un rollo continuo, y el
// largo lo decide la impresora. Con alto, un ticket largo sigue en la hoja
// siguiente.
// escpos: una funcion (puede ser async) que devuelve los bytes para mandar
// directo a la ticketera (servicios/escpos.js).
// soloAyuda: muestra solo "ayuda", sin los consejos de la ticketera (para el acta en A4).
export function VentanaImpresion({ titulo, pagina, ayuda, escpos, children, alCerrar, ancho, soloAyuda = false }) {
  const [enviando, ejecutar] = useAccion()
  // "@page" le dice al navegador el tamano del papel y que no deje margenes.
  const regla = pagina.alto ? `@page { size: ${pagina.ancho}mm ${pagina.alto}mm; margin: 0; }` : '@page { margin: 0; }'
  const directo = escpos && hayUsb

  return (
    <Modal titulo={titulo} alCerrar={alCerrar} ancho={ancho}>
      {/* Vista previa. Si el papel es mas ancho que la pantalla, se desliza por dentro. */}
      <div className="flex max-h-[50vh] justify-center overflow-auto rounded-lg bg-neutral-200 p-3">
        {/* "papel": adentro vuelven el negro y el blanco de siempre (ver index.css). */}
        <div className="papel min-w-0 space-y-2 [&>*]:shadow-md">{children}</div>
      </div>

      {soloAyuda ? (
        <p className="mt-3 text-xs text-neutral-500">{ayuda}</p>
      ) : (
        <p className="mt-3 text-xs text-neutral-500">
          {ayuda}{' '}
          {directo
            ? 'La primera vez el navegador pregunta cuál es la ticketera: elegila y tocá Conectar.'
            : 'En la ventana que se abre elegí la impresora. Si sale cortado o muy chico, cambiá el tamaño del papel en Ajustes.'}{' '}
          {escpos && !hayUsb && 'Para imprimir directo en la ticketera, sin driver, abrí el panel en Google Chrome.'} Si la impresora
          larga texto raro (%!PS-Adobe...) y no para, en Ajustes está cómo arreglarlo.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="boton boton-claro" onClick={alCerrar}>
          Cerrar
        </button>
        {directo ? (
          <button
            type="button"
            className="boton boton-oscuro"
            disabled={enviando}
            onClick={() => ejecutar(async () => imprimirEnTicketera(await escpos()), { exito: 'Enviado a la ticketera' })}
          >
            <IconoImpresora />
            {enviando ? 'Imprimiendo...' : 'Imprimir'}
          </button>
        ) : (
          <button type="button" className="boton boton-oscuro" onClick={() => window.print()}>
            <IconoImpresora />
            Imprimir
          </button>
        )}
      </div>
      {/* Para otra impresora instalada en la computadora. */}
      {directo && (
        <button type="button" className="boton boton-claro boton-chico mt-2 w-full" onClick={() => window.print()}>
          Imprimir en otra impresora
        </button>
      )}

      {/* Lo mismo, afuera de la pagina: es lo unico que se ve al imprimir (ver index.css). */}
      {createPortal(
        <div className="zona-impresion papel">
          <style>{regla}</style>
          {children}
        </div>,
        document.body,
      )}
    </Modal>
  )
}

export function IconoImpresora() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" strokeLinejoin="round" />
      <path d="M7 14h10v6H7z" strokeLinejoin="round" />
    </svg>
  )
}

// --- Piezas de un ticket -----------------------------------------------------
// Dicen lo mismo que lo que sale por la ticketera (servicios/escpos.js).

function Raya() {
  return <div className="my-1.5 border-t border-dashed border-black" />
}

// Un renglon con algo a la izquierda y un monto a la derecha.
function Fila({ izquierda, derecha, fuerte = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${fuerte ? 'my-1 text-[14px] font-bold' : ''}`}>
      <span className="min-w-0">{izquierda}</span>
      <span className="shrink-0 whitespace-nowrap">{derecha}</span>
    </div>
  )
}

// Los datos del comercio que van arriba de todo ticket. El original lleva el
// logo; el duplicado, el nombre en letras.
function Encabezado({ configuracion, duplicado }) {
  const contacto = [configuracion.negocio_telefono && `Tel. ${configuracion.negocio_telefono}`, configuracion.negocio_cuit && `CUIT ${configuracion.negocio_cuit}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="text-center">
      {duplicado ? <p className="text-[16px] leading-tight font-bold">{configuracion.negocio_nombre}</p> : <LogoImpreso alto="8mm" />}
      {configuracion.negocio_direccion && <p>{configuracion.negocio_direccion}</p>}
      {contacto && <p>{contacto}</p>}
      {duplicado && <p className="mt-1 font-bold">DUPLICADO PARA EL LOCAL</p>}
    </div>
  )
}

// Numero, fecha, quien atendio y el cliente.
function DatosDelTicket({ titulo, numero, fecha, vendedor, cliente, telefono }) {
  return (
    <>
      <p className="font-bold">
        {titulo} N° {numeroDeTicket(numero)}
      </p>
      {fecha && <p>Fecha: {fechaDeTicket(fecha)}</p>}
      {vendedor && <p>Atendido por: {vendedor}</p>}
      {cliente && <p>Cliente: {cliente}</p>}
      {telefono && <p>Tel.: {telefono}</p>}
    </>
  )
}

// El pie, la letra chica y el codigo de barras para buscar el ticket con la
// pistola. El duplicado suma la firma del cliente.
function Pie({ configuracion, codigo, duplicado }) {
  return (
    <div className="text-center">
      {configuracion.ticket_pie && <p>{configuracion.ticket_pie}</p>}
      {configuracion.ticket_condiciones && <p className="mt-1 text-[0.85em] leading-tight">{configuracion.ticket_condiciones}</p>}
      {/* Este ticket es un comprobante interno: no reemplaza a la factura. */}
      <p className="mt-1 text-[9px]">Documento no válido como factura</p>
      <div className="mx-auto mt-2 h-[7mm] w-[85%]">
        <CodigoBarras valor={codigo} />
      </div>
      <p className="font-mono text-[0.85em] tracking-wider">{codigo}</p>
      {duplicado && (
        <div className="mt-8 space-y-6 text-left">
          <p className="border-b border-black pb-0.5">Firma:</p>
          <p className="border-b border-black pb-0.5">Aclaración:</p>
        </div>
      )}
    </div>
  )
}

// Con papel angosto la letra va mas chica y el margen se achica.
const estiloDeTicket = (configuracion) => {
  const ancho = configuracion.ticket_ancho_mm
  return {
    width: `${ancho}mm`,
    fontSize: ancho < 55 ? '9.5px' : ancho < 70 ? '10px' : '11px',
    padding: ancho < 55 ? '2mm' : '3mm',
  }
}

// Ticket de una venta. comprobante: lo que arma armarComprobante().
export function TicketVenta({ comprobante, configuracion, duplicado = false }) {
  return (
    <div className="ticket" style={estiloDeTicket(configuracion)}>
      <Encabezado configuracion={configuracion} duplicado={duplicado} />
      <Raya />
      <DatosDelTicket titulo="Comprobante" {...comprobante} />
      <Raya />

      {comprobante.renglones.map((renglon) => (
        <div key={renglon.llave} className="mb-1">
          <Fila
            izquierda={`${renglon.cantidad} x ${renglon.descripcion}`}
            derecha={renglon.importe_ars === 0 ? 'Sin cargo' : pesos(renglon.importe_ars)}
          />
          <div className="pl-3 text-[0.92em]">
            {renglon.cantidad > 1 && renglon.precio_ars > 0 && <p>{pesos(renglon.precio_ars)} c/u</p>}
            {renglon.detalle && <p>{renglon.detalle}</p>}
            {renglon.imei && <p>IMEI {renglon.imei}</p>}
            {textoGarantiaDe(renglon) && <p className="font-bold">{textoGarantiaDe(renglon)}</p>}
          </div>
        </div>
      ))}

      <Raya />
      {comprobante.permuta_ars > 0 && (
        <>
          <Fila izquierda="Subtotal" derecha={pesos(comprobante.subtotal_ars)} />
          <Fila izquierda="Equipo recibido en parte de pago" derecha={`- ${pesos(comprobante.permuta_ars)}`} />
        </>
      )}
      <Fila izquierda="TOTAL" derecha={pesos(comprobante.total_ars)} fuerte />
      {comprobante.pagos.map((pago) => (
        <Fila key={pago.nombre} izquierda={pago.nombre} derecha={pago.monto_ars === null ? '' : pesos(pago.monto_ars)} />
      ))}
      {comprobante.tarjeta && <p>{textoDeTarjeta(comprobante.tarjeta)}</p>}
      {comprobante.debe_ars > 0 && <Fila izquierda="Queda debiendo" derecha={pesos(comprobante.debe_ars)} fuerte />}
      {comprobante.nota && <p className="mt-1">{comprobante.nota}</p>}

      <Raya />
      <Pie configuracion={configuracion} codigo={codigoDeVenta(comprobante.numero)} duplicado={duplicado} />
    </div>
  )
}

// Orden de servicio tecnico. Antes de entregar es el comprobante que se lleva
// el cliente para retirar; despues, el de lo que se le hizo y se le cobro.
export function TicketServicio({ orden, configuracion, duplicado = false }) {
  const entregada = orden.estado === 'entregado'
  const vence = venceGarantia(orden.fecha_entrega, orden.garantia_dias)
  const partes = entregada ? repartirCobro(orden, orden.cobrado_ars) : null

  return (
    <div className="ticket" style={estiloDeTicket(configuracion)}>
      <Encabezado configuracion={configuracion} duplicado={duplicado} />
      <Raya />
      <p className="text-center font-bold">SERVICIO TÉCNICO</p>
      <DatosDelTicket
        titulo="Orden"
        numero={orden.id}
        fecha={orden.fecha_ingreso}
        vendedor={orden.vendedor}
        cliente={orden.cliente}
        telefono={orden.telefono}
      />
      <Raya />
      <p className="font-bold">{orden.equipo}</p>
      {orden.imei && <p>IMEI {orden.imei}</p>}
      {orden.falla && <p>Falla: {orden.falla}</p>}
      {orden.trabajo && <p>Trabajo: {orden.trabajo}</p>}
      {orden.en_garantia && <p>Ingresa por garantía</p>}
      <Raya />

      {entregada ? (
        <>
          <Fila izquierda="TOTAL" derecha={orden.cobrado_ars > 0 ? pesos(orden.cobrado_ars) : 'Sin cargo'} fuerte />
          {partes.efectivo_ars > 0 && <Fila izquierda="Efectivo" derecha={pesos(partes.efectivo_ars)} />}
          {partes.transferencia_ars > 0 && (
            <Fila izquierda={orden.medio === 'tarjeta' ? 'Tarjeta' : 'Transferencia'} derecha={pesos(partes.transferencia_ars)} />
          )}
          <p>Entregado el {fechaDeTicket(orden.fecha_entrega)}</p>
          {vence && (
            <p>
              Garantía del arreglo: {textoDeGarantia(orden.garantia_dias)} (hasta el {diaDeTicket(vence)})
            </p>
          )}
        </>
      ) : (
        <>
          <Fila izquierda="Estado" derecha={ESTADOS_DE_SERVICIO[orden.estado]} />
          {orden.presupuesto_ars > 0 && <Fila izquierda="Presupuesto" derecha={pesos(orden.presupuesto_ars)} fuerte />}
          <p className="mt-1">Presentá este comprobante para retirar el equipo.</p>
        </>
      )}

      <Raya />
      <Pie configuracion={configuracion} codigo={codigoDeServicio(orden.id)} duplicado={duplicado} />
    </div>
  )
}

// El original y, si esta prendido en Ajustes, el duplicado para el local.
// Ticket: TicketVenta o TicketServicio; props: las suyas.
export function ConDuplicado({ Ticket, ...props }) {
  return (
    <>
      <Ticket {...props} />
      {props.configuracion.ticket_duplicado && <Ticket {...props} duplicado />}
    </>
  )
}

// --- Etiquetas ---------------------------------------------------------------

// Dibuja un Code 128 como una imagen de barras. Se estira al ancho y al alto
// del lugar donde se lo pone.
export function CodigoBarras({ valor }) {
  const modulos = codificar128(valor)
  if (!modulos) return null

  // Junta los modulos negros seguidos en una sola barra: [posicion, ancho].
  const barras = []
  for (let i = 0; i < modulos.length; i += 1) {
    if (modulos[i] !== '1') continue
    let fin = i
    while (modulos[fin + 1] === '1') fin += 1
    barras.push([i, fin - i + 1])
    i = fin
  }
  // El lector necesita un margen blanco a cada lado: 10 modulos.
  const margen = 10

  return (
    <svg
      viewBox={`0 0 ${modulos.length + margen * 2} 10`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="block h-full w-full"
      role="img"
      aria-label={`Código de barras ${valor}`}
    >
      {barras.map(([posicion, ancho]) => (
        <rect key={posicion} x={posicion + margen} y="0" width={ancho} height="10" fill="#000" />
      ))}
    </svg>
  )
}

// El logo del local para imprimir (ver RECORTE_DEL_LOGO), con una imagen
// comun, que se imprime aunque la impresion de fondos este apagada.
function LogoImpreso({ alto }) {
  const { x, y, ancho, alto: altoRecorte, lado } = RECORTE_DEL_LOGO
  return (
    <div className="relative mx-auto shrink-0 overflow-hidden" style={{ height: alto, maxWidth: '100%', aspectRatio: `${ancho} / ${altoRecorte}` }}>
      <img
        src={ARCHIVO_DEL_LOGO}
        alt=""
        className="absolute max-w-none"
        style={{ width: `${(lado / ancho) * 100}%`, left: `${(-x / ancho) * 100}%`, top: `${(-y / altoRecorte) * 100}%` }}
      />
    </div>
  )
}

// etiquetas: [{ llave, titulo, detalle, codigo }]. codigo es opcional. Cada
// etiqueta sale en su propia hoja, con el logo arriba. No llevan precio:
// cambia con el dolar y la etiqueta queda pegada en la caja.
export function HojaEtiquetas({ etiquetas, configuracion }) {
  const ancho = configuracion.etiqueta_ancho_mm
  const alto = configuracion.etiqueta_alto_mm
  // La letra acompana el alto de la etiqueta (la de 30 mm usa 9 puntos).
  const letra = Math.max(6, Math.min(12, alto * 0.3))

  return etiquetas.map((etiqueta) => (
    <div key={etiqueta.llave} className="etiqueta-impresa" style={{ width: `${ancho}mm`, height: `${alto}mm`, fontSize: `${letra}pt` }}>
      <LogoImpreso alto={`${Math.max(4, Math.min(14, alto * 0.26))}mm`} />
      <p className="font-bold">{etiqueta.titulo}</p>
      {etiqueta.detalle && <p className="text-[0.8em]">{etiqueta.detalle}</p>}
      {etiqueta.codigo && (
        <>
          <div className="mt-[0.5mm] min-h-0 flex-1">
            <CodigoBarras valor={etiqueta.codigo} />
          </div>
          <p className="font-mono text-[0.75em] tracking-wider">{etiqueta.codigo}</p>
        </>
      )}
    </div>
  ))
}

// --- Ventanas listas para usar -----------------------------------------------

// Busca un comprobante por su numero y muestra el ticket para imprimir.
export function VentanaTicket({ comprobanteId, alCerrar }) {
  const { configuracion } = usePanel()
  // { id, datos } o { id, error }. Se guarda el numero junto con la respuesta
  // para no mostrar el ticket de un comprobante anterior.
  const [respuesta, setRespuesta] = useState(null)

  useEffect(() => {
    let vigente = true
    leerComprobante(comprobanteId)
      .then((datos) => vigente && setRespuesta({ id: comprobanteId, datos }))
      .catch((fallo) => vigente && setRespuesta({ id: comprobanteId, error: fallo.message }))
    return () => {
      vigente = false
    }
  }, [comprobanteId])

  const actual = respuesta?.id === comprobanteId ? respuesta : null

  if (!actual?.datos) {
    return (
      <Modal titulo="Ticket" alCerrar={alCerrar} ancho="max-w-sm">
        <p className={`text-sm ${actual?.error ? 'text-red-700' : 'text-neutral-500'}`}>{actual?.error || 'Cargando el ticket...'}</p>
      </Modal>
    )
  }

  return (
    <VentanaImpresion
      titulo={`Ticket N° ${numeroDeTicket(comprobanteId)}`}
      pagina={paginaDeTicket(configuracion)}
      ayuda="Es un comprobante interno, no una factura."
      escpos={async () => ticketDeVenta(armarComprobante(actual.datos), configuracion, await logoDeTicket(configuracion))}
      alCerrar={alCerrar}
    >
      <ConDuplicado Ticket={TicketVenta} comprobante={armarComprobante(actual.datos)} configuracion={configuracion} />
    </VentanaImpresion>
  )
}

export function VentanaOrden({ orden, alCerrar }) {
  const { configuracion } = usePanel()
  return (
    <VentanaImpresion
      titulo={`Orden N° ${numeroDeTicket(orden.id)}`}
      pagina={paginaDeTicket(configuracion)}
      ayuda="Es el comprobante que se lleva el cliente."
      escpos={async () => ticketDeServicio(orden, configuracion, await logoDeTicket(configuracion))}
      alCerrar={alCerrar}
    >
      <ConDuplicado Ticket={TicketServicio} orden={orden} configuracion={configuracion} />
    </VentanaImpresion>
  )
}
