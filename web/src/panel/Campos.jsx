// panel/Campos.jsx
// Campos de formulario que se repiten en el panel.

import { useState } from 'react'
import { aPesos, pesos } from '../formato.js'

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

// Dos botones para usar el precio publicado (minorista) o el mayorista del
// lote. Despues el precio se puede seguir cambiando a mano.
// minorista y mayorista en pesos; mayorista null = el lote no tiene.
export function ElegirPrecio({ minorista, mayorista, valor, alElegir }) {
  const opciones = [
    { nombre: 'Publicado', precio: minorista },
    { nombre: 'Mayorista', precio: mayorista },
  ]
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
      {opciones.map((opcion) => (
        <button
          key={opcion.nombre}
          type="button"
          className={`boton boton-chico min-w-0 flex-col gap-0 py-1 ${opcion.precio !== null && valor === opcion.precio ? 'boton-oscuro' : 'boton-claro'}`}
          disabled={opcion.precio === null}
          onClick={() => alElegir(opcion.precio)}
        >
          <span>{opcion.nombre}</span>
          <span className="truncate text-[11px] font-normal">{opcion.precio === null ? 'Sin cargar' : pesos(opcion.precio)}</span>
        </button>
      ))}
    </div>
  )
}
