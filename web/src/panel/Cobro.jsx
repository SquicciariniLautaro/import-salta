// panel/Cobro.jsx
// Campos que se repiten cada vez que se cobra algo: como paga, quien compra
// y si queda debiendo una parte.

import { useState } from 'react'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { normalizar, pesos } from '../formato.js'
import { MEDIOS, pagoConTarjeta, problemaDeDeuda } from '../servicios/comprobante.js'
import { nombreDePlan, textoDeRecargo } from '../servicios/cuotas.js'
import { usePanel } from './contexto.js'

// Efectivo o transferencia, para un pago de un solo medio (los de una cuenta
// o un movimiento de caja).
export function SelectorMedio({ id, valor, alCambiar }) {
  return (
    <select id={id} className="campo" value={valor} onChange={(evento) => alCambiar(evento.target.value)} aria-label="Medio de pago">
      <option value="efectivo">Efectivo</option>
      <option value="transferencia">Transferencia</option>
    </select>
  )
}

// Como se paga una venta o un arreglo. Ademas de efectivo y transferencia
// permite las dos cosas (ahi pide cuanto fue en efectivo y muestra el resto)
// y tarjeta en el posnet, en un pago o en las cuotas cargadas en Ajustes.
// cobro: { medio, efectivo, cuotas, recargo }. total: lo que se cobra, en pesos.
export function CamposDeCobro({ cobro, alCambiar, total }) {
  const mixto = cobro.medio === 'mixto'
  const resto = total - (cobro.efectivo ?? 0)

  return (
    <div className="grid grid-cols-2 gap-3">
      {cobro.medio === 'tarjeta' && <CamposDeTarjeta cobro={cobro} alCambiar={alCambiar} total={total} />}
      <label className="etiqueta col-span-2">
        Cómo paga
        <select className="campo" value={cobro.medio} onChange={(evento) => alCambiar({ ...cobro, medio: evento.target.value })}>
          {MEDIOS.map((medio) => (
            <option key={medio.id} value={medio.id}>
              {medio.nombre}
            </option>
          ))}
        </select>
      </label>
      {mixto && (
        <label className="etiqueta">
          En efectivo ($)
          <CampoPesos valor={cobro.efectivo} alCambiar={(efectivo) => alCambiar({ ...cobro, efectivo })} />
        </label>
      )}
      {mixto && (
        <div className="etiqueta">
          Por transferencia
          <p className={`rounded-lg bg-neutral-100 px-3 py-2 text-base md:text-sm ${resto < 0 ? 'text-red-700' : 'text-neutral-900'}`}>
            {cobro.efectivo === null ? '-' : resto < 0 ? 'Es más que el total' : pesos(resto)}
          </p>
        </div>
      )}
    </div>
  )
}

// En cuantas cuotas se pasa la tarjeta. Las opciones son "1 pago" y los
// planes de Ajustes, cada uno con su recargo; el recargo se puede cambiar en
// el momento (una promo del dia, por ejemplo). Muestra cuanto hay que pasar
// por el posnet y cuanto queda cada cuota.
function CamposDeTarjeta({ cobro, alCambiar, total }) {
  const { configuracion } = usePanel()
  const planes = configuracion.cuotas_planes || []
  const cuotas = cobro.cuotas || 1
  const posnet = pagoConTarjeta(cobro, total)
  // Si alguien elige un plan que despues se saco de Ajustes, igual se ve.
  const conocido = cuotas === 1 || planes.some((plan) => plan.cuotas === cuotas)

  function elegir(valor) {
    const elegidas = Number(valor)
    const plan = planes.find((otro) => otro.cuotas === elegidas)
    alCambiar({ ...cobro, cuotas: elegidas, recargo: plan ? Number(plan.recargo) : 0 })
  }

  return (
    <div className="order-last col-span-2 grid grid-cols-2 gap-3">
      <label className="etiqueta">
        Cuotas
        <select className="campo" value={cuotas} onChange={(evento) => elegir(evento.target.value)}>
          <option value={1}>1 pago</option>
          {planes.map((plan) => (
            <option key={plan.cuotas} value={plan.cuotas}>
              {nombreDePlan(plan)}
              {Number(plan.recargo) > 0 ? ` (+${textoDeRecargo(plan.recargo)})` : ''}
            </option>
          ))}
          {!conocido && <option value={cuotas}>{cuotas} cuotas</option>}
        </select>
      </label>
      <label className="etiqueta">
        Recargo (%)
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="300"
          step="0.01"
          className="campo"
          value={cobro.recargo ?? 0}
          onChange={(evento) => alCambiar({ ...cobro, recargo: evento.target.value === '' ? 0 : Math.max(0, Number(evento.target.value)) })}
        />
      </label>
      <div className="col-span-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-neutral-600">Pasar por el posnet</span>
          <span className="font-bold whitespace-nowrap">{pesos(posnet.total_ars)}</span>
        </p>
        <p className="text-xs text-neutral-500">
          {cuotas === 1 ? 'En un pago.' : `${cuotas} cuotas de ${pesos(posnet.cuota_ars)}.`}
          {posnet.recargo > 0 && ` Incluye ${textoDeRecargo(posnet.recargo)} de recargo. En la venta queda el precio de lista.`}
        </p>
      </div>
      {planes.length === 0 && (
        <p className="col-span-2 text-xs text-neutral-500">Los planes de cuotas y sus recargos se cargan en Ajustes.</p>
      )}
    </div>
  )
}

