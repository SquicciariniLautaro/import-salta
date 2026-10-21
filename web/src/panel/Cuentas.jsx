// panel/Cuentas.jsx
// Pestanas "Revendedores" y "Senas". Son el mismo mecanismo con dos nombres:
// una persona tiene equipos a su nombre, va entregando plata y debe un saldo.
//   Saldo = valor de los equipos (precio acordado) - lo entregado sin aplicar.
// Lo entregado se ve repartido equipo por equipo, del primero que se llevo al
// ultimo. En los revendedores, el equipo que queda cubierto pasa a vendido solo.

import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import {
  devolverUnidades,
  editarPago,
  eliminarRevendedor,
  guardarRevendedor,
  marcarPagado,
  registrarPago,
} from '../apiAdmin.js'
import { aPesos, dolares, fechaCorta, pesos, soloFecha } from '../formato.js'
import { nombreDeMedio } from '../servicios/comprobante.js'
import { equiposCubiertos } from '../servicios/cuentas.js'
import { SelectorMedio } from './Cobro.jsx'
import { SelectorUnidades } from './Unidades.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

// tipo: 'revendedor' o 'sena'.
export default function PestanaCuentas({ tipo }) {
  const { cuentas, cotizaciones } = usePanel()
  const esSena = tipo === 'sena'
  const lista = cuentas[tipo]
  const [abierta, setAbierta] = useState(null)
  const [nuevo, setNuevo] = useState(false)

  const deuda = lista.reduce((suma, cuenta) => suma + Math.max(0, cuenta.saldo_usd), 0)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="tarjeta min-w-0 px-3 py-2">
          <p className="text-[10px] tracking-wide text-neutral-500 uppercase">{esSena ? 'Falta cobrar' : 'Te deben los revendedores'}</p>
          <p className={`truncate text-sm font-semibold ${deuda > 0 ? 'text-red-700' : ''}`}>{pesos(aPesos(deuda, cotizaciones.venta))}</p>
          <p className="text-[11px] text-neutral-500">{dolares(deuda)}</p>
        </div>
        {esSena ? (
          <p className="tarjeta px-3 py-2 text-xs text-neutral-600">Para señar un equipo, buscalo en el stock y tocá "Señar".</p>
        ) : (
          <button type="button" className="boton boton-oscuro" onClick={() => setNuevo(true)}>
            + Revendedor
          </button>
        )}
      </div>

      {lista.length === 0 && (
        <p className="tarjeta p-6 text-center text-sm text-neutral-500">
          {esSena ? 'No hay equipos señados.' : 'Todavía no hay revendedores.'}
        </p>
      )}

      {lista.map((cuenta) => (
        <Cuenta
          key={cuenta.nombre}
          cuenta={cuenta}
          abierta={abierta === cuenta.nombre}
          alAlternar={() => setAbierta(abierta === cuenta.nombre ? null : cuenta.nombre)}
        />
      ))}

      {nuevo && <ModalRevendedor alCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function Cuenta({ cuenta, abierta, alAlternar }) {
  const { cotizaciones, recargar } = usePanel()
  const esSena = cuenta.tipo === 'sena'
  const cotizacion = cotizaciones.venta
  const [monto, setMonto] = useState(null)
  const [medio, setMedio] = useState('efectivo')
  // Ventana abierta: { clase: 'pagado' | 'devolver' | 'pago' | 'eliminar' | 'editar', ... }.
  const [ventana, setVentana] = useState(null)
  const [ocupado, ejecutar] = useAccion()
  const unidades = cuenta.unidades.length

  function pagar(evento) {
    evento.preventDefault()
    if (!monto) return
    // Los equipos que este pago termina de cubrir: en los revendedores pasan a vendido.
    const nuevos = esSena ? 0 : equiposCubiertos(cuenta, monto / cotizacion) - equiposCubiertos(cuenta, 0)
    ejecutar(async () => {
      const cerrada = await registrarPago(cuenta.tipo, cuenta.nombre, monto, medio)
      setMonto(null)
      await recargar()
      if (cerrada) toast.success('Pago registrado: la cuenta quedó saldada')
      else if (nuevos > 0) toast.success(`Pago registrado: ${nuevos === 1 ? 'quedó pagado 1 equipo' : `quedaron pagados ${nuevos} equipos`}`)
      else toast.success('Pago registrado')
    })
  }

  return (
    <section className="tarjeta overflow-hidden">
      <button type="button" className="renglon flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" onClick={alAlternar} aria-expanded={abierta}>
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words">{cuenta.nombre}</p>
          <p className="text-xs text-neutral-500">
            {unidades} {unidades === 1 ? 'unidad' : 'unidades'}
            {cuenta.celular && ` · ${cuenta.celular}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {cuenta.saldo_usd > 0 ? (
            <>
              <p className="text-[11px] font-medium text-red-700">{esSena ? 'Falta pagar' : 'Te debe'}</p>
              <p className="text-sm font-semibold whitespace-nowrap text-red-700">{pesos(aPesos(cuenta.saldo_usd, cotizacion))}</p>
              <p className="text-[11px] whitespace-nowrap text-neutral-500">{dolares(cuenta.saldo_usd)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold whitespace-nowrap">{cuenta.saldo_usd < 0 ? pesos(aPesos(-cuenta.saldo_usd, cotizacion)) : 'Al día'}</p>
              {cuenta.saldo_usd < 0 && <p className="text-[11px] text-neutral-500">a favor</p>}
            </>
          )}
        </div>
      </button>

      {abierta && (
        <div className="animate-aparecer space-y-4 border-t border-neutral-200 bg-neutral-50 px-3 py-3">
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div className="min-w-0">
              <dt className="text-neutral-500">Equipos</dt>
              <dd className="truncate font-medium">{pesos(aPesos(cuenta.valor_usd, cotizacion))}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-neutral-500">Entregó</dt>
              <dd className="truncate font-medium">{pesos(aPesos(cuenta.entregado_usd, cotizacion))}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-neutral-500">{cuenta.saldo_usd < 0 ? 'A favor' : esSena ? 'Falta pagar' : 'Te debe'}</dt>
              <dd className={`truncate font-semibold ${cuenta.saldo_usd > 0 ? 'text-red-700' : ''}`}>{pesos(aPesos(Math.abs(cuenta.saldo_usd), cotizacion))}</dd>
            </div>
          </dl>

          {!esSena && cuenta.renglones.length > 0 && (
            <p className="text-[11px] text-neutral-500">
              Cada pago se descuenta del primer equipo que se llevó. Cuando un equipo queda cubierto, pasa a vendido solo.
            </p>
          )}

          {cuenta.renglones.length > 0 && (
            <ul className="space-y-2">
              {cuenta.renglones.map((renglon) => (
                <li key={renglon.llave} className="rounded-lg bg-white p-2.5">
                  <p className="text-sm font-medium break-words">
                    {renglon.unidades.length > 1 && `${renglon.unidades.length} x `}
                    {renglon.descripcion}
                  </p>
                  <p className="text-xs break-words text-neutral-500">
                    {renglon.detalle && `${renglon.detalle} · `}
                    {pesos(aPesos(renglon.precio_usd, cotizacion))}
                    {renglon.unidades.length > 1 && ' c/u'}
                  </p>
                  {renglon.tabla === 'celulares' && (
                    <p className="text-[11px] text-neutral-500">
                      {renglon.unidades[0].imei ? <span className="font-mono">{renglon.unidades[0].imei}</span> : 'Sin IMEI'}
                      {renglon.unidades[0].fecha_revendedor && ` · desde el ${soloFecha(renglon.unidades[0].fecha_revendedor)}`}
                    </p>
                  )}
                  <AvanceDePago renglon={renglon} cotizacion={cotizacion} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" className="boton boton-verde boton-chico" onClick={() => setVentana({ clase: 'pagado', renglon })}>
                      Pagado
                    </button>
                    <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'devolver', renglon })}>
                      {esSena ? 'Canceló' : 'Devolvió'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={pagar} className="grid grid-cols-2 gap-2">
            <label className="etiqueta">
              Registrar pago ($)
              <CampoPesos valor={monto} alCambiar={setMonto} />
            </label>
            <label className="etiqueta">
              Cómo paga
              <SelectorMedio valor={medio} alCambiar={setMedio} />
            </label>
            <button type="submit" className="boton boton-oscuro col-span-2" disabled={ocupado || !monto}>
              {ocupado ? 'Registrando...' : 'Registrar pago'}
            </button>
          </form>

          {cuenta.pagos.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-neutral-600">Pagos</h4>
              <ul className="mt-1 divide-y divide-neutral-200">
                {cuenta.pagos.map((pago) => (
                  <li key={pago.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium whitespace-nowrap">{pesos(pago.monto_ars)}</p>
                      <p className="text-[11px] text-neutral-500">
                        {fechaCorta(pago.fecha)}
                        {pago.monto_usd < 0 ? ' · descontado por equipos pagados' : ` · ${nombreDeMedio(pago.medio)}`}
                      </p>
                    </div>
                    {/* Los descuentos automaticos no se editan. */}
                    {pago.monto_usd > 0 && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'pago', pago })}>
                          Editar
                        </button>
                        <button type="button" className="boton boton-peligro boton-chico" onClick={() => setVentana({ clase: 'eliminarPago', pago })}>
                          Eliminar
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!esSena && cuenta.id !== null && (
            <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 pt-3">
              <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'editar' })}>
                Editar celular
              </button>
              <button type="button" className="boton boton-peligro boton-chico" onClick={() => setVentana({ clase: 'eliminar' })}>
                Eliminar revendedor
              </button>
            </div>
          )}
        </div>
      )}

      {(ventana?.clase === 'pagado' || ventana?.clase === 'devolver') && (
        <ModalRenglon cuenta={cuenta} renglon={ventana.renglon} accion={ventana.clase} alCerrar={() => setVentana(null)} />
      )}
      {ventana?.clase === 'pago' && <ModalPago cuenta={cuenta} pago={ventana.pago} alCerrar={() => setVentana(null)} />}
      {ventana?.clase === 'eliminarPago' && (
        <Confirmar
          titulo="Eliminar pago"
          textoBoton="Sí, eliminar"
          peligro
          alCerrar={() => setVentana(null)}
          alConfirmar={async () => {
            await editarPago(cuenta.tipo, ventana.pago.id, 0)
            await recargar()
            toast.success('Pago eliminado')
          }}
        >
          Vas a eliminar el pago de <strong>{pesos(ventana.pago.monto_ars)}</strong> del {fechaCorta(ventana.pago.fecha)}.
        </Confirmar>
      )}
      {ventana?.clase === 'editar' && <ModalRevendedor cuenta={cuenta} alCerrar={() => setVentana(null)} />}
      {ventana?.clase === 'eliminar' && (
        <Confirmar
          titulo="Eliminar revendedor"
          textoBoton="Sí, eliminar"
          peligro
          alCerrar={() => setVentana(null)}
          alConfirmar={async () => {
            await eliminarRevendedor(cuenta.id)
            await recargar()
            toast.success('Revendedor eliminado')
          }}
        >
          Vas a quitar a <strong>{cuenta.nombre}</strong> de la lista. Solo se puede si no tiene equipos ni pagos sin cerrar.
        </Confirmar>
      )}
    </section>
  )
}

// Cuanto de lo entregado le toca a un renglon y cuanto le falta.
function AvanceDePago({ renglon, cotizacion }) {
  const total = renglon.precio_usd * renglon.unidades.length
  const falta = Math.max(0, total - renglon.pagado_usd)
  const parte = total > 0 ? Math.min(100, (renglon.pagado_usd / total) * 100) : 0
  return (
    <div className="mt-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden="true">
        <div className="h-full rounded-full bg-green-600" style={{ width: `${parte}%` }} />
      </div>
      <p className="mt-1 flex justify-between gap-2 text-[11px]">
        <span className={renglon.pagado_usd > 0 ? 'text-green-700' : 'text-neutral-500'}>
          {renglon.pagado_usd > 0 ? `Pagó ${pesos(aPesos(renglon.pagado_usd, cotizacion))}` : 'Sin pagos todavía'}
        </span>
        <span className="font-medium text-red-700">Falta {pesos(aPesos(falta, cotizacion))}</span>
      </p>
    </div>
  )
}

// "Pagado" o "Devolvio / Cancelo" sobre un renglon de la cuenta.
function ModalRenglon({ cuenta, renglon, accion, alCerrar }) {
  const { cotizaciones, recargar } = usePanel()
  const esSena = cuenta.tipo === 'sena'
  const pagado = accion === 'pagado'
  const [elegidas, setElegidas] = useState(renglon.unidades.map((unidad) => unidad.id))
  // Como se cobra lo que falta al marcar pagado.
  const [medio, setMedio] = useState('efectivo')
  const [ocupado, ejecutar] = useAccion()

  const valor = renglon.precio_usd * elegidas.length
  // Lo ya entregado se descuenta primero; el resto se cobra en el momento.
  const descuento = Math.min(valor, Math.max(0, cuenta.entregado_usd))

  function confirmar() {
    const celulares = renglon.tabla === 'celulares' ? elegidas : []
    const accesorios = renglon.tabla === 'accesorios' ? elegidas : []
    ejecutar(
      async () => {
        if (pagado) await marcarPagado(cuenta.tipo, cuenta.nombre, celulares, accesorios, medio)
        else await devolverUnidades(cuenta.tipo, celulares, accesorios)
        await recargar()
      },
      { exito: pagado ? 'Marcado como pagado' : 'De vuelta en el local', alTerminar: alCerrar },
    )
  }

  const titulo = pagado ? 'Pagado' : esSena ? 'Canceló la seña' : 'Devolvió'

  return (
    <Modal titulo={`${titulo} · ${renglon.descripcion}`} alCerrar={alCerrar} ancho="max-w-sm">
      <SelectorUnidades unidades={renglon.unidades} elegidas={elegidas} alCambiar={setElegidas} />

      {pagado ? (
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Valor</dt>
            <dd className="font-medium whitespace-nowrap">{pesos(aPesos(valor, cotizaciones.venta))}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Ya entregado que se descuenta</dt>
            <dd className="font-medium whitespace-nowrap">{pesos(aPesos(descuento, cotizaciones.venta))}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-neutral-200 pt-1">
            <dt className="text-neutral-600">Se cobra ahora</dt>
            <dd className="font-bold whitespace-nowrap">{pesos(aPesos(valor - descuento, cotizaciones.venta))}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-neutral-600">Las unidades vuelven al local y la deuda baja. Los pagos ya registrados no se tocan.</p>
      )}

      {pagado && valor - descuento > 0 && (
        <label className="etiqueta mt-3">
          Cómo paga lo que se cobra ahora
          <SelectorMedio valor={medio} alCambiar={setMedio} />
        </label>
      )}

      <button type="button" className={`boton mt-4 w-full ${pagado ? 'boton-verde' : 'boton-oscuro'}`} disabled={ocupado || elegidas.length === 0} onClick={confirmar}>
        {ocupado ? 'Guardando...' : 'Confirmar'}
      </button>
    </Modal>
  )
}

function ModalPago({ cuenta, pago, alCerrar }) {
  const { recargar } = usePanel()
  const [monto, setMonto] = useState(Math.round(pago.monto_ars))
  const [medio, setMedio] = useState(pago.medio || 'efectivo')
  const [ocupado, ejecutar] = useAccion()

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await editarPago(cuenta.tipo, pago.id, monto, medio)
        await recargar()
      },
      { exito: 'Pago corregido', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo="Corregir pago" alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={guardar}>
        <label className="etiqueta">
          Monto ($)
          <CampoPesos valor={monto} alCambiar={setMonto} />
        </label>
        <p className="mt-1 text-xs text-neutral-500">Se convierte a dólares con la cotización del día en que se cobró ({pesos(pago.cotizacion)}).</p>
        <label className="etiqueta mt-3">
          Cómo pagó
          <SelectorMedio valor={medio} alCambiar={setMedio} />
        </label>
        <button type="submit" className="boton boton-oscuro mt-4 w-full" disabled={ocupado || !monto}>
          {ocupado ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}

// Alta de un revendedor, o cambio de su celular.
function ModalRevendedor({ cuenta, alCerrar }) {
  const { recargar } = usePanel()
  const [nombre, setNombre] = useState(cuenta?.nombre || '')
  const [celular, setCelular] = useState(cuenta?.celular || '')
  const [ocupado, ejecutar] = useAccion()

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await guardarRevendedor(nombre, celular)
        await recargar()
      },
      { exito: 'Revendedor guardado', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={cuenta ? `Editar · ${cuenta.nombre}` : 'Nuevo revendedor'} alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={guardar} className="space-y-3">
        <label className="etiqueta">
          Nombre
          <input className="campo" value={nombre} onChange={(evento) => setNombre(evento.target.value)} maxLength={80} disabled={Boolean(cuenta)} autoFocus={!cuenta} />
        </label>
        <label className="etiqueta">
          Celular
          <input className="campo" type="tel" inputMode="tel" value={celular} onChange={(evento) => setCelular(evento.target.value)} maxLength={30} placeholder="Opcional" />
        </label>
        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !nombre.trim()}>
          {ocupado ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}
