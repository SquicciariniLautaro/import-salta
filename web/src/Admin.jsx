// Admin.jsx
// Panel de administracion. Este archivo se descarga recien al entrar a /admin
// (ver lazy() en App.jsx).
//
// Aca vive la estructura: la sesion, el encabezado con las cotizaciones, las
// secciones y los datos que comparten todas las pantallas. Cada seccion esta
// en su propio archivo dentro de panel/.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import toast, { Toaster } from 'react-hot-toast'
import { MODO_PRUEBA } from './api.js'
import { alVencerSesion, cerrarSesion, guardarConfiguracion, leerPanel, verSesion } from './apiAdmin.js'
import { NEGOCIO } from './negocio.js'
import { armarAvisos } from './servicios/avisos.js'
import { armarCuentas } from './servicios/cuentas.js'
import { armarStock } from './servicios/stock.js'
import Login from './Login.jsx'
import CampoPesos from './componentes/CampoPesos.jsx'
import Pie from './componentes/Pie.jsx'
import PestanaAjustes from './panel/Ajustes.jsx'
import PestanaCaja from './panel/Caja.jsx'
import { BarraCarrito } from './panel/Carrito.jsx'
import PestanaClientes from './panel/Clientes.jsx'
import PestanaCuentas from './panel/Cuentas.jsx'
import PestanaGarantias from './panel/Garantias.jsx'
import PestanaProveedores from './panel/Proveedores.jsx'
import PestanaServicio from './panel/Servicio.jsx'
import PestanaStock from './panel/Stock.jsx'
import { VentanaTicket } from './panel/Impresion.jsx'
import { ContextoPanel } from './panel/contexto.js'
import { usePistolaDeTickets } from './panel/pistola.js'
import { useAccion } from './panel/useAccion.js'
import { leerDolarBlue } from './panel/dolarBlue.js'
import { fechaCorta, pesos } from './formato.js'

// La pestana de ventas trae la libreria de graficos: se baja al abrirla.
const PestanaVentas = lazy(() => import('./panel/Ventas.jsx'))

// Las secciones del panel: tres filas de cuatro en el celular y dos de seis
// en pantallas mas anchas. "corto" es el nombre que entra en un celular de 360 px.
const PESTANAS = [
  { id: 'celulares', nombre: 'Celulares', corto: 'Celulares' },
  { id: 'accesorios', nombre: 'Accesorios', corto: 'Accesor.' },
  { id: 'revendedores', nombre: 'Revendedores', corto: 'Revend.' },
  { id: 'senas', nombre: 'Señas', corto: 'Señas' },
  { id: 'clientes', nombre: 'Clientes', corto: 'Clientes' },
  { id: 'ventas', nombre: 'Ventas', corto: 'Ventas' },
  { id: 'caja', nombre: 'Caja', corto: 'Caja' },
  { id: 'servicio', nombre: 'Servicio técnico', corto: 'Servicio' },
  { id: 'proveedores', nombre: 'Proveedores', corto: 'Proveed.' },
  { id: 'garantias', nombre: 'Garantías', corto: 'Garantías' },
  { id: 'ajustes', nombre: 'Ajustes', corto: 'Ajustes' },
]

const CARRITO_VACIO = { tipo: null, items: [] }