// Nombre y telefono de quien compra. Los dos son opcionales. Mientras se
// escribe el nombre se ofrecen los clientes registrados: elegir uno completa
// su telefono y muestra si debe algo. Un nombre nuevo queda registrado al vender.
export function CamposDeCliente({ cliente, telefono, alCambiar }) {
  const { datos } = usePanel()
  const [escribiendo, setEscribiendo] = useState(false)
  const buscado = normalizar(cliente)
  const clientes = datos.clientes || []
  const registrado = buscado ? clientes.find((otro) => normalizar(otro.nombre) === buscado) : null
  const sugeridos =
    escribiendo && buscado.length >= 2 && !registrado
      ? clientes.filter((otro) => normalizar(`${otro.nombre} ${otro.telefono}`).includes(buscado)).slice(0, 5)
      : []

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="etiqueta relative">
        Cliente
        <input
          className="campo"
          value={cliente}
          onChange={(evento) => alCambiar({ cliente: evento.target.value, telefono })}
          onFocus={() => setEscribiendo(true)}
          onBlur={() => setEscribiendo(false)}
          placeholder="Opcional"
          maxLength={80}
          autoComplete="off"
        />
        {sugeridos.length > 0 && (
          <ul className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
            {sugeridos.map((otro) => (
              <li key={otro.id}>
                <button
                  type="button"
                  className="renglon w-full px-3 py-1.5 text-left text-sm font-normal text-neutral-900"
                  // mousedown y no click: el click llega despues de que el campo pierde el foco y la lista ya no esta.
                  onMouseDown={(evento) => {
                    evento.preventDefault()
                    alCambiar({ cliente: otro.nombre, telefono: otro.telefono || telefono })
                    setEscribiendo(false)
                  }}
                >
                  <span className="block break-words">{otro.nombre}</span>
                  {(otro.telefono || otro.saldo_ars > 0) && (
                    <span className={`block text-[11px] ${otro.saldo_ars > 0 ? 'text-red-700' : 'text-neutral-500'}`}>
                      {[otro.telefono, otro.saldo_ars > 0 && `Debe ${pesos(otro.saldo_ars)}`].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {registrado && (
          <span className={`mt-0.5 block text-[11px] font-normal ${registrado.saldo_ars > 0 ? 'text-red-700' : 'text-green-700'}`}>
            {registrado.saldo_ars > 0 ? `Cliente registrado · debe ${pesos(registrado.saldo_ars)}` : 'Cliente registrado'}
          </span>
        )}
      </label>
      <label className="etiqueta">
        Teléfono
        <input
          className="campo"
          type="tel"
          inputMode="tel"
          value={telefono}
          onChange={(evento) => alCambiar({ cliente, telefono: evento.target.value })}
          placeholder="Opcional"
          maxLength={40}
          autoComplete="off"
        />
      </label>
    </div>
  )
}

// "Queda debiendo una parte". deuda: { activa, monto } (ver comprobante.js).
// total: lo que se cobra, en pesos. cliente: el nombre escrito arriba.
export function CampoDeuda({ deuda, alCambiar, total, cliente }) {
  const problema = problemaDeDeuda(deuda, total, cliente)
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-black"
          checked={deuda.activa}
          onChange={(evento) => alCambiar({ activa: evento.target.checked, monto: evento.target.checked ? deuda.monto : null })}
        />
        Queda debiendo una parte
      </label>
      {deuda.activa && (
        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta">
            Queda debiendo ($)
            <CampoPesos valor={deuda.monto} alCambiar={(monto) => alCambiar({ ...deuda, monto })} />
          </label>
          <div className="etiqueta">
            Paga ahora
            <p className="rounded-lg bg-neutral-100 px-3 py-2 text-base md:text-sm">{pesos(Math.max(0, total - (deuda.monto ?? 0)))}</p>
          </div>
          <p className={`col-span-2 text-xs ${problema ? 'text-red-700' : 'text-neutral-500'}`}>
            {problema || 'Se suma a la cuenta del cliente, en la pestaña Clientes.'}
          </p>
        </div>
      )}
    </div>
  )
}

// Dias de garantia, con atajos para los plazos mas comunes.
export function CampoGarantia({ valor, alCambiar }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1">
        {[0, 30, 90, 365].map((dias) => (
          <button key={dias} type="button" className={`boton boton-chico px-1 ${valor === dias ? 'boton-oscuro' : 'boton-claro'}`} onClick={() => alCambiar(dias)}>
            {dias === 0 ? 'Sin' : dias === 365 ? '1 año' : `${dias} días`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max="3650"
          className="campo w-24"
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value === '' ? '' : Math.max(0, Math.round(Number(evento.target.value))))}
          aria-label="Días de garantía"
        />
        <span className="text-xs text-neutral-500">días (otro plazo)</span>
      </div>
    </div>
  )
}

// "Atendido por": quien hace la venta o recibe el equipo (ver useVendedor.js).
export function CampoVendedor({ vendedor, alCambiar, opciones }) {
  if (opciones.length === 0) return null
  return (
    <label className="etiqueta">
      Atendido por
      <select className="campo" value={vendedor} onChange={(evento) => alCambiar(evento.target.value)}>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </label>
  )
}
