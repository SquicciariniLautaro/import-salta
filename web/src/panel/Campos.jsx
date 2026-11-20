// panel/Campos.jsx
// Campos de formulario que se repiten en el panel.

import { useState } from 'react'
import { aPesos, dolares, pesos, soloFecha } from '../formato.js'
import { descuentoPara, descuentosDe, precioEnEfectivo } from '../servicios/efectivo.js'
import { problemaDeDia } from '../servicios/fechas.js'
import { ganancia } from '../servicios/precios.js'
import { usePanel } from './contexto.js'

// Desplegable con una ultima opcion "Otro (escribir)". Se usa en lugar de
// <datalist>, que en los celulares no muestra ni la flecha ni la lista.
export function SelectorConOtro({ id, valor, alCambiar, opciones, vacio = 'Elegir...' }) {
  // Si el valor actual no esta en la lista, se arranca en modo "escribir".
  const [escribiendo, setEscribiendo] = useState(valor !== '' && !opciones.includes(valor))

  function alElegir(evento) {
    if (evento.target.value === '__otro') {
      setEscribiendo(true)
      alCambiar('')
    } else {
      setEscribiendo(false)
      alCambiar(evento.target.value)
    }
  }

  return (
    <>
      <select id={id} className="campo" value={escribiendo ? '__otro' : valor} onChange={alElegir}>
        <option value="">{vacio}</option>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
        <option value="__otro">Otro (escribir)</option>
      </select>
      {escribiendo && (
        <input
          className="campo mt-1"
          value={valor}
          onChange={(evento) => alCambiar(evento.target.value)}
          placeholder="Escribilo acá"
          aria-label="Otro valor"
          autoFocus
        />
      )}
    </>
  )
}

// Campo en dolares. Admite varios decimales (step="any") porque el dueno
// piensa en pesos redondos, y debajo muestra el equivalente en pesos.
// "valor" es el texto del campo; quien lo usa lo convierte a numero.
export function CampoUsd({ id, valor, alCambiar, cotizacion, disabled }) {
  const numero = Number(valor)
  return (
    <>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        className="campo"
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        disabled={disabled}
      />
      <span className="mt-0.5 block text-[11px] text-neutral-500">
        {valor !== '' && numero >= 0 ? `≈ ${pesos(aPesos(numero, cotizacion))}` : ' '}
      </span>
    </>
  )
}

// Lo que se gana vendiendo a "ventaArs" algo que costo "compraArs", los dos en
// pesos: "$ 150.000 · US$ 150 · +30 %". En rojo si se pierde plata.
function MontoDeGanancia({ ventaArs, compraArs, cotizacion }) {
  const { ars, porcentaje } = ganancia(ventaArs, compraArs)
  return (
    <span className={`text-right font-semibold whitespace-nowrap ${ars < 0 ? 'text-red-700' : 'text-green-700'}`}>
      {pesos(ars)}
      <span className="font-normal text-neutral-500">
        {' '}· {dolares(ars / cotizacion)}
        {porcentaje !== null && ` · ${porcentaje > 0 ? '+' : ''}${String(porcentaje).replace('.', ',')} %`}
      </span>
    </span>
  )
}

