// panel/Compra.jsx
// Lotes de compra: todo lo que vino de un proveedor en una misma compra.
// Se elige el proveedor una vez y se cargan los modelos que trajo, cada uno
// con su color, bateria, costo, precio y cantidad. Los IMEI se pueden leer en
// el momento o despues, de corrido, desde el lote. Cada modelo puede llevar
// su foto para el catalogo.

import { useRef, useState } from 'react'
import Modal from '../componentes/Modal.jsx'
import { ingresarCompra } from '../apiAdmin.js'
import { aPesos, dolares, fechaCorta, pesos } from '../formato.js'
import { numeroDeTicket } from '../servicios/comprobante.js'
import { claveDeLoteIngresado } from '../servicios/imagenes.js'
import { sumar } from '../servicios/lotes.js'
import { diaDe } from '../servicios/caja.js'
import { fechaParaLaBase, problemaDeDia } from '../servicios/fechas.js'
import { describir } from '../servicios/texto.js'
import { CampoFecha, CampoUsd, Cantidad, SelectorConOtro } from './Campos.jsx'
import { CamposDeCelular } from './Formularios.jsx'
import { CampoFoto } from './FotoLote.jsx'
import { ponerFotos, subirFotos } from './fotos.js'
import { CampoImeis, CargaRapidaImeis } from './Imei.jsx'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

const MODELO_VACIO = { modelo: '', capacidad: '', color: '', bateria: '', detalles: '', costo: '', precio: '', mayorista: '', cantidad: 1, imeis: [], foto: null }

// Un texto de campo es un monto valido si es un numero mayor o igual a cero.
const esMonto = (texto) => texto !== '' && Number(texto) >= 0

