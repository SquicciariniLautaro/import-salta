// panel/Acta.jsx
// El acta de entrega y garantia de un celular. Se hace al entregar el equipo,
// con el cliente adelante:
//   1. se revisa cada punto de la lista de Ajustes (camara, bateria,
//      pantalla, Face ID...) y se anota si funciona, si tiene un detalle o si
//      no aplica;
//   2. firman el cliente y el vendedor en la pantalla.
// Sin la revision completa y las dos firmas no se puede guardar. Una vez
// guardada no se edita (es lo que se firmo) y se imprime en una hoja A4 para
// darle una copia al cliente.

import { useEffect, useState } from 'react'
import Modal from '../componentes/Modal.jsx'
import { leerActa, registrarActa } from '../apiAdmin.js'
import { diaDeTicket, fechaDeTicket, normalizar } from '../formato.js'
import { ESTADOS_DE_PUNTO, faltanRevisar, firmaATexto, marcarRestantes, nombreDeEstado, problemaDeActa, revisionInicial } from '../servicios/actas.js'
import { numeroDeTicket } from '../servicios/comprobante.js'
import { textoDeGarantia, venceGarantia } from '../servicios/garantias.js'
import { CampoGarantia, CampoVendedor } from './Cobro.jsx'
import { CampoFirma, FirmaDibujada } from './Firma.jsx'
import { VentanaImpresion } from './Impresion.jsx'
import { ARCHIVO_DEL_LOGO } from './ticketera.js'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'
import { useVendedor } from './useVendedor.js'

// Hoja A4, en milimetros.
const HOJA_A4 = { ancho: 210, alto: 297 }

