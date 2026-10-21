// panel/Combos.jsx
// Combos: varios accesorios que se venden juntos a un precio (por ejemplo,
// fuente + cable). Se arman con los lotes de accesorios que ya existen: no
// tienen stock propio, se pueden vender mientras haya de todas sus partes.

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import { eliminarCombo, guardarCombo } from '../apiAdmin.js'
import { aPesos, dolares, pesos } from '../formato.js'
import { armarCombos } from '../servicios/combos.js'
import { describir } from '../servicios/texto.js'
import { CampoUsd } from './Campos.jsx'
import { ModalVentaCombo } from './Venta.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

// Tarjeta desplegable con los combos, arriba de la lista de accesorios.
export function SeccionCombos() {
  const { datos, stock, cotizaciones, recargar } = usePanel()
  const combos = useMemo(() => armarCombos(datos.combos, stock.accesorios), [datos.combos, stock.accesorios])
  const [abierta, setAbierta] = useState(false)
  // Ventana abierta: { clase: 'nuevo' | 'editar' | 'vender' | 'eliminar', id }.
  const [ventana, setVentana] = useState(null)

  const deVentana = ventana?.id ? combos.find((combo) => combo.id === ventana.id) : null
  const cerrar = () => setVentana(null)

  return (
    <section className="tarjeta overflow-hidden">
      <button type="button" className="renglon flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
        <span className="min-w-0 text-sm font-semibold">Combos</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
          {combos.length}
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {abierta && (
        <div className="animate-aparecer space-y-2 border-t border-neutral-200 bg-neutral-50 px-3 py-3">
          {combos.length === 0 && (
            <p className="text-xs text-neutral-600">
              Un combo junta accesorios que se venden juntos, como fuente + cable. Al venderlo se descuenta cada parte del stock.
            </p>
          )}
          {combos.map((combo) => (
            <div key={combo.id} className="rounded-lg bg-white p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold break-words">{combo.nombre}</p>
                  <p className="text-xs break-words text-neutral-500">{combo.descripcion}</p>
                  <p className={`text-[11px] ${combo.disponibles > 0 ? 'text-neutral-500' : 'font-medium text-red-600'}`}>
                    {combo.disponibles > 0 ? `Se pueden armar ${combo.disponibles}` : 'Sin stock de alguna parte'}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold whitespace-nowrap">{pesos(aPesos(combo.precio_usd, cotizaciones.venta))}</p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button type="button" className="boton boton-verde boton-chico" disabled={combo.disponibles === 0} onClick={() => setVentana({ clase: 'vender', id: combo.id })}>
                  Vender
                </button>
                <button type="button" className="boton boton-claro boton-chico" onClick={() => setVentana({ clase: 'editar', id: combo.id })}>
                  Editar
                </button>
                <button type="button" className="boton boton-peligro boton-chico" onClick={() => setVentana({ clase: 'eliminar', id: combo.id })}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="boton boton-oscuro boton-chico w-full" disabled={stock.accesorios.length === 0} onClick={() => setVentana({ clase: 'nuevo' })}>
            + Nuevo combo
          </button>
        </div>
      )}

      {ventana?.clase === 'nuevo' && <ModalCombo alCerrar={cerrar} />}
      {deVentana && ventana.clase === 'editar' && <ModalCombo combo={deVentana} alCerrar={cerrar} />}
      {deVentana && ventana.clase === 'vender' && <ModalVentaCombo combo={deVentana} alCerrar={cerrar} />}
      {deVentana && ventana.clase === 'eliminar' && (
        <Confirmar
          titulo="Eliminar combo"
          textoBoton="Sí, eliminar"
          peligro
          alCerrar={cerrar}
          alConfirmar={async () => {
            await eliminarCombo(deVentana.id)
            await recargar()
            toast.success('Combo eliminado')
          }}
        >
          Vas a eliminar el combo <strong>{deVentana.nombre}</strong>. Los accesorios siguen en el stock.
        </Confirmar>
      )}
    </section>
  )
}

// Crear o corregir un combo: nombre, precio y que accesorios lleva.
function ModalCombo({ combo, alCerrar }) {
  const { stock, cotizaciones, recargar } = usePanel()
  const [nombre, setNombre] = useState(combo?.nombre || '')
  const [precio, setPrecio] = useState(combo ? String(combo.precio_usd) : '')
  const [partes, setPartes] = useState(() =>
    combo ? combo.partes.filter((parte) => parte.lote).map(({ clave, cantidad }) => ({ clave, cantidad })) : [{ clave: '', cantidad: 1 }],
  )
  const [ocupado, ejecutar] = useAccion()

  const loteDe = (clave) => stock.accesorios.find((lote) => lote.clave === clave)
  // Lo que suman las partes a precio de lista: sirve de referencia para el precio del combo.
  const porSeparado = partes.reduce((suma, parte) => suma + (loteDe(parte.clave)?.precio_usd ?? 0) * (parte.cantidad || 0), 0)
  const cambiar = (posicion, cambios) => setPartes(partes.map((parte, indice) => (indice === posicion ? { ...parte, ...cambios } : parte)))
  const falta =
    !nombre.trim() || precio === '' || !(Number(precio) >= 0) || partes.length === 0 ||
    partes.some((parte) => !parte.clave || !(parte.cantidad >= 1))

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await guardarCombo(combo?.id ?? null, { nombre, precio_usd: Number(precio), partes })
        await recargar()
      },
      { exito: 'Combo guardado', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={combo ? `Editar · ${combo.nombre}` : 'Nuevo combo'} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <label className="etiqueta">
          Nombre
          <input className="campo" value={nombre} onChange={(evento) => setNombre(evento.target.value)} maxLength={80} placeholder="COMBO CARGADOR 20W + CABLE" />
        </label>

        <div>
          <p className="etiqueta mb-1">Qué lleva</p>
          <div className="space-y-2">
            {partes.map((parte, posicion) => (
              <div key={posicion} className="flex gap-2">
                <select className="campo" value={parte.clave} onChange={(evento) => cambiar(posicion, { clave: evento.target.value })} aria-label="Accesorio">
                  <option value="">Elegir accesorio...</option>
                  {stock.accesorios.map((lote) => (
                    <option
                      key={lote.clave}
                      value={lote.clave}
                      // Un accesorio no puede estar dos veces: se cambia la cantidad.
                      disabled={partes.some((otra, indice) => indice !== posicion && otra.clave === lote.clave)}
                    >
                      {describir(lote, 'accesorios')} ({lote.cantidad})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="99"
                  className="campo w-16 shrink-0 text-center"
                  value={parte.cantidad}
                  onChange={(evento) => cambiar(posicion, { cantidad: evento.target.value === '' ? '' : Math.max(1, Math.min(99, Math.round(Number(evento.target.value)))) })}
                  aria-label="Cantidad"
                />
                <button type="button" className="boton boton-claro shrink-0 px-2.5" onClick={() => setPartes(partes.filter((_, indice) => indice !== posicion))} aria-label="Quitar accesorio">
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="boton boton-claro boton-chico mt-2" onClick={() => setPartes([...partes, { clave: '', cantidad: 1 }])}>
            + Agregar accesorio
          </button>
        </div>

        <label className="etiqueta">
          Precio del combo (USD)
          <CampoUsd valor={precio} alCambiar={setPrecio} cotizacion={cotizaciones.venta} />
          <span className="block text-[11px] text-neutral-500">
            Por separado: {dolares(porSeparado)} ({pesos(aPesos(porSeparado, cotizaciones.venta))})
          </span>
        </label>

        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || falta}>
          {ocupado ? 'Guardando...' : 'Guardar combo'}
        </button>
      </form>
    </Modal>
  )
}
