// panel/Formularios.jsx
// Ventanas para cargar stock: ingresar un lote nuevo, sumar unidades a uno
// que ya existe, editar sus datos, y registrar una permuta.

import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../componentes/Modal.jsx'
import CampoPesos from '../componentes/CampoPesos.jsx'
import { buscarImei, cambiarFechaCompra, editarLote, ingresarAccesorios, ingresarCelulares, registrarPermuta } from '../apiAdmin.js'
import { aDolares, aPesos, extraerImei, fechaCorta, pesos, soloFecha } from '../formato.js'
import { COBRO_VACIO, DEUDA_VACIA, cobroIncompleto, cobroParaLaBase, montoDeDeuda, numeroDeTicket, problemaDeDeuda } from '../servicios/comprobante.js'
import { claveDeLoteIngresado } from '../servicios/imagenes.js'
import { comprasPorDia, proveedoresDelLote } from '../servicios/stock.js'
import { diaDe } from '../servicios/caja.js'
import { diaDeLaCompraMasNueva, fechaParaLaBase, problemaDeDia } from '../servicios/fechas.js'
import { describir } from '../servicios/texto.js'
import { CampoFecha, CampoUsd, Cantidad, SelectorConOtro } from './Campos.jsx'
import { CampoFoto } from './FotoLote.jsx'
import { fotoDelLote, ponerFotos, subirFotos } from './fotos.js'
import { CampoDeuda, CampoGarantia, CampoVendedor, CamposDeCliente, CamposDeCobro } from './Cobro.jsx'
import { useVendedor } from './useVendedor.js'
import { AyudaPistola, CampoImeis } from './Imei.jsx'
import { IconoImpresora, VentanaTicket } from './Impresion.jsx'
import { usePanel } from './contexto.js'
import { opcionesDe } from './listas.js'
import { avisarNoEsImei, usePistola } from './pistola.js'
import { useAccion } from './useAccion.js'

// Los datos que identifican un celular. Se usa al ingresar, en la permuta y
// en cada modelo de un lote de compra.
export function CamposDeCelular({ campos, alCambiar }) {
  const { datos, stock } = usePanel()
  const fijar = (nombre) => (valor) => alCambiar({ ...campos, [nombre]: valor })
  const usados = (nombre) => stock.celulares.map((lote) => lote[nombre])

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="etiqueta col-span-2">
        Modelo
        <SelectorConOtro valor={campos.modelo} alCambiar={fijar('modelo')} opciones={opcionesDe(datos, 'modelo', usados('modelo'))} />
      </label>
      <label className="etiqueta">
        Capacidad
        <SelectorConOtro valor={campos.capacidad} alCambiar={fijar('capacidad')} opciones={opcionesDe(datos, 'capacidad', usados('capacidad'))} />
      </label>
      <label className="etiqueta">
        Color
        <SelectorConOtro valor={campos.color} alCambiar={fijar('color')} opciones={opcionesDe(datos, 'color', usados('color'))} />
      </label>
      <label className="etiqueta">
        Batería
        <input
          className="campo"
          value={campos.bateria}
          onChange={(evento) => fijar('bateria')(evento.target.value)}
          placeholder="85%"
          maxLength={10}
        />
      </label>
      <label className="etiqueta">
        Detalles
        <input
          className="campo"
          value={campos.detalles}
          onChange={(evento) => fijar('detalles')(evento.target.value)}
          placeholder="Opcional"
          maxLength={200}
        />
      </label>
    </div>
  )
}

function CamposDeAccesorio({ campos, alCambiar }) {
  const { datos, stock } = usePanel()
  const fijar = (nombre) => (valor) => alCambiar({ ...campos, [nombre]: valor })

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="etiqueta col-span-2">
        Tipo
        <SelectorConOtro
          valor={campos.tipo}
          alCambiar={fijar('tipo')}
          opciones={opcionesDe(datos, 'tipo', stock.accesorios.map((lote) => lote.tipo))}
        />
      </label>
      <label className="etiqueta col-span-2">
        Modelo
        <input
          className="campo"
          value={campos.modelo}
          onChange={(evento) => fijar('modelo')(evento.target.value)}
          placeholder="SILICONA IPHONE 13"
          maxLength={80}
        />
      </label>
      <label className="etiqueta">
        Color
        <input className="campo" value={campos.color} onChange={(evento) => fijar('color')(evento.target.value)} placeholder="Opcional" maxLength={40} />
      </label>
      <label className="etiqueta">
        Detalles
        <input className="campo" value={campos.detalles} onChange={(evento) => fijar('detalles')(evento.target.value)} placeholder="Opcional" maxLength={200} />
      </label>
    </div>
  )
}

