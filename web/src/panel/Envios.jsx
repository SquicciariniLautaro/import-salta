// panel/Envios.jsx
// Garantia con el proveedor: un equipo que vuelve por garantia (o que salio
// fallado) se anota para mandarselo al proveedor que lo vendio. Su costo se
// descuenta de lo que se le debe a ese proveedor.
//   Para mandar -> En el proveedor -> Volvio (arreglado o cambiado: el
//   descuento se quita) o Se lo quedo (el descuento queda).

import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import { anotarEnvio, eliminarEnvio, marcarEnvio } from '../apiAdmin.js'
import { dolares, fechaCorta, soloFecha } from '../formato.js'
import { CampoUsd, SelectorConOtro } from './Campos.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

const ESTADOS = {
  por_enviar: { nombre: 'Para mandar', clase: 'bg-amber-100 text-amber-800' },
  enviado: { nombre: 'En el proveedor', clase: 'bg-blue-50 text-blue-700' },
  volvio: { nombre: 'Volvió', clase: 'bg-green-50 text-green-700' },
  descontado: { nombre: 'Se lo quedó', clase: 'bg-neutral-100 text-neutral-600' },
}

// Anotar un equipo para mandar al proveedor.
// inicial: { celular_id, proveedor, equipo, imei, cliente, monto_usd } (todo opcional).
export function ModalEnvio({ inicial = {}, alCerrar }) {
  const { datos, cotizaciones, recargar } = usePanel()
  const [campos, setCampos] = useState({
    proveedor: inicial.proveedor || '',
    equipo: inicial.equipo || '',
    imei: inicial.imei || '',
    cliente: inicial.cliente || '',
    falla: '',
    monto: inicial.monto_usd > 0 ? String(inicial.monto_usd) : '',
  })
  const [enviado, setEnviado] = useState(false)
  const [ocupado, ejecutar] = useAccion()
  const fijar = (nombre) => (valor) => setCampos({ ...campos, [nombre]: valor })
  const montoValido = campos.monto === '' || Number(campos.monto) >= 0
  const falta = !campos.proveedor.trim() || !campos.equipo.trim() || !montoValido

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await anotarEnvio({
          proveedor: campos.proveedor,
          celular_id: inicial.celular_id ?? null,
          equipo: campos.equipo,
          imei: campos.imei,
          cliente: campos.cliente,
          falla: campos.falla,
          monto_usd: campos.monto === '' ? 0 : Number(campos.monto),
          enviado,
        })
        await recargar()
      },
      { exito: 'Anotado para el proveedor', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo="Mandar al proveedor" alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={guardar} className="space-y-3">
        <label className="etiqueta">
          Proveedor
          <SelectorConOtro
            valor={campos.proveedor}
            alCambiar={fijar('proveedor')}
            opciones={datos.proveedores.map((opcion) => opcion.nombre)}
            vacio="Elegir proveedor..."
          />
        </label>
        <label className="etiqueta">
          Equipo
          <input className="campo" value={campos.equipo} onChange={(evento) => fijar('equipo')(evento.target.value)} maxLength={120} placeholder="iPhone 14 Pro Max 128GB" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta">
            IMEI
            <input
              className="campo font-mono"
              inputMode="numeric"
              autoComplete="off"
              value={campos.imei}
              onChange={(evento) => fijar('imei')(evento.target.value)}
              // El Enter de la pistola no tiene que enviar el formulario.
              onKeyDown={(evento) => evento.key === 'Enter' && evento.preventDefault()}
              maxLength={20}
              placeholder="Opcional"
            />
          </label>
          <label className="etiqueta">
            Cliente
            <input className="campo" value={campos.cliente} onChange={(evento) => fijar('cliente')(evento.target.value)} maxLength={80} placeholder="Opcional" />
          </label>
        </div>
        <label className="etiqueta">
          Falla
          <input className="campo" value={campos.falla} onChange={(evento) => fijar('falla')(evento.target.value)} maxLength={300} placeholder="No carga, pantalla, Face ID..." />
        </label>
        <label className="etiqueta">
          Se le descuenta (USD)
          <CampoUsd valor={campos.monto} alCambiar={fijar('monto')} cotizacion={cotizaciones.costo} />
          <span className="block text-[11px] font-normal text-neutral-500">
            Baja lo que le debés a este proveedor. Arranca con lo que te costó el equipo; vacío o 0 = no se descuenta nada.
          </span>
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className={`boton boton-chico ${enviado ? 'boton-claro' : 'boton-oscuro'}`} onClick={() => setEnviado(false)}>
            Todavía está acá
          </button>
          <button type="button" className={`boton boton-chico ${enviado ? 'boton-oscuro' : 'boton-claro'}`} onClick={() => setEnviado(true)}>
            Ya se lo mandé
          </button>
        </div>
        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || falta}>
          {ocupado ? 'Guardando...' : 'Anotar'}
        </button>
      </form>
    </Modal>
  )
}

