// panel/Ventas.jsx
// Pestana "Ventas": resumen, tarjetas por mes (tocar una filtra), grafico e
// historial paginado con exportacion a CSV. El historial se busca por IMEI
// (escrito o con la pistola) o por cliente: sirve para encontrar una venta
// equivocada y anularla.
// Se descarga recien al abrir la pestana: trae la libreria de graficos.

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { anularVenta, editarComprobante, editarVenta, leerVentas } from '../apiAdmin.js'
import { aDolares, aPesos, dolares, extraerImei, fechaCorta, fechaDeCompra, nombreDeMes, normalizar, pesos } from '../formato.js'
import { cobroParaLaBase, nombreDeMedio, numeroDeTicket } from '../servicios/comprobante.js'
import { aCsv, armarVentas, mesDe, totalizar } from '../servicios/ventas.js'
import { CamposDeCliente, CamposDeCobro } from './Cobro.jsx'
import { CampoBusqueda } from './Imei.jsx'
import { IconoImpresora, VentanaTicket } from './Impresion.jsx'
import { SelectorUnidades } from './Unidades.jsx'
import { usePanel } from './contexto.js'
import { avisarNoEsImei, usePistola } from './pistola.js'
import { useAccion } from './useAccion.js'

const POR_PAGINA = 15

// true si el renglon coincide con lo buscado: los digitos (desde 4) se buscan
// en los IMEI de sus equipos; las palabras, en el producto y el comprador.
function coincide(renglon, busqueda) {
  const digitos = busqueda.replace(/D/g, '')
  if (digitos.length >= 4 && digitos.length === busqueda.replace(/[s-]/g, '').length) {
    return renglon.unidades.some((unidad) => unidad.imei && unidad.imei.includes(digitos))
  }
  const texto = normalizar(`${renglon.descripcion} ${renglon.detalle || ''} ${renglon.comprador || ''}`)
  return normalizar(busqueda)
    .split(' ')
    .filter(Boolean)
    .every((palabra) => texto.includes(palabra))
}

