// panel/Carrito.jsx
// El carrito: equipos elegidos desde el stock para entregarle a un revendedor
// (sin pagarlos todavia) o para reservarle a un cliente con una sena.
// Es uno solo y no mezcla los dos tipos.

import { useState } from 'react'
import Modal from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { entregarACuenta } from '../apiAdmin.js'
import { aDolares, pesos } from '../formato.js'
import { ElegirPrecio, SelectorConOtro } from './Campos.jsx'
import { SelectorMedio } from './Cobro.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

// Barra fija abajo que avisa que hay un carrito armado.
export function BarraCarrito() {
  const { carrito } = usePanel()
  const [abierto, setAbierto] = useState(false)
  const unidades = carrito.items.reduce((suma, item) => suma + item.ids.length, 0)

  if (unidades === 0) return null

  return (
    <>
      <div className="sticky bottom-0 z-20 border-t border-neutral-300 bg-white px-3 py-2 text-neutral-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm">
            {carrito.tipo === 'sena' ? 'Seña' : 'Carrito revendedor'} · {unidades} {unidades === 1 ? 'unidad' : 'unidades'}
          </p>
          <button type="button" className="boton boton-blanco boton-chico shrink-0" onClick={() => setAbierto(true)}>
            Ver carrito
          </button>
        </div>
      </div>
      {abierto && <ModalCarrito alCerrar={() => setAbierto(false)} />}
    </>
  )
}

function ModalCarrito({ alCerrar }) {
  const { carrito, cambiarCarrito, vaciarCarrito, cuentas, cotizaciones, recargar } = usePanel()
  const esSena = carrito.tipo === 'sena'
  const [nombre, setNombre] = useState('')
  const [entrega, setEntrega] = useState(null) // pesos que entrega ahora
  const [medio, setMedio] = useState('efectivo')
  const [ocupado, ejecutar] = useAccion()

  // Personas que ya tienen cuenta de este tipo (y los revendedores guardados).
  const personas = cuentas[carrito.tipo].map((cuenta) => cuenta.nombre)

  const total = carrito.items.reduce((suma, item) => suma + (item.precio ?? 0) * item.ids.length, 0)
  const falta = !nombre.trim() || carrito.items.length === 0 || carrito.items.some((item) => item.precio === null)

  function cambiarPrecio(posicion, precio) {
    cambiarCarrito({ ...carrito, items: carrito.items.map((item, indice) => (indice === posicion ? { ...item, precio } : item)) })
  }

  function quitar(posicion) {
    const items = carrito.items.filter((_, indice) => indice !== posicion)
    if (items.length === 0) {
      vaciarCarrito()
      alCerrar()
    } else {
      cambiarCarrito({ ...carrito, items })
    }
  }

  function confirmar(evento) {
    evento.preventDefault()
    // Cada unidad viaja con su precio acordado, en dolares.
    const armar = (tabla) =>
      carrito.items
        .filter((item) => item.tabla === tabla)
        .flatMap((item) => item.ids.map((id) => ({ id, precio_usd: aDolares(item.precio, cotizaciones.venta) })))

    ejecutar(
      async () => {
        await entregarACuenta(carrito.tipo, nombre, armar('celulares'), armar('accesorios'), entrega || 0, medio)
        vaciarCarrito()
        await recargar()
      },
      { exito: esSena ? 'Seña registrada' : 'Equipos entregados', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={esSena ? 'Señar equipos' : 'Entregar a un revendedor'} alCerrar={alCerrar}>
      <form onSubmit={confirmar} className="space-y-4">
        <label className="etiqueta">
          {esSena ? 'Cliente' : 'Revendedor'}
          <SelectorConOtro valor={nombre} alCambiar={setNombre} opciones={personas} vacio={esSena ? 'Elegir cliente...' : 'Elegir revendedor...'} />
        </label>

        <ul className="space-y-2">
          {carrito.items.map((item, posicion) => (
            <li key={`${item.tabla}|${item.clave}`} className="rounded-lg bg-neutral-50 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">
                    {item.ids.length} x {item.descripcion}
                  </p>
                  {item.detalle && <p className="text-xs break-words text-neutral-500">{item.detalle}</p>}
                </div>
                <button type="button" className="boton boton-claro boton-chico shrink-0" onClick={() => quitar(posicion)}>
                  Quitar
                </button>
              </div>
              <label className="etiqueta mt-2">
                Precio acordado por unidad ($)
                <CampoPesos valor={item.precio} alCambiar={(precio) => cambiarPrecio(posicion, precio)} />
              </label>
              {item.minorista !== undefined && (
                <ElegirPrecio minorista={item.minorista} mayorista={item.mayorista} valor={item.precio} alElegir={(precio) => cambiarPrecio(posicion, precio)} />
              )}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-3">
          <label className={`etiqueta ${entrega ? '' : 'col-span-2'}`}>
            Entrega ahora ($)
            <CampoPesos valor={entrega} alCambiar={setEntrega} placeholder="Nada por ahora" />
          </label>
          {/* Como paga solo importa si entrega algo. */}
          {Boolean(entrega) && (
            <label className="etiqueta">
              Cómo paga
              <SelectorMedio valor={medio} alCambiar={setMedio} />
            </label>
          )}
        </div>

        <dl className="space-y-1 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Total acordado</dt>
            <dd className="font-semibold whitespace-nowrap">{pesos(total)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-600">Queda debiendo</dt>
            <dd className="font-semibold whitespace-nowrap">{pesos(Math.max(0, total - (entrega || 0)))}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="boton boton-claro"
            disabled={ocupado}
            onClick={() => {
              vaciarCarrito()
              alCerrar()
            }}
          >
            Vaciar
          </button>
          <button type="submit" className="boton boton-oscuro" disabled={ocupado || falta}>
            {ocupado ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
