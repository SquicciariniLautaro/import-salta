// panel/Venta.jsx
// Ventana "Vendido": cantidad (o cuales equipos), precio final por unidad en
// pesos y, si es un celular, los accesorios que se lleva con el equipo.
// Tambien quien compra, como paga y cuantos dias de garantia tiene. Al
// terminar ofrece imprimir el ticket y, si se vendio un celular, hacer el acta
// de entrega y garantia (revision y firmas, ver Acta.jsx).

import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { vender } from '../apiAdmin.js'
import { aDolares, aPesos, pesos } from '../formato.js'
import { COBRO_VACIO, DEUDA_VACIA, cobroIncompleto, cobroParaLaBase, montoDeDeuda, numeroDeTicket, problemaDeDeuda } from '../servicios/comprobante.js'
import { venderCombo } from '../servicios/combos.js'
import { precioPorCantidad } from '../servicios/precios.js'
import { describir } from '../servicios/texto.js'
import { diaDe } from '../servicios/caja.js'
import { diaDeLaCompraMasNueva, fechaParaLaBase, problemaDeDia } from '../servicios/fechas.js'
import { CampoFecha, Cantidad, ElegirPrecio } from './Campos.jsx'
import { CampoDeuda, CampoGarantia, CampoVendedor, CamposDeCliente, CamposDeCobro } from './Cobro.jsx'
import { useVendedor } from './useVendedor.js'
import { IconoImpresora, VentanaTicket } from './Impresion.jsx'
import { ModalActa, VentanaActa } from './Acta.jsx'
import { SelectorUnidades } from './Unidades.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

// Precio por unidad de un accesorio para una cantidad, en pesos: el tramo de
// su escala que corresponda o, si no hay, el precio de lista.
function precioDeAccesorio(lote, cantidad, escalas, cotizacion) {
  return precioPorCantidad({
    tramos: escalas.filter((escala) => escala.clave === lote.clave),
    cantidad,
    precioListaUsd: lote.precio_usd,
    cotizacion,
  }).precio_ars
}

const MODOS = [
  { id: 'lista', nombre: 'Precio publicado' },
  { id: 'mayorista', nombre: 'Precio mayorista' },
  { id: 'especial', nombre: 'Precio especial' },
  { id: 'gratis', nombre: 'De regalo' },
]

