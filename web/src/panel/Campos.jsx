// panel/Campos.jsx
// Campos de formulario que se repiten en el panel.

import { useState } from 'react'
import { aPesos, pesos, soloFecha } from '../formato.js'
import { descuentoPara, descuentosDe, precioEnEfectivo } from '../servicios/efectivo.js'
import { problemaDeDia } from '../servicios/fechas.js'
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
