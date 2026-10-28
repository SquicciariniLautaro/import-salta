// panel/Stock.jsx
// Pestanas "Celulares" y "Accesorios": el stock agrupado por familias (que
// arrancan cerradas). Cada lote es un renglon compacto que se despliega y
// muestra sus acciones. Vender y borrar actuan solo sobre unidades del local.
// Arriba avisa que se quedo sin stock, de que queda poco y de los celulares
// que todavia no tienen el IMEI cargado. En accesorios,
// ademas, estan los combos.

import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import PuntoColor from '../componentes/PuntoColor.jsx'
import Foto from '../componentes/Foto.jsx'
import { borrarUnidades, editarImei, guardarEscalas } from '../apiAdmin.js'
import { aPesos, dolares, normalizar, pesos, soloFecha } from '../formato.js'
import { agruparPorFamilia, comprasPorDia, proveedoresDelLote, resumirStock, tituloDeFamilia } from '../servicios/stock.js'
import { describir } from '../servicios/texto.js'
import { SeccionCombos } from './Combos.jsx'
import { ModalCompra } from './Compra.jsx'
import { FormularioLote, ModalPermuta } from './Formularios.jsx'
import { ModalFoto } from './FotoLote.jsx'
import { fotoDelLote } from './fotos.js'
import { BuscadorImei, CampoBusqueda, CargaRapidaImeis } from './Imei.jsx'
import { HojaEtiquetas, IconoImpresora, VentanaImpresion } from './Impresion.jsx'
import { etiquetasParaTicketera } from './ticketera.js'
import { SelectorUnidades } from './Unidades.jsx'
import { ModalVenta } from './Venta.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