// La lista de equipos mandados (o para mandar) al proveedor. Los abiertos van
// a la vista; los cerrados en los ultimos 90 dias, plegados abajo.
// envios: lo que devuelve envios_datos().
export function ListaDeEnvios({ envios, alNuevo }) {
  const [verCerrados, setVerCerrados] = useState(false)
  // Ventana abierta: { clase: 'volvio' | 'descontado' | 'eliminar', envio }.
  const [ventana, setVentana] = useState(null)
  const abiertos = envios.filter((envio) => envio.estado === 'por_enviar' || envio.estado === 'enviado')
  const cerrados = envios.filter((envio) => envio.estado === 'volvio' || envio.estado === 'descontado')
  const paraMandar = abiertos.filter((envio) => envio.estado === 'por_enviar').length

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Garantía con el proveedor</h3>
          <p className="text-xs text-neutral-500">
            {abiertos.length === 0
              ? 'No hay equipos para mandar ni en el proveedor.'
              : [paraMandar > 0 && `${paraMandar} para mandar`, abiertos.length - paraMandar > 0 && `${abiertos.length - paraMandar} en el proveedor`]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>
        <button type="button" className="boton boton-claro boton-chico shrink-0" onClick={alNuevo}>
          + Anotar
        </button>
      </div>

      {abiertos.length > 0 && (
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
          {abiertos.map((envio) => (
            <Envio key={envio.id} envio={envio} alElegir={(clase) => setVentana({ clase, envio })} />
          ))}
        </ul>
      )}

      {cerrados.length > 0 && (
        <div className="border-t border-neutral-200">
          <button type="button" className="w-full px-3 py-2 text-left text-xs text-neutral-500 underline" onClick={() => setVerCerrados(!verCerrados)} aria-expanded={verCerrados}>
            {verCerrados ? 'Ocultar los cerrados' : `Ver los cerrados (${cerrados.length})`}
          </button>
          {verCerrados && (
            <ul className="animate-aparecer divide-y divide-neutral-200 border-t border-neutral-200">
              {cerrados.map((envio) => (
                <Envio key={envio.id} envio={envio} alElegir={(clase) => setVentana({ clase, envio })} />
              ))}
            </ul>
          )}
        </div>
      )}

      {ventana && <ConfirmarEnvio {...ventana} alCerrar={() => setVentana(null)} />}
    </section>
  )
}

function Envio({ envio, alElegir }) {
  const { recargar } = usePanel()
  const [ocupado, ejecutar] = useAccion()
  const estado = ESTADOS[envio.estado]
  const abierto = envio.estado === 'por_enviar' || envio.estado === 'enviado'

  function mandado() {
    ejecutar(
      async () => {
        await marcarEnvio(envio.id, 'enviado')
        await recargar()
      },
      { exito: 'Marcado como mandado' },
    )
  }

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{envio.equipo}</p>
          {envio.imei && <p className="font-mono text-[11px] text-neutral-500">{envio.imei}</p>}
          <p className="text-xs break-words text-neutral-600">
            {envio.proveedor}
            {envio.cliente && ` · cliente ${envio.cliente}`}
          </p>
          {envio.falla && <p className="text-xs break-words text-neutral-500">Falla: {envio.falla}</p>}
          <p className="text-[11px] text-neutral-500">
            Anotado el {fechaCorta(envio.fecha)}
            {envio.fecha_enviado && ` · mandado el ${soloFecha(envio.fecha_enviado)}`}
            {envio.fecha_cierre && ` · cerrado el ${soloFecha(envio.fecha_cierre)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${estado.clase}`}>{estado.nombre}</span>
          {envio.monto_usd > 0 && (
            <p className={`mt-1 text-xs whitespace-nowrap ${envio.estado === 'volvio' ? 'text-neutral-400 line-through' : 'font-semibold text-green-700'}`}>
              - {dolares(envio.monto_usd)}
            </p>
          )}
        </div>
      </div>
      {abierto ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {envio.estado === 'por_enviar' && (
            <button type="button" className="boton boton-oscuro boton-chico col-span-2" disabled={ocupado} onClick={mandado}>
              Ya se lo mandé
            </button>
          )}
          <button type="button" className="boton boton-claro boton-chico" onClick={() => alElegir('volvio')}>
            Volvió
          </button>
          <button type="button" className="boton boton-claro boton-chico" onClick={() => alElegir('descontado')}>
            Se lo quedó
          </button>
          <button type="button" className="boton boton-peligro boton-chico col-span-2" onClick={() => alElegir('eliminar')}>
            Borrar (lo anoté mal)
          </button>
        </div>
      ) : (
        <button type="button" className="mt-1 text-[11px] text-neutral-500 underline" onClick={() => alElegir('eliminar')}>
          Borrar
        </button>
      )}
    </li>
  )
}

function ConfirmarEnvio({ clase, envio, alCerrar }) {
  const { recargar } = usePanel()
  const descuento = envio.monto_usd > 0 ? dolares(envio.monto_usd) : null
  const textos = {
    volvio: {
      titulo: 'Volvió del proveedor',
      boton: 'Sí, volvió',
      detalle: descuento
        ? `Lo devolvió arreglado o te mandó otro: se quita el descuento de ${descuento} y se le vuelve a deber.`
        : 'Lo devolvió arreglado o te mandó otro.',
    },
    descontado: {
      titulo: 'Se lo quedó',
      boton: 'Sí, se lo quedó',
      detalle: descuento ? `El proveedor se quedó con el equipo: el descuento de ${descuento} queda.` : 'El proveedor se quedó con el equipo.',
    },
    eliminar: {
      titulo: 'Borrar envío',
      boton: 'Sí, borrar',
      detalle: descuento && envio.estado !== 'volvio' ? `Se borra el envío y su descuento de ${descuento}.` : 'Se borra el envío.',
    },
  }[clase]

  return (
    <Confirmar
      titulo={textos.titulo}
      textoBoton={textos.boton}
      peligro={clase === 'eliminar'}
      alCerrar={alCerrar}
      alConfirmar={async () => {
        if (clase === 'eliminar') await eliminarEnvio(envio.id)
        else await marcarEnvio(envio.id, clase)
        await recargar()
        toast.success(clase === 'eliminar' ? 'Envío borrado' : 'Listo')
      }}
    >
      <p>
        <strong>{envio.equipo}</strong> · {envio.proveedor}
      </p>
      <p className="mt-1">{textos.detalle}</p>
    </Confirmar>
  )
}
