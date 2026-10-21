// panel/Proveedores.jsx
// Pestana "Proveedores": a quien se le compra la mercaderia.
// De cada uno se ve cuanto se le debe, cuantas unidades se le cargaron y sus
// lotes de compra. Desde aca se carga un lote nuevo de ese proveedor.
//
// La deuda se lleva en dolares, como el costo: suma cada lote que queda
// debiendose y lo que se anota a mano; la bajan los pagos (los gastos de la
// caja a su nombre), cada uno pasado a dolares con el dolar de costo del dia,
// y los equipos que se le mandan por garantia (ver Envios.jsx).

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import { anotarDeudaProveedor, eliminarDeudaProveedor, eliminarProveedor, guardarProveedor, leerCuentaProveedor } from '../apiAdmin.js'
import { aPesos, dolares, fechaCorta, pesos } from '../formato.js'
import { redondear4 } from '../servicios/lotes.js'
import { ModalMovimiento } from './Caja.jsx'
import { CampoUsd } from './Campos.jsx'
import { ListaDeCompras, ModalCompra, ModalImeisCompra } from './Compra.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

// Lo que se le debe a un proveedor, en dolares (negativo = a favor).
const saldoDe = (proveedor) => redondear4(proveedor.deuda_usd - proveedor.pagado_usd)

export default function PestanaProveedores() {
  const { datos, cotizaciones, recargar } = usePanel()
  const proveedores = datos.proveedores
  const [abierto, setAbierto] = useState(null)
  // Ventana abierta: { clase: 'nuevo' | 'editar' | 'pago' | 'deuda' | 'eliminar' | 'stock' | 'imeis', id, compra }.
  const [ventana, setVentana] = useState(null)

  const debido = proveedores.reduce((suma, proveedor) => suma + Math.max(0, saldoDe(proveedor)), 0)
  const deVentana = ventana?.id ? proveedores.find((proveedor) => proveedor.id === ventana.id) : null
  const cerrar = () => setVentana(null)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="tarjeta min-w-0 px-3 py-2">
          <p className="text-[10px] tracking-wide text-neutral-500 uppercase">Les debés</p>
          <p className={`truncate text-sm font-semibold ${debido > 0 ? 'text-red-700' : ''}`}>{dolares(debido)}</p>
          <p className="truncate text-[11px] text-neutral-500">{pesos(aPesos(debido, cotizaciones.costo))}</p>
        </div>
        <button type="button" className="boton boton-oscuro" onClick={() => setVentana({ clase: 'nuevo' })}>
          + Proveedor
        </button>
      </div>

      {proveedores.length === 0 && (
        <p className="tarjeta p-6 text-center text-sm text-neutral-500">
          Todavía no hay proveedores. También se crean solos cuando escribís uno nuevo al cargar stock o un gasto.
        </p>
      )}

      {proveedores.map((proveedor) => {
        const saldo = saldoDe(proveedor)
        return (
          <section key={proveedor.id} className="tarjeta overflow-hidden">
            <button
              type="button"
              className="renglon flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              onClick={() => setAbierto(abierto === proveedor.id ? null : proveedor.id)}
              aria-expanded={abierto === proveedor.id}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold break-words">{proveedor.nombre}</p>
                <p className="text-xs break-words text-neutral-500">{[proveedor.rubro, proveedor.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p>
              </div>
              <div className="shrink-0 text-right">
                {saldo > 0 ? (
                  <>
                    <p className="text-sm font-semibold whitespace-nowrap text-red-700">{dolares(saldo)}</p>
                    <p className="text-[11px] text-neutral-500">le debés</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold whitespace-nowrap">{saldo < 0 ? dolares(-saldo) : 'Al día'}</p>
                    <p className="text-[11px] text-neutral-500">{saldo < 0 ? 'a favor' : `pagado ${pesos(proveedor.pagado_ars)}`}</p>
                  </>
                )}
              </div>
            </button>

            {abierto === proveedor.id && (
              <div className="animate-aparecer space-y-3 border-t border-neutral-200 bg-neutral-50 px-3 py-3">
                <CuentaProveedor proveedor={proveedor} />
                <p className="text-xs text-neutral-600">
                  {proveedor.unidades === 0
                    ? 'Todavía no se cargó mercadería a su nombre.'
                    : `${proveedor.unidades} ${proveedor.unidades === 1 ? 'unidad cargada' : 'unidades cargadas'} a su nombre.`}
                </p>
                {proveedor.notas && <p className="text-xs break-words text-neutral-600">{proveedor.notas}</p>}
                <ListaDeCompras proveedorId={proveedor.id} alCargarImeis={(compra) => setVentana({ clase: 'imeis', id: proveedor.id, compra })} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="boton boton-oscuro boton-chico" onClick={() => setVentana({ clase: 'stock', id: proveedor.id })}>
                    + Cargar stock
                  </button>
                  <button type="button" className="boton boton-oscuro boton-chico" onClick={() => setVentana({ clase: 'pago', id: proveedor.id })}>
                    Anotar un pago
                  </button>
                  <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'deuda', id: proveedor.id })}>
                    Anotar deuda
                  </button>
                  <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'editar', id: proveedor.id })}>
                    Editar
                  </button>
                  <button type="button" className="boton boton-peligro boton-chico col-span-2" onClick={() => setVentana({ clase: 'eliminar', id: proveedor.id })}>
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </section>
        )
      })}

      {ventana?.clase === 'nuevo' && <ModalProveedor alCerrar={cerrar} />}
      {deVentana && ventana.clase === 'editar' && <ModalProveedor proveedor={deVentana} alCerrar={cerrar} />}
      {/* El pago es un gasto de la caja que ya arranca con este proveedor. */}
      {deVentana && ventana.clase === 'pago' && (
        <ModalMovimiento tipo="egreso" inicial={{ categoria: 'PROVEEDOR', proveedor: deVentana.nombre }} alCerrar={cerrar} />
      )}
      {deVentana && ventana.clase === 'deuda' && <ModalDeuda proveedor={deVentana} alCerrar={cerrar} />}
      {deVentana && ventana.clase === 'stock' && <ModalCompra proveedorInicial={deVentana.nombre} alCerrar={cerrar} />}
      {ventana?.clase === 'imeis' && <ModalImeisCompra compraId={ventana.compra} alCerrar={cerrar} />}
      {deVentana && ventana.clase === 'eliminar' && (
        <Confirmar
          titulo="Eliminar proveedor"
          textoBoton="Sí, eliminar"
          peligro
          alCerrar={cerrar}
          alConfirmar={async () => {
            await eliminarProveedor(deVentana.id)
            await recargar()
            toast.success('Proveedor eliminado')
          }}
        >
          Vas a quitar a <strong>{deVentana.nombre}</strong> de la lista. Solo se puede si no tiene mercadería, pagos ni deudas a su nombre.
        </Confirmar>
      )}
    </div>
  )
}

