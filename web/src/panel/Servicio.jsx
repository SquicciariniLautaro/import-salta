// panel/Servicio.jsx
// Pestana "Servicio": ordenes de servicio tecnico.
// Una orden entra (Recibido), se arregla (En reparacion), queda lista y se
// entrega. Al entregar se anota lo cobrado, que pasa solo a la caja, y la
// garantia del arreglo.

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Modal, { Confirmar } from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { eliminarServicio, entregarServicio, guardarServicio, leerServicios, reabrirServicio } from '../apiAdmin.js'
import { fechaCorta, normalizar, pesos } from '../formato.js'
import { COBRO_VACIO, cobroIncompleto, cobroParaLaBase, numeroDeTicket } from '../servicios/comprobante.js'
import { CampoGarantia, CampoVendedor, CamposDeCobro } from './Cobro.jsx'
import { CampoBusqueda } from './Imei.jsx'
import { IconoImpresora, VentanaOrden } from './Impresion.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'
import { useVendedor } from './useVendedor.js'

const ESTADOS = {
  recibido: { nombre: 'Recibido', color: 'bg-neutral-100 text-neutral-700' },
  reparando: { nombre: 'En reparación', color: 'bg-blue-50 text-blue-700' },
  listo: { nombre: 'Listo para retirar', color: 'bg-green-50 text-green-700' },
  entregado: { nombre: 'Entregado', color: 'bg-neutral-100 text-neutral-500' },
  cancelado: { nombre: 'Cancelado', color: 'bg-red-50 text-red-700' },
}
// El paso que sigue a cada estado mientras el equipo esta en el taller.
const SIGUIENTE = { recibido: 'reparando', reparando: 'listo' }

const FILTROS = [
  { id: 'taller', nombre: 'En el taller' },
  { id: 'cerradas', nombre: 'Entregadas' },
  { id: 'todas', nombre: 'Todas' },
]
const EN_TALLER = ['recibido', 'reparando', 'listo']