// Cargar un lote de compra. proveedorInicial: si se abre desde un proveedor.
export function ModalCompra({ proveedorInicial = '', alCerrar }) {
  const { datos, cotizaciones, recargar } = usePanel()
  const [proveedor, setProveedor] = useState(proveedorInicial)
  const [nota, setNota] = useState('')
  // Cada modelo lleva una "llave" propia para que React no los mezcle al quitar uno.
  const [modelos, setModelos] = useState([{ ...MODELO_VACIO, llave: 1 }])
  const proximaLlave = useRef(2)
  // Cuando el lote se guardo: el numero de compra. Despues se ofrecen los IMEI.
  const [hecha, setHecha] = useState(null)
  const [cargandoImeis, setCargandoImeis] = useState(false)
  // Si el lote queda debiendose al proveedor. La deuda vacia es el costo total.
  const [queDebe, setQueDebe] = useState(true)
  const [deuda, setDeuda] = useState('')
  // Fecha de compra del lote: arranca en hoy.
  const [hoy] = useState(() => diaDe(new Date()))
  const [dia, setDia] = useState(hoy)
  const [ocupado, ejecutar] = useAccion()

  const unidades = modelos.reduce((suma, modelo) => suma + modelo.cantidad, 0)
  const costoTotal = sumar(modelos.map((modelo) => (esMonto(modelo.costo) ? Number(modelo.costo) * modelo.cantidad : 0)))
  const deudaUsd = !queDebe ? 0 : deuda === '' ? costoTotal : Number(deuda)
  const falta =
    !proveedor.trim() ||
    Boolean(problemaDeDia(dia, { hoy })) ||
    (queDebe && deuda !== '' && !esMonto(deuda)) ||
    modelos.some((modelo) => !modelo.modelo.trim() || !esMonto(modelo.costo) || !esMonto(modelo.precio) || (modelo.mayorista !== '' && !esMonto(modelo.mayorista)))

  // Parte de la lista del momento: la foto llega un rato despues de elegirla.
  function cambiar(posicion, cambios) {
    setModelos((actuales) => actuales.map((modelo, indice) => (indice === posicion ? { ...modelo, ...cambios } : modelo)))
  }

  // Duplicar copia todo menos la cantidad, los IMEI y la foto: sirve para el
  // mismo modelo en otro color o con otra bateria.
  function duplicar(posicion) {
    const copia = { ...modelos[posicion], cantidad: 1, imeis: [], foto: null, llave: proximaLlave.current }
    proximaLlave.current += 1
    setModelos([...modelos.slice(0, posicion + 1), copia, ...modelos.slice(posicion + 1)])
  }

  function agregar() {
    setModelos([...modelos, { ...MODELO_VACIO, llave: proximaLlave.current }])
    proximaLlave.current += 1
  }

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        const urls = await subirFotos(modelos.map((modelo) => modelo.foto))
        const resultado = await ingresarCompra(
          proveedor,
          nota,
          modelos.map((modelo) => ({
            modelo: modelo.modelo,
            capacidad: modelo.capacidad,
            color: modelo.color,
            bateria: modelo.bateria,
            detalles: modelo.detalles,
            costo_usd: Number(modelo.costo),
            precio_usd: Number(modelo.precio),
            precio_mayorista_usd: modelo.mayorista === '' ? null : Number(modelo.mayorista),
            cantidad: modelo.cantidad,
            imeis: modelo.imeis,
          })),
          deudaUsd,
          fechaParaLaBase(dia, hoy),
        )
        const nuevos = await recargar()
        // La foto de cada modelo va al lote que se cargo en esta compra.
        const deLaCompra = nuevos.celulares.filter((unidad) => unidad.compra_id === resultado.compra)
        await ponerFotos(
          'celulares',
          modelos.map((modelo, posicion) => ({
            clave: claveDeLoteIngresado(deLaCompra, {
              modelo: modelo.modelo, capacidad: modelo.capacidad, color: modelo.color, bateria: modelo.bateria, detalles: modelo.detalles,
            }),
            url: urls[posicion],
          })),
          recargar,
        )
        setHecha(resultado.compra)
      },
      { exito: 'Lote cargado' },
    )
  }

  if (hecha && cargandoImeis) return <ModalImeisCompra compraId={hecha} alCerrar={alCerrar} />

  if (hecha) {
    const compra = datos.compras.find((otra) => otra.id === hecha)
    const sinImei = compra ? compra.modelos.reduce((suma, modelo) => suma + modelo.sin_imei, 0) : 0
    return (
      <Modal titulo="Lote cargado" alCerrar={alCerrar} ancho="max-w-sm">
        <p className="text-sm text-neutral-700">
          El lote <strong>N° {numeroDeTicket(hecha)}</strong> de <strong>{proveedor.toUpperCase()}</strong> quedó en el stock con {unidades}{' '}
          {unidades === 1 ? 'equipo' : 'equipos'}.
        </p>
        <p className="mt-2 text-sm text-neutral-700">
          {deudaUsd > 0 ? (
            <>
              Quedó una deuda de <strong>{dolares(deudaUsd)}</strong> en la cuenta del proveedor.
            </>
          ) : (
            'Quedó como pagado: no suma deuda.'
          )}
        </p>
        {sinImei > 0 && (
          <p className="mt-2 text-sm text-neutral-700">
            Quedan <strong>{sinImei}</strong> sin IMEI. Los podés cargar ahora de corrido o más tarde desde Proveedores.
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="boton boton-claro" onClick={alCerrar}>
            Listo
          </button>
          <button type="button" className="boton boton-oscuro" disabled={sinImei === 0} onClick={() => setCargandoImeis(true)}>
            Cargar IMEI
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Lote de proveedor" alCerrar={alCerrar} ancho="max-w-lg">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta col-span-2">
            Proveedor
            <SelectorConOtro
              valor={proveedor}
              alCambiar={setProveedor}
              opciones={datos.proveedores.map((opcion) => opcion.nombre)}
              vacio="Elegir proveedor..."
            />
          </label>
          <label className="etiqueta col-span-2">
            Nota
            <input className="campo" value={nota} onChange={(evento) => setNota(evento.target.value)} maxLength={300} placeholder="Opcional: número de factura, forma de pago..." />
          </label>
          <div className="col-span-2">
            <CampoFecha etiqueta="Fecha de compra" valor={dia} hoy={hoy} alCambiar={setDia} ayuda="Vale para todos los equipos del lote. Si lo compraste otro día, cambiala." />
          </div>
        </div>

        {modelos.map((modelo, posicion) => (
          <section key={modelo.llave} className="space-y-3 rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Modelo {posicion + 1}</h3>
              <div className="flex gap-1">
                <button type="button" className="boton boton-claro boton-chico" onClick={() => duplicar(posicion)}>
                  Duplicar
                </button>
                {modelos.length > 1 && (
                  <button
                    type="button"
                    className="boton boton-peligro boton-chico"
                    onClick={() => setModelos(modelos.filter((_, indice) => indice !== posicion))}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>

            <CamposDeCelular campos={modelo} alCambiar={(campos) => cambiar(posicion, campos)} />

            <div className="grid grid-cols-2 gap-3">
              <label className="etiqueta">
                Costo c/u (USD)
                <CampoUsd valor={modelo.costo} alCambiar={(costo) => cambiar(posicion, { costo })} cotizacion={cotizaciones.costo} />
              </label>
              <label className="etiqueta">
                Precio minorista (USD)
                <CampoUsd valor={modelo.precio} alCambiar={(precio) => cambiar(posicion, { precio })} cotizacion={cotizaciones.venta} />
              </label>
              <label className="etiqueta col-span-2">
                Precio mayorista (USD, opcional)
                <CampoUsd valor={modelo.mayorista} alCambiar={(mayorista) => cambiar(posicion, { mayorista })} cotizacion={cotizaciones.venta} />
              </label>
            </div>

            <div>
              <p className="etiqueta mb-1">Cantidad</p>
              <Cantidad
                valor={modelo.cantidad}
                minimo={Math.max(1, modelo.imeis.length)}
                maximo={500}
                alCambiar={(cantidad) => cambiar(posicion, { cantidad })}
              />
            </div>

            <div>
              <p className="etiqueta mb-1">IMEI (opcional: también se cargan después)</p>
              <CampoImeis
                imeis={modelo.imeis}
                // Cada IMEI es un equipo: la cantidad nunca queda por debajo, y si
                // iba pareja con los IMEI (cargando con la pistola), los sigue.
                alCambiar={(imeis) =>
                  cambiar(posicion, {
                    imeis,
                    cantidad: modelo.cantidad === modelo.imeis.length ? Math.max(1, imeis.length) : Math.max(modelo.cantidad, imeis.length),
                  })
                }
              />
            </div>

            <CampoFoto
              foto={modelo.foto}
              alCambiar={(foto) => cambiar(posicion, { foto })}
              ayuda="Sale en el catálogo al lado de este modelo. Vale para todas sus unidades."
            />
          </section>
        ))}

        <button type="button" className="boton boton-claro w-full" onClick={agregar}>
          + Agregar otro modelo
        </button>

        <p className="flex items-baseline justify-between gap-2 border-t border-neutral-200 pt-3 text-sm">
          <span className="text-neutral-600">
            {unidades} {unidades === 1 ? 'equipo' : 'equipos'} · costo total
          </span>
          <span className="text-right">
            <span className="block font-bold whitespace-nowrap">{dolares(costoTotal)}</span>
            <span className="block text-[11px] text-neutral-500">{pesos(aPesos(costoTotal, cotizaciones.costo))}</span>
          </span>
        </p>

        <section className="space-y-2 rounded-xl bg-neutral-50 p-3">
          <h3 className="text-sm font-semibold">Pago al proveedor</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className={`boton boton-chico ${queDebe ? 'boton-oscuro' : 'boton-claro'}`} onClick={() => setQueDebe(true)}>
              Queda debiendo
            </button>
            <button type="button" className={`boton boton-chico ${queDebe ? 'boton-claro' : 'boton-oscuro'}`} onClick={() => setQueDebe(false)}>
              Ya está pagado
            </button>
          </div>
          {queDebe ? (
            <label className="etiqueta">
              Deuda por este lote (USD)
              <CampoUsd valor={deuda} alCambiar={setDeuda} cotizacion={cotizaciones.costo} />
              <span className="block text-[11px] font-normal text-neutral-500">
                Vacío = el costo total ({dolares(costoTotal)}). Se suma a la cuenta del proveedor y la bajan los pagos que le anotes.
              </span>
            </label>
          ) : (
            <p className="text-xs text-neutral-500">
              El lote no suma deuda. Usalo para mercadería que ya estaba paga antes de cargarla; si le pagás ahora con plata de la caja, mejor elegí
              "Queda debiendo" y anotá el pago desde Proveedores.
            </p>
          )}
        </section>

        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || falta}>
          {ocupado ? 'Guardando...' : `Cargar lote de ${unidades} ${unidades === 1 ? 'equipo' : 'equipos'}`}
        </button>
      </form>
    </Modal>
  )
}

// Cargar los IMEI que faltan en un lote de compra, modelo por modelo.
export function ModalImeisCompra({ compraId, alCerrar }) {
  const { datos } = usePanel()
  const compra = datos.compras.find((otra) => otra.id === compraId)
  // El modelo que se esta cargando: arranca en el primero al que le faltan.
  const [abierto, setAbierto] = useState(() => compra?.modelos.find((modelo) => modelo.sin_imei > 0)?.clave ?? null)

  if (!compra) {
    return (
      <Modal titulo="Lote de compra" alCerrar={alCerrar} ancho="max-w-sm">
        <p className="text-sm text-neutral-600">Ese lote ya no aparece. Actualizá la página.</p>
      </Modal>
    )
  }

  return (
    <Modal titulo={`IMEI del lote N° ${numeroDeTicket(compra.id)}`} alCerrar={alCerrar}>
      <p className="text-xs text-neutral-500">
        Elegí el modelo y leé las cajas de corrido con el lector o la cámara, o pegá la lista que te pasó el proveedor. Al guardar, cada IMEI va a
        un equipo de ese modelo que no tenga.
      </p>
      <ul className="mt-3 space-y-2">
        {compra.modelos.map((modelo) => (
          <li key={modelo.clave} className="rounded-lg border border-neutral-200">
            <button
              type="button"
              className="renglon flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left"
              onClick={() => setAbierto(abierto === modelo.clave ? null : modelo.clave)}
              aria-expanded={abierto === modelo.clave}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium break-words">{describir(modelo, 'celulares')}</span>
                {modelo.bateria && <span className="block text-xs text-neutral-500">{modelo.bateria}</span>}
              </span>
              <span className={`shrink-0 text-xs font-medium ${modelo.sin_imei > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {modelo.sin_imei === 0 ? 'Completo' : modelo.sin_imei === 1 ? 'Falta 1' : `Faltan ${modelo.sin_imei}`}
              </span>
            </button>
            {abierto === modelo.clave && (
              <div className="animate-aparecer border-t border-neutral-200 p-3">
                <CargaRapidaImeis clave={modelo.clave} compra={compra.id} faltan={modelo.sin_imei} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}

// Los lotes de compra de un proveedor (los de los ultimos 180 dias).
export function ListaDeCompras({ proveedorId, alCargarImeis }) {
  const { datos } = usePanel()
  const compras = datos.compras.filter((compra) => compra.proveedor_id === proveedorId)
  if (compras.length === 0) return null

  return (
    <div>
      <h4 className="text-xs font-semibold text-neutral-600">Lotes de compra</h4>
      <ul className="mt-1 divide-y divide-neutral-200">
        {compras.map((compra) => {
          const equipos = compra.modelos.reduce((suma, modelo) => suma + modelo.unidades, 0)
          const sinImei = compra.modelos.reduce((suma, modelo) => suma + modelo.sin_imei, 0)
          const costo = sumar(compra.modelos.map((modelo) => modelo.costo_usd))
          return (
            <li key={compra.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0 text-xs">
                <p className="text-sm font-medium">
                  Lote N° {numeroDeTicket(compra.id)} · {equipos} {equipos === 1 ? 'equipo' : 'equipos'}
                </p>
                <p className="text-neutral-500">
                  {fechaCorta(compra.fecha)} · costo {dolares(costo)}
                  {compra.deuda_usd > 0 ? ` · quedó debiendo ${dolares(compra.deuda_usd)}` : ''}
                </p>
                {compra.nota && <p className="break-words text-neutral-500">{compra.nota}</p>}
                <p className={sinImei > 0 ? 'font-medium text-amber-700' : 'text-green-700'}>
                  {sinImei === 0 ? 'IMEI completos' : sinImei === 1 ? 'Falta 1 IMEI' : `Faltan ${sinImei} IMEI`}
                </p>
              </div>
              <button type="button" className="boton boton-claro boton-chico shrink-0" onClick={() => alCargarImeis(compra.id)}>
                {sinImei > 0 ? 'Cargar IMEI' : 'Ver'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