// unidadInicial: si se abre desde el buscador de IMEI, arranca con ese equipo elegido.
export function ModalVenta({ lote, unidadInicial, alCerrar }) {
  const { cotizaciones, configuracion, datos, stock, recargar } = usePanel()
  const esCelular = lote.tabla === 'celulares'
  const cotizacion = cotizaciones.venta

  // Las unidades elegidas arrancan en una: lo mas comun es vender de a uno.
  const [elegidas, setElegidas] = useState(() =>
    lote.disponibles.some((unidad) => unidad.id === unidadInicial) ? [unidadInicial] : [lote.disponibles[0].id],
  )
  // El precio publicado de un accesorio depende de la cantidad (precios por cantidad).
  const precioSugerido = (cantidad) =>
    esCelular ? aPesos(lote.precio_usd, cotizacion) : precioDeAccesorio(lote, cantidad, datos.escalas, cotizacion)
  const precioMayorista = lote.precio_mayorista_usd == null ? null : aPesos(lote.precio_mayorista_usd, cotizacion)
  const [precio, setPrecio] = useState(precioSugerido(1))
  // Si el dueno escribio un precio a mano, deja de seguir a la cantidad.
  const [precioTocado, setPrecioTocado] = useState(false)

  // Accesorios que se lleva ademas (con el equipo, o junto con este accesorio):
  // [{ clave, cantidad, modo, precio }].
  const [extras, setExtras] = useState([])
  const [persona, setPersona] = useState({ cliente: '', telefono: '' })
  const [vendedor, setVendedor, vendedores] = useVendedor()
  const [cobro, setCobro] = useState(COBRO_VACIO)
  const [deuda, setDeuda] = useState(DEUDA_VACIA)
  // Arranca en los dias cargados en Ajustes para este tipo de producto.
  const [garantia, setGarantia] = useState(esCelular ? configuracion.garantia_dias_celulares : configuracion.garantia_dias_accesorios)
  // Fecha de la venta: arranca en hoy.
  const [hoy] = useState(() => diaDe(new Date()))
  const [dia, setDia] = useState(hoy)
  // Cuando la venta se registro: el numero de comprobante.
  const [hecha, setHecha] = useState(null)
  const [ocupado, ejecutar] = useAccion()

  // Si se vende un accesorio, el mismo no se ofrece de nuevo como agregado.
  const accesoriosConStock = stock.accesorios.filter((accesorio) => accesorio.cantidad > 0 && accesorio.clave !== lote.clave)
  const loteDe = (clave) => accesoriosConStock.find((accesorio) => accesorio.clave === clave)

  function cambiarElegidas(ids) {
    setElegidas(ids)
    if (!precioTocado) setPrecio(precioSugerido(ids.length))
  }

  function cambiarExtra(posicion, cambios) {
    setExtras(extras.map((extra, indice) => (indice === posicion ? { ...extra, ...cambios } : extra)))
  }

  // Precio por unidad de un extra, en pesos, segun su modo.
  function precioDeExtra(extra) {
    if (extra.modo === 'gratis') return 0
    if (extra.modo === 'especial') return extra.precio ?? 0
    if (extra.modo === 'mayorista') return aPesos(loteDe(extra.clave).precio_mayorista_usd ?? 0, cotizacion)
    return precioDeAccesorio(loteDe(extra.clave), extra.cantidad, datos.escalas, cotizacion)
  }

  const extrasValidos = extras.filter((extra) => loteDe(extra.clave))
  // No se puede vender antes del dia en que entro al stock la unidad mas nueva.
  const compraMasNueva = diaDeLaCompraMasNueva([
    ...lote.disponibles.filter((unidad) => elegidas.includes(unidad.id)),
    ...extrasValidos.flatMap((extra) => loteDe(extra.clave).disponibles.slice(0, extra.cantidad)),
  ])
  const total = (precio ?? 0) * elegidas.length + extrasValidos.reduce((suma, extra) => suma + precioDeExtra(extra) * extra.cantidad, 0)
  // Lo que se paga ahora: el total menos lo que queda debiendo.
  const ahora = total - montoDeDeuda(deuda)
  const falta =
    elegidas.length === 0 || precio === null || garantia === '' ||
    Boolean(problemaDeDia(dia, { hoy, minimo: compraMasNueva })) ||
    extras.some(
      (extra) =>
        !loteDe(extra.clave) ||
        (extra.modo === 'especial' && extra.precio === null) ||
        (extra.modo === 'mayorista' && loteDe(extra.clave).precio_mayorista_usd == null),
    ) ||
    Boolean(problemaDeDeuda(deuda, total, persona.cliente)) ||
    cobroIncompleto(cobro, ahora)

  function confirmar(evento) {
    evento.preventDefault()
    // Cada unidad viaja con su precio real cobrado, en dolares.
    const propias = elegidas.map((id) => ({ id, precio_usd: aDolares(precio, cotizacion) }))
    const accesorios = extrasValidos.flatMap((extra) =>
      loteDe(extra.clave)
        .disponibles.slice(0, extra.cantidad)
        .map((unidad) => ({ id: unidad.id, precio_usd: aDolares(precioDeExtra(extra), cotizacion) })),
    )
    // La garantia elegida vale para el producto de esta ventana; los
    // accesorios que acompanan a un celular llevan la de Ajustes.
    const datosDeVenta = {
      ...persona,
      ...cobroParaLaBase(cobro),
      vendedor,
      debe_ars: montoDeDeuda(deuda),
      [esCelular ? 'garantia_celulares' : 'garantia_accesorios']: garantia,
      fecha: fechaParaLaBase(dia, hoy),
    }
    ejecutar(
      async () => {
        const resultado = await vender(esCelular ? propias : [], esCelular ? accesorios : [...propias, ...accesorios], datosDeVenta)
        // Primero se muestra el resultado: al recargar, este lote puede dejar
        // de existir y la ventana se cerraria sin ofrecer el ticket.
        setHecha(resultado.comprobante)
      },
      { exito: 'Venta registrada' },
    )
  }

  // Cerrar despues de vender: recien ahi se vuelve a leer el stock.
  function terminar() {
    alCerrar()
    recargar().catch(() => {})
  }

  // Los celulares vendidos, para hacerles el acta.
  const equiposVendidos = esCelular
    ? elegidas.map((id) => {
        const unidad = lote.disponibles.find((otra) => otra.id === id)
        return {
          celular_id: id,
          descripcion: describir(lote, 'celulares'),
          imei: unidad?.imei || '',
          bateria: lote.bateria,
          cliente: persona.cliente,
          telefono: persona.telefono,
          garantia_dias: garantia,
        }
      })
    : []

  if (hecha) return <VentaRegistrada numero={hecha} total={total} equipos={equiposVendidos} alTerminar={terminar} />

  return (
    <Modal titulo={`Vendido · ${describir(lote, lote.tabla)}`} alCerrar={alCerrar}>
      <form onSubmit={confirmar} className="space-y-4">
        <div>
          <p className="etiqueta mb-1">{lote.disponibles.some((unidad) => unidad.imei) ? 'Qué equipos' : 'Cantidad'}</p>
          <SelectorUnidades unidades={lote.disponibles} elegidas={elegidas} alCambiar={cambiarElegidas} />
        </div>

        <label className="etiqueta">
          Precio final por unidad ($)
          <CampoPesos
            valor={precio}
            alCambiar={(valor) => {
              setPrecio(valor)
              setPrecioTocado(true)
            }}
          />
          {/* Por mayor se toca "Mayorista"; despues el precio se puede cambiar a mano. */}
          <ElegirPrecio
            minorista={precioSugerido(elegidas.length)}
            mayorista={precioMayorista}
            tabla={lote.tabla}
            valor={precio}
            alElegir={(valor) => {
              setPrecio(valor)
              setPrecioTocado(true)
            }}
          />
        </label>

        <section className="border-t border-neutral-200 pt-3">
          <h3 className="text-sm font-semibold">{esCelular ? 'Accesorios que se lleva' : 'Otros accesorios que se lleva'}</h3>
          {extras.map((extra, posicion) => {
            const accesorio = loteDe(extra.clave)
            return (
              <div key={posicion} className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-2.5">
                <div className="flex gap-2">
                  <select
                    className="campo"
                    value={extra.clave}
                    onChange={(evento) => cambiarExtra(posicion, { clave: evento.target.value, cantidad: 1 })}
                    aria-label="Accesorio"
                  >
                    <option value="">Elegir accesorio...</option>
                    {accesoriosConStock.map((opcion) => (
                      <option
                        key={opcion.clave}
                        value={opcion.clave}
                        // Un mismo accesorio no puede estar en dos renglones.
                        disabled={extras.some((otro, indice) => indice !== posicion && otro.clave === opcion.clave)}
                      >
                        {describir(opcion, 'accesorios')} ({opcion.cantidad})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="boton boton-claro shrink-0 px-2.5"
                    onClick={() => setExtras(extras.filter((_, indice) => indice !== posicion))}
                    aria-label="Quitar accesorio"
                  >
                    ×
                  </button>
                </div>
                {accesorio && (
                  <>
                    <Cantidad valor={extra.cantidad} maximo={accesorio.cantidad} alCambiar={(cantidad) => cambiarExtra(posicion, { cantidad })} />
                    <div className="grid grid-cols-2 gap-2">
                      <select className="campo" value={extra.modo} onChange={(evento) => cambiarExtra(posicion, { modo: evento.target.value })} aria-label="Cómo se cobra">
                        {MODOS.map((modo) => (
                          <option key={modo.id} value={modo.id} disabled={modo.id === 'mayorista' && accesorio.precio_mayorista_usd == null}>
                            {modo.nombre}
                          </option>
                        ))}
                      </select>
                      {extra.modo === 'especial' ? (
                        <CampoPesos valor={extra.precio} alCambiar={(valor) => cambiarExtra(posicion, { precio: valor })} placeholder="$ por unidad" />
                      ) : (
                        <p className="self-center text-right text-sm font-medium">
                          {extra.modo === 'gratis' ? 'Sin cargo' : `${pesos(precioDeExtra(extra))} c/u`}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
          {accesoriosConStock.length > 0 ? (
            <button
              type="button"
              className="boton boton-claro boton-chico mt-2"
              onClick={() => setExtras([...extras, { clave: '', cantidad: 1, modo: 'lista', precio: null }])}
            >
              + Agregar accesorio
            </button>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">No hay accesorios en el local.</p>
          )}
        </section>

        <section className="space-y-3 border-t border-neutral-200 pt-3">
          <CamposDeCliente cliente={persona.cliente} telefono={persona.telefono} alCambiar={setPersona} />
          <CampoVendedor vendedor={vendedor} alCambiar={setVendedor} opciones={vendedores} />
          <div>
            <p className="etiqueta mb-1">Garantía</p>
            <CampoGarantia valor={garantia} alCambiar={setGarantia} />
          </div>
          <CampoFecha etiqueta="Fecha de venta" valor={dia} hoy={hoy} minimo={compraMasNueva} alCambiar={setDia} ayuda="Si la venta fue otro día, cambiala." />
        </section>

        <p className="flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-3 text-sm">
          <span className="text-neutral-600">Total a cobrar</span>
          <span className="text-lg font-bold whitespace-nowrap">{pesos(total)}</span>
        </p>

        <CampoDeuda deuda={deuda} alCambiar={setDeuda} total={total} cliente={persona.cliente} />

        {ahora > 0 && <CamposDeCobro cobro={cobro} alCambiar={setCobro} total={ahora} />}

        <button type="submit" className="boton boton-verde w-full" disabled={ocupado || falta}>
          {ocupado ? 'Registrando...' : 'Registrar venta'}
        </button>
      </form>
    </Modal>
  )
}

// Cartel de "venta registrada" con el boton para imprimir el ticket y, por
// cada celular vendido, el de hacer su acta de entrega y garantia.
// alTerminar: cierra la ventana (y ahi recien se vuelve a leer el stock).
function VentaRegistrada({ numero, total, equipos = [], alTerminar }) {
  const [imprimir, setImprimir] = useState(false)
  // El equipo al que se le esta haciendo el acta, y el acta que se esta mirando.
  const [haciendo, setHaciendo] = useState(null)
  const [mirando, setMirando] = useState(null)
  // celular_id -> numero de acta, de las que ya se hicieron en esta ventana.
  const [hechas, setHechas] = useState({})

  if (imprimir) return <VentanaTicket comprobanteId={numero} alCerrar={() => setImprimir(false)} />
  if (haciendo) {
    return (
      <ModalActa
        equipo={haciendo}
        alCerrar={() => setHaciendo(null)}
        alGuardar={(id) => {
          setHechas({ ...hechas, [haciendo.celular_id]: id })
          setHaciendo(null)
          setMirando(id)
        }}
      />
    )
  }
  if (mirando) return <VentanaActa actaId={mirando} alCerrar={() => setMirando(null)} />

  return (
    <Modal titulo="Venta registrada" alCerrar={alTerminar} ancho="max-w-sm">
      <p className="text-sm text-neutral-700">
        Quedó guardada con el comprobante <strong>N° {numeroDeTicket(numero)}</strong> por <strong>{pesos(total)}</strong>.
      </p>
      {equipos.length > 0 && (
        <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">
            Antes de entregar: revisá el equipo con el cliente y que firmen los dos el acta de garantía.
          </p>
          {equipos.map((equipo) =>
            hechas[equipo.celular_id] ? (
              <button key={equipo.celular_id} type="button" className="boton boton-claro boton-chico w-full" onClick={() => setMirando(hechas[equipo.celular_id])}>
                <IconoImpresora />
                Acta firmada{equipos.length > 1 && ` · ${equipo.imei || equipo.descripcion}`}
              </button>
            ) : (
              <button key={equipo.celular_id} type="button" className="boton boton-oscuro w-full" onClick={() => setHaciendo(equipo)}>
                Hacer el acta{equipos.length > 1 && ` · ${equipo.imei || equipo.descripcion}`}
              </button>
            ),
          )}
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="boton boton-claro" onClick={alTerminar}>
          Listo
        </button>
        <button type="button" className="boton boton-oscuro" onClick={() => setImprimir(true)}>
          <IconoImpresora />
          Ticket
        </button>
      </div>
    </Modal>
  )
}

// Vender combos. combo: uno armado con armarCombos() (trae sus partes y
// cuantos se pueden armar). El precio del combo se reparte entre sus
// accesorios y el ticket dice que fue un combo.
export function ModalVentaCombo({ combo, alCerrar }) {
  const { cotizaciones, configuracion, recargar } = usePanel()
  const cotizacion = cotizaciones.venta
  const [cantidad, setCantidad] = useState(1)
  const [precio, setPrecio] = useState(aPesos(combo.precio_usd, cotizacion)) // por combo, en pesos
  const [persona, setPersona] = useState({ cliente: '', telefono: '' })
  const [vendedor, setVendedor, vendedores] = useVendedor()
  const [cobro, setCobro] = useState(COBRO_VACIO)
  const [deuda, setDeuda] = useState(DEUDA_VACIA)
  const [garantia, setGarantia] = useState(configuracion.garantia_dias_accesorios)
  const [hoy] = useState(() => diaDe(new Date()))
  const [dia, setDia] = useState(hoy)
  const [hecha, setHecha] = useState(null)
  const [ocupado, ejecutar] = useAccion()

  const total = (precio ?? 0) * cantidad
  const ahora = total - montoDeDeuda(deuda)
  // Las unidades que salen con estos combos (en el mismo orden que venderCombo).
  const compraMasNueva = diaDeLaCompraMasNueva(combo.partes.flatMap((parte) => parte.lote.disponibles.slice(0, parte.cantidad * cantidad)))
  const falta =
    precio === null || garantia === '' || Boolean(problemaDeDia(dia, { hoy, minimo: compraMasNueva })) ||
    Boolean(problemaDeDeuda(deuda, total, persona.cliente)) || cobroIncompleto(cobro, ahora)

  function confirmar(evento) {
    evento.preventDefault()
    const items = venderCombo(combo, cantidad, aDolares(precio, cotizacion))
    if (!items) {
      toast.error('No alcanza el stock para esa cantidad de combos')
      return
    }
    ejecutar(
      async () => {
        const resultado = await vender([], items, {
          ...persona,
          ...cobroParaLaBase(cobro),
          vendedor,
          debe_ars: montoDeDeuda(deuda),
          garantia_accesorios: garantia,
          fecha: fechaParaLaBase(dia, hoy),
          // Asi el ticket dice que los accesorios salieron como combo.
          nota: `${cantidad > 1 ? `${cantidad} x ` : ''}${combo.nombre} a ${pesos(precio)} c/u`,
        })
        setHecha(resultado.comprobante)
      },
      { exito: 'Venta registrada' },
    )
  }

  function terminar() {
    alCerrar()
    recargar().catch(() => {})
  }

  if (hecha) return <VentaRegistrada numero={hecha} total={total} alTerminar={terminar} />

  return (
    <Modal titulo={`Vender · ${combo.nombre}`} alCerrar={alCerrar}>
      <form onSubmit={confirmar} className="space-y-4">
        <p className="text-xs break-words text-neutral-600">{combo.descripcion}</p>
        <div>
          <p className="etiqueta mb-1">Cantidad de combos</p>
          <Cantidad valor={cantidad} maximo={combo.disponibles} alCambiar={setCantidad} />
        </div>
        <label className="etiqueta">
          Precio final por combo ($)
          <CampoPesos valor={precio} alCambiar={setPrecio} />
          <span className="mt-0.5 block text-[11px] text-neutral-500">
            Lista del combo: {pesos(aPesos(combo.precio_usd, cotizacion))} · por separado: {pesos(aPesos(combo.lista_usd, cotizacion))}
          </span>
          {/* Si hay descuento en efectivo para los accesorios, un boton para usarlo. */}
          <ElegirPrecio minorista={aPesos(combo.precio_usd, cotizacion)} tabla="accesorios" valor={precio} alElegir={setPrecio} />
        </label>

        <section className="space-y-3 border-t border-neutral-200 pt-3">
          <CamposDeCliente cliente={persona.cliente} telefono={persona.telefono} alCambiar={setPersona} />
          <CampoVendedor vendedor={vendedor} alCambiar={setVendedor} opciones={vendedores} />
          <div>
            <p className="etiqueta mb-1">Garantía</p>
            <CampoGarantia valor={garantia} alCambiar={setGarantia} />
          </div>
          <CampoFecha etiqueta="Fecha de venta" valor={dia} hoy={hoy} minimo={compraMasNueva} alCambiar={setDia} ayuda="Si la venta fue otro día, cambiala." />
        </section>

        <p className="flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-3 text-sm">
          <span className="text-neutral-600">Total a cobrar</span>
          <span className="text-lg font-bold whitespace-nowrap">{pesos(total)}</span>
        </p>
        <CampoDeuda deuda={deuda} alCambiar={setDeuda} total={total} cliente={persona.cliente} />
        {ahora > 0 && <CamposDeCobro cobro={cobro} alCambiar={setCobro} total={ahora} />}

        <button type="submit" className="boton boton-verde w-full" disabled={ocupado || falta}>
          {ocupado ? 'Registrando...' : 'Registrar venta'}
        </button>
      </form>
    </Modal>
  )
}