// equipo: { celular_id, descripcion, imei, bateria, cliente, telefono, garantia_dias }.
// Sin celular_id es un equipo que no se vendio por el panel: se escribe a mano.
// alGuardar(id): se llama con el numero del acta nueva.
export function ModalActa({ equipo, alCerrar, alGuardar }) {
  const { configuracion, datos } = usePanel()
  const suelto = !equipo.celular_id
  const [descripcion, setDescripcion] = useState(equipo.descripcion || '')
  const [imei, setImei] = useState(equipo.imei || '')
  const [cliente, setCliente] = useState(equipo.cliente || '')
  // Si el cliente ya esta registrado, su documento y su telefono se completan solos.
  const registrado = (datos.clientes || []).find((otro) => normalizar(otro.nombre) === normalizar(equipo.cliente))
  const [documento, setDocumento] = useState(registrado?.documento || '')
  const [telefono, setTelefono] = useState(equipo.telefono || registrado?.telefono || '')
  const [vendedor, setVendedor, vendedores] = useVendedor()
  // Si no hay lista de vendedores en Ajustes, se escribe el nombre.
  const [vendedorEscrito, setVendedorEscrito] = useState('')
  const [garantia, setGarantia] = useState(equipo.garantia_dias ?? configuracion.garantia_dias_celulares)
  const [revision, setRevision] = useState(() => revisionInicial(configuracion.revision_puntos))
  const [observaciones, setObservaciones] = useState('')
  const [firmaCliente, setFirmaCliente] = useState([])
  const [firmaVendedor, setFirmaVendedor] = useState([])
  const [verCondiciones, setVerCondiciones] = useState(false)
  const [ocupado, ejecutar] = useAccion()

  const quienEntrega = vendedores.length > 0 ? vendedor : vendedorEscrito
  const problema =
    (suelto && !descripcion.trim() ? 'Escribí qué equipo se entrega.' : '') ||
    (garantia === '' ? 'Elegí los días de garantía.' : '') ||
    problemaDeActa({ cliente, vendedor: quienEntrega, revision, firmaCliente, firmaVendedor })
  const faltan = faltanRevisar(revision)

  function cambiarPunto(posicion, cambios) {
    setRevision(revision.map((item, indice) => (indice === posicion ? { ...item, ...cambios } : item)))
  }

  function guardar(evento) {
    evento.preventDefault()
    if (problema) return
    ejecutar(
      () =>
        registrarActa({
          celular_id: equipo.celular_id ?? null,
          equipo: suelto ? descripcion : undefined,
          imei: suelto ? imei : undefined,
          cliente,
          documento,
          telefono,
          vendedor: quienEntrega,
          garantia_dias: garantia,
          revision,
          observaciones,
          firma_cliente: firmaATexto(firmaCliente),
          firma_vendedor: firmaATexto(firmaVendedor),
        }),
      { exito: 'Acta guardada', alTerminar: alGuardar },
    )
  }

  return (
    <Modal titulo="Acta de entrega y garantía" alCerrar={alCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} className="space-y-5">
        <section className="space-y-3">
          <Paso numero="1" titulo="Equipo" />
          {suelto ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="etiqueta">
                Equipo
                <input className="campo" value={descripcion} onChange={(evento) => setDescripcion(evento.target.value)} maxLength={160} placeholder="IPHONE 13 128GB AZUL" />
              </label>
              <label className="etiqueta">
                IMEI
                <input className="campo" inputMode="numeric" value={imei} onChange={(evento) => setImei(evento.target.value)} maxLength={20} placeholder="Opcional" />
              </label>
            </div>
          ) : (
            <div className="rounded-xl bg-neutral-100 px-3 py-2.5">
              <p className="text-sm font-semibold break-words">{equipo.descripcion}</p>
              <p className="text-xs text-neutral-500">
                {[equipo.imei ? `IMEI ${equipo.imei}` : 'Sin IMEI cargado', equipo.bateria && `Batería ${equipo.bateria}`].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
          <div>
            <p className="etiqueta mb-1">Garantía</p>
            <CampoGarantia valor={garantia} alCambiar={setGarantia} />
          </div>
        </section>

        <section className="space-y-3">
          <Paso numero="2" titulo="Cliente" />
          <label className="etiqueta">
            Nombre y apellido
            <input className="campo" value={cliente} onChange={(evento) => setCliente(evento.target.value)} maxLength={80} autoComplete="off" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="etiqueta">
              DNI
              <input className="campo" inputMode="numeric" value={documento} onChange={(evento) => setDocumento(evento.target.value)} maxLength={20} placeholder="Opcional" />
            </label>
            <label className="etiqueta">
              Teléfono
              <input className="campo" type="tel" inputMode="tel" value={telefono} onChange={(evento) => setTelefono(evento.target.value)} maxLength={40} placeholder="Opcional" />
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Paso numero="3" titulo="Revisión del equipo, con el cliente" />
            <button type="button" className="boton boton-claro boton-chico" disabled={faltan === 0} onClick={() => setRevision(marcarRestantes(revision))}>
              Marcar el resto como Funciona
            </button>
          </div>
          <p className={`text-xs ${faltan > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {faltan > 0 ? `Faltan revisar ${faltan} de ${revision.length} puntos.` : `Los ${revision.length} puntos están revisados.`}
          </p>
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
            {revision.map((item, posicion) => (
              <li key={item.punto} className={`px-3 py-2.5 ${item.estado ? '' : 'bg-neutral-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium break-words">{item.punto}</p>
                  <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={item.punto}>
                    {ESTADOS_DE_PUNTO.map((estado) => (
                      <button
                        key={estado.id}
                        type="button"
                        role="radio"
                        aria-checked={item.estado === estado.id}
                        onClick={() => cambiarPunto(posicion, { estado: estado.id })}
                        className={`boton boton-chico px-2 ${
                          item.estado === estado.id
                            ? estado.id === 'ok'
                              ? 'bg-verde text-negro'
                              : estado.id === 'detalle'
                                ? 'bg-amber-700 text-negro'
                                : 'bg-neutral-700 text-negro'
                            : 'boton-claro'
                        }`}
                      >
                        {estado.nombre}
                      </button>
                    ))}
                  </div>
                </div>
                {item.estado === 'detalle' && (
                  <input
                    className="campo mt-2"
                    value={item.nota}
                    onChange={(evento) => cambiarPunto(posicion, { nota: evento.target.value })}
                    maxLength={120}
                    placeholder="Cuál es el detalle (obligatorio)"
                    aria-label={`Detalle de ${item.punto}`}
                  />
                )}
              </li>
            ))}
          </ul>
          <label className="etiqueta">
            Observaciones
            <textarea
              className="campo"
              rows={2}
              value={observaciones}
              onChange={(evento) => setObservaciones(evento.target.value)}
              maxLength={500}
              placeholder="Opcional: accesorios que se lleva, estado de la caja, lo que haga falta"
            />
          </label>
        </section>

        <section className="space-y-3">
          <Paso numero="4" titulo="Firmas" />
          <div className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
            <p>
              El cliente firma que revisó el equipo y lo recibe así, con {textoDeGarantia(Number(garantia) || 0).toLowerCase()} de garantía y estas condiciones.{' '}
              <button type="button" className="enlace-raya font-medium text-blue-700" onClick={() => setVerCondiciones(!verCondiciones)}>
                {verCondiciones ? 'Ocultar condiciones' : 'Leer condiciones'}
              </button>
            </p>
            {verCondiciones && <p className="animate-aparecer mt-2 break-words whitespace-pre-line">{configuracion.acta_condiciones}</p>}
          </div>
          {vendedores.length > 0 ? (
            <CampoVendedor vendedor={vendedor} alCambiar={setVendedor} opciones={vendedores} />
          ) : (
            <label className="etiqueta">
              Quién entrega el equipo
              <input className="campo" value={vendedorEscrito} onChange={(evento) => setVendedorEscrito(evento.target.value)} maxLength={80} placeholder="Nombre del vendedor" />
            </label>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <CampoFirma titulo="Firma del cliente" aclaracion={cliente.trim()} trazos={firmaCliente} alCambiar={setFirmaCliente} />
            <CampoFirma titulo="Firma del vendedor" aclaracion={quienEntrega.trim()} trazos={firmaVendedor} alCambiar={setFirmaVendedor} />
          </div>
        </section>

        <div className="space-y-2 border-t border-neutral-200 pt-4">
          {problema && <p className="text-xs text-amber-700">{problema}</p>}
          <button type="submit" className="boton boton-verde w-full py-2.5" disabled={ocupado || Boolean(problema)}>
            {ocupado ? 'Guardando...' : 'Guardar acta firmada'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Paso({ numero, titulo }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-400 text-[11px]">{numero}</span>
      {titulo}
    </h3>
  )
}

// La ventana para ver e imprimir un acta ya guardada. Se busca por su numero.
export function VentanaActa({ actaId, alCerrar }) {
  const { configuracion } = usePanel()
  const [acta, setActa] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    leerActa(actaId)
      .then((datos) => vigente && setActa(datos))
      .catch((fallo) => vigente && setError(fallo.message))
    return () => {
      vigente = false
    }
  }, [actaId])

  if (!acta) {
    return (
      <Modal titulo="Acta de entrega y garantía" alCerrar={alCerrar} ancho="max-w-sm">
        <p className={`text-sm ${error ? 'text-red-700' : 'text-neutral-500'}`}>{error || 'Cargando el acta...'}</p>
      </Modal>
    )
  }

  return (
    <VentanaImpresion
      titulo={`Acta N° ${numeroDeTicket(acta.id)}`}
      pagina={HOJA_A4}
      ancho="max-w-2xl"
      ayuda="Se imprime en una hoja A4 (o se guarda como PDF desde la ventana de impresión): una copia para el cliente y otra para el local."
      soloAyuda
      alCerrar={alCerrar}
    >
      <DocumentoActa acta={acta} configuracion={configuracion} />
    </VentanaImpresion>
  )
}

// El acta impresa. Va adentro de ".papel" (negro sobre blanco, ver index.css).
export function DocumentoActa({ acta, configuracion }) {
  const vence = venceGarantia(acta.fecha, acta.garantia_dias)
  const datosDelLocal = [configuracion.negocio_direccion, configuracion.negocio_telefono, configuracion.negocio_cuit && `CUIT ${configuracion.negocio_cuit}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="acta">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b-2 border-black pb-3">
        <div className="min-w-0">
          <img src={ARCHIVO_DEL_LOGO} alt={configuracion.negocio_nombre} style={{ height: '9mm', maxWidth: '100%' }} />
          {datosDelLocal && <p className="mt-1 text-[11px]">{datosDelLocal}</p>}
        </div>
        <div className="ml-auto text-right">
          <p className="text-[15px] font-bold">ACTA DE ENTREGA Y GARANTÍA</p>
          <p>N° {numeroDeTicket(acta.id)}</p>
          <p>{fechaDeTicket(acta.fecha)}</p>
        </div>
      </div>

      <table className="mt-3">
        <tbody>
          <tr>
            <th style={{ width: '22%' }}>Cliente</th>
            <td>{acta.cliente}</td>
          </tr>
          {(acta.documento || acta.telefono) && (
            <tr>
              <th>DNI / Teléfono</th>
              <td>{[acta.documento && `DNI ${acta.documento}`, acta.telefono].filter(Boolean).join(' · ')}</td>
            </tr>
          )}
          <tr>
            <th>Equipo</th>
            <td>
              <strong>{acta.equipo}</strong>
              {acta.bateria && ` · Batería ${acta.bateria}`}
            </td>
          </tr>
          <tr>
            <th>IMEI</th>
            <td style={{ fontFamily: 'monospace' }}>{acta.imei || 'No informado'}</td>
          </tr>
          <tr>
            <th>Garantía</th>
            <td>
              <strong>{textoDeGarantia(acta.garantia_dias)}</strong>
              {vence && ` desde la entrega, hasta el ${diaDeTicket(vence)} inclusive`}
            </td>
          </tr>
          <tr>
            <th>Entregó</th>
            <td>{acta.vendedor}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4 font-bold">Revisión del equipo junto al cliente</p>
      <table className="mt-1">
        <thead>
          <tr>
            <th>Punto revisado</th>
            <th style={{ width: '20%' }}>Estado</th>
            <th style={{ width: '38%' }}>Observación</th>
          </tr>
        </thead>
        <tbody>
          {acta.revision.map((item) => (
            <tr key={item.punto}>
              <td>{item.punto}</td>
              <td style={{ fontWeight: item.estado === 'detalle' ? 700 : 400 }}>{nombreDeEstado(item.estado)}</td>
              <td>{item.nota}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {acta.observaciones && (
        <p className="mt-3">
          <strong>Observaciones:</strong> {acta.observaciones}
        </p>
      )}

      <p className="mt-4 font-bold">Condiciones de la garantía</p>
      <p className="mt-1 text-[11px] whitespace-pre-line">{acta.condiciones}</p>

      <div className="mt-6 grid grid-cols-2 gap-8">
        <Firmante firma={acta.firma_cliente} titulo="Firma del cliente" aclaracion={acta.cliente} detalle={acta.documento && `DNI ${acta.documento}`} />
        <Firmante firma={acta.firma_vendedor} titulo="Firma del vendedor" aclaracion={acta.vendedor} detalle={configuracion.negocio_nombre} />
      </div>
    </div>
  )
}

function Firmante({ firma, titulo, aclaracion, detalle }) {
  return (
    <div className="firma text-center">
      <FirmaDibujada texto={firma} />
      <div className="border-t border-black pt-1">
        <p className="font-bold">{titulo}</p>
        <p>Aclaración: {aclaracion}</p>
        {detalle && <p>{detalle}</p>}
      </div>
    </div>
  )
}