// La cuenta de un proveedor: cuanto se le debe y cada deuda y pago. Los
// movimientos se piden al abrirla y se vuelven a pedir despues de cada cambio.
function CuentaProveedor({ proveedor }) {
  const { datos, cotizaciones, recargar } = usePanel()
  // { id, filas } o { id, error }: se guarda el proveedor junto con la respuesta.
  const [respuesta, setRespuesta] = useState(null)
  const [borrando, setBorrando] = useState(null)
  const saldo = saldoDe(proveedor)

  useEffect(() => {
    let vigente = true
    leerCuentaProveedor(proveedor.id)
      .then((filas) => vigente && setRespuesta({ id: proveedor.id, filas }))
      .catch((fallo) => vigente && setRespuesta({ id: proveedor.id, error: fallo.message }))
    return () => {
      vigente = false
    }
  }, [proveedor.id, datos])

  const actual = respuesta?.id === proveedor.id ? respuesta : null
  // La deuda de panel_datos ya viene con las garantias descontadas: aca se
  // muestran aparte, del lado de lo que la baja.
  const garantias = redondear4((actual?.filas ?? []).filter((fila) => fila.clase === 'garantia').reduce((suma, fila) => suma + fila.monto_usd, 0))

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div className="min-w-0">
          <dt className="text-neutral-500">Deuda</dt>
          <dd className="truncate font-medium">{dolares(redondear4(proveedor.deuda_usd + garantias))}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-neutral-500">{garantias > 0 ? 'Pagado y garantías' : 'Pagado'}</dt>
          <dd className="truncate font-medium">{dolares(redondear4(proveedor.pagado_usd + garantias))}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-neutral-500">{saldo < 0 ? 'A favor' : 'Le debés'}</dt>
          <dd className={`truncate font-semibold ${saldo > 0 ? 'text-red-700' : ''}`}>{dolares(Math.abs(saldo))}</dd>
          <dd className="truncate text-[11px] text-neutral-500">{pesos(aPesos(Math.abs(saldo), cotizaciones.costo))}</dd>
        </div>
      </dl>

      {actual?.error && <p className="text-xs text-red-700">{actual.error}</p>}
      {actual?.filas?.length > 0 && (
        <ul className="max-h-56 divide-y divide-neutral-200 overflow-y-auto rounded-lg bg-white">
          {actual.filas.map((fila) => (
            <li key={`${fila.clase}|${fila.id}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium break-words">
                  {fila.clase === 'deuda' ? fila.detalle || 'Deuda' : fila.clase === 'garantia' ? fila.detalle : `Pago · ${fila.detalle}`}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {fechaCorta(fila.fecha)}
                  {fila.clase === 'pago' && ` · ${pesos(fila.monto_ars)}`}
                  {fila.clase === 'pago' && fila.monto_usd === null && ' · anotado antes de llevar la deuda'}
                  {fila.clase === 'garantia' && ' · se cambia desde Garantías'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`text-sm font-semibold whitespace-nowrap ${fila.clase === 'deuda' ? 'text-red-700' : 'text-green-700'}`}>
                  {fila.monto_usd === null ? '-' : `${fila.clase === 'deuda' ? '+' : '-'} ${dolares(fila.monto_usd)}`}
                </span>
                {/* Las deudas anotadas a mano se borran; la de un lote va con el lote. */}
                {fila.clase === 'deuda' && fila.compra_id === null && (
                  <button type="button" className="rounded-full px-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" onClick={() => setBorrando(fila)} aria-label="Borrar deuda">
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {actual?.filas?.length === 0 && <p className="text-xs text-neutral-500">Todavía no hay deudas ni pagos anotados.</p>}

      {borrando && (
        <Confirmar
          titulo="Borrar deuda"
          textoBoton="Sí, borrar"
          peligro
          alCerrar={() => setBorrando(null)}
          alConfirmar={async () => {
            await eliminarDeudaProveedor(borrando.id)
            await recargar()
            toast.success('Deuda borrada')
          }}
        >
          Vas a borrar la deuda de <strong>{dolares(borrando.monto_usd)}</strong> del {fechaCorta(borrando.fecha)}.
        </Confirmar>
      )}
    </div>
  )
}

// Anotar a mano una deuda con el proveedor: mercaderia que se cargo antes,
// un saldo que viene de antes, algo que no esta en el stock.
function ModalDeuda({ proveedor, alCerrar }) {
  const { cotizaciones, recargar } = usePanel()
  const [monto, setMonto] = useState('')
  const [detalle, setDetalle] = useState('')
  const [ocupado, ejecutar] = useAccion()

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await anotarDeudaProveedor(proveedor.id, Number(monto), detalle)
        await recargar()
      },
      { exito: 'Deuda anotada', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={`Deuda con ${proveedor.nombre}`} alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={guardar} className="space-y-3">
        <label className="etiqueta">
          Cuánto se le debe (USD)
          <CampoUsd valor={monto} alCambiar={setMonto} cotizacion={cotizaciones.costo} />
        </label>
        <label className="etiqueta">
          Detalle
          <input className="campo" value={detalle} onChange={(evento) => setDetalle(evento.target.value)} maxLength={200} placeholder="Saldo anterior, mercadería de antes..." />
        </label>
        <p className="text-xs text-neutral-500">Los lotes que cargás desde "+ Cargar stock" ya suman su deuda solos.</p>
        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !(Number(monto) > 0)}>
          {ocupado ? 'Guardando...' : 'Anotar deuda'}
        </button>
      </form>
    </Modal>
  )
}

function ModalProveedor({ proveedor, alCerrar }) {
  const { recargar } = usePanel()
  const [campos, setCampos] = useState({
    nombre: proveedor?.nombre || '',
    telefono: proveedor?.telefono || '',
    rubro: proveedor?.rubro || '',
    notas: proveedor?.notas || '',
  })
  const [ocupado, ejecutar] = useAccion()
  const fijar = (nombre) => (evento) => setCampos({ ...campos, [nombre]: evento.target.value })

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await guardarProveedor(proveedor?.id ?? null, campos)
        await recargar()
      },
      { exito: 'Proveedor guardado', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={proveedor ? `Editar · ${proveedor.nombre}` : 'Nuevo proveedor'} alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={guardar} className="space-y-3">
        <label className="etiqueta">
          Nombre
          <input className="campo" value={campos.nombre} onChange={fijar('nombre')} maxLength={80} autoComplete="off" />
        </label>
        <label className="etiqueta">
          Teléfono
          <input className="campo" type="tel" inputMode="tel" value={campos.telefono} onChange={fijar('telefono')} maxLength={40} placeholder="Opcional" autoComplete="off" />
        </label>
        <label className="etiqueta">
          Qué vende
          <input className="campo" value={campos.rubro} onChange={fijar('rubro')} maxLength={80} placeholder="Celulares, accesorios, repuestos..." />
        </label>
        <label className="etiqueta">
          Notas
          <textarea className="campo" rows={2} value={campos.notas} onChange={fijar('notas')} maxLength={500} placeholder="Opcional: cómo se le paga, horarios..." />
        </label>
        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !campos.nombre.trim()}>
          {ocupado ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}
