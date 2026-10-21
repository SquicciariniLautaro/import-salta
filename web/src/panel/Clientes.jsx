// panel/Clientes.jsx
// Pestana "Clientes": a quien se le vende y cuanto debe cada uno.
//
// Un cliente se registra a mano o solo, la primera vez que se le vende con
// su nombre. Su cuenta suma lo que quedo debiendo de cada venta (y las
// deudas que se anotan a mano) y la bajan los pagos, que entran a la caja.

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { anotarCuentaCliente, eliminarCliente, eliminarCuentaCliente, guardarCliente, leerCuentaCliente } from '../apiAdmin.js'
import { fechaCorta, normalizar, pesos } from '../formato.js'
import { nombreDeMedio, numeroDeTicket } from '../servicios/comprobante.js'
import { SelectorMedio } from './Cobro.jsx'
import { IconoImpresora, VentanaTicket } from './Impresion.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

const DE_A = 40

export default function PestanaClientes() {
  const { datos } = usePanel()
  const clientes = datos.clientes
  const [busqueda, setBusqueda] = useState('')
  const [soloDeudores, setSoloDeudores] = useState(false)
  const [mostrados, setMostrados] = useState(DE_A)
  const [abierto, setAbierto] = useState(null)
  const [nuevo, setNuevo] = useState(false)

  const deben = clientes.filter((cliente) => cliente.saldo_ars > 0)
  const total = deben.reduce((suma, cliente) => suma + cliente.saldo_ars, 0)

  const palabras = normalizar(busqueda).split(' ').filter(Boolean)
  const visibles = clientes
    .filter((cliente) => !soloDeudores || cliente.saldo_ars > 0)
    .filter((cliente) => {
      const texto = normalizar(`${cliente.nombre} ${cliente.telefono} ${cliente.documento}`)
      return palabras.every((palabra) => texto.includes(palabra))
    })
    // Primero los que deben (el que mas debe arriba); despues, por nombre.
    .sort((a, b) => Math.max(0, b.saldo_ars) - Math.max(0, a.saldo_ars) || a.nombre.localeCompare(b.nombre, 'es'))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="tarjeta min-w-0 px-3 py-2">
          <p className="text-[10px] tracking-wide text-neutral-500 uppercase">Te deben</p>
          <p className={`truncate text-sm font-semibold ${total > 0 ? 'text-red-700' : ''}`}>{pesos(total)}</p>
          <p className="truncate text-[11px] text-neutral-500">
            {deben.length} {deben.length === 1 ? 'cliente' : 'clientes'} con deuda
          </p>
        </div>
        <button type="button" className="boton boton-oscuro" onClick={() => setNuevo(true)}>
          + Cliente
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="search"
          className="campo"
          value={busqueda}
          onChange={(evento) => {
            setBusqueda(evento.target.value)
            setMostrados(DE_A)
          }}
          placeholder="Buscar: nombre, teléfono o DNI"
          aria-label="Buscar cliente"
        />
        <button
          type="button"
          className={`boton shrink-0 ${soloDeudores ? 'boton-oscuro' : 'boton-claro'}`}
          onClick={() => setSoloDeudores(!soloDeudores)}
          aria-pressed={soloDeudores}
        >
          Deben
        </button>
      </div>

      {clientes.length === 0 && (
        <p className="tarjeta p-6 text-center text-sm text-neutral-500">
          Todavía no hay clientes. Se registran solos cuando vendés con el nombre del cliente, o con "+ Cliente".
        </p>
      )}
      {clientes.length > 0 && visibles.length === 0 && <p className="tarjeta p-6 text-center text-sm text-neutral-500">Ningún cliente coincide.</p>}

      {visibles.slice(0, mostrados).map((cliente) => (
        <Cliente
          key={cliente.id}
          cliente={cliente}
          abierto={abierto === cliente.id}
          alAlternar={() => setAbierto(abierto === cliente.id ? null : cliente.id)}
        />
      ))}

      {visibles.length > mostrados && (
        <button type="button" className="boton boton-claro w-full" onClick={() => setMostrados(mostrados + DE_A)}>
          Ver más ({visibles.length - mostrados})
        </button>
      )}

      {nuevo && <ModalCliente alCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function Saldo({ saldo }) {
  if (saldo > 0) {
    return (
      <>
        <p className="text-sm font-semibold whitespace-nowrap text-red-700">{pesos(saldo)}</p>
        <p className="text-[11px] text-neutral-500">debe</p>
      </>
    )
  }
  return (
    <>
      <p className="text-sm font-semibold whitespace-nowrap">{saldo < 0 ? pesos(-saldo) : 'Al día'}</p>
      {saldo < 0 && <p className="text-[11px] text-neutral-500">a favor</p>}
    </>
  )
}

function Cliente({ cliente, abierto, alAlternar }) {
  const datosDeContacto = [cliente.telefono, cliente.documento && `DNI ${cliente.documento}`].filter(Boolean)
  return (
    <section className="tarjeta overflow-hidden">
      <button type="button" className="renglon flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" onClick={alAlternar} aria-expanded={abierto}>
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words">{cliente.nombre}</p>
          <p className="text-xs break-words text-neutral-500">
            {[...datosDeContacto, `${cliente.compras} ${cliente.compras === 1 ? 'compra' : 'compras'}`].join(' · ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Saldo saldo={cliente.saldo_ars} />
        </div>
      </button>
      {abierto && <CuentaCliente cliente={cliente} />}
    </section>
  )
}

// La cuenta y las compras de un cliente. Se piden al abrirla y se vuelven a
// pedir despues de cada cambio.
function CuentaCliente({ cliente }) {
  const { datos, recargar } = usePanel()
  // { id, cuenta } o { id, error }: se guarda el cliente junto con la respuesta.
  const [respuesta, setRespuesta] = useState(null)
  const [monto, setMonto] = useState(null)
  const [medio, setMedio] = useState('efectivo')
  // Ventana abierta: { clase: 'deuda' | 'editar' | 'eliminar' | 'borrar' | 'ticket', ... }.
  const [ventana, setVentana] = useState(null)
  const [ocupado, ejecutar] = useAccion()

  useEffect(() => {
    let vigente = true
    leerCuentaCliente(cliente.id)
      .then((cuenta) => vigente && setRespuesta({ id: cliente.id, cuenta }))
      .catch((fallo) => vigente && setRespuesta({ id: cliente.id, error: fallo.message }))
    return () => {
      vigente = false
    }
  }, [cliente.id, datos])

  const cuenta = respuesta?.id === cliente.id ? respuesta.cuenta : null
  const cerrar = () => setVentana(null)

  function pagar(evento) {
    evento.preventDefault()
    if (!monto) return
    ejecutar(async () => {
      await anotarCuentaCliente(cliente.id, 'pago', monto, medio)
      setMonto(null)
      await recargar()
      toast.success(monto >= cliente.saldo_ars && cliente.saldo_ars > 0 ? 'Pago registrado: quedó al día' : 'Pago registrado')
    })
  }

  return (
    <div className="animate-aparecer space-y-4 border-t border-neutral-200 bg-neutral-50 px-3 py-3">
      {cliente.notas && <p className="text-xs break-words text-neutral-600">{cliente.notas}</p>}

      <form onSubmit={pagar} className="grid grid-cols-2 gap-2">
        <label className="etiqueta">
          Registrar pago ($)
          <CampoPesos valor={monto} alCambiar={setMonto} placeholder={cliente.saldo_ars > 0 ? pesos(cliente.saldo_ars) : ''} />
        </label>
        <label className="etiqueta">
          Cómo paga
          <SelectorMedio valor={medio} alCambiar={setMedio} />
        </label>
        <button type="submit" className="boton boton-oscuro col-span-2" disabled={ocupado || !monto}>
          {ocupado ? 'Registrando...' : 'Registrar pago'}
        </button>
      </form>

      {respuesta?.error && <p className="text-xs text-red-700">{respuesta.error}</p>}
      {!cuenta && !respuesta?.error && <p className="text-xs text-neutral-500">Cargando la cuenta...</p>}

      {cuenta && cuenta.movimientos.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-600">Cuenta</h4>
          <ul className="mt-1 max-h-60 divide-y divide-neutral-200 overflow-y-auto rounded-lg bg-white">
            {cuenta.movimientos.map((movimiento) => {
              const esDeuda = movimiento.tipo === 'deuda'
              return (
                <li key={movimiento.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{movimiento.detalle || (esDeuda ? 'Deuda' : 'Pago')}</p>
                    <p className="text-[11px] text-neutral-500">
                      {fechaCorta(movimiento.fecha)}
                      {!esDeuda && ` · ${nombreDeMedio(movimiento.medio)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={`font-semibold whitespace-nowrap ${esDeuda ? 'text-red-700' : 'text-green-700'}`}>
                      {esDeuda ? '+ ' : '- '}
                      {pesos(movimiento.monto_ars)}
                    </span>
                    {/* El saldo de una venta se va al anular la venta, no desde aca. */}
                    {movimiento.comprobante_id === null && (
                      <button
                        type="button"
                        className="rounded-full px-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                        onClick={() => setVentana({ clase: 'borrar', movimiento })}
                        aria-label="Borrar"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {cuenta && cuenta.compras.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-600">Compras</h4>
          <ul className="mt-1 max-h-60 divide-y divide-neutral-200 overflow-y-auto rounded-lg bg-white">
            {cuenta.compras.map((compra) => (
              <li key={compra.id}>
                <button type="button" className="renglon flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm" onClick={() => setVentana({ clase: 'ticket', id: compra.id })}>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      Ticket N° {numeroDeTicket(compra.id)} · {compra.unidades} {compra.unidades === 1 ? 'producto' : 'productos'}
                    </span>
                    <span className="block text-[11px] text-neutral-500">
                      {fechaCorta(compra.fecha)}
                      {compra.debe_ars > 0 && ` · quedó debiendo ${pesos(compra.debe_ars)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-semibold whitespace-nowrap">
                    {pesos(compra.total_ars)}
                    <IconoImpresora />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cuenta && cuenta.movimientos.length === 0 && cuenta.compras.length === 0 && (
        <p className="text-xs text-neutral-500">Todavía no tiene compras ni deudas.</p>
      )}

      <div className="grid grid-cols-3 gap-2 border-t border-neutral-200 pt-3">
        <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'deuda' })}>
          Anotar deuda
        </button>
        <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'editar' })}>
          Editar
        </button>
        <button type="button" className="boton boton-peligro boton-chico" onClick={() => setVentana({ clase: 'eliminar' })}>
          Eliminar
        </button>
      </div>

      {ventana?.clase === 'deuda' && <ModalDeuda cliente={cliente} alCerrar={cerrar} />}
      {ventana?.clase === 'editar' && <ModalCliente cliente={cliente} alCerrar={cerrar} />}
      {ventana?.clase === 'ticket' && <VentanaTicket comprobanteId={ventana.id} alCerrar={cerrar} />}
      {ventana?.clase === 'borrar' && (
        <Confirmar
          titulo={ventana.movimiento.tipo === 'deuda' ? 'Borrar deuda' : 'Borrar pago'}
          textoBoton="Sí, borrar"
          peligro
          alCerrar={cerrar}
          alConfirmar={async () => {
            await eliminarCuentaCliente(ventana.movimiento.id)
            await recargar()
            toast.success('Borrado')
          }}
        >
          Vas a borrar {ventana.movimiento.tipo === 'deuda' ? 'la deuda' : 'el pago'} de <strong>{pesos(ventana.movimiento.monto_ars)}</strong> del{' '}
          {fechaCorta(ventana.movimiento.fecha)}.{ventana.movimiento.tipo === 'pago' && ' También sale de la caja.'}
        </Confirmar>
      )}
      {ventana?.clase === 'eliminar' && (
        <Confirmar
          titulo="Eliminar cliente"
          textoBoton="Sí, eliminar"
          peligro
          alCerrar={cerrar}
          alConfirmar={async () => {
            await eliminarCliente(cliente.id)
            await recargar()
            toast.success('Cliente eliminado')
          }}
        >
          Vas a quitar a <strong>{cliente.nombre}</strong> de la lista. Solo se puede si no tiene deudas ni pagos; sus compras quedan en Ventas.
        </Confirmar>
      )}
    </div>
  )
}

// Una deuda anotada a mano: algo que se llevo sin pasar por el stock, un
// saldo que viene de antes.
function ModalDeuda({ cliente, alCerrar }) {
  const { recargar } = usePanel()
  const [monto, setMonto] = useState(null)
  const [detalle, setDetalle] = useState('')
  const [ocupado, ejecutar] = useAccion()

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await anotarCuentaCliente(cliente.id, 'deuda', monto, null, detalle)
        await recargar()
      },
      { exito: 'Deuda anotada', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={`Deuda de ${cliente.nombre}`} alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={guardar} className="space-y-3">
        <label className="etiqueta">
          Cuánto debe ($)
          <CampoPesos valor={monto} alCambiar={setMonto} />
        </label>
        <label className="etiqueta">
          Detalle
          <input className="campo" value={detalle} onChange={(evento) => setDetalle(evento.target.value)} maxLength={200} placeholder="Saldo anterior, un arreglo..." />
        </label>
        <p className="text-xs text-neutral-500">Para una venta del stock no hace falta: al vender, marcá "Queda debiendo una parte".</p>
        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !monto}>
          {ocupado ? 'Guardando...' : 'Anotar deuda'}
        </button>
      </form>
    </Modal>
  )
}

// Alta de un cliente, o cambio de sus datos.
function ModalCliente({ cliente, alCerrar }) {
  const { recargar } = usePanel()
  const [campos, setCampos] = useState({
    nombre: cliente?.nombre || '',
    telefono: cliente?.telefono || '',
    documento: cliente?.documento || '',
    notas: cliente?.notas || '',
  })
  const [ocupado, ejecutar] = useAccion()
  const fijar = (nombre) => (evento) => setCampos({ ...campos, [nombre]: evento.target.value })

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await guardarCliente(cliente?.id ?? null, campos)
        await recargar()
      },
      { exito: 'Cliente guardado', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={cliente ? `Editar · ${cliente.nombre}` : 'Nuevo cliente'} alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={guardar} className="space-y-3">
        <label className="etiqueta">
          Nombre
          <input className="campo" value={campos.nombre} onChange={fijar('nombre')} maxLength={80} autoComplete="off" autoFocus={!cliente} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta">
            Teléfono
            <input className="campo" type="tel" inputMode="tel" value={campos.telefono} onChange={fijar('telefono')} maxLength={40} placeholder="Opcional" autoComplete="off" />
          </label>
          <label className="etiqueta">
            DNI o CUIT
            <input className="campo" inputMode="numeric" value={campos.documento} onChange={fijar('documento')} maxLength={20} placeholder="Opcional" autoComplete="off" />
          </label>
        </div>
        <label className="etiqueta">
          Notas
          <textarea className="campo" rows={2} value={campos.notas} onChange={fijar('notas')} maxLength={500} placeholder="Opcional" />
        </label>
        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !campos.nombre.trim()}>
          {ocupado ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}