// Al poner los precios de un lote: la diferencia entre lo que costo (compra) y
// cada precio al que se puede vender. Siempre el precio de venta (el
// publicado); ademas el de efectivo si hay descuento y el mayorista si se
// cargo. Todo en pesos: la compra con el dolar de costo y la venta con el de
// venta, igual que en el stock. Los montos llegan como el texto de los campos,
// en dolares. tabla: 'celulares' o 'accesorios'.
export function Ganancia({ costo, precio, mayorista = '', tabla }) {
  const { configuracion, cotizaciones } = usePanel()
  const esNumero = (texto) => texto !== '' && Number(texto) >= 0
  if (!esNumero(costo) || !esNumero(precio)) return null

  const compra = aPesos(Number(costo), cotizaciones.costo)
  const venta = aPesos(Number(precio), cotizaciones.venta)
  const descuento = descuentoPara(tabla, descuentosDe(configuracion))
  const efectivo = precioEnEfectivo(venta, descuento)
  const renglones = [
    { nombre: 'Venta', precio: venta },
    efectivo !== null && { nombre: `Venta en efectivo (−${descuento} %)`, precio: efectivo },
    esNumero(mayorista) && { nombre: 'Venta por mayor', precio: aPesos(Number(mayorista), cotizaciones.venta) },
  ].filter(Boolean)

  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 text-xs">
      <p className="font-semibold text-neutral-700">Ganancia por unidad (venta − compra)</p>
      <p className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-neutral-600">Compra</span>
        <span className="font-medium whitespace-nowrap">{pesos(compra)}</span>
      </p>
      {renglones.map((renglon) => (
        <div key={renglon.nombre} className="mt-1 border-t border-neutral-200 pt-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-neutral-600">{renglon.nombre}</span>
            <span className="font-medium whitespace-nowrap">{pesos(renglon.precio)}</span>
          </p>
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-neutral-600">Ganancia</span>
            <MontoDeGanancia ventaArs={renglon.precio} compraArs={compra} cotizacion={cotizaciones.venta} />
          </p>
        </div>
      ))}
      {renglones.some((renglon) => renglon.precio < compra) && (
        <p className="mt-1 text-[11px] text-red-700">Hay un precio por debajo de la compra.</p>
      )}
    </div>
  )
}

// Al vender: la ganancia con el precio que se esta poniendo, sea el publicado,
// el de efectivo, el mayorista o uno escrito a mano. costosUsd: lo que costo
// cada unidad elegida (cada una pudo entrar a otro precio). precioArs: el
// precio por unidad en pesos, o null mientras el campo esta vacio.
export function GananciaDeVenta({ costosUsd, precioArs }) {
  const { cotizaciones } = usePanel()
  if (precioArs === null || precioArs === undefined || costosUsd.length === 0) return null
  const cantidad = costosUsd.length
  const compraTotal = costosUsd.reduce((suma, costo) => suma + aPesos(Number(costo) || 0, cotizaciones.costo), 0)
  const compra = Math.round(compraTotal / cantidad)
  const ventaTotal = precioArs * cantidad
  return (
    <div className="mt-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-neutral-600">Compra{cantidad > 1 ? ' c/u' : ''}</span>
        <span className="font-medium whitespace-nowrap">{pesos(compra)}</span>
      </p>
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-neutral-600">Venta{cantidad > 1 ? ' c/u' : ''}</span>
        <span className="font-medium whitespace-nowrap">{pesos(precioArs)}</span>
      </p>
      <p className="mt-1 flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-1">
        <span className="font-semibold text-neutral-700">Ganancia{cantidad > 1 ? ' c/u' : ''}</span>
        <MontoDeGanancia ventaArs={precioArs} compraArs={compra} cotizacion={cotizaciones.venta} />
      </p>
      {cantidad > 1 && (
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-neutral-700">Ganancia total ({cantidad})</span>
          <MontoDeGanancia ventaArs={ventaTotal} compraArs={compraTotal} cotizacion={cotizaciones.venta} />
        </p>
      )}
    </div>
  )
}

// Elegir una cantidad con botones de menos y mas.
export function Cantidad({ valor, alCambiar, minimo = 1, maximo }) {
  const fijar = (numero) => alCambiar(Math.min(maximo, Math.max(minimo, Math.round(Number(numero)) || minimo)))
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="boton boton-claro h-10 w-10 shrink-0 p-0 text-lg"
        onClick={() => fijar(valor - 1)}
        disabled={valor <= minimo}
        aria-label="Uno menos"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="campo w-20 text-center"
        value={valor}
        min={minimo}
        max={maximo}
        onChange={(evento) => fijar(evento.target.value)}
        aria-label="Cantidad"
      />
      <button
        type="button"
        className="boton boton-claro h-10 w-10 shrink-0 p-0 text-lg"
        onClick={() => fijar(valor + 1)}
        disabled={valor >= maximo}
        aria-label="Uno más"
      >
        +
      </button>
      <span className="text-xs text-neutral-500">de {maximo}</span>
    </div>
  )
}