const VACIO = {
  celulares: { modelo: '', capacidad: '', color: '', bateria: '', detalles: '' },
  accesorios: { tipo: '', modelo: '', color: '', detalles: '' },
}

// Un texto de campo es un monto valido si es un numero mayor o igual a cero.
const esMonto = (texto) => texto !== '' && Number(texto) >= 0

// modo: 'nuevo' (lote nuevo), 'sumar' (mas unidades a "lote") o 'editar' (datos de "lote").
export function FormularioLote({ tabla, modo, lote, alCerrar }) {
  const { cotizaciones, datos, recargar } = usePanel()
  const esCelular = tabla === 'celulares'
  const nombres = Object.keys(VACIO[tabla])

  const [campos, setCampos] = useState(() =>
    lote ? Object.fromEntries(nombres.map((nombre) => [nombre, lote[nombre] ?? ''])) : VACIO[tabla],
  )
  const [costo, setCosto] = useState(lote ? String(lote.costo_usd) : '')
  const [precio, setPrecio] = useState(lote ? String(lote.precio_usd) : '')
  // Precio por mayor, opcional. Vacio al sumar stock = las unidades nuevas toman el del lote.
  const [mayorista, setMayorista] = useState(modo === 'editar' && lote.precio_mayorista_usd != null ? String(lote.precio_mayorista_usd) : '')
  const [cantidad, setCantidad] = useState(1)
  const [imeis, setImeis] = useState([])
  // A quien se le compro esta tanda. Vacio = no se anota.
  // Al editar arranca en el proveedor del lote, si todas sus unidades son del mismo.
  const delLote = lote ? proveedoresDelLote(lote, datos.proveedores) : null
  const [proveedor, setProveedor] = useState(() =>
    modo === 'editar' && delLote.lista.length === 1 && delLote.texto !== 'SIN PROVEEDOR' ? delLote.texto : '',
  )
  // Al editar, el proveedor solo se cambia si se lo toco.
  const [proveedorTocado, setProveedorTocado] = useState(false)
  // Foto para el catalogo, opcional: { archivo, vista } o null (= no tocarla).
  const [foto, setFoto] = useState(null)
  // Fecha de compra (el dia que entra al stock). Al cargar arranca en hoy; al
  // editar, en la del lote (la mas vieja si sus unidades entraron en dias distintos).
  const [hoy] = useState(() => diaDe(new Date()))
  const unidadesDelLote = lote ? [...lote.disponibles, ...lote.conRevendedores, ...lote.senadas] : []
  const diasDeCompra = modo === 'editar' ? comprasPorDia(unidadesDelLote) : []
  const diaOriginal = diasDeCompra[0]?.dia || hoy
  const [dia, setDia] = useState(diaOriginal)
  // Al editar, la fecha solo se cambia si se la toco.
  const [diaTocado, setDiaTocado] = useState(false)
  const [ocupado, ejecutar] = useAccion()

  const titulos = {
    nuevo: esCelular ? 'Ingresar celulares' : 'Ingresar accesorios',
    sumar: `Sumar stock · ${lote ? describir(lote, tabla) : ''}`,
    editar: `Editar · ${lote ? describir(lote, tabla) : ''}`,
  }

  const falta =
    (esCelular ? !campos.modelo.trim() : !campos.tipo.trim()) || !esMonto(costo) || !esMonto(precio) ||
    (mayorista !== '' && !esMonto(mayorista)) || Boolean(problemaDeDia(dia, { hoy }))

  function guardar(evento) {
    evento.preventDefault()
    const montos = {
      costo_usd: Number(costo),
      precio_usd: Number(precio),
      precio_mayorista_usd: mayorista === '' ? null : Number(mayorista),
    }
    ejecutar(
      async () => {
        const [url] = await subirFotos([foto])
        // Al editar, la base devuelve la clave (cambia si cambiaron los datos).
        let clave = null
        if (modo === 'editar') {
          // Si se toco la fecha, queda para todas las unidades sin vender del lote.
          if (diaTocado && (dia !== diaOriginal || diasDeCompra.length > 1)) {
            await cambiarFechaCompra(tabla, unidadesDelLote.map((unidad) => unidad.id), new Date(`${dia}T12:00:00`).toISOString())
          }
          clave = await editarLote(tabla, lote.clave, campos, montos.costo_usd, montos.precio_usd, proveedorTocado ? proveedor : null, montos.precio_mayorista_usd)
        }
        else if (esCelular) await ingresarCelulares({ ...campos, ...montos, cantidad, imeis, proveedor, fecha: fechaParaLaBase(dia, hoy) })
        else await ingresarAccesorios({ ...campos, ...montos, cantidad, proveedor, fecha: fechaParaLaBase(dia, hoy) })
        const nuevos = await recargar()
        await ponerFotos(tabla, [{ clave: clave ?? claveDeLoteIngresado(nuevos[tabla], campos), url }], recargar)
      },
      { exito: modo === 'editar' ? 'Lote actualizado' : 'Stock cargado', alTerminar: alCerrar },
    )
  }

  // Aviso de promedio: al sumar con otro costo o precio, el lote queda promediado.
  const cambiaValores =
    modo === 'sumar' && esMonto(costo) && esMonto(precio) &&
    (Number(costo) !== lote.costo_usd || Number(precio) !== lote.precio_usd)

  return (
    <Modal titulo={titulos[modo]} alCerrar={alCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        {/* Al sumar, los datos del lote no se tocan: si cambiaran seria otro lote. */}
        {modo !== 'sumar' &&
          (esCelular ? (
            <CamposDeCelular campos={campos} alCambiar={setCampos} />
          ) : (
            <CamposDeAccesorio campos={campos} alCambiar={setCampos} />
          ))}

        <div className="grid grid-cols-2 gap-3">
          <label className="etiqueta">
            Costo por unidad (USD)
            <CampoUsd valor={costo} alCambiar={setCosto} cotizacion={cotizaciones.costo} />
          </label>
          <label className="etiqueta">
            Precio minorista (USD)
            <CampoUsd valor={precio} alCambiar={setPrecio} cotizacion={cotizaciones.venta} />
          </label>
          <label className="etiqueta col-span-2">
            Precio mayorista (USD)
            <CampoUsd valor={mayorista} alCambiar={setMayorista} cotizacion={cotizaciones.venta} />
            <span className="block text-[11px] font-normal text-neutral-500">
              {modo === 'sumar' && lote.precio_mayorista_usd != null
                ? `Vacío = sigue el del lote (US$ ${lote.precio_mayorista_usd}). `
                : ''}
              Opcional. Es el que se ofrece al vender por mayor; el catálogo muestra solo el minorista.
            </span>
          </label>
        </div>

        {cambiaValores && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            El costo o el precio son distintos a los del lote: todas las unidades del local van a quedar con el promedio.
          </p>
        )}

        {modo !== 'editar' && (
          <>
            <div>
              <p className="etiqueta mb-1">Cantidad</p>
              <Cantidad valor={cantidad} minimo={Math.max(1, imeis.length)} maximo={500} alCambiar={setCantidad} />
            </div>
            {esCelular && (
              <div>
                <p className="etiqueta mb-1">IMEI (opcional, uno por equipo)</p>
                <CampoImeis
                  imeis={imeis}
                  alCambiar={(lista) => {
                    setImeis(lista)
                    // Cada IMEI es un equipo: la cantidad nunca queda por debajo, y
                    // si iba pareja con los IMEI (cargando con la pistola), los sigue.
                    setCantidad(cantidad === imeis.length ? Math.max(1, lista.length) : Math.max(cantidad, lista.length))
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Al sumar no: el lote ya existe y su foto se cambia desde el boton del lote. */}
        {modo !== 'sumar' && (
          <CampoFoto
            foto={foto}
            alCambiar={setFoto}
            actual={modo === 'editar' ? fotoDelLote(datos, lote) : null}
            ayuda={
              modo === 'editar'
                ? 'Sale en el catálogo al lado del producto. Elegí una solo si la querés cambiar.'
                : `Sale en el catálogo al lado del producto. Si ingresás varias unidades, la foto es para todas${esCelular ? ' (son el mismo modelo, color y capacidad)' : ''}.`
            }
          />
        )}

        <CampoFecha
          etiqueta="Fecha de compra"
          valor={dia}
          hoy={hoy}
          original={diaOriginal}
          alCambiar={(valor) => {
            setDia(valor)
            setDiaTocado(true)
          }}
          ayuda={
            modo === 'editar'
              ? diasDeCompra.length > 1
                ? `Hoy: ${diasDeCompra.map((otro) => `${soloFecha(otro.fecha)} (${otro.cantidad} u.)`).join(' · ')}. Si la cambiás, queda para todas las unidades sin vender.`
                : 'El día que entró al stock. Si la cambiás, queda para todas las unidades sin vender.'
              : 'El día que entró al stock. Si lo compraste otro día, cambiala.'
          }
        />

        <label className="etiqueta">
          Proveedor{modo === 'editar' ? '' : ' (opcional)'}
          <SelectorConOtro
            valor={proveedor}
            alCambiar={(valor) => {
              setProveedor(valor)
              setProveedorTocado(true)
            }}
            opciones={datos.proveedores.map((opcion) => opcion.nombre)}
            vacio="Sin proveedor"
          />
          {modo === 'editar' && delLote.lista.length > 1 && (
            <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">
              Hoy: {delLote.texto}. Si elegís uno, queda para todas las unidades sin vender.
            </span>
          )}
        </label>

        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || falta}>
          {ocupado ? 'Guardando...' : modo === 'editar' ? 'Guardar cambios' : `Ingresar ${cantidad} ${cantidad === 1 ? 'unidad' : 'unidades'}`}
        </button>
      </form>
    </Modal>
  )
}

// Permuta: el cliente entrega un equipo usado como parte de pago.
// Se carga el equipo que se recibe y, opcionalmente, el que se lleva. Los dos
// se pueden buscar por IMEI, que es como el dueno identifica cada equipo.
export function ModalPermuta({ alCerrar }) {
  const { cotizaciones, configuracion, datos, stock, recargar } = usePanel()
  const [campos, setCampos] = useState(VACIO.celulares)
  const [imeis, setImeis] = useState([])
  const [toma, setToma] = useState(null) // en pesos
  const [lista, setLista] = useState(null) // en pesos
  const [claveEntregado, setClaveEntregado] = useState('')
  const [idEntregado, setIdEntregado] = useState(null)
  const [precioEntregado, setPrecioEntregado] = useState(null) // en pesos
  const [persona, setPersona] = useState({ cliente: '', telefono: '' })
  const [vendedor, setVendedor, vendedores] = useVendedor()
  const [cobro, setCobro] = useState(COBRO_VACIO)
  const [garantia, setGarantia] = useState(configuracion.garantia_dias_celulares)
  const [deuda, setDeuda] = useState(DEUDA_VACIA)
  // Lo escrito para buscar por IMEI el equipo que se lleva.
  const [buscado, setBuscado] = useState('')
  // Si el equipo que entrega ya paso por el local: como se vendio (de buscar_imei).
  const [historial, setHistorial] = useState(null)
  // Fecha de la permuta: la de la venta y la de ingreso del equipo recibido.
  const [hoy] = useState(() => diaDe(new Date()))
  const [dia, setDia] = useState(hoy)
  // Cuando la permuta se registro con un equipo entregado: { numero, imprimir }.
  const [hecha, setHecha] = useState(null)
  const [ocupado, ejecutar] = useAccion()

  const conStock = stock.celulares.filter((lote) => lote.cantidad > 0)
  const loteEntregado = conStock.find((lote) => lote.clave === claveEntregado)
  // El equipo que se lleva no puede salir antes del dia en que entro al stock.
  const compraMasNueva = loteEntregado ? diaDeLaCompraMasNueva(loteEntregado.disponibles.filter((unidad) => unidad.id === idEntregado)) : ''

  function elegirEntregado(clave) {
    const lote = conStock.find((candidato) => candidato.clave === clave)
    setClaveEntregado(clave)
    setIdEntregado(lote ? lote.disponibles[0].id : null)
    setPrecioEntregado(lote ? aPesos(lote.precio_usd, cotizaciones.venta) : null)
  }

  // El equipo del local con ese IMEI. Con 15 digitos tiene que ser exacto;
  // con menos (desde 4) alcanza con que lo contenga.
  function unidadConImei(texto) {
    const digitos = String(texto).replace(/\D/g, '')
    if (digitos.length < 4) return null
    for (const lote of conStock) {
      const unidad = lote.disponibles.find((otra) => otra.imei && (digitos.length === 15 ? otra.imei === digitos : otra.imei.includes(digitos)))
      if (unidad) return { lote, unidad }
    }
    return null
  }

  function elegirPorImei(texto) {
    const encontrado = unidadConImei(texto)
    if (!encontrado) {
      toast.error('Ningún equipo del local tiene ese IMEI')
      return
    }
    setClaveEntregado(encontrado.lote.clave)
    setIdEntregado(encontrado.unidad.id)
    setPrecioEntregado(aPesos(encontrado.lote.precio_usd, cotizaciones.venta))
    setBuscado(encontrado.unidad.imei)
    toast.success(`Se lleva: ${describir(encontrado.lote, 'celulares')}`)
  }

  // El IMEI del equipo que entrega. Si ese equipo ya se vendio aca, se
  // completan modelo, capacidad y color con lo que se sabe de el.
  async function cambiarRecibido(lista) {
    setImeis(lista)
    setHistorial(null)
    const imei = lista[0]
    if (!imei) return
    try {
      const encontrados = await buscarImei(imei)
      const anterior = encontrados.find((equipo) => equipo.imei === imei && equipo.estado === 'vendido')
      if (!anterior) return
      setHistorial(anterior)
      setCampos((actuales) => ({ ...actuales, modelo: anterior.modelo, capacidad: anterior.capacidad, color: anterior.color }))
    } catch {
      // Sin conexion no se completa nada: se carga a mano.
    }
  }

  // La pistola: si el IMEI es de un equipo del local, es el que se lleva; si
  // no, es el que entrega.
  const zona = usePistola((codigo) => {
    const imei = extraerImei(codigo)
    if (!imei) {
      avisarNoEsImei(codigo)
      return
    }
    if (unidadConImei(imei)) elegirPorImei(imei)
    else if (datos.celulares.some((unidad) => unidad.imei === imei)) toast.error('Ese IMEI es de un equipo que tiene un revendedor o está señado')
    else if (imeis.length > 0) toast.error('El equipo que entrega ya tiene IMEI. Sacalo para leer otro.')
    else cambiarRecibido([imei])
  })

  // Lo que paga en plata el cliente (si da negativo, la diferencia la paga el comercio).
  const diferencia = (precioEntregado ?? 0) - (toma ?? 0)
  // Solo se puede dejar debiendo si el cliente tiene que pagar algo.
  const debe = diferencia > 0 ? montoDeDeuda(deuda) : 0
  const falta =
    !campos.modelo.trim() || toma === null || Boolean(problemaDeDia(dia, { hoy, minimo: compraMasNueva })) ||
    (loteEntregado &&
      (precioEntregado === null || garantia === '' ||
        (diferencia > 0 && Boolean(problemaDeDeuda(deuda, diferencia, persona.cliente))) ||
        cobroIncompleto(cobro, diferencia - debe)))

  function guardar(evento) {
    evento.preventDefault()
    const valorUsd = aDolares(toma, cotizaciones.venta)
    ejecutar(
      async () => {
        const resultado = await registrarPermuta(
          { ...campos, imei: imeis[0] || '', valor_usd: valorUsd, precio_usd: lista === null ? valorUsd : aDolares(lista, cotizaciones.venta) },
          loteEntregado ? idEntregado : null,
          loteEntregado ? aDolares(precioEntregado, cotizaciones.venta) : null,
          loteEntregado
            ? { ...persona, ...cobroParaLaBase(cobro), vendedor, debe_ars: debe, garantia_celulares: garantia, fecha: fechaParaLaBase(dia, hoy) }
            : { fecha: fechaParaLaBase(dia, hoy) },
        )
        await recargar()
        // Si se llevo un equipo hay un comprobante para imprimir; si no, se cierra.
        if (resultado.comprobante) setHecha({ numero: resultado.comprobante, imprimir: false })
        else alCerrar()
      },
      { exito: 'Permuta registrada' },
    )
  }

  if (hecha?.imprimir) return <VentanaTicket comprobanteId={hecha.numero} alCerrar={alCerrar} />

  if (hecha) {
    return (
      <Modal titulo="Permuta registrada" alCerrar={alCerrar} ancho="max-w-sm">
        <p className="text-sm text-neutral-700">
          El equipo recibido ya está en el stock. La venta quedó con el comprobante <strong>N° {numeroDeTicket(hecha.numero)}</strong>.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="boton boton-claro" onClick={alCerrar}>
            Listo
          </button>
          <button type="button" className="boton boton-oscuro" onClick={() => setHecha({ ...hecha, imprimir: true })}>
            <IconoImpresora />
            Ticket
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo="Permuta" alCerrar={alCerrar}>
      <form ref={zona} onSubmit={guardar} className="space-y-4">
        <AyudaPistola texto="Con la pistola: leé el IMEI de los dos equipos. Se reconoce solo cuál entrega y cuál se lleva." />
        <section>
          <h3 className="mb-2 text-sm font-semibold">Equipo que recibís</h3>
          <p className="etiqueta mb-1">IMEI (opcional)</p>
          <CampoImeis imeis={imeis} alCambiar={cambiarRecibido} maximo={1} lector={false} />
          {historial && (
            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Este equipo ya pasó por el local: se vendió el {fechaCorta(historial.fecha_venta)}
              {historial.cliente ? ` a ${historial.cliente}` : ''}. Se completaron el modelo, la capacidad y el color.
            </p>
          )}
          <div className="mt-3">
            <CamposDeCelular campos={campos} alCambiar={setCampos} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="etiqueta">
              Valor de toma ($)
              <CampoPesos valor={toma} alCambiar={setToma} />
            </label>
            <label className="etiqueta">
              Precio de lista ($)
              <CampoPesos valor={lista} alCambiar={setLista} placeholder="Igual a la toma" />
            </label>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Entra al stock. El valor de toma queda como su costo.</p>
        </section>

        <section className="border-t border-neutral-200 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Equipo que se lleva (opcional)</h3>
          <div className="mb-2 flex gap-2">
            <input
              className="campo"
              inputMode="numeric"
              autoComplete="off"
              value={buscado}
              onChange={(evento) => setBuscado(evento.target.value)}
              onKeyDown={(evento) => {
                // El Enter (de la pistola o del teclado) busca, no envia la permuta.
                if (evento.key === 'Enter') {
                  evento.preventDefault()
                  if (buscado.trim()) elegirPorImei(buscado)
                }
              }}
              placeholder="Buscar por IMEI"
              aria-label="Buscar el equipo que se lleva por IMEI"
            />
            <button type="button" className="boton boton-claro shrink-0" disabled={!buscado.trim()} onClick={() => elegirPorImei(buscado)}>
              Buscar
            </button>
          </div>
          <select className="campo" value={claveEntregado} onChange={(evento) => elegirEntregado(evento.target.value)} aria-label="Equipo que se lleva">
            <option value="">Ninguno por ahora</option>
            {conStock.map((lote) => (
              <option key={lote.clave} value={lote.clave}>
                {describir(lote, 'celulares')} {lote.bateria} · {pesos(aPesos(lote.precio_usd, cotizaciones.venta))}
              </option>
            ))}
          </select>

          {loteEntregado && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {loteEntregado.disponibles.some((unidad) => unidad.imei) && (
                <label className="etiqueta col-span-2">
                  Cuál de los equipos
                  <select className="campo" value={idEntregado ?? ''} onChange={(evento) => setIdEntregado(Number(evento.target.value))}>
                    {loteEntregado.disponibles.map((unidad) => (
                      <option key={unidad.id} value={unidad.id}>
                        {unidad.imei || 'Sin IMEI'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="etiqueta col-span-2">
                Precio del equipo que se lleva ($)
                <CampoPesos valor={precioEntregado} alCambiar={setPrecioEntregado} />
              </label>
              {toma !== null && precioEntregado !== null && (
                <p className="col-span-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm">
                  Diferencia a cobrar: <strong>{pesos(precioEntregado - toma)}</strong>
                </p>
              )}
              <div className="col-span-2 space-y-3">
                <CamposDeCliente cliente={persona.cliente} telefono={persona.telefono} alCambiar={setPersona} />
                <CampoVendedor vendedor={vendedor} alCambiar={setVendedor} opciones={vendedores} />
                <div>
                  <p className="etiqueta mb-1">Garantía del equipo que se lleva</p>
                  <CampoGarantia valor={garantia} alCambiar={setGarantia} />
                </div>
                {diferencia > 0 && <CampoDeuda deuda={deuda} alCambiar={setDeuda} total={diferencia} cliente={persona.cliente} />}
                {diferencia - debe > 0 && <CamposDeCobro cobro={cobro} alCambiar={setCobro} total={diferencia - debe} />}
              </div>
            </div>
          )}
        </section>

        <CampoFecha
          etiqueta="Fecha de la permuta"
          valor={dia}
          hoy={hoy}
          minimo={compraMasNueva}
          alCambiar={setDia}
          ayuda="Es la fecha de ingreso del equipo que se recibe y la de venta del que se lleva."
        />

        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || falta}>
          {ocupado ? 'Guardando...' : 'Registrar permuta'}
        </button>
      </form>
    </Modal>
  )
}