export default function PestanaVentas() {
  const { cuentas, datos } = usePanel()
  // null mientras carga; despues { celulares, accesorios } vendidos.
  const [vendidas, setVendidas] = useState(null)
  const [error, setError] = useState('')
  const [mes, setMes] = useState(null) // mes elegido, o null = todo
  const [pagina, setPagina] = useState(1)
  const [renglonAbierto, setRenglonAbierto] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  // Se vuelve a leer cada vez que cambian los datos del panel (por ejemplo,
  // despues de anular una venta).
  useEffect(() => {
    let vigente = true
    leerVentas()
      .then((resultado) => vigente && setVendidas(resultado))
      .catch((fallo) => vigente && setError(fallo.message))
    return () => {
      vigente = false
    }
  }, [datos])

  const { renglones, meses } = useMemo(
    () => (vendidas ? armarVentas(vendidas, [...cuentas.revendedor, ...cuentas.sena]) : { renglones: [], meses: [] }),
    [vendidas, cuentas],
  )

  // La pistola busca el equipo en todo el historial. Si hay una sola venta
  // con ese IMEI, la abre.
  const zona = usePistola((codigo) => {
    const imei = extraerImei(codigo)
    if (!imei) {
      avisarNoEsImei(codigo)
      return
    }
    setBusqueda(imei)
    setMes(null)
    setPagina(1)
    const encontrados = renglones.filter((renglon) => coincide(renglon, imei))
    if (encontrados.length === 0) toast.error('No hay ventas de un equipo con ese IMEI')
    else if (encontrados.length === 1) setRenglonAbierto(encontrados[0])
  }, Boolean(vendidas))

  if (error) return <p className="tarjeta p-6 text-center text-sm text-red-700">{error}</p>
  if (!vendidas) return <p className="tarjeta p-6 text-center text-sm text-neutral-500">Cargando ventas...</p>

  const delMes = mes ? renglones.filter((renglon) => mesDe(renglon.fecha) === mes) : renglones
  const filtrados = busqueda.trim() ? delMes.filter((renglon) => coincide(renglon, busqueda.trim())) : delMes
  const total = totalizar(filtrados)
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas)
  const enPagina = filtrados.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA)

  // Para el grafico: los ultimos 12 meses, del mas viejo al mas nuevo.
  const paraGrafico = meses
    .slice(0, 12)
    .reverse()
    .map((resumen) => ({ mes: resumen.mes.slice(5) + '/' + resumen.mes.slice(2, 4), ganancia: Math.round(resumen.ganancia_usd) }))

  function elegirMes(valor) {
    setMes(mes === valor ? null : valor)
    setPagina(1)
  }

  function exportar() {
    // El primer caracter (BOM) le avisa a Excel que el archivo tiene tildes.
    const archivo = new Blob(['﻿' + aCsv(filtrados)], { type: 'text/csv;charset=utf-8' })
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(archivo)
    enlace.download = `ventas-${mes || 'todas'}.csv`
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  return (
    <div ref={zona} className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Dato titulo={mes ? nombreDeMes(mes) : 'Todo'} valor={`${total.unidades} u.`} />
        <Dato titulo="Cobrado" valor={pesos(total.cobrado_ars)} />
        <Dato titulo="Ganancia" valor={dolares(total.ganancia_usd)} />
      </div>

      {meses.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {meses.map((resumen) => (
            <button
              key={resumen.mes}
              type="button"
              onClick={() => elegirMes(resumen.mes)}
              aria-pressed={mes === resumen.mes}
              className={`tarjeta renglon min-w-0 px-3 py-2 text-left transition-shadow duration-200 hover:shadow-md ${
                mes === resumen.mes ? 'border-black ring-1 ring-black' : ''
              }`}
            >
              <p className="truncate text-xs font-semibold">{nombreDeMes(resumen.mes)}</p>
              <p className="truncate text-sm">{pesos(resumen.cobrado_ars)}</p>
              <p className="truncate text-[11px] text-neutral-500">
                {resumen.unidades} u. · {dolares(resumen.ganancia_usd)}
              </p>
            </button>
          ))}
        </div>
      )}

      {paraGrafico.length > 0 && (
        <div className="tarjeta p-3">
          <p className="mb-2 text-xs font-semibold text-neutral-600">Ganancia por mes (USD)</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paraGrafico} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(valor) => [dolares(valor), 'Ganancia']} cursor={{ fill: '#f5f5f5' }} />
                <Bar dataKey="ganancia" fill="#171717" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <CampoBusqueda
        valor={busqueda}
        alCambiar={(valor) => {
          setBusqueda(valor)
          setPagina(1)
        }}
        placeholder="Buscar venta por IMEI o cliente (o disparar la pistola)"
        etiqueta="Buscar en el historial"
      />

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Historial{mes ? ` · ${nombreDeMes(mes)}` : ''}</h3>
        <button type="button" className="boton boton-claro boton-chico" onClick={exportar} disabled={filtrados.length === 0}>
          Exportar CSV
        </button>
      </div>

      {filtrados.length === 0 && (
        <p className="tarjeta p-6 text-center text-sm text-neutral-500">
          {busqueda.trim() ? `Ninguna venta coincide con "${busqueda.trim()}"${mes ? ' en este mes' : ''}.` : 'Todavía no hay ventas.'}
        </p>
      )}

      {enPagina.length > 0 && (
        <ul className="tarjeta divide-y divide-neutral-200 overflow-hidden">
          {enPagina.map((renglon) => (
            <li key={renglon.llave}>
              <button
                type="button"
                className="renglon flex w-full items-start gap-2 px-3 py-2 text-left disabled:cursor-default"
                // Los pagos a cuenta se corrigen desde la cuenta, no desde aca.
                disabled={renglon.clase !== 'venta'}
                onClick={() => setRenglonAbierto(renglon)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">
                    {renglon.cantidad > 0 && `${renglon.cantidad} x `}
                    {renglon.descripcion}
                  </p>
                  <p className="text-[11px] break-words text-neutral-500">
                    {renglon.clase === 'venta' ? `Vendido el ${fechaCorta(renglon.fecha)}` : fechaCorta(renglon.fecha)}
                    {renglon.clase === 'venta' && fechaDeCompra(renglon.unidades) && ` · comprado ${fechaDeCompra(renglon.unidades)}`}
                    {renglon.detalle && ` · ${renglon.detalle}`}
                    {renglon.clase === 'venta' && renglon.comprador && ` · ${renglon.comprador}`}
                    {renglon.medio && ` · ${nombreDeMedio(renglon.medio)}`}
                    {renglon.cuotas > 1 && ` en ${renglon.cuotas} cuotas`}
                    {renglon.permuta_usd !== null && renglon.clase === 'venta' && ' · con permuta'}
                  </p>
                  {renglon.tabla === 'celulares' && renglon.unidades.some((unidad) => unidad.imei) && (
                    <p className="font-mono text-[11px] break-all text-neutral-500">
                      IMEI {renglon.unidades.map((unidad) => unidad.imei).filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold whitespace-nowrap">{pesos(renglon.cobrado_ars)}</p>
                  <p className={`text-[11px] whitespace-nowrap ${renglon.ganancia_usd < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {dolares(renglon.ganancia_usd)}
                    {renglon.clase === 'pago' && ' est.'}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="boton boton-claro boton-chico" disabled={actual <= 1} onClick={() => setPagina(actual - 1)}>
            Anterior
          </button>
          <span className="text-xs text-neutral-500">
            Página {actual} de {paginas}
          </span>
          <button type="button" className="boton boton-claro boton-chico" disabled={actual >= paginas} onClick={() => setPagina(actual + 1)}>
            Siguiente
          </button>
        </div>
      )}

      {renglonAbierto && (
        <ModalVentaHecha
          renglon={renglonAbierto}
          comprobante={vendidas.comprobantes.find((comprobante) => comprobante.id === renglonAbierto.comprobante_id)}
          alCerrar={() => setRenglonAbierto(null)}
        />
      )}
    </div>
  )
}

function Dato({ titulo, valor }) {
  return (
    <div className="tarjeta min-w-0 px-2.5 py-2">
      <p className="truncate text-[10px] tracking-wide text-neutral-500 uppercase">{titulo}</p>
      <p className="truncate text-sm font-semibold">{valor}</p>
    </div>
  )
}

// Ver el ticket de una venta, corregir su precio o sus datos, o anularla
// (toda o algunas unidades).
// comprobante: el de esta venta, o undefined en las ventas viejas que no tienen.
function ModalVentaHecha({ renglon, comprobante, alCerrar }) {
  const { recargar } = usePanel()
  const [ticket, setTicket] = useState(false)
  // El precio se corrige en pesos a la cotizacion del dia de la venta.
  const [precio, setPrecio] = useState(aPesos(renglon.precio_usd, renglon.cotizacion_venta))
  const [paraAnular, setParaAnular] = useState(renglon.unidades.map((unidad) => unidad.id))
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, ejecutar] = useAccion()
  const ids = renglon.unidades.map((unidad) => unidad.id)

  if (ticket) return <VentanaTicket comprobanteId={comprobante.id} alCerrar={() => setTicket(false)} />

  if (confirmando) {
    return (
      <Confirmar
        titulo="Anular venta"
        textoBoton="Sí, anular"
        peligro
        alCerrar={alCerrar}
        alConfirmar={async () => {
          await anularVenta(renglon.tabla, paraAnular)
          await recargar()
          toast.success('Venta anulada: las unidades volvieron al stock')
        }}
      >
        Vas a anular {paraAnular.length} {paraAnular.length === 1 ? 'unidad' : 'unidades'} de <strong>{renglon.descripcion}</strong>.
        Vuelven al stock del local.
      </Confirmar>
    )
  }

  return (
    <Modal titulo={`${renglon.cantidad} x ${renglon.descripcion}`} alCerrar={alCerrar}>
      <p className="text-xs text-neutral-500">
        Vendido el {fechaCorta(renglon.fecha)} · dólar del día {pesos(renglon.cotizacion_venta)}
      </p>
      {fechaDeCompra(renglon.unidades) && <p className="text-xs text-neutral-500">Comprado {fechaDeCompra(renglon.unidades)}</p>}
      {comprobante?.debe_ars > 0 && (
        <p className="mt-1 text-xs text-red-700">
          Quedó debiendo {pesos(comprobante.debe_ars)}, en la cuenta de {comprobante.cliente}. Si anulás toda la venta, esa deuda se borra.
        </p>
      )}

      {comprobante && (
        <button type="button" className="boton boton-claro mt-3 w-full" onClick={() => setTicket(true)}>
          <IconoImpresora />
          Ver ticket N° {numeroDeTicket(comprobante.id)}
        </button>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(evento) => {
          evento.preventDefault()
          ejecutar(
            async () => {
              await editarVenta(renglon.tabla, ids, aDolares(precio, renglon.cotizacion_venta))
              await recargar()
            },
            { exito: 'Precio corregido', alTerminar: alCerrar },
          )
        }}
      >
        <label className="etiqueta flex-1">
          Precio por unidad ($)
          <CampoPesos valor={precio} alCambiar={setPrecio} />
        </label>
        <button type="submit" className="boton boton-oscuro shrink-0" disabled={ocupado || precio === null}>
          Corregir
        </button>
      </form>

      {comprobante && <DatosDeComprobante comprobante={comprobante} total={renglon.cobrado_ars} alCerrar={alCerrar} />}

      <section className="mt-5 border-t border-neutral-200 pt-4">
        <h3 className="mb-2 text-sm font-semibold">Anular</h3>
        <SelectorUnidades unidades={renglon.unidades} elegidas={paraAnular} alCambiar={setParaAnular} />
        <button type="button" className="boton boton-peligro mt-3 w-full" disabled={paraAnular.length === 0} onClick={() => setConfirmando(true)}>
          Anular {paraAnular.length} {paraAnular.length === 1 ? 'unidad' : 'unidades'}
        </button>
      </section>
    </Modal>
  )
}

// Corregir quien compro y como pago. El medio de pago solo se puede cambiar
// en ventas de mostrador y permutas: las de una cuenta se cobraron con pagos.
function DatosDeComprobante({ comprobante, total, alCerrar }) {
  const { recargar } = usePanel()
  const conMedio = comprobante.origen === 'mostrador' || comprobante.origen === 'permuta'
  const [persona, setPersona] = useState({ cliente: comprobante.cliente, telefono: comprobante.telefono })
  const [cobro, setCobro] = useState({
    medio: comprobante.medio || 'efectivo',
    efectivo: comprobante.efectivo_ars,
    cuotas: comprobante.cuotas || 1,
    recargo: Number(comprobante.recargo_pct) || 0,
  })
  const [ocupado, ejecutar] = useAccion()

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await editarComprobante(comprobante.id, { ...persona, ...cobroParaLaBase(cobro) })
        await recargar()
      },
      { exito: 'Datos de la venta guardados', alTerminar: alCerrar },
    )
  }

  return (
    <form onSubmit={guardar} className="mt-5 space-y-3 border-t border-neutral-200 pt-4">
      <h3 className="text-sm font-semibold">Cliente y pago</h3>
      <CamposDeCliente cliente={persona.cliente} telefono={persona.telefono} alCambiar={setPersona} />
      {conMedio && <CamposDeCobro cobro={cobro} alCambiar={setCobro} total={total} />}
      {/* El pago mixto es de la venta entera, no solo de este renglon. */}
      {conMedio && cobro.medio === 'mixto' && (
        <p className="text-xs text-neutral-500">El efectivo es sobre el total del ticket, que puede incluir otros productos.</p>
      )}
      <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || (conMedio && cobro.medio === 'mixto' && cobro.efectivo === null)}>
        {ocupado ? 'Guardando...' : 'Guardar datos'}
      </button>
    </form>
  )
}