// ordenLeida: { numero } cuando se leyo con la pistola el ticket de una
// orden: arranca buscandola por su numero, abierta. (El panel vuelve a
// armar esta pantalla con cada lectura.)
export default function PestanaServicio({ ordenLeida }) {
  // Recargar el panel dispara tambien la lectura de las ordenes (ver el efecto).
  const { datos, recargar } = usePanel()
  // null mientras carga; despues, la lista de servicios_datos().
  const [ordenes, setOrdenes] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState(ordenLeida ? 'todas' : 'taller')
  const [busqueda, setBusqueda] = useState(ordenLeida ? numeroDeTicket(ordenLeida.numero) : '')
  const [abierta, setAbierta] = useState(ordenLeida?.numero ?? null)
  // Ventana abierta: { clase: 'nueva' | 'editar' | 'entregar' | 'imprimir' | 'reabrir' | 'eliminar', id }.
  const [ventana, setVentana] = useState(null)

  useEffect(() => {
    let vigente = true
    leerServicios()
      .then((resultado) => vigente && setOrdenes(resultado))
      .catch((fallo) => vigente && setError(fallo.message))
    return () => {
      vigente = false
    }
  }, [datos])

  if (error) return <p className="tarjeta p-6 text-center text-sm text-red-700">{error}</p>
  if (!ordenes) return <p className="tarjeta p-6 text-center text-sm text-neutral-500">Cargando las órdenes...</p>

  const palabras = normalizar(busqueda).split(' ').filter(Boolean)
  const visibles = ordenes.filter((orden) => {
    if (filtro === 'taller' && !EN_TALLER.includes(orden.estado)) return false
    if (filtro === 'cerradas' && EN_TALLER.includes(orden.estado)) return false
    const texto = normalizar([orden.id, numeroDeTicket(orden.id), orden.cliente, orden.telefono, orden.equipo, orden.imei].join(' '))
    return palabras.every((palabra) => texto.includes(palabra))
  })
  const contar = (estados) => ordenes.filter((orden) => estados.includes(orden.estado)).length
  // La orden de la ventana abierta, siempre con los datos mas nuevos.
  const ordenDeVentana = ventana?.id ? ordenes.find((orden) => orden.id === ventana.id) : null
  const cerrar = () => setVentana(null)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Dato titulo="En reparación" valor={contar(['recibido', 'reparando'])} />
        <Dato titulo="Para retirar" valor={contar(['listo'])} />
        <button type="button" className="boton boton-oscuro" onClick={() => setVentana({ clase: 'nueva' })}>
          + Orden
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-200 p-1" role="tablist" aria-label="Qué órdenes ver">
        {FILTROS.map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            role="tab"
            aria-selected={filtro === opcion.id}
            onClick={() => setFiltro(opcion.id)}
            className={`min-w-0 rounded-lg px-1 py-1.5 text-xs font-medium transition-colors duration-200 ${
              filtro === opcion.id ? 'bg-black text-white shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            {opcion.nombre}
          </button>
        ))}
      </div>

      <CampoBusqueda valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar: cliente, equipo, IMEI o número" etiqueta="Buscar una orden" />

      {visibles.length === 0 && (
        <p className="tarjeta p-6 text-center text-sm text-neutral-500">
          {ordenes.length === 0 ? 'Todavía no hay órdenes de servicio.' : 'No hay órdenes para mostrar acá.'}
        </p>
      )}

      {visibles.map((orden) => (
        <Orden
          key={orden.id}
          orden={orden}
          abierta={abierta === orden.id}
          alAlternar={() => setAbierta(abierta === orden.id ? null : orden.id)}
          alAbrir={(clase) => setVentana({ clase, id: orden.id })}
        />
      ))}

      {ventana?.clase === 'nueva' && (
        <ModalServicio
          alCerrar={cerrar}
          // Apenas se crea, se ofrece imprimir el comprobante para el cliente.
          alGuardar={(id) => setVentana({ clase: 'imprimir', id })}
        />
      )}
      {ordenDeVentana && ventana.clase === 'editar' && <ModalServicio orden={ordenDeVentana} alCerrar={cerrar} />}
      {ordenDeVentana && ventana.clase === 'entregar' && (
        <ModalEntregar orden={ordenDeVentana} alCerrar={cerrar} alEntregar={() => setVentana({ clase: 'imprimir', id: ordenDeVentana.id })} />
      )}
      {ordenDeVentana && ventana.clase === 'imprimir' && <VentanaOrden orden={ordenDeVentana} alCerrar={cerrar} />}
      {ordenDeVentana && ventana.clase === 'reabrir' && (
        <Confirmar
          titulo="Reabrir orden"
          textoBoton="Sí, reabrir"
          alCerrar={cerrar}
          alConfirmar={async () => {
            await reabrirServicio(ordenDeVentana.id)
            await recargar()
            toast.success('La orden volvió a "Listo para retirar"')
          }}
        >
          La orden N° {numeroDeTicket(ordenDeVentana.id)} vuelve a <strong>Listo para retirar</strong>
          {ordenDeVentana.cobrado_ars > 0 && (
            <>
              {' '}
              y su cobro de <strong>{pesos(ordenDeVentana.cobrado_ars)}</strong> sale de la caja
            </>
          )}
          .
        </Confirmar>
      )}
      {ordenDeVentana && ventana.clase === 'eliminar' && (
        <Confirmar
          titulo="Eliminar orden"
          textoBoton="Sí, eliminar"
          peligro
          alCerrar={cerrar}
          alConfirmar={async () => {
            await eliminarServicio(ordenDeVentana.id)
            await recargar()
            toast.success('Orden eliminada')
          }}
        >
          Vas a eliminar la orden N° {numeroDeTicket(ordenDeVentana.id)} de <strong>{ordenDeVentana.cliente}</strong>. Usalo solo para una
          carga equivocada: no queda registro.
        </Confirmar>
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

function Orden({ orden, abierta, alAlternar, alAbrir }) {
  const { recargar } = usePanel()
  const [ocupado, ejecutar] = useAccion()
  const estado = ESTADOS[orden.estado]
  const enTaller = EN_TALLER.includes(orden.estado)
  const siguiente = SIGUIENTE[orden.estado]

  // Pasa la orden al estado que sigue sin abrir el formulario.
  function avanzar() {
    ejecutar(
      async () => {
        await guardarServicio(orden.id, { ...orden, estado: siguiente })
        await recargar()
      },
      { exito: `Orden en "${ESTADOS[siguiente].nombre}"` },
    )
  }

  return (
    <section className="tarjeta overflow-hidden">
      <button type="button" className="renglon flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left" onClick={alAlternar} aria-expanded={abierta}>
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words">{orden.equipo}</p>
          <p className="text-xs break-words text-neutral-500">
            N° {numeroDeTicket(orden.id)} · {orden.cliente}
          </p>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
            <span className={`rounded px-1.5 py-0.5 font-medium ${estado.color}`}>{estado.nombre}</span>
            {orden.en_garantia && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">Por garantía</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold whitespace-nowrap">
            {orden.estado === 'entregado' ? pesos(orden.cobrado_ars) : orden.presupuesto_ars > 0 ? pesos(orden.presupuesto_ars) : 'Sin presupuesto'}
          </p>
          <p className="text-[11px] text-neutral-500">{orden.estado === 'entregado' ? 'cobrado' : fechaCorta(orden.fecha_ingreso).slice(0, 8)}</p>
        </div>
      </button>

      {abierta && (
        <div className="animate-aparecer space-y-3 border-t border-neutral-200 bg-neutral-50 px-3 py-3">
          <dl className="space-y-1 text-xs">
            <Renglon titulo="Ingresó" valor={fechaCorta(orden.fecha_ingreso)} />
            {orden.telefono && <Renglon titulo="Teléfono" valor={orden.telefono} />}
            {orden.imei && <Renglon titulo="IMEI" valor={orden.imei} />}
            {orden.falla && <Renglon titulo="Falla" valor={orden.falla} />}
            {orden.trabajo && <Renglon titulo="Trabajo" valor={orden.trabajo} />}
            {orden.costo_ars > 0 && <Renglon titulo="Repuestos" valor={pesos(orden.costo_ars)} />}
            {orden.notas && <Renglon titulo="Notas" valor={orden.notas} />}
            {orden.fecha_entrega && <Renglon titulo="Entregado" valor={fechaCorta(orden.fecha_entrega)} />}
          </dl>

          <div className="grid grid-cols-2 gap-2">
            {enTaller && (
              <button type="button" className="boton boton-verde col-span-2" onClick={() => alAbrir('entregar')}>
                Entregar y cobrar
              </button>
            )}
            {siguiente && (
              <button type="button" className="boton boton-oscuro boton-chico col-span-2" disabled={ocupado} onClick={avanzar}>
                {ocupado ? 'Guardando...' : `Pasar a "${ESTADOS[siguiente].nombre}"`}
              </button>
            )}
            <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('imprimir')}>
              <IconoImpresora />
              Imprimir
            </button>
            {orden.estado === 'entregado' ? (
              <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('reabrir')}>
                Reabrir
              </button>
            ) : (
              <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('editar')}>
                Editar
              </button>
            )}
            {orden.estado === 'cancelado' && (
              <button type="button" className="boton boton-claro boton-chico" onClick={() => alAbrir('reabrir')}>
                Reabrir
              </button>
            )}
            {orden.estado !== 'entregado' && (
              <button
                type="button"
                className={`boton boton-peligro boton-chico ${orden.estado === 'cancelado' ? '' : 'col-span-2'}`}
                onClick={() => alAbrir('eliminar')}
              >
                Eliminar
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function Renglon({ titulo, valor }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-neutral-500">{titulo}</dt>
      <dd className="min-w-0 font-medium break-words">{valor}</dd>
    </div>
  )
}

const ORDEN_VACIA = {
  cliente: '', telefono: '', equipo: '', imei: '', falla: '', trabajo: '', notas: '',
  estado: 'recibido', presupuesto_ars: null, costo_ars: null, en_garantia: false,
}

// Cargar una orden nueva o corregir una que esta en el taller.
// inicial: valores de arranque para una nueva (lo usa Garantias al abrir un reclamo).
// alGuardar(id): se llama en vez de cerrar cuando se crea una orden.
export function ModalServicio({ orden, inicial = {}, alCerrar, alGuardar }) {
  const { recargar } = usePanel()
  const [campos, setCampos] = useState(() =>
    orden
      ? { ...orden, presupuesto_ars: orden.presupuesto_ars || null, costo_ars: orden.costo_ars || null }
      : { ...ORDEN_VACIA, ...inicial },
  )
  // Quien recibe el equipo: se anota al crear la orden y despues no cambia.
  const [vendedor, setVendedor, vendedores] = useVendedor()
  const [ocupado, ejecutar] = useAccion()
  const fijar = (nombre) => (evento) => setCampos({ ...campos, [nombre]: evento.target.value })

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        const id = await guardarServicio(orden?.id ?? null, {
          ...campos,
          vendedor,
          presupuesto_ars: campos.presupuesto_ars || 0,
          costo_ars: campos.costo_ars || 0,
        })
        await recargar()
        return id
      },
      {
        exito: orden ? 'Orden guardada' : 'Orden creada',
        alTerminar: (id) => (!orden && alGuardar ? alGuardar(id) : alCerrar()),
      },
    )
  }

  return (
    <Modal titulo={orden ? `Orden N° ${numeroDeTicket(orden.id)}` : 'Nueva orden de servicio'} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta">
            Cliente
            <input className="campo" value={campos.cliente} onChange={fijar('cliente')} maxLength={80} autoComplete="off" />
          </label>
          <label className="etiqueta">
            Teléfono
            <input className="campo" type="tel" inputMode="tel" value={campos.telefono} onChange={fijar('telefono')} maxLength={40} placeholder="Opcional" autoComplete="off" />
          </label>
          <label className="etiqueta">
            Equipo
            <input className="campo" value={campos.equipo} onChange={fijar('equipo')} maxLength={120} placeholder="IPHONE 11 NEGRO" />
          </label>
          <label className="etiqueta">
            IMEI
            <input
              className="campo"
              inputMode="numeric"
              value={campos.imei}
              onChange={fijar('imei')}
              // El lector de mano termina con Enter: no tiene que enviar el formulario.
              onKeyDown={(evento) => evento.key === 'Enter' && evento.preventDefault()}
              maxLength={20}
              placeholder="Opcional"
              autoComplete="off"
            />
          </label>
        </div>
        <label className="etiqueta">
          Falla que cuenta el cliente
          <textarea className="campo" rows={2} value={campos.falla} onChange={fijar('falla')} maxLength={500} />
        </label>
        {orden && (
          <label className="etiqueta">
            Trabajo realizado
            <textarea className="campo" rows={2} value={campos.trabajo} onChange={fijar('trabajo')} maxLength={500} placeholder="Sale en el comprobante de entrega" />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta">
            Presupuesto ($)
            <CampoPesos valor={campos.presupuesto_ars} alCambiar={(valor) => setCampos({ ...campos, presupuesto_ars: valor })} placeholder="A confirmar" />
          </label>
          <label className="etiqueta">
            Repuestos ($)
            <CampoPesos valor={campos.costo_ars} alCambiar={(valor) => setCampos({ ...campos, costo_ars: valor })} placeholder="Tu costo" />
          </label>
        </div>
        {orden && (
          <label className="etiqueta">
            Estado
            <select className="campo" value={campos.estado} onChange={fijar('estado')}>
              <option value="recibido">Recibido</option>
              <option value="reparando">En reparación</option>
              <option value="listo">Listo para retirar</option>
              <option value="cancelado">Cancelado (no se arregla)</option>
            </select>
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-black"
            checked={campos.en_garantia}
            onChange={(evento) => setCampos({ ...campos, en_garantia: evento.target.checked })}
          />
          Entra por garantía
        </label>
        {!orden && <CampoVendedor vendedor={vendedor} alCambiar={setVendedor} opciones={vendedores} />}
        <label className="etiqueta">
          Notas internas
          <input className="campo" value={campos.notas} onChange={fijar('notas')} maxLength={500} placeholder="No salen impresas" />
        </label>

        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !campos.cliente.trim() || !campos.equipo.trim()}>
          {ocupado ? 'Guardando...' : orden ? 'Guardar cambios' : 'Crear orden'}
        </button>
      </form>
    </Modal>
  )
}

// Entregar el equipo: cuanto se cobra, como y que garantia lleva el arreglo.
function ModalEntregar({ orden, alCerrar, alEntregar }) {
  const { configuracion, recargar } = usePanel()
  // Un reclamo por garantia arranca sin cargo.
  const [cobrado, setCobrado] = useState(orden.en_garantia ? 0 : orden.presupuesto_ars || null)
  const [cobro, setCobro] = useState(COBRO_VACIO)
  const [garantia, setGarantia] = useState(configuracion.garantia_dias_servicio)
  const [ocupado, ejecutar] = useAccion()

  function confirmar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        // Sin cargo no hay nada que repartir entre efectivo y transferencia.
        const comoPaga = cobrado > 0 ? cobroParaLaBase(cobro) : { medio: 'efectivo', efectivo_ars: null }
        await entregarServicio(orden.id, { cobrado_ars: cobrado, ...comoPaga, garantia_dias: garantia })
        await recargar()
      },
      { exito: 'Equipo entregado', alTerminar: alEntregar },
    )
  }

  return (
    <Modal titulo={`Entregar · ${orden.equipo}`} alCerrar={alCerrar} ancho="max-w-sm">
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-xs text-neutral-500">
          {orden.cliente}
          {orden.presupuesto_ars > 0 && ` · presupuesto ${pesos(orden.presupuesto_ars)}`}
        </p>
        <label className="etiqueta">
          Se cobra ($)
          <CampoPesos valor={cobrado} alCambiar={setCobrado} placeholder="0 = sin cargo" />
        </label>
        {cobrado > 0 && <CamposDeCobro cobro={cobro} alCambiar={setCobro} total={cobrado} />}
        <div>
          <p className="etiqueta mb-1">Garantía del arreglo</p>
          <CampoGarantia valor={garantia} alCambiar={setGarantia} />
        </div>
        <button type="submit" className="boton boton-verde w-full" disabled={ocupado || cobrado === null || garantia === '' || (cobrado > 0 && cobroIncompleto(cobro, cobrado))}>
          {ocupado ? 'Guardando...' : 'Entregar'}
        </button>
      </form>
    </Modal>
  )
}