export default function Admin() {
  // fase: 'verificando' | 'afuera' | 'adentro' | 'error'
  const [sesion, setSesion] = useState({ fase: 'verificando', correo: '' })
  const [intento, setIntento] = useState(0)

  // Al abrir /admin se revisa si hay una sesion guardada y si es de un administrador.
  useEffect(() => {
    let vigente = true
    verSesion()
      .then((datos) => {
        if (vigente) setSesion(datos.activa ? { fase: 'adentro', correo: datos.correo } : { fase: 'afuera', correo: '' })
      })
      .catch(() => vigente && setSesion({ fase: 'error', correo: '' }))
    return () => {
      vigente = false
    }
  }, [intento])

  // Si en medio del trabajo la sesion se cierra o vence, se vuelve al
  // formulario de ingreso. El efecto devuelve la funcion que deja de escuchar.
  useEffect(() => alVencerSesion(() => setSesion({ fase: 'afuera', correo: '' })), [])

  async function salir() {
    try {
      await cerrarSesion()
    } catch {
      // Si fallo, igual se muestra el formulario de ingreso.
    }
    setSesion({ fase: 'afuera', correo: '' })
  }

  return (
    <>
      {/* Avisos cortos ("Guardado"). Las confirmaciones van en ventanas modales, no aca. */}
      <Toaster position="top-center" toastOptions={{ style: { fontSize: '14px', maxWidth: '92vw', background: '#1c1c1f', color: '#f5f5f7', border: '1px solid #2c2c31' } }} />

      {sesion.fase === 'verificando' && <p className="p-6 text-center text-sm text-neutral-500">Cargando...</p>}

      {sesion.fase === 'error' && (
        <div className="p-6 text-center">
          <p className="text-sm text-neutral-700">No se pudo conectar con el servidor.</p>
          <button
            type="button"
            onClick={() => {
              setSesion({ fase: 'verificando', correo: '' })
              setIntento(intento + 1)
            }}
            className="boton boton-oscuro mt-3"
          >
            Reintentar
          </button>
        </div>
      )}

      {sesion.fase === 'afuera' && <Login alEntrar={(datos) => setSesion({ fase: 'adentro', correo: datos.correo })} />}

      {sesion.fase === 'adentro' && <Panel correo={sesion.correo} alSalir={salir} />}
    </>
  )
}

