// panel/Caja.jsx
// Pestana "Caja": toda la plata que entra y sale.
//
// Las ventas, los pagos de revendedores y senas y los arreglos cobrados
// aparecen solos. A mano se anotan los gastos (alquiler, un pago a un
// proveedor, un retiro) y los ingresos que no salen del stock (una "venta
// aparte", el saldo con el que se arranca).

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { eliminarMovimiento, guardarMovimiento, leerCaja } from '../apiAdmin.js'
import { dolares, fechaCorta, pesos } from '../formato.js'
import { PERIODOS, armarCaja, cajaACsv, diaDe, filtrarCaja, resumirCaja } from '../servicios/caja.js'
import { SelectorConOtro } from './Campos.jsx'
import { SelectorMedio } from './Cobro.jsx'
import { VentanaTicket } from './Impresion.jsx'
import { usePanel } from './contexto.js'
import { CATEGORIAS_DE_GASTO, CATEGORIAS_DE_INGRESO, conLasUsadas } from './listas.js'
import { useAccion } from './useAccion.js'

const DE_A = 30

export default function PestanaCaja() {
  const { datos } = usePanel()
  // null mientras carga; despues, las filas de caja_datos().
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [periodo, setPeriodo] = useState('hoy')
  const [mostrados, setMostrados] = useState(DE_A)
  // Ventana abierta: { clase: 'movimiento', tipo, movimiento } o { clase: 'ticket', id }.
  const [ventana, setVentana] = useState(null)

  // Se vuelve a leer cada vez que cambian los datos del panel.
  useEffect(() => {
    let vigente = true
    leerCaja()
      .then((resultado) => vigente && setFilas(resultado))
      .catch((fallo) => vigente && setError(fallo.message))
    return () => {
      vigente = false
    }
  }, [datos])

  const movimientos = useMemo(() => (filas ? armarCaja(filas) : []), [filas])

  if (error) return <p className="tarjeta p-6 text-center text-sm text-red-700">{error}</p>
  if (!filas) return <p className="tarjeta p-6 text-center text-sm text-neutral-500">Cargando la caja...</p>

  // Lo que hay en la caja se calcula con TODOS los movimientos, no con el periodo.
  const saldo = resumirCaja(movimientos)
  const delPeriodo = filtrarCaja(movimientos, periodo)
  const resumen = resumirCaja(delPeriodo)
  const nombreDelPeriodo = PERIODOS.find((opcion) => opcion.id === periodo).nombre

  function exportar() {
    // El primer caracter (BOM) le avisa a Excel que el archivo tiene tildes.
    const archivo = new Blob(['﻿' + cajaACsv(delPeriodo)], { type: 'text/csv;charset=utf-8' })
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(archivo)
    enlace.download = `caja-${periodo}.csv`
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  // Lo anotado a mano se puede corregir; una venta abre su ticket.
  function abrir(movimiento) {
    if (movimiento.origen === 'movimiento') setVentana({ clase: 'movimiento', tipo: movimiento.tipo, movimiento })
    else if (movimiento.origen === 'venta' && movimiento.id) setVentana({ clase: 'ticket', id: movimiento.id })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Dato titulo="Efectivo en caja" valor={pesos(saldo.efectivo)} detalle="Acumulado" negativo={saldo.efectivo < 0} />
        <Dato titulo="En el banco" valor={pesos(saldo.transferencia)} detalle="Transferencias y tarjeta" negativo={saldo.transferencia < 0} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton boton-verde" onClick={() => setVentana({ clase: 'movimiento', tipo: 'ingreso' })}>
          + Ingreso
        </button>
        <button type="button" className="boton boton-oscuro" onClick={() => setVentana({ clase: 'movimiento', tipo: 'egreso' })}>
          + Gasto
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-neutral-200 p-1" role="tablist" aria-label="Período">
        {PERIODOS.map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            role="tab"
            aria-selected={periodo === opcion.id}
            onClick={() => {
              setPeriodo(opcion.id)
              setMostrados(DE_A)
            }}
            className={`min-w-0 rounded-lg px-1 py-1.5 text-xs font-medium transition-colors duration-200 ${
              periodo === opcion.id ? 'bg-black text-white shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            {opcion.nombre}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Dato titulo="Entró" valor={pesos(resumen.ingresos)} />
        <Dato titulo="Salió" valor={pesos(resumen.egresos)} />
        <Dato titulo="Resultado" valor={pesos(resumen.resultado)} negativo={resumen.resultado < 0} />
      </div>
      <p className="px-1 text-xs text-neutral-500">
        {nombreDelPeriodo}: efectivo {pesos(resumen.efectivo)} · banco {pesos(resumen.transferencia)}
      </p>

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Movimientos</h3>
        <button type="button" className="boton boton-claro boton-chico" onClick={exportar} disabled={delPeriodo.length === 0}>
          Exportar CSV
        </button>
      </div>

      {delPeriodo.length === 0 && (
        <p className="tarjeta p-6 text-center text-sm text-neutral-500">
          {periodo === 'todo' ? 'Todavía no hay movimientos.' : 'No hay movimientos en este período.'}
        </p>
      )}

      {delPeriodo.length > 0 && (
        <ul className="tarjeta divide-y divide-neutral-200 overflow-hidden">
          {delPeriodo.slice(0, mostrados).map((movimiento) => (
            <li key={movimiento.llave}>
              <Movimiento movimiento={movimiento} alAbrir={() => abrir(movimiento)} />
            </li>
          ))}
        </ul>
      )}

      {delPeriodo.length > mostrados && (
        <button type="button" className="boton boton-claro w-full" onClick={() => setMostrados(mostrados + DE_A)}>
          Ver más ({delPeriodo.length - mostrados})
        </button>
      )}

      {ventana?.clase === 'movimiento' && (
        <ModalMovimiento
          tipo={ventana.tipo}
          movimiento={ventana.movimiento}
          // Las categorias ya usadas se ofrecen en la lista.
          usadas={movimientos.filter((otro) => otro.origen === 'movimiento' && otro.tipo === ventana.tipo).map((otro) => otro.categoria)}
          alCerrar={() => setVentana(null)}
        />
      )}
      {ventana?.clase === 'ticket' && <VentanaTicket comprobanteId={ventana.id} alCerrar={() => setVentana(null)} />}
    </div>
  )
}

function Dato({ titulo, valor, detalle, negativo = false }) {
  return (
    <div className="tarjeta min-w-0 px-2.5 py-2">
      <p className="truncate text-[10px] tracking-wide text-neutral-500 uppercase">{titulo}</p>
      <p className={`truncate text-sm font-semibold ${negativo ? 'text-red-700' : ''}`}>{valor}</p>
      {detalle && <p className="truncate text-[11px] text-neutral-500">{detalle}</p>}
    </div>
  )
}

// Con que se movio la plata: un medio solo, o los dos con su parte.
function textoDeMedio(movimiento) {
  const efectivo = Math.abs(movimiento.efectivo_ars)
  const transferencia = Math.abs(movimiento.transferencia_ars)
  if (efectivo > 0 && transferencia > 0) return `Efectivo ${pesos(efectivo)} + banco ${pesos(transferencia)}`
  // "Banco": por transferencia o con tarjeta (posnet o QR).
  return transferencia > 0 ? 'Banco' : 'Efectivo'
}

function Movimiento({ movimiento, alAbrir }) {
  const sale = movimiento.total_ars < 0
  const seAbre = movimiento.origen === 'movimiento' || (movimiento.origen === 'venta' && Boolean(movimiento.id))
  const quien = movimiento.persona || movimiento.proveedor

  return (
    <button type="button" className="renglon flex w-full items-start gap-2 px-3 py-2 text-left disabled:cursor-default" disabled={!seAbre} onClick={alAbrir}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words">
          {movimiento.concepto}
          {movimiento.detalle && <span className="font-normal text-neutral-600"> · {movimiento.detalle}</span>}
        </p>
        <p className="text-[11px] break-words text-neutral-500">
          {fechaCorta(movimiento.fecha)}
          {quien && ` · ${quien}`}
          {` · ${textoDeMedio(movimiento)}`}
        </p>
      </div>
      <p className={`shrink-0 text-sm font-semibold whitespace-nowrap ${sale ? 'text-red-700' : 'text-green-700'}`}>
        {sale ? '- ' : '+ '}
        {pesos(Math.abs(movimiento.total_ars))}
      </p>
    </button>
  )
}

// Anotar o corregir un ingreso o un gasto.
// tipo: 'ingreso' o 'egreso'. movimiento: el que se corrige (sin el, es nuevo).
// inicial: valores de arranque para uno nuevo (por ejemplo, el proveedor).
export function ModalMovimiento({ tipo, movimiento, inicial = {}, usadas = [], alCerrar }) {
  const { datos, cotizaciones, recargar } = usePanel()
  const esGasto = tipo === 'egreso'
  // El dia de hoy se toma una sola vez, al abrir la ventana.
  const [hoy] = useState(() => diaDe(new Date()))
  const diaOriginal = movimiento ? diaDe(movimiento.fecha) : hoy

  const [categoria, setCategoria] = useState(movimiento?.categoria || inicial.categoria || '')
  const [detalle, setDetalle] = useState(movimiento?.detalle || '')
  const [monto, setMonto] = useState(movimiento ? Math.round(Math.abs(movimiento.total_ars)) : null)
  const [medio, setMedio] = useState(movimiento?.medio || 'efectivo')
  const [persona, setPersona] = useState(movimiento?.persona || '')
  const [proveedor, setProveedor] = useState(movimiento?.proveedor || inicial.proveedor || '')
  const [dia, setDia] = useState(diaOriginal)
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, ejecutar] = useAccion()

  const categorias = conLasUsadas(esGasto ? CATEGORIAS_DE_GASTO : CATEGORIAS_DE_INGRESO, usadas)

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await guardarMovimiento(movimiento?.id ?? null, {
          tipo,
          categoria,
          detalle,
          monto_ars: monto,
          medio,
          cliente: esGasto ? '' : persona,
          proveedor: esGasto ? proveedor : '',
          // Sin fecha, la base usa este momento (o deja la que tenia). Si se
          // eligio otro dia, se anota al mediodia de ese dia.
          fecha: dia === diaOriginal ? null : new Date(`${dia}T12:00:00`).toISOString(),
        })
        await recargar()
      },
      { exito: esGasto ? 'Gasto guardado' : 'Ingreso guardado', alTerminar: alCerrar },
    )
  }

  if (confirmando) {
    return (
      <Confirmar
        titulo={esGasto ? 'Eliminar gasto' : 'Eliminar ingreso'}
        textoBoton="Sí, eliminar"
        peligro
        alCerrar={alCerrar}
        alConfirmar={async () => {
          await eliminarMovimiento(movimiento.id)
          await recargar()
          toast.success('Eliminado')
        }}
      >
        Vas a eliminar <strong>{movimiento.concepto}</strong> por <strong>{pesos(Math.abs(movimiento.total_ars))}</strong> del{' '}
        {fechaCorta(movimiento.fecha)}.
      </Confirmar>
    )
  }

  return (
    <Modal titulo={`${movimiento ? 'Corregir' : 'Anotar'} ${esGasto ? 'gasto' : 'ingreso'}`} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="space-y-3">
        <label className="etiqueta">
          Categoría
          <SelectorConOtro valor={categoria} alCambiar={setCategoria} opciones={categorias} />
        </label>
        <label className="etiqueta">
          Detalle
          <input
            className="campo"
            value={detalle}
            onChange={(evento) => setDetalle(evento.target.value)}
            placeholder={esGasto ? 'Opcional: qué se pagó' : 'Opcional: qué se vendió'}
            maxLength={200}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta">
            Monto ($)
            <CampoPesos valor={monto} alCambiar={setMonto} />
          </label>
          <label className="etiqueta">
            {esGasto ? 'Cómo se pagó' : 'Cómo pagó'}
            <SelectorMedio valor={medio} alCambiar={setMedio} />
          </label>
        </div>
        {esGasto ? (
          <label className="etiqueta">
            Proveedor (opcional)
            <SelectorConOtro valor={proveedor} alCambiar={setProveedor} opciones={datos.proveedores.map((opcion) => opcion.nombre)} vacio="Sin proveedor" />
            {/* La deuda con un proveedor se lleva en dolares: el pago se pasa con el dolar de costo de hoy. */}
            {proveedor.trim() && monto > 0 && !movimiento && (
              <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">
                Baja {dolares(monto / cotizaciones.costo)} de lo que se le debe (dólar costo {pesos(cotizaciones.costo)}).
              </span>
            )}
          </label>
        ) : (
          <label className="etiqueta">
            Cliente (opcional)
            <input className="campo" value={persona} onChange={(evento) => setPersona(evento.target.value)} maxLength={80} autoComplete="off" />
          </label>
        )}
        <label className="etiqueta">
          Fecha
          <input type="date" className="campo" value={dia} max={hoy} onChange={(evento) => setDia(evento.target.value || diaOriginal)} />
        </label>

        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !categoria.trim() || !monto}>
          {ocupado ? 'Guardando...' : 'Guardar'}
        </button>
        {movimiento && (
          <button type="button" className="boton boton-peligro w-full" disabled={ocupado} onClick={() => setConfirmando(true)}>
            Eliminar
          </button>
        )}
      </form>
    </Modal>
  )
}
