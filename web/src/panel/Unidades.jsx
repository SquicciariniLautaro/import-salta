// panel/Unidades.jsx
// Elegir QUE unidades de un lote se venden, se entregan o se borran.
//
// En la base cada fila es una unidad fisica. Si el lote no tiene IMEI
// cargados da lo mismo cual sale, y se elige solo la cantidad. Si los tiene,
// hay que saber cual equipo se va: se marca en una lista o se lee su IMEI.

import { useState } from 'react'
import toast from 'react-hot-toast'
import { extraerImei } from '../formato.js'
import { Cantidad } from './Campos.jsx'
import { avisarNoEsImei, usePistola } from './pistola.js'

// unidades: las que se pueden elegir. elegidas: lista de ids.
export function SelectorUnidades({ unidades, elegidas, alCambiar }) {
  const [texto, setTexto] = useState('')
  const hayImei = unidades.some((unidad) => unidad.imei)
  // La pistola marca el equipo aunque el cursor no este en el campo.
  const zona = usePistola((codigo) => leer(codigo), hayImei)

  if (!hayImei) {
    return (
      <Cantidad
        valor={elegidas.length}
        maximo={unidades.length}
        // Se toman las primeras N del lote.
        alCambiar={(cantidad) => alCambiar(unidades.slice(0, cantidad).map((unidad) => unidad.id))}
      />
    )
  }

  function alternar(id) {
    alCambiar(elegidas.includes(id) ? elegidas.filter((otro) => otro !== id) : [...elegidas, id])
  }

  // Leer un IMEI (pistola o teclado + Enter) marca ese equipo.
  function leer(valor) {
    const imei = extraerImei(valor)
    if (!imei) {
      avisarNoEsImei(valor)
      return
    }
    const unidad = unidades.find((candidata) => candidata.imei === imei)
    if (!unidad) {
      toast.error(`El IMEI ${imei} no es de estos equipos`)
      return
    }
    if (!elegidas.includes(unidad.id)) alCambiar([...elegidas, unidad.id])
    toast.success(`Marcado ${imei}`, { id: 'imei-marcado', duration: 1500 })
    setTexto('')
  }

  return (
    <div ref={zona}>
      <input
        className="campo"
        inputMode="numeric"
        autoComplete="off"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') {
            evento.preventDefault()
            if (texto.trim()) leer(texto)
          }
        }}
        placeholder="Leé el IMEI con la pistola para marcarlo"
        aria-label="Leer IMEI"
      />
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {unidades.map((unidad) => (
          <li key={unidad.id}>
            <label className="renglon flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-black"
                checked={elegidas.includes(unidad.id)}
                onChange={() => alternar(unidad.id)}
              />
              <span className={unidad.imei ? 'font-mono' : 'text-neutral-500'}>{unidad.imei || 'Sin IMEI'}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-neutral-500">
        {elegidas.length} de {unidades.length} elegidos
      </p>
    </div>
  )
}