// Botones para usar el precio publicado (minorista, el precio con tarjeta),
// el mayorista del lote o, si en Ajustes hay descuento en efectivo para esa
// tabla, el precio en efectivo. Despues el precio se puede seguir cambiando a
// mano. minorista y mayorista en pesos; mayorista null = el lote no tiene,
// undefined = no se ofrece. tabla: 'celulares' o 'accesorios'.
export function ElegirPrecio({ minorista, mayorista, tabla, valor, alElegir }) {
  const { configuracion } = usePanel()
  const descuento = descuentoPara(tabla, descuentosDe(configuracion))
  const efectivo = precioEnEfectivo(minorista, descuento)
  const opciones = [
    { nombre: 'Publicado', precio: minorista },
    mayorista !== undefined && { nombre: 'Mayorista', precio: mayorista },
    efectivo !== null && { nombre: 'Efectivo', precio: efectivo, ayuda: `Precio con tarjeta menos el ${descuento} %` },
  ].filter(Boolean)
  // Con un solo boton no hay nada que elegir.
  if (opciones.length < 2) return null
  return (
    <div className={`mt-1.5 grid gap-1.5 ${opciones.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {opciones.map((opcion) => (
        <button
          key={opcion.nombre}
          type="button"
          className={`boton boton-chico min-w-0 flex-col gap-0 py-1 ${opcion.precio !== null && valor === opcion.precio ? 'boton-oscuro' : 'boton-claro'}`}
          disabled={opcion.precio === null}
          onClick={() => alElegir(opcion.precio)}
          title={opcion.ayuda}
        >
          <span>{opcion.nombre}</span>
          <span className="truncate text-[11px] font-normal">{opcion.precio === null ? 'Sin cargar' : pesos(opcion.precio)}</span>
        </button>
      ))}
    </div>
  )
}

// Elegir un dia (la fecha de compra o la de venta). Arranca en hoy y no deja
// elegir uno futuro ni, si hay "minimo", uno anterior (por ejemplo, vender
// antes de que el equipo entrara al stock). valor, hoy y minimo: "AAAA-MM-DD".
// original: el dia con el que arranca (hoy, salvo al corregir una fecha).
// maximo: opcional, el ultimo dia que se puede elegir (si no, hoy).
export function CampoFecha({ etiqueta, valor, alCambiar, hoy, original = hoy, minimo = '', maximo = '', ayuda }) {
  const problema = problemaDeDia(valor, { hoy, minimo, maximo })
  // El dia contra el que choca, para mostrarlo: "(22/10/26)".
  const limite = minimo && valor < minimo ? minimo : maximo && valor > maximo ? maximo : ''
  return (
    <label className="etiqueta">
      {etiqueta}
      <input
        type="date"
        className="campo"
        value={valor}
        min={minimo || undefined}
        max={maximo && maximo < hoy ? maximo : hoy}
        onChange={(evento) => alCambiar(evento.target.value)}
      />
      <span className={`mt-0.5 block text-[11px] font-normal ${problema ? 'text-red-700' : 'text-neutral-500'}`}>
        {problema
          ? `${problema}${limite ? ` (${soloFecha(`${limite}T12:00:00`)})` : ''}.`
          : original === hoy && valor !== hoy
            ? `Queda con fecha ${soloFecha(`${valor}T12:00:00`)}, no la de hoy.`
            : ayuda}
      </span>
    </label>
  )
}