function Flecha({ abierta }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// tabla: 'celulares' o 'accesorios'.
export default function PestanaStock({ tabla }) {
  const { stock, cotizaciones, avisos, datos, irA } = usePanel()
  const esCelular = tabla === 'celulares'
  const lotes = stock[tabla]
  const nombreDeProveedor = new Map(datos.proveedores.map((proveedor) => [proveedor.id, proveedor.nombre]))

  const [busqueda, setBusqueda] = useState('')
  // Familias desplegadas (arrancan todas cerradas) y lote desplegado.
  const [familiasAbiertas, setFamiliasAbiertas] = useState(() => new Set())
  const [loteAbierto, setLoteAbierto] = useState(null)
  // Ventana abierta: { clase: 'nuevo' | 'permuta' | 'vender' | ..., lote }.
  const [ventana, setVentana] = useState(null)

  const palabras = normalizar(busqueda).split(' ').filter(Boolean)
  // Un lote se muestra si contiene TODAS las palabras del filtro. Ademas de
  // sus datos, se buscan los IMEI, los proveedores y quien tiene cada unidad
  // (revendedor o cliente que seno): escribir "JUAN" muestra lo que tiene Juan.
  const visibles = lotes.filter((lote) => {
    const unidades = [...lote.disponibles, ...lote.conRevendedores, ...lote.senadas]
    const texto = normalizar(
      [
        lote.tipo, lote.modelo, lote.capacidad, lote.color, lote.bateria, lote.detalles,
        ...unidades.map((unidad) => unidad.imei || ''),
        ...unidades.map((unidad) => nombreDeProveedor.get(unidad.proveedor_id) || ''),
        ...unidades.map((unidad) => unidad.revendedor || ''),
      ].join(' '),
    )
    return palabras.every((palabra) => texto.includes(palabra))
  })
  const grupos = agruparPorFamilia(visibles)
  const resumen = resumirStock(lotes)

  function alternarFamilia(llave) {
    const nuevas = new Set(familiasAbiertas)
    if (nuevas.has(llave)) nuevas.delete(llave)
    else nuevas.add(llave)
    setFamiliasAbiertas(nuevas)
  }

  const cerrar = () => setVentana(null)

  // Lo que se eligio en un resultado del buscador de IMEI.
  function elegirDesdeImei(accion, equipo) {
    if (accion === 'cuenta') {
      irA(equipo.estado === 'senado' ? 'senas' : 'revendedores')
      return
    }
    const lote = lotes.find((otro) => otro.clave === equipo.clave)
    if (!lote) {
      toast.error('Ese equipo ya no está en el stock. Actualizá la página.')
      return
    }
    if (accion === 'ver') {
      setBusqueda(equipo.imei)
      setLoteAbierto(lote.clave)
      return
    }
    if (accion !== 'etiquetas' && !lote.disponibles.some((unidad) => unidad.id === equipo.id)) {
      toast.error('Ese equipo ya no está en el local. Actualizá la página.')
      return
    }
    setVentana({ clase: accion, lote, unidad: equipo.id })
  }

  // El lote puede haber cambiado despues de recargar: se busca el actual.
  const loteDeVentana = ventana?.lote && lotes.find((lote) => lote.clave === ventana.lote.clave)

  return (
    <div className="space-y-3">
      <TotalDeUnidades resumen={resumen} esCelular={esCelular} />
      <div className="grid grid-cols-2 gap-2">
        <Dato titulo="Costo del local" valor={dolares(resumen.costo_usd)} detalle={pesos(aPesos(resumen.costo_usd, cotizaciones.costo))} />
        <Dato titulo="Minorista del local" valor={dolares(resumen.venta_usd)} detalle={pesos(aPesos(resumen.venta_usd, cotizaciones.venta))} />
      </div>

      <div className={`grid gap-2 ${esCelular ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button type="button" className="boton boton-oscuro" onClick={() => setVentana({ clase: 'nuevo' })}>
          + Ingresar{esCelular ? '' : ' accesorios'}
        </button>
        {esCelular && (
          <>
            <button type="button" className="boton boton-oscuro" onClick={() => setVentana({ clase: 'compra' })}>
              + Lote proveedor
            </button>
            <button type="button" className="boton boton-claro col-span-2" onClick={() => setVentana({ clase: 'permuta' })}>
              Permuta
            </button>
          </>
        )}
      </div>

      <AvisosDeStock
        avisos={avisos[tabla]}
        alFiltrar={setBusqueda}
        alCargarImeis={(clave) => {
          const lote = lotes.find((otro) => otro.clave === clave)
          if (lote) setVentana({ clase: 'imeis', lote })
        }}
      />

      {esCelular && <BuscadorImei cotizacion={cotizaciones.venta} alElegir={elegirDesdeImei} />}

      {!esCelular && <SeccionCombos />}

      {esCelular ? (
        <CampoBusqueda valor={busqueda} alCambiar={setBusqueda} placeholder="Filtrar: 13 pro 256, IMEI, proveedor o revendedor" etiqueta="Filtrar el stock" />
      ) : (
        <input
          type="search"
          className="campo"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Filtrar: fuente, cable, proveedor..."
          aria-label="Filtrar el stock"
        />
      )}

      {lotes.length === 0 && <p className="tarjeta p-6 text-center text-sm text-neutral-500">Todavía no hay stock cargado.</p>}
      {lotes.length > 0 && visibles.length === 0 && <p className="tarjeta p-6 text-center text-sm text-neutral-500">Nada coincide con el filtro.</p>}

      {grupos.map((grupo) => {
        const llave = `${grupo.marca}|${grupo.familia}`
        // Con un filtro escrito, las familias se muestran abiertas.
        const abierta = palabras.length > 0 || familiasAbiertas.has(llave)
        const unidades = grupo.lotes.reduce((suma, lote) => suma + lote.cantidad, 0)
        const afuera = grupo.lotes.reduce((suma, lote) => suma + lote.conRevendedores.length + lote.senadas.length, 0)
        return (
          <section key={llave} className="tarjeta overflow-hidden">
            <button
              type="button"
              className="renglon flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              onClick={() => alternarFamilia(llave)}
              aria-expanded={abierta}
            >
              <span className="min-w-0 text-sm font-semibold break-words">{tituloDeFamilia(grupo)}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                <span className="text-right">
                  <span className="block font-semibold text-neutral-800">{unidades + afuera} u.</span>
                  {afuera > 0 && <span className="block text-[10px]">{unidades} en el local</span>}
                </span>
                <Flecha abierta={abierta} />
              </span>
            </button>
            {abierta &&
              grupo.lotes.map((lote) => (
                <Lote
                  key={lote.clave}
                  lote={lote}
                  abierto={loteAbierto === lote.clave}
                  alAlternar={() => setLoteAbierto(loteAbierto === lote.clave ? null : lote.clave)}
                  alAbrir={(clase) => setVentana({ clase, lote })}
                />
              ))}
          </section>
        )
      })}

      {ventana?.clase === 'nuevo' && <FormularioLote tabla={tabla} modo="nuevo" alCerrar={cerrar} />}
      {ventana?.clase === 'permuta' && <ModalPermuta alCerrar={cerrar} />}
      {ventana?.clase === 'compra' && <ModalCompra alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'sumar' && <FormularioLote tabla={tabla} modo="sumar" lote={loteDeVentana} alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'editar' && <FormularioLote tabla={tabla} modo="editar" lote={loteDeVentana} alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'vender' && <ModalVenta lote={loteDeVentana} unidadInicial={ventana.unidad} alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'borrar' && <ModalBorrar lote={loteDeVentana} alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'escalas' && <ModalEscalas lote={loteDeVentana} alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'foto' && <ModalFoto lote={loteDeVentana} alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'imeis' && <ModalImeis lote={loteDeVentana} alCerrar={cerrar} />}
      {loteDeVentana && ventana.clase === 'etiquetas' && <ModalEtiquetas lote={loteDeVentana} unidadInicial={ventana.unidad} alCerrar={cerrar} />}
      {loteDeVentana && (ventana.clase === 'revendedor' || ventana.clase === 'sena') && (
        <ModalAlCarrito lote={loteDeVentana} tipo={ventana.clase} unidadInicial={ventana.unidad} alCerrar={cerrar} />
      )}
    </div>
  )
}

// El total de unidades que tiene el negocio: las del local mas las que estan
// afuera (con revendedores o senadas), con el detalle de donde esta cada una.
function TotalDeUnidades({ resumen, esCelular }) {
  const partes = [
    `${resumen.unidades} en el local`,
    resumen.conRevendedores > 0 && `${resumen.conRevendedores} con revendedores`,
    resumen.senadas > 0 && `${resumen.senadas} ${resumen.senadas === 1 ? 'señado' : 'señados'}`,
  ].filter(Boolean)
  return (
    <div className="tarjeta flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] tracking-wide text-neutral-500 uppercase">{esCelular ? 'Total de celulares' : 'Total de accesorios'}</p>
        <p className="text-xs break-words text-neutral-600">{partes.join(' · ')}</p>
      </div>
      <p className="shrink-0 text-2xl font-bold">{resumen.total}</p>
    </div>
  )
}

function Dato({ titulo, valor, detalle }) {
  return (
    <div className="tarjeta min-w-0 px-2.5 py-2">
      <p className="truncate text-[10px] tracking-wide text-neutral-500 uppercase">{titulo}</p>
      <p className="truncate text-sm font-semibold">{valor}</p>
      {detalle && <p className="truncate text-[11px] text-neutral-500">{detalle}</p>}
    </div>
  )
}

function Lote({ lote, abierto, alAlternar, alAbrir }) {
  const { cotizaciones, datos, carrito, irA } = usePanel()
  const esCelular = lote.tabla === 'celulares'
  const hayEnLocal = lote.cantidad > 0
  const escalas = datos.escalas.filter((escala) => escala.clave === lote.clave).length
  // Unidades de este lote que ya estan en el carrito: no se pueden volver a agregar.
  const enCarrito = carrito.items.filter((item) => item.clave === lote.clave).reduce((suma, item) => suma + item.ids.length, 0)
  const libres = lote.cantidad - enCarrito
  const sinImei = [...lote.disponibles, ...lote.conRevendedores, ...lote.senadas].filter((unidad) => !unidad.imei).length
  const foto = fotoDelLote(datos, lote)

  return (
    <div className="border-t border-neutral-200">
      <button type="button" className="renglon flex w-full items-center gap-2 px-3 py-2 text-left" onClick={alAlternar} aria-expanded={abierto}>
        {foto && <Foto url={foto} ancho={40} alto={40} className="h-10 w-10 shrink-0 rounded-lg" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            <span className="font-medium break-words">{esCelular ? lote.capacidad || lote.modelo : lote.modelo || lote.tipo}</span>
            <PuntoColor color={lote.color} />
            {esCelular && lote.bateria && <span className="text-xs text-neutral-500">{lote.bateria}</span>}
          </div>
          {lote.detalles && <p className="text-xs break-words text-neutral-500">{lote.detalles}</p>}
          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
            {porPersona(lote.conRevendedores).map(({ nombre, cantidad }) => (
              <span key={nombre} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                {cantidad > 1 ? `${cantidad} con ` : 'Lo tiene '}
                {nombre}
              </span>
            ))}
            {porPersona(lote.senadas).map(({ nombre, cantidad }) => (
              <span key={nombre} className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
                {cantidad > 1 ? `${cantidad} señados por ` : 'Señado por '}
                {nombre}
              </span>
            ))}
            {esCelular && sinImei > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">{sinImei === 1 ? '1 sin IMEI' : `${sinImei} sin IMEI`}</span>
            )}
            {lote.promediado && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">Promediado</span>}
            {lote.precio_mayorista_usd == null && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500">Sin precio mayorista</span>}
            {escalas > 0 && <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">Precio por cantidad</span>}
            {!foto && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500">Sin foto</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold whitespace-nowrap">{pesos(aPesos(lote.precio_usd, cotizaciones.venta))}</p>
          {lote.precio_mayorista_usd != null && (
            <p className="text-[11px] whitespace-nowrap text-neutral-500">May. {pesos(aPesos(lote.precio_mayorista_usd, cotizaciones.venta))}</p>
          )}
          <p className={`text-xs ${hayEnLocal ? 'text-neutral-500' : 'font-medium text-red-600'}`}>{lote.cantidad} u.</p>
        </div>
        <Flecha abierta={abierto} />
      </button>

      {abierto && (
        <div className="animate-aparecer space-y-3 bg-neutral-50 px-3 py-3">
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div className="min-w-0">
              <dt className="text-neutral-500">Costo</dt>
              <dd className="truncate font-medium">{dolares(lote.costo_usd)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-neutral-500">Minorista</dt>
              <dd className="truncate font-medium">{dolares(lote.precio_usd)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-neutral-500">Ganancia c/u</dt>
              <dd className="truncate font-medium">
                {dolares((aPesos(lote.precio_usd, cotizaciones.venta) - aPesos(lote.costo_usd, cotizaciones.costo)) / cotizaciones.venta)}
              </dd>
            </div>
          </dl>

          <p className="text-xs break-words text-neutral-600">
            <span className="text-neutral-500">Proveedor: </span>
            {proveedoresDelLote(lote, datos.proveedores).texto}
          </p>
          <FechasDeCompra unidades={lote.disponibles} />

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="boton boton-verde col-span-2" disabled={!hayEnLocal} onClick={() => alAbrir('vender')}>
              Vendido
            </button>
            <button type="button" className="boton boton-claro boton-chico" disabled={libres < 1} onClick={() => alAbrir('revendedor')}>
              Al carrito revendedor
            </button>
            <button type="button" className="boton boton-claro boton-chico" disabled={libres < 1} onClick={() => alAbrir('sena')}>
              Señar
            </button>
            <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('sumar')}>
              Sumar stock
            </button>
            <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('editar')}>
              Editar
            </button>
            {esCelular ? (
              <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('imeis')}>
                IMEI
              </button>
            ) : (
              <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('escalas')}>
                Precios por cantidad
              </button>
            )}
            <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('etiquetas')}>
              <IconoImpresora />
              Etiquetas
            </button>
            <button type="button" className="boton boton-claro boton-chico col-span-2" onClick={() => alAbrir('foto')}>
              {foto ? 'Cambiar la foto del catálogo' : 'Poner foto en el catálogo'}
            </button>
            <button type="button" className="boton boton-peligro boton-chico col-span-2" disabled={!hayEnLocal} onClick={() => alAbrir('borrar')}>
              Borrar
            </button>
          </div>

          {(lote.conRevendedores.length > 0 || lote.senadas.length > 0) && <FueraDelLocal lote={lote} alIr={irA} />}
        </div>
      )}
    </div>
  )
}

// Cuando se compraron (entraron al stock) las unidades que estan en el local.
// Si entraron en dias distintos, cada dia con cuantas: "20/10/26 (2 u.) · 27/10/26 (4 u.)".
function FechasDeCompra({ unidades }) {
  const dias = comprasPorDia(unidades)
  if (dias.length === 0) return null
  return (
    <p className="text-xs break-words text-neutral-600">
      <span className="text-neutral-500">Comprado: </span>
      {dias.length === 1
        ? `el ${soloFecha(dias[0].fecha)}`
        : dias.map((dia) => `${soloFecha(dia.fecha)} (${dia.cantidad} u.)`).join(' · ')}
    </p>
  )
}

// Junta las unidades por la persona que las tiene: [{ nombre, cantidad }].
function porPersona(unidades) {
  const cuenta = new Map()
  for (const unidad of unidades) cuenta.set(unidad.revendedor, (cuenta.get(unidad.revendedor) || 0) + 1)
  return [...cuenta.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad }))
}

// Los equipos del lote que no estan en el local: quien tiene cada uno,
// desde cuando y a que precio se le dio.
function FueraDelLocal({ lote, alIr }) {
  const { cotizaciones } = usePanel()
  const unidades = [...lote.conRevendedores, ...lote.senadas]
  return (
    <div>
      <h4 className="text-xs font-semibold text-neutral-600">Fuera del local</h4>
      <ul className="mt-1 divide-y divide-neutral-200 rounded-lg bg-white">
        {unidades.map((unidad) => {
          const esSena = unidad.estado === 'senado'
          return (
            <li key={unidad.id}>
              <button
                type="button"
                className="renglon flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left"
                onClick={() => alIr(esSena ? 'senas' : 'revendedores')}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium break-words">
                    {esSena ? 'Señado por ' : 'Lo tiene '}
                    {unidad.revendedor}
                  </span>
                  <span className="block text-[11px] text-neutral-500">
                    {unidad.imei ? <span className="font-mono">{unidad.imei}</span> : 'Sin IMEI'}
                    {unidad.fecha_revendedor && ` · desde el ${soloFecha(unidad.fecha_revendedor)}`}
                    {unidad.fecha_ingreso && ` · comprado el ${soloFecha(unidad.fecha_ingreso)}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs whitespace-nowrap text-neutral-600">
                  {pesos(aPesos(unidad.precio_revendedor, cotizaciones.venta))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Tarjeta de avisos: lotes sin unidades en el local, lotes que llegaron al
// limite cargado en Ajustes y celulares sin IMEI. Arranca cerrada para no
// tapar el stock. alCargarImeis(clave): abre la carga de IMEI de ese lote.
function AvisosDeStock({ avisos, alFiltrar, alCargarImeis }) {
  const [abierto, setAbierto] = useState(false)
  if (avisos.total === 0) return null

  const sinImei = avisos.sinImei.equipos
  const resumen = [
    avisos.sinStock.length > 0 && `${avisos.sinStock.length} sin stock`,
    avisos.poco.length > 0 && `${avisos.poco.length} con poco stock`,
    sinImei > 0 && `${sinImei} ${sinImei === 1 ? 'equipo' : 'equipos'} sin IMEI`,
  ]
    .filter(Boolean)
    .join(' · ')

  // Los lotes que siguen en el panel se pueden tocar para verlos en la lista.
  const renglon = (aviso, texto) => (
    <li key={aviso.clave}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 py-1.5 text-left disabled:cursor-default"
        disabled={aviso.ultima_venta !== null}
        onClick={() => alFiltrar(aviso.descripcion)}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium break-words">{aviso.descripcion}</span>
          {aviso.detalle && <span className="block text-xs break-words text-amber-800/80">{aviso.detalle}</span>}
        </span>
        <span className="shrink-0 text-right text-xs text-amber-800">{texto}</span>
      </button>
    </li>
  )

  return (
    <section className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 text-amber-900">
      <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 4l9 16H3z" strokeLinejoin="round" />
            <path d="M12 10v4M12 17.2v.3" strokeLinecap="round" />
          </svg>
          <span className="min-w-0 break-words">{resumen}</span>
        </span>
        <Flecha abierta={abierto} />
      </button>

      {abierto && (
        <div className="animate-aparecer space-y-3 border-t border-amber-200 px-3 py-2">
          {avisos.sinStock.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold tracking-wide uppercase">Sin stock en el local</h4>
              <ul className="divide-y divide-amber-200">
                {avisos.sinStock.map((aviso) =>
                  renglon(
                    aviso,
                    aviso.ultima_venta
                      ? `Último vendido el ${soloFecha(aviso.ultima_venta)}`
                      : `${aviso.afuera} afuera del local`,
                  ),
                )}
              </ul>
            </div>
          )}
          {avisos.poco.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold tracking-wide uppercase">Queda poco</h4>
              <ul className="divide-y divide-amber-200">
                {avisos.poco.map((aviso) => renglon(aviso, aviso.cantidad === 1 ? 'Queda 1' : `Quedan ${aviso.cantidad}`))}
              </ul>
            </div>
          )}
          {avisos.sinImei.lotes.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold tracking-wide uppercase">Sin IMEI cargado</h4>
              <ul className="divide-y divide-amber-200">
                {avisos.sinImei.lotes.map((aviso) => (
                  <li key={aviso.clave} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium break-words">{aviso.descripcion}</span>
                      <span className="block text-xs text-amber-800">{aviso.faltan === 1 ? 'Falta 1 IMEI' : `Faltan ${aviso.faltan} IMEI`}</span>
                    </span>
                    <button type="button" className="boton boton-claro boton-chico shrink-0" onClick={() => alCargarImeis(aviso.clave)}>
                      Cargar IMEI
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {avisos.sinStock.length + avisos.poco.length > 0 && (
            <p className="text-[11px] text-amber-800/80">Desde cuántas unidades avisar se cambia en Ajustes.</p>
          )}
        </div>
      )}
    </section>
  )
}

// Elegir de que unidades imprimir etiquetas. Las que tienen IMEI salen con su
// codigo de barras, para leerlas despues con el lector o la camara.
// unidadInicial: si se abre desde el buscador de IMEI, arranca con ese equipo.
function ModalEtiquetas({ lote, unidadInicial, alCerrar }) {
  const { configuracion } = usePanel()
  const unidades = [...lote.disponibles, ...lote.conRevendedores, ...lote.senadas]
  const [elegidas, setElegidas] = useState(() =>
    unidadInicial ? [unidadInicial] : (lote.disponibles.length > 0 ? lote.disponibles : unidades).map((unidad) => unidad.id),
  )
  const [viendo, setViendo] = useState(false)

  if (viendo) {
    const etiquetas = unidades
      .filter((unidad) => elegidas.includes(unidad.id))
      .map((unidad) => ({
        llave: unidad.id,
        titulo: describir(lote, lote.tabla),
        detalle: [lote.bateria, lote.detalles].filter(Boolean).join(' · '),
        codigo: unidad.imei || '',
      }))
    return (
      <VentanaImpresion
        titulo={`${etiquetas.length} ${etiquetas.length === 1 ? 'etiqueta' : 'etiquetas'}`}
        pagina={{ ancho: configuracion.etiqueta_ancho_mm, alto: configuracion.etiqueta_alto_mm }}
        ayuda={`Papel de ${configuracion.etiqueta_ancho_mm} x ${configuracion.etiqueta_alto_mm} mm.`}
        escpos={etiquetasParaTicketera(etiquetas, configuracion)}
        alCerrar={alCerrar}
      >
        <HojaEtiquetas etiquetas={etiquetas} configuracion={configuracion} />
      </VentanaImpresion>
    )
  }

  return (
    <Modal titulo={`Etiquetas · ${describir(lote, lote.tabla)}`} alCerrar={alCerrar} ancho="max-w-sm">
      <SelectorUnidades unidades={unidades} elegidas={elegidas} alCambiar={setElegidas} />
      <p className="mt-3 text-xs text-neutral-500">La etiqueta lleva el logo y no el precio, que cambia con el dólar.</p>
      {lote.tabla === 'celulares' && !unidades.some((unidad) => unidad.imei) && (
        <p className="mt-2 text-xs text-neutral-500">Estos equipos no tienen IMEI cargado: la etiqueta sale sin código de barras.</p>
      )}
      <button type="button" className="boton boton-oscuro mt-4 w-full" disabled={elegidas.length === 0} onClick={() => setViendo(true)}>
        Ver {elegidas.length} {elegidas.length === 1 ? 'etiqueta' : 'etiquetas'}
      </button>
    </Modal>
  )
}

// Elegir unidades del lote para sumarlas al carrito (revendedor o sena).
function ModalAlCarrito({ lote, tipo, unidadInicial, alCerrar }) {
  const { carrito, agregarAlCarrito, cotizaciones } = usePanel()
  // Las que ya estan en el carrito no se ofrecen de nuevo.
  const yaElegidas = new Set(carrito.items.flatMap((item) => item.ids))
  const libres = lote.disponibles.filter((unidad) => !yaElegidas.has(unidad.id))
  const [elegidas, setElegidas] = useState(() => {
    if (libres.some((unidad) => unidad.id === unidadInicial)) return [unidadInicial]
    return libres.length > 0 ? [libres[0].id] : []
  })

  function agregar() {
    const agregado = agregarAlCarrito(tipo, {
      tabla: lote.tabla,
      clave: lote.clave,
      descripcion: describir(lote, lote.tabla),
      detalle: [lote.bateria, lote.detalles].filter(Boolean).join(' · '),
      ids: elegidas,
      // Precio acordado por unidad, en pesos. A un revendedor se le propone el
      // mayorista (si el lote tiene); a una sena, el minorista.
      precio: aPesos(tipo === 'revendedor' && lote.precio_mayorista_usd != null ? lote.precio_mayorista_usd : lote.precio_usd, cotizaciones.venta),
      // Los dos precios del lote, para elegir en el carrito.
      minorista: aPesos(lote.precio_usd, cotizaciones.venta),
      mayorista: lote.precio_mayorista_usd == null ? null : aPesos(lote.precio_mayorista_usd, cotizaciones.venta),
    })
    if (agregado) {
      toast.success('Agregado al carrito')
      alCerrar()
    }
  }

  return (
    <Modal titulo={`${tipo === 'sena' ? 'Señar' : 'Al carrito revendedor'} · ${describir(lote, lote.tabla)}`} alCerrar={alCerrar} ancho="max-w-sm">
      <SelectorUnidades unidades={libres} elegidas={elegidas} alCambiar={setElegidas} />
      <p className="mt-3 text-xs text-neutral-500">El precio y la persona se eligen en el carrito.</p>
      <button type="button" className="boton boton-oscuro mt-3 w-full" disabled={elegidas.length === 0} onClick={agregar}>
        Agregar al carrito
      </button>
    </Modal>
  )
}

function ModalBorrar({ lote, alCerrar }) {
  const { recargar } = usePanel()
  const [elegidas, setElegidas] = useState([lote.disponibles[0].id])
  const [confirmando, setConfirmando] = useState(false)

  if (confirmando) {
    return (
      <Confirmar
        titulo="Borrar del stock"
        textoBoton="Sí, borrar"
        peligro
        alCerrar={alCerrar}
        alConfirmar={async () => {
          await borrarUnidades(lote.tabla, elegidas)
          await recargar()
          toast.success('Borrado')
        }}
      >
        Vas a borrar {elegidas.length} {elegidas.length === 1 ? 'unidad' : 'unidades'} de{' '}
        <strong>{describir(lote, lote.tabla)}</strong>. Usalo solo para corregir una carga equivocada: no queda registro.
      </Confirmar>
    )
  }

  return (
    <Modal titulo={`Borrar · ${describir(lote, lote.tabla)}`} alCerrar={alCerrar} ancho="max-w-sm">
      <SelectorUnidades unidades={lote.disponibles} elegidas={elegidas} alCambiar={setElegidas} />
      <button type="button" className="boton boton-peligro mt-4 w-full" disabled={elegidas.length === 0} onClick={() => setConfirmando(true)}>
        Borrar {elegidas.length} {elegidas.length === 1 ? 'unidad' : 'unidades'}
      </button>
    </Modal>
  )
}

// Precios por cantidad de un accesorio: tramos { desde, moneda, precio }.
function ModalEscalas({ lote, alCerrar }) {
  const { datos, cotizaciones, recargar } = usePanel()
  const [tramos, setTramos] = useState(() =>
    datos.escalas.filter((escala) => escala.clave === lote.clave).map(({ desde, moneda, precio }) => ({ desde, moneda, precio })),
  )
  const [ocupado, ejecutar] = useAccion()

  const cambiar = (posicion, cambios) => setTramos(tramos.map((tramo, indice) => (indice === posicion ? { ...tramo, ...cambios } : tramo)))
  const incompleto = tramos.some((tramo) => !(tramo.desde >= 1) || tramo.precio === null || tramo.precio === '' || !(Number(tramo.precio) >= 0))

  function guardar() {
    ejecutar(
      async () => {
        await guardarEscalas(lote.clave, tramos.map((tramo) => ({ desde: Number(tramo.desde), moneda: tramo.moneda, precio: Number(tramo.precio) })))
        await recargar()
      },
      { exito: 'Precios por cantidad guardados', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={`Precios por cantidad · ${describir(lote, 'accesorios')}`} alCerrar={alCerrar}>
      <p className="text-xs text-neutral-600">
        Precio de lista: {pesos(aPesos(lote.precio_usd, cotizaciones.venta))}. Para cada cantidad vale el tramo más alto que no la supere.
        Un tramo en pesos queda fijo; uno en dólares sigue la cotización.
      </p>

      <div className="mt-3 space-y-2">
        {tramos.map((tramo, posicion) => (
          <div key={posicion} className="grid grid-cols-[4.5rem_1fr_1fr_auto] items-end gap-2">
            <label className="etiqueta">
              Desde
              <input
                type="number"
                inputMode="numeric"
                min="1"
                className="campo"
                value={tramo.desde}
                onChange={(evento) => cambiar(posicion, { desde: evento.target.value === '' ? '' : Number(evento.target.value) })}
              />
            </label>
            <label className="etiqueta">
              Moneda
              <select className="campo" value={tramo.moneda} onChange={(evento) => cambiar(posicion, { moneda: evento.target.value, precio: null })}>
                <option value="ars">Pesos</option>
                <option value="usd">Dólares</option>
              </select>
            </label>
            <label className="etiqueta">
              Precio c/u
              {tramo.moneda === 'ars' ? (
                <CampoPesos valor={tramo.precio} alCambiar={(valor) => cambiar(posicion, { precio: valor })} />
              ) : (
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className="campo"
                  value={tramo.precio ?? ''}
                  onChange={(evento) => cambiar(posicion, { precio: evento.target.value })}
                />
              )}
            </label>
            <button type="button" className="boton boton-claro px-2.5" onClick={() => setTramos(tramos.filter((_, indice) => indice !== posicion))} aria-label="Quitar tramo">
              ×
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="boton boton-claro boton-chico mt-3" onClick={() => setTramos([...tramos, { desde: '', moneda: 'ars', precio: null }])}>
        + Agregar tramo
      </button>

      <button type="button" className="boton boton-oscuro mt-4 w-full" disabled={ocupado || incompleto} onClick={guardar}>
        {ocupado ? 'Guardando...' : 'Guardar'}
      </button>
    </Modal>
  )
}

const DONDE = { disponible: 'En el local', revendedor: 'Con revendedor', senado: 'Señado' }

// Ver y corregir el IMEI de cada equipo del lote.
function ModalImeis({ lote, alCerrar }) {
  const unidades = [...lote.disponibles, ...lote.conRevendedores, ...lote.senadas]
  const faltan = unidades.filter((unidad) => !unidad.imei).length
  return (
    <Modal titulo={`IMEI · ${describir(lote, 'celulares')}`} alCerrar={alCerrar}>
      {/* Para muchos equipos: se leen todos de corrido y se reparten solos. */}
      {faltan > 0 && (
        <section className="mb-4 rounded-xl bg-neutral-50 p-3">
          <h3 className="text-sm font-semibold">Carga rápida</h3>
          <p className="mb-2 text-xs text-neutral-500">
            {faltan === 1 ? 'Falta 1 equipo' : `Faltan ${faltan} equipos`} sin IMEI. Leé las cajas de corrido o pegá una lista: cada IMEI va a un equipo
            que no tenga.
          </p>
          <CargaRapidaImeis clave={lote.clave} faltan={faltan} />
        </section>
      )}
      <h3 className="mb-2 text-sm font-semibold">Uno por uno</h3>
      <ul className="space-y-2">
        {unidades.map((unidad) => (
          <FilaImei key={unidad.id} unidad={unidad} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">Parate en un campo y leé el código con el lector: se guarda solo con el Enter.</p>
    </Modal>
  )
}

function FilaImei({ unidad }) {
  const { recargar } = usePanel()
  const [texto, setTexto] = useState(unidad.imei || '')
  const [ocupado, ejecutar] = useAccion()
  const cambio = texto.trim() !== (unidad.imei || '')

  function guardar(evento) {
    evento.preventDefault()
    const limpio = texto.replace(/\D/g, '')
    if (limpio !== '' && limpio.length !== 15) {
      toast.error('Un IMEI tiene 15 dígitos')
      return
    }
    ejecutar(
      async () => {
        await editarImei(unidad.id, limpio)
        await recargar()
      },
      { exito: limpio ? 'IMEI guardado' : 'IMEI borrado' },
    )
  }

  return (
    <li>
      <form onSubmit={guardar} className="flex items-end gap-2">
        <label className="etiqueta flex-1">
          {DONDE[unidad.estado]}
          {unidad.revendedor ? ` · ${unidad.revendedor}` : ''}
          <input
            className="campo font-mono"
            inputMode="numeric"
            autoComplete="off"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Sin IMEI"
          />
        </label>
        <button type="submit" className="boton boton-oscuro shrink-0" disabled={ocupado || !cambio}>
          Guardar
        </button>
      </form>
    </li>
  )
}