function Panel({ correo, alSalir }) {
  // Lo que devuelve panel_datos(), o null mientras llega la primera vez.
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState('celulares')
  const [carrito, setCarrito] = useState(CARRITO_VACIO)
  // Un ticket leido con la pistola: el de una venta se abre para verlo o
  // reimprimirlo; el de una orden lleva a esa orden en Servicio tecnico.
  const [ventaLeida, setVentaLeida] = useState(null) // numero de comprobante
  const [ordenLeida, setOrdenLeida] = useState(null) // { numero, vez }
  usePistolaDeTickets(({ tipo, numero }) => {
    if (!datos) return
    if (tipo === 'venta') {
      setVentaLeida(numero)
      return
    }
    // "vez": leer dos veces la misma orden la vuelve a buscar.
    setOrdenLeida({ numero, vez: Date.now() })
    setPestana('servicio')
  })
  // Al cambiar de pestana a mano, Servicio tecnico vuelve a arrancar sin buscar nada.
  function irA(id) {
    setOrdenLeida(null)
    setPestana(id)
  }

  // Vuelve a leer todo de la base. Se llama despues de cada cambio.
  // Devuelve lo leido, para quien necesite los datos nuevos en el momento.
  const recargar = useCallback(async () => {
    const nuevos = await leerPanel()
    setDatos(nuevos)
    return nuevos
  }, [])

  // Primera lectura, al entrar al panel.
  useEffect(() => {
    let vigente = true
    leerPanel()
      .then((resultado) => vigente && setDatos(resultado))
      .catch((fallo) => vigente && setError(fallo.message))
    return () => {
      vigente = false
    }
  }, [])

  // Todo lo que se calcula a partir de los datos, en un solo lugar.
  const valor = useMemo(() => {
    if (!datos) return null
    const cotizaciones = {
      venta: datos.configuracion.cotizacion_dolar,
      // Vacia = la misma que la de venta.
      costo: datos.configuracion.cotizacion_costo ?? datos.configuracion.cotizacion_dolar,
    }
    const comunes = { celulares: datos.celulares, accesorios: datos.accesorios, cotizaciones }
    const stock = {
      celulares: armarStock(datos.celulares, 'celulares'),
      accesorios: armarStock(datos.accesorios, 'accesorios'),
    }
    return {
      datos,
      cotizaciones,
      // Los ajustes del comercio: datos para el ticket, garantias, avisos y papel.
      configuracion: datos.configuracion,
      stock,
      // Que se quedo sin stock y de que queda poco, por tabla.
      avisos: armarAvisos({ stock, agotados: datos.agotados, configuracion: datos.configuracion }),
      cuentas: {
        revendedor: armarCuentas({ ...comunes, tipo: 'revendedor', pagos: datos.pagos_revendedor, lista: datos.revendedores }),
        sena: armarCuentas({ ...comunes, tipo: 'sena', pagos: datos.pagos_sena }),
      },
    }
  }, [datos])

  // Suma unidades al carrito. El carrito es uno solo y no mezcla revendedor
  // con sena. Devuelve true si se pudo agregar.
  function agregarAlCarrito(tipo, item) {
    if (carrito.tipo && carrito.tipo !== tipo) {
      toast.error(`El carrito ya tiene equipos para ${carrito.tipo === 'sena' ? 'una seña' : 'un revendedor'}. Confirmalo o vacialo primero.`)
      return false
    }
    // Si ese lote ya estaba en el carrito, se le suman las unidades.
    const existente = carrito.items.find((otro) => otro.tabla === item.tabla && otro.clave === item.clave)
    const items = existente
      ? carrito.items.map((otro) => (otro === existente ? { ...otro, ids: [...otro.ids, ...item.ids] } : otro))
      : [...carrito.items, item]
    setCarrito({ tipo, items })
    return true
  }

  if (error && !datos) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm break-words text-neutral-700">{error}</p>
        <button
          type="button"
          className="boton boton-oscuro mt-3"
          onClick={() => {
            setError('')
            recargar().catch((fallo) => setError(fallo.message))
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-negro">
      <header className="border-b border-neutral-200 bg-negro px-3 pt-3 pb-2 text-blanco">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{NEGOCIO.nombre} · Panel</p>
              <p className="truncate text-[11px] text-neutral-500">{correo}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link to="/" className="boton boton-fantasma boton-chico">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
                <span className="sm:hidden">Catálogo</span>
                <span className="hidden sm:inline">Volver al catálogo</span>
              </Link>
              <button type="button" onClick={alSalir} className="boton boton-fantasma boton-chico">
                Salir
              </button>
            </div>
          </div>

          {MODO_PRUEBA && (
            <p className="mt-2 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-medium text-negro">
              Modo prueba: datos inventados que se reinician al recargar la página.
            </p>
          )}

          {valor && <Cotizaciones configuracion={datos.configuracion} alGuardar={recargar} />}

          <nav className="mt-3 grid grid-cols-4 gap-1 pb-1 sm:grid-cols-6" role="tablist">
            {PESTANAS.map((opcion) => {
              // Un punto avisa que en esa seccion hay stock agotado o por agotarse.
              const conAviso = valor?.avisos[opcion.id]?.total > 0
              return (
                <button
                  key={opcion.id}
                  type="button"
                  role="tab"
                  aria-selected={pestana === opcion.id}
                  onClick={() => irA(opcion.id)}
                  className={`relative min-w-0 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors duration-200 sm:text-xs md:text-sm ${
                    pestana === opcion.id ? 'bg-blanco text-negro' : 'text-neutral-500 hover:bg-neutral-100 hover:text-blanco'
                  }`}
                >
                  <span className="block truncate sm:hidden">{opcion.corto}</span>
                  <span className="hidden truncate sm:block">{opcion.nombre}</span>
                  {conAviso && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-400" title="Hay avisos de stock">
                      <span className="sr-only">Hay avisos de stock</span>
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-3">
        {!valor ? (
          <p className="tarjeta p-6 text-center text-sm text-neutral-500">Cargando...</p>
        ) : (
          <ContextoPanel.Provider
            value={{
              ...valor,
              recargar,
              carrito,
              agregarAlCarrito,
              cambiarCarrito: setCarrito,
              vaciarCarrito: () => setCarrito(CARRITO_VACIO),
              irA,
            }}
          >
            {/* key hace que al cambiar de pestana la pantalla arranque de cero. */}
            <div key={pestana} className="animate-aparecer">
              {pestana === 'celulares' && <PestanaStock tabla="celulares" />}
              {pestana === 'accesorios' && <PestanaStock tabla="accesorios" />}
              {pestana === 'revendedores' && <PestanaCuentas tipo="revendedor" />}
              {pestana === 'senas' && <PestanaCuentas tipo="sena" />}
              {pestana === 'clientes' && <PestanaClientes />}
              {pestana === 'ventas' && (
                <Suspense fallback={<p className="tarjeta p-6 text-center text-sm text-neutral-500">Cargando ventas...</p>}>
                  <PestanaVentas />
                </Suspense>
              )}
              {pestana === 'caja' && <PestanaCaja />}
              {pestana === 'servicio' && <PestanaServicio key={ordenLeida?.vez} ordenLeida={ordenLeida} />}
              {pestana === 'proveedores' && <PestanaProveedores />}
              {pestana === 'garantias' && <PestanaGarantias />}
              {pestana === 'ajustes' && <PestanaAjustes />}
            </div>
            <BarraCarrito />
            {ventaLeida && <VentanaTicket comprobanteId={ventaLeida} alCerrar={() => setVentaLeida(null)} />}
          </ContextoPanel.Provider>
        )}
      </main>

      <Pie />
    </div>
  )
}

// Encabezado del panel: las dos cotizaciones y Guardar. "Dólar blue de hoy"
// trae la cotizacion del dia y la pone en el dolar de venta (hay que guardar).
function Cotizaciones({ configuracion, alGuardar }) {
  const [venta, setVenta] = useState(configuracion.cotizacion_dolar)
  // null significa "la misma que la de venta".
  const [costo, setCosto] = useState(configuracion.cotizacion_costo)
  const [ocupado, ejecutar] = useAccion()
  const [blue, setBlue] = useState(null) // { compra, venta, fecha }
  const [buscando, buscar] = useAccion()

  function traerBlue() {
    buscar(async () => {
      const datos = await leerDolarBlue()
      setBlue(datos)
      setVenta(datos.venta)
    })
  }

  const cambio = venta !== configuracion.cotizacion_dolar || (costo || null) !== configuracion.cotizacion_costo

  function guardar(evento) {
    evento.preventDefault()
    if (!venta) {
      toast.error('Cargá la cotización de venta')
      return
    }
    ejecutar(
      async () => {
        await guardarConfiguracion({ cotizacion_dolar: venta, cotizacion_costo: costo || null })
        await alGuardar()
      },
      { exito: 'Cotizaciones guardadas' },
    )
  }

  return (
    <form onSubmit={guardar} className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
      <label htmlFor="cotizacion-venta" className="min-w-0 text-[11px] text-neutral-600">
        Dólar venta
        <CampoPesos id="cotizacion-venta" valor={venta} alCambiar={setVenta} />
      </label>
      <label htmlFor="cotizacion-costo" className="min-w-0 text-[11px] text-neutral-600">
        Dólar costo
        <CampoPesos id="cotizacion-costo" valor={costo} alCambiar={setCosto} placeholder="Igual a venta" />
      </label>
      <button type="submit" disabled={ocupado || !cambio} className="boton boton-blanco">
        {ocupado ? '...' : 'Guardar'}
      </button>
      <div className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        <button type="button" onClick={traerBlue} disabled={buscando} className="enlace-raya font-medium text-neutral-800 disabled:opacity-50">
          {buscando ? 'Consultando...' : 'Usar el dólar blue de hoy'}
        </button>
        {blue && (
          <span>
            Blue: compra {pesos(blue.compra)} · venta {pesos(blue.venta)}
            {blue.fecha && ` (${fechaCorta(blue.fecha)})`}
            {cambio && ' · tocá Guardar'}
          </span>
        )}
      </div>
    </form>
  )
}
