// panel/Ajustes.jsx
// Pestana "Ajustes": lo que el dueno configura una vez y despues se usa solo.
//   * Los datos del comercio que salen impresos en cada ticket, la letra chica
//     de la garantia y si se imprime un duplicado para el local.
//   * Los dias de garantia que se proponen al vender o entregar un arreglo.
//   * El descuento pagando en efectivo (uno para celulares y otro para
//     accesorios): el catalogo muestra el precio con tarjeta y en efectivo.
//   * Las tarjetas (Visa / Mastercard, Naranja...), cada una con su recargo
//     en 1 pago y sus planes de cuotas (cuantas cuotas y con que recargo).
//     Se muestran en el catalogo y se eligen al cobrar.
//   * La revision del acta de entrega y garantia: que puntos se revisan con
//     el cliente y las condiciones que firma.
//   * Desde cuantas unidades avisar que queda poco stock.
//   * El tamano del papel de la impresora, con una prueba de impresion, y como
//     usar la ticketera de la Mac, que no tiene driver.
//   * Las listas de los desplegables: modelos, capacidades, colores, tipos
//     de accesorio y quienes atienden.
// Las cotizaciones del dolar siguen arriba, en el encabezado.

import { useState } from 'react'
import toast from 'react-hot-toast'
import { agregarOpcion, guardarAjustes, quitarOpcion } from '../apiAdmin.js'
import { armarComprobante, paginaDeTicket } from '../servicios/comprobante.js'
import { TARJETAS_MAXIMAS, cuotasDe, ordenarPlanes, problemaDeTarjetas, tarjetasDe, textoDeRecargo, totalConRecargo } from '../servicios/cuotas.js'
import { DESCUENTO_MAXIMO, descuentosDe, precioEnEfectivo, problemaDeDescuento } from '../servicios/efectivo.js'
import { pesos, textoDeLista } from '../formato.js'
import { DATOS_DE_LISTA, LARGO_ENCABEZADO, LARGO_PIE, LISTA_DE_FABRICA, opcionesDeLista, problemaDeLista } from '../servicios/lista.js'
import { ticketDeVenta } from '../servicios/escpos.js'
import { etiquetasParaTicketera, logoDeTicket } from './ticketera.js'
import { ConDuplicado, HojaEtiquetas, IconoImpresora, TicketVenta, VentanaImpresion } from './Impresion.jsx'
import { usePanel } from './contexto.js'
import { LISTAS } from './listas.js'
import { useAccion } from './useAccion.js'

const TEXTOS = [
  'negocio_nombre', 'negocio_direccion', 'negocio_telefono', 'negocio_cuit', 'ticket_pie', 'ticket_condiciones',
  'cuotas_leyenda', 'acta_condiciones',
]

// Atajos para sumar un plan de cuotas.
const CUOTAS_COMUNES = [3, 6, 9, 12, 18, 24]
// El precio con el que se muestra el ejemplo de cada plan.
const PRECIO_DE_EJEMPLO = 1000000

// Atajos para el descuento pagando en efectivo.
const DESCUENTOS_COMUNES = [0, 10, 20, 30]
// Los descuentos como texto, para los campos y para comparar con lo guardado.
const descuentosEnTexto = (configuracion) => {
  const { celulares, accesorios } = descuentosDe(configuracion)
  return { celulares: String(celulares), accesorios: String(accesorios) }
}

// Las tarjetas como las guarda la base (los planes en orden), para guardar y
// para comparar con lo que trae.
const tarjetasOrdenadas = (tarjetas) => tarjetas.map((tarjeta) => ({ ...tarjeta, planes: ordenarPlanes(tarjeta.planes) }))
// Atajos para sumar una tarjeta.
const TARJETAS_COMUNES = ['Visa / Mastercard', 'Naranja', 'American Express', 'Cabal']
const NUMEROS = [
  'garantia_dias_celulares', 'garantia_dias_accesorios', 'garantia_dias_servicio',
  'aviso_celulares', 'aviso_accesorios',
  'ticket_ancho_mm', 'ticket_alto_mm', 'etiqueta_ancho_mm', 'etiqueta_alto_mm',
]

// Los anchos de rollo mas comunes y los altos de hoja (0 = rollo continuo).
const ANCHOS_DE_TICKET = ['50', '58', '80']
const ALTOS_DE_TICKET = [
  { valor: '0', nombre: 'Rollo continuo' },
  { valor: '60', nombre: '60 mm' },
  { valor: '80', nombre: '80 mm' },
  { valor: '100', nombre: '100 mm' },
]

// Una venta inventada para probar como sale el ticket.
const VENTA_DE_PRUEBA = {
  id: 1,
  fecha: new Date().toISOString(),
  origen: 'mostrador',
  cliente: 'CLIENTE DE PRUEBA',
  vendedor: 'VENDEDOR DE PRUEBA',
  telefono: '',
  medio: 'efectivo',
  nota: '',
  celulares: [
    {
      id: 1, clave: 'PRUEBA', modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL', bateria: '88%', detalles: '',
      imei: '356789012345678', precio_usd: 400, cotizacion_venta: 1000, garantia_dias: 30, fecha_venta: new Date().toISOString(),
    },
  ],
  accesorios: [
    { id: 2, clave: 'PRUEBA', tipo: 'FUNDA', modelo: 'SILICONA', color: 'NEGRO', detalles: '', precio_usd: 6, cotizacion_venta: 1000, garantia_dias: 0 },
  ],
}

// Dos equipos inventados para mostrar como queda la lista para compartir.
const CELULARES_DE_EJEMPLO = [
  { clave: 'EJEMPLO1', marca: 'IPHONE', familia: '13', modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL', bateria: '88%', detalles: '', precio_usd: 400 },
  {
    clave: 'EJEMPLO2', marca: 'IPHONE', familia: '15 PRO', modelo: 'IPHONE 15 PRO', capacidad: '256GB', color: 'TITANIO',
    bateria: '100%', detalles: 'NUEVO SELLADO', precio_usd: 950,
  },
]

const ETIQUETA_DE_PRUEBA =[{ llave: 1, titulo: 'IPHONE 13 128GB AZUL', detalle: '88%', codigo: '356789012345678' }]

export default function PestanaAjustes() {
  const { configuracion, recargar } = usePanel()
  // Los numeros se guardan como texto mientras se escriben (un campo puede quedar vacio).
  const [campos, setCampos] = useState(() =>
    Object.fromEntries([...TEXTOS, ...NUMEROS].map((nombre) => [nombre, String(configuracion[nombre] ?? '')])),
  )
  // Sin la ultima migracion la base no lo trae: se toma como prendido.
  const [duplicado, setDuplicado] = useState(configuracion.ticket_duplicado ?? true)
  // Las tarjetas con sus planes. Los recargos se editan como numeros; un campo
  // vacio queda en null hasta que se escribe.
  const [tarjetas, setTarjetas] = useState(() => tarjetasDe(configuracion))
  const [cuotasAccesorios, setCuotasAccesorios] = useState(Boolean(configuracion.cuotas_accesorios))
  // Los descuentos en efectivo, como texto mientras se escriben. Sin la
  // migracion del descuento la base no los trae: arrancan en 0.
  const [descuentos, setDescuentos] = useState(() => descuentosEnTexto(configuracion))
  const [puntos, setPuntos] = useState(configuracion.revision_puntos || [])
  // Lo que lleva la lista que se comparte por WhatsApp desde el catalogo.
  const [lista, setLista] = useState(() => opcionesDeLista(configuracion.lista_compartir))
  const [prueba, setPrueba] = useState(null) // 'ticket' | 'etiqueta'
  const [ocupado, ejecutar] = useAccion()
  const fijar = (nombre) => (evento) => setCampos({ ...campos, [nombre]: evento.target.value })

  // La base guarda los textos sin espacios de mas: se comparan de la misma forma.
  const limpio = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim()
  const cambio =
    TEXTOS.some((nombre) => limpio(campos[nombre]) !== limpio(configuracion[nombre])) ||
    NUMEROS.some((nombre) => Number(campos[nombre]) !== configuracion[nombre]) ||
    duplicado !== (configuracion.ticket_duplicado ?? true) ||
    JSON.stringify(tarjetasOrdenadas(tarjetas)) !== JSON.stringify(tarjetasDe(configuracion)) ||
    cuotasAccesorios !== Boolean(configuracion.cuotas_accesorios) ||
    JSON.stringify(descuentos) !== JSON.stringify(descuentosEnTexto(configuracion)) ||
    JSON.stringify(puntos) !== JSON.stringify(configuracion.revision_puntos || []) ||
    JSON.stringify(lista) !== JSON.stringify(opcionesDeLista(configuracion.lista_compartir))
  const problemaCuotas = problemaDeTarjetas(tarjetas)
  const problemaLista = problemaDeLista(lista)
  const problemaEfectivo = problemaDeDescuento(descuentos.celulares) || problemaDeDescuento(descuentos.accesorios)
  const falta =
    !campos.negocio_nombre.trim() || NUMEROS.some((nombre) => campos[nombre] === '' || Number(campos[nombre]) < 0) ||
    Boolean(problemaCuotas) || Boolean(problemaEfectivo) || Boolean(problemaLista) || puntos.length === 0 || !campos.acta_condiciones.trim()

  // Lo que hay escrito ahora, con los numeros como numeros: sirve para guardar
  // y para probar la impresion antes de guardar.
  const actuales = {
    ...Object.fromEntries(TEXTOS.map((nombre) => [nombre, campos[nombre]])),
    ...Object.fromEntries(NUMEROS.map((nombre) => [nombre, Math.round(Number(campos[nombre]))])),
    ticket_duplicado: duplicado,
    tarjetas: tarjetasOrdenadas(tarjetas),
    cuotas_accesorios: cuotasAccesorios,
    descuento_efectivo_celulares: Number(descuentos.celulares),
    descuento_efectivo_accesorios: Number(descuentos.accesorios),
    revision_puntos: puntos,
    lista_compartir: lista,
  }

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(
      async () => {
        await guardarAjustes(actuales)
        await recargar()
      },
      { exito: 'Ajustes guardados' },
    )
  }

  const numero = (nombre, minimo, maximo) => (
    <input
      type="number"
      inputMode="numeric"
      min={minimo}
      max={maximo}
      className="campo"
      value={campos[nombre]}
      onChange={fijar(nombre)}
    />
  )

  return (
    <div className="space-y-3">
      <form onSubmit={guardar} className="space-y-3">
        <section className="tarjeta space-y-3 p-3">
          <Titulo texto="Datos del comercio" ayuda="Salen impresos arriba de cada ticket." />
          <label className="etiqueta">
            Nombre
            <input className="campo" value={campos.negocio_nombre} onChange={fijar('negocio_nombre')} maxLength={80} />
          </label>
          <label className="etiqueta">
            Dirección
            <input className="campo" value={campos.negocio_direccion} onChange={fijar('negocio_direccion')} maxLength={120} placeholder="Opcional" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="etiqueta">
              Teléfono
              <input className="campo" type="tel" inputMode="tel" value={campos.negocio_telefono} onChange={fijar('negocio_telefono')} maxLength={40} placeholder="Opcional" />
            </label>
            <label className="etiqueta">
              CUIT
              <input className="campo" inputMode="numeric" value={campos.negocio_cuit} onChange={fijar('negocio_cuit')} maxLength={20} placeholder="Opcional" />
            </label>
          </div>
          <label className="etiqueta">
            Texto al pie del ticket
            <textarea
              className="campo"
              rows={2}
              value={campos.ticket_pie}
              onChange={fijar('ticket_pie')}
              maxLength={300}
              placeholder="Opcional: por ejemplo, ¡Gracias por tu compra!"
            />
          </label>
          <label className="etiqueta">
            Condiciones de garantía (letra chica)
            <textarea
              className="campo"
              rows={3}
              value={campos.ticket_condiciones}
              onChange={fijar('ticket_condiciones')}
              maxLength={600}
              placeholder="Opcional: qué cubre la garantía"
            />
          </label>
        </section>
  
        <section className="tarjeta space-y-3 p-3">
          <Titulo texto="Garantías" ayuda="Días que se proponen en cada venta o arreglo. Se pueden cambiar en el momento. 0 = sin garantía." />
          <div className="grid grid-cols-3 gap-3">
            <label className="etiqueta">
              Celulares
              {numero('garantia_dias_celulares', 0, 3650)}
            </label>
            <label className="etiqueta">
              Accesorios
              {numero('garantia_dias_accesorios', 0, 3650)}
            </label>
            <label className="etiqueta">
              Arreglos
              {numero('garantia_dias_servicio', 0, 3650)}
            </label>
          </div>
        </section>
  
        <SeccionEfectivo descuentos={descuentos} alCambiar={setDescuentos} problema={problemaEfectivo} />

        <SeccionCuotas
          tarjetas={tarjetas}
          alCambiar={setTarjetas}
          leyenda={campos.cuotas_leyenda}
          alCambiarLeyenda={fijar('cuotas_leyenda')}
          accesorios={cuotasAccesorios}
          alCambiarAccesorios={setCuotasAccesorios}
          problema={problemaCuotas}
        />

        <SeccionLista
          lista={lista}
          alCambiar={setLista}
          problema={problemaLista}
          ejemplo={{
            cotizacion: configuracion.cotizacion_dolar || 1000,
            celulares: CELULARES_DE_EJEMPLO,
            cuotas: { tarjetas: tarjetasOrdenadas(tarjetas), accesorios: cuotasAccesorios },
            efectivo: { celulares: Number(descuentos.celulares) || 0, accesorios: Number(descuentos.accesorios) || 0 },
            lista,
          }}
        />

        <SeccionRevision
          puntos={puntos}
          alCambiar={setPuntos}
          condiciones={campos.acta_condiciones}
          alCambiarCondiciones={fijar('acta_condiciones')}
        />

        <section className="tarjeta space-y-3 p-3">
          <Titulo
            texto="Avisos de stock"
            ayuda="Avisa que queda poco cuando en el local hay esa cantidad o menos. Con 0 solo avisa cuando se termina."
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="etiqueta">
              Celulares
              {numero('aviso_celulares', 0, 999)}
            </label>
            <label className="etiqueta">
              Accesorios
              {numero('aviso_accesorios', 0, 999)}
            </label>
          </div>
        </section>
  
        <section className="tarjeta space-y-3 p-3">
          <Titulo texto="Impresora" ayuda="El tamaño del papel, en milímetros. Probá antes de guardar: la prueba usa lo que está escrito acá." />
          <div className="grid grid-cols-2 gap-3">
            <label className="etiqueta">
              Ticket: ancho
              <select className="campo" value={campos.ticket_ancho_mm} onChange={fijar('ticket_ancho_mm')}>
                {ANCHOS_DE_TICKET.map((ancho) => (
                  <option key={ancho} value={ancho}>
                    {ancho} mm
                  </option>
                ))}
                {/* Por si en la base quedo cargado otro ancho. */}
                {!ANCHOS_DE_TICKET.includes(campos.ticket_ancho_mm) && <option value={campos.ticket_ancho_mm}>{campos.ticket_ancho_mm} mm</option>}
              </select>
            </label>
            <label className="etiqueta">
              Ticket: alto de la hoja
              <select className="campo" value={campos.ticket_alto_mm} onChange={fijar('ticket_alto_mm')}>
                {ALTOS_DE_TICKET.map((alto) => (
                  <option key={alto.valor} value={alto.valor}>
                    {alto.nombre}
                  </option>
                ))}
                {!ALTOS_DE_TICKET.some((alto) => alto.valor === campos.ticket_alto_mm) && (
                  <option value={campos.ticket_alto_mm}>{campos.ticket_alto_mm} mm</option>
                )}
              </select>
            </label>
          </div>
          <p className="text-xs text-neutral-500">
            Imprimiendo directo en la ticketera solo importa el ancho: 50 o 58 mm para un rollo de 58 y 80 para uno de 80. Con otra impresora, tiene
            que coincidir con el papel que muestra la ventana de impresión: si ahí dice 50 x 60 mm, elegí 50 de ancho y 60 de alto.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="etiqueta">
              Etiqueta: ancho
              {numero('etiqueta_ancho_mm', 20, 120)}
            </label>
            <label className="etiqueta">
              Etiqueta: alto
              {numero('etiqueta_alto_mm', 15, 120)}
            </label>
          </div>
          <p className="text-xs text-neutral-500">Para que el código de barras del IMEI se lea bien, la etiqueta tiene que medir 50 mm de ancho o más.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-black" checked={duplicado} onChange={(evento) => setDuplicado(evento.target.checked)} />
            <span>
              Imprimir un duplicado para el local
              <span className="block text-xs text-neutral-500">Sale a continuación del ticket, sin logo y con lugar para la firma del cliente.</span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="boton boton-claro boton-chico" disabled={falta} onClick={() => setPrueba('ticket')}>
              <IconoImpresora />
              Probar ticket
            </button>
            <button type="button" className="boton boton-claro boton-chico" disabled={falta} onClick={() => setPrueba('etiqueta')}>
              <IconoImpresora />
              Probar etiqueta
            </button>
          </div>
        </section>
  
        <button type="submit" className="boton boton-oscuro w-full" disabled={ocupado || !cambio || falta}>
          {ocupado ? 'Guardando...' : cambio ? 'Guardar ajustes' : 'Sin cambios'}
        </button>
  
        {prueba === 'ticket' && (
          <VentanaImpresion
            titulo="Prueba de ticket"
            pagina={paginaDeTicket(actuales)}
            ayuda="Es una venta inventada."
            escpos={async () => ticketDeVenta(armarComprobante(VENTA_DE_PRUEBA), actuales, await logoDeTicket(actuales))}
            alCerrar={() => setPrueba(null)}
          >
            <ConDuplicado Ticket={TicketVenta} comprobante={armarComprobante(VENTA_DE_PRUEBA)} configuracion={actuales} />
          </VentanaImpresion>
        )}
        {prueba === 'etiqueta' && (
          <VentanaImpresion
            titulo="Prueba de etiqueta"
            pagina={{ ancho: actuales.etiqueta_ancho_mm, alto: actuales.etiqueta_alto_mm }}
            ayuda="Es un equipo inventado."
            escpos={etiquetasParaTicketera(ETIQUETA_DE_PRUEBA, actuales)}
            alCerrar={() => setPrueba(null)}
          >
            <HojaEtiquetas etiquetas={ETIQUETA_DE_PRUEBA} configuracion={actuales} />
          </VentanaImpresion>
        )}
      </form>
      <ImpresoraQueNoPara />
      <ListasDeOpciones />
    </div>
  )
}

// La ticketera de la Mac (una Global TP-POS58-USB) no tiene driver para Mac.
// Agregada a mano, la Mac la toma por una impresora PostScript (el idioma de
// las impresoras de oficina): le manda preguntas en ese idioma, la ticketera
// las imprime como texto ("%!PS-Adobe-3.0 Query", "ADOIsBinaryOK?") y la Mac
// vuelve a preguntar, sin parar. Se arregla sacandola de la Mac e imprimiendo
// directo desde Chrome, que le habla en su idioma (panel/ticketera.js).
function ImpresoraQueNoPara() {
  const [abierta, setAbierta] = useState(false)
  return (
    <section className="tarjeta overflow-hidden">
      <button
        type="button"
        className="renglon flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        onClick={() => setAbierta(!abierta)}
        aria-expanded={abierta}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Ticketera sin driver, o que imprime sin parar</span>
          <span className="block text-xs text-neutral-500">Sale texto raro como "%!PS-Adobe-3.0 Query" o "ADOIsBinaryOK?"</span>
        </span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {abierta && (
        <div className="animate-aparecer space-y-2 border-t border-neutral-200 px-3 py-3 text-sm text-neutral-700">
          <p>
            No es el panel: sin driver, la Mac toma la ticketera por una impresora de oficina (PostScript). Le manda preguntas en ese idioma, la
            ticketera no lo entiende y las imprime como texto, y la Mac vuelve a preguntar. El panel puede imprimir directo en la ticketera desde
            Google Chrome, sin driver:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Para cortarlo: apagá la ticketera, abrí la cola de impresión en la Mac (el ícono de la impresora en el Dock) y borrá todos los trabajos.</li>
            <li>
              En <strong>Configuración del Sistema → Impresoras y escáneres</strong>, elegí la ticketera y quitala con el botón <strong>−</strong>. Así la
              Mac no le vuelve a mandar nada.
            </li>
            <li>Prendé la ticketera y abrí el panel en Google Chrome (en Safari no se puede).</li>
            <li>
              Tocá <strong>Probar ticket</strong> y después <strong>Imprimir</strong>. La primera vez Chrome muestra una lista: elegí la
              ticketera (suele llamarse "POS58" o "Printer") y tocá <strong>Conectar</strong>. Después la recuerda.
            </li>
          </ol>
        </div>
      )}
    </section>
  )
}

// El descuento pagando en efectivo: un porcentaje para los celulares y otro
// para los accesorios (y los combos), con atajos y un ejemplo. El precio
// cargado en el stock es el precio con tarjeta. Se guardan con el boton de abajo.
function SeccionEfectivo({ descuentos, alCambiar, problema }) {
  const renglon = (tabla, nombre) => {
    const valor = descuentos[tabla]
    const ejemplo = problemaDeDescuento(valor) ? null : precioEnEfectivo(PRECIO_DE_EJEMPLO, Number(valor))
    return (
      <div className="space-y-1.5 rounded-lg border border-neutral-200 p-2.5">
        <p className="etiqueta">{nombre}: descuento en efectivo (%)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max={DESCUENTO_MAXIMO}
            step="1"
            className="campo w-20 shrink-0"
            value={valor}
            onChange={(evento) => alCambiar({ ...descuentos, [tabla]: evento.target.value })}
            aria-label={`${nombre}: descuento en efectivo (%)`}
          />
          <div className="grid flex-1 grid-cols-4 gap-1">
            {DESCUENTOS_COMUNES.map((porcentaje) => (
              <button
                key={porcentaje}
                type="button"
                className={`boton boton-chico min-w-0 px-1 ${valor === String(porcentaje) ? 'boton-oscuro' : 'boton-claro'}`}
                onClick={() => alCambiar({ ...descuentos, [tabla]: String(porcentaje) })}
              >
                {porcentaje === 0 ? 'Sin' : `${porcentaje} %`}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-neutral-500">
          {ejemplo === null
            ? 'Sin descuento: el catálogo muestra un solo precio.'
            : `Uno de ${pesos(PRECIO_DE_EJEMPLO)} con tarjeta queda en ${pesos(ejemplo)} en efectivo.`}
        </p>
      </div>
    )
  }

  return (
    <section className="tarjeta space-y-3 p-3">
      <Titulo
        texto="Precio en efectivo"
        ayuda="El precio cargado en el stock es el precio con tarjeta. Con un descuento, el catálogo muestra los dos precios, y al vender aparece el botón «Efectivo» para usarlo. 0 = sin descuento."
      />
      {renglon('celulares', 'Celulares')}
      {renglon('accesorios', 'Accesorios y combos')}
      {problema && <p className="text-xs text-red-700">{problema}</p>}
    </section>
  )
}

// Las tarjetas: cada una con su nombre, su recargo en 1 pago y sus planes de
// cuotas. Se guardan con el boton de abajo.
function SeccionCuotas({ tarjetas, alCambiar, leyenda, alCambiarLeyenda, accesorios, alCambiarAccesorios, problema }) {
  const cambiar = (posicion, cambios) => alCambiar(tarjetas.map((tarjeta, indice) => (indice === posicion ? { ...tarjeta, ...cambios } : tarjeta)))
  const nombres = new Set(tarjetas.map((tarjeta) => String(tarjeta.nombre ?? '').trim().toUpperCase()))
  const sumar = (nombre) => alCambiar([...tarjetas, { nombre, un_pago: 0, planes: [] }])
  // Cambiar el orden: la primera es la que se propone al cobrar.
  function subir(posicion) {
    const nuevas = [...tarjetas]
    ;[nuevas[posicion - 1], nuevas[posicion]] = [nuevas[posicion], nuevas[posicion - 1]]
    alCambiar(nuevas)
  }

  return (
    <section className="tarjeta space-y-3 p-3">
      <Titulo
        texto="Tarjetas y cuotas"
        ayuda="Cada tarjeta (o grupo de tarjetas que cuestan lo mismo) con su recargo en 1 pago y sus cuotas. Se muestran en el catálogo y se eligen al cobrar con tarjeta o QR. El recargo se suma al precio con tarjeta: 0 % es sin interés."
      />
      {tarjetas.length === 0 && (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">Sin tarjetas: el catálogo no muestra cuotas y al cobrar con tarjeta solo hay 1 pago.</p>
      )}
      <ul className="space-y-3">
        {tarjetas.map((tarjeta, posicion) => (
          <li key={posicion}>
            <EditorDeTarjeta
              tarjeta={tarjeta}
              primera={posicion === 0}
              alCambiar={(cambios) => cambiar(posicion, cambios)}
              alSubir={posicion > 0 ? () => subir(posicion) : null}
              alQuitar={() => alCambiar(tarjetas.filter((_, indice) => indice !== posicion))}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {TARJETAS_COMUNES.filter((nombre) => !nombres.has(nombre.toUpperCase())).map((nombre) => (
          <button key={nombre} type="button" className="boton boton-claro boton-chico" disabled={tarjetas.length >= TARJETAS_MAXIMAS} onClick={() => sumar(nombre)}>
            + {nombre}
          </button>
        ))}
        <button type="button" className="boton boton-claro boton-chico" disabled={tarjetas.length >= TARJETAS_MAXIMAS} onClick={() => sumar('')}>
          + Otra tarjeta
        </button>
      </div>
      {problema && <p className="text-xs text-red-700">{problema}</p>}
      <label className="etiqueta">
        Texto que acompaña las cuotas en el catálogo
        <input className="campo" value={leyenda} onChange={alCambiarLeyenda} maxLength={200} placeholder="Opcional: vacío no se muestra nada" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-black" checked={accesorios} onChange={(evento) => alCambiarAccesorios(evento.target.checked)} />
        <span>
          Mostrar las cuotas también en los accesorios
          <span className="block text-xs text-neutral-500">Si no, solo aparecen en los celulares.</span>
        </span>
      </label>
    </section>
  )
}

// Una tarjeta en Ajustes: su nombre, el recargo en 1 pago y un renglon por
// plan con sus cuotas y su recargo, con un ejemplo de cuanto queda cada cuota.
function EditorDeTarjeta({ tarjeta, primera, alCambiar, alSubir, alQuitar }) {
  const planes = tarjeta.planes
  const cambiarPlan = (posicion, cambios) => alCambiar({ planes: planes.map((plan, indice) => (indice === posicion ? { ...plan, ...cambios } : plan)) })
  const sumar = (cuotas) => alCambiar({ planes: ordenarPlanes([...planes, { cuotas, recargo: 0 }]) })
  const numero = (texto) => (texto === '' ? null : Number(texto))
  const nombre = String(tarjeta.nombre ?? '').trim() || 'esta tarjeta'

  return (
    <div className="space-y-2.5 rounded-lg border border-neutral-300 p-2.5">
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <label className="etiqueta">
          Tarjeta{primera && <span className="font-normal text-neutral-500"> · la que se propone al cobrar</span>}
          <input
            className="campo"
            value={tarjeta.nombre}
            onChange={(evento) => alCambiar({ nombre: evento.target.value })}
            maxLength={40}
            placeholder="Visa / Mastercard"
          />
        </label>
        <div className="flex gap-1">
          {alSubir && (
            <button type="button" className="boton boton-claro px-2.5" onClick={alSubir} aria-label={`Subir ${nombre}`} title="Subir">
              ↑
            </button>
          )}
          <button type="button" className="boton boton-claro px-2.5" onClick={alQuitar} aria-label={`Quitar ${nombre}`}>
            Quitar
          </button>
        </div>
      </div>
      <label className="etiqueta">
        Recargo en 1 pago (%)
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="300"
          step="0.01"
          className="campo"
          value={tarjeta.un_pago ?? ''}
          onChange={(evento) => alCambiar({ un_pago: numero(evento.target.value) })}
        />
        {tarjeta.un_pago > 0 && (
          <span className="mt-0.5 block text-[11px] font-normal text-neutral-500">
            Un equipo de {pesos(PRECIO_DE_EJEMPLO)} queda en {pesos(totalConRecargo(PRECIO_DE_EJEMPLO, tarjeta.un_pago))} en 1 pago
          </span>
        )}
      </label>
      {planes.length === 0 && <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">Sin cuotas: con {nombre} solo se cobra en 1 pago.</p>}
      <ul className="space-y-2">
        {planes.map((plan, posicion) => {
          const [ejemplo] = plan.cuotas >= 2 && plan.recargo !== null ? cuotasDe(PRECIO_DE_EJEMPLO, [plan]) : []
          return (
            <li key={posicion} className="rounded-lg border border-neutral-200 p-2.5">
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <label className="etiqueta">
                  Cuotas
                  <input
                    type="number"
                    inputMode="numeric"
                    min="2"
                    max="48"
                    className="campo"
                    value={plan.cuotas ?? ''}
                    onChange={(evento) => cambiarPlan(posicion, { cuotas: numero(evento.target.value) })}
                  />
                </label>
                <label className="etiqueta">
                  Recargo (%)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="300"
                    step="0.01"
                    className="campo"
                    value={plan.recargo ?? ''}
                    onChange={(evento) => cambiarPlan(posicion, { recargo: numero(evento.target.value) })}
                  />
                </label>
                <button
                  type="button"
                  className="boton boton-claro px-2.5"
                  onClick={() => alCambiar({ planes: planes.filter((_, indice) => indice !== posicion) })}
                  aria-label={`Quitar el plan de ${plan.cuotas} cuotas`}
                >
                  Quitar
                </button>
              </div>
              {ejemplo && (
                <p className="mt-1.5 text-[11px] text-neutral-500">
                  {textoDeRecargo(plan.recargo)} · un equipo de {pesos(PRECIO_DE_EJEMPLO)} queda en {plan.cuotas} cuotas de {pesos(ejemplo.cuota_ars)}
                  {!ejemplo.sin_interes && ` (total ${pesos(ejemplo.total_ars)})`}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {CUOTAS_COMUNES.map((cuotas) => (
          <button
            key={cuotas}
            type="button"
            className="boton boton-claro boton-chico"
            disabled={planes.some((plan) => plan.cuotas === cuotas) || planes.length >= 12}
            onClick={() => sumar(cuotas)}
          >
            + {cuotas} cuotas
          </button>
        ))}
      </div>
    </div>
  )
}

// Lo que lleva la lista que se comparte por WhatsApp desde el catalogo (el
// boton "Compartir lista por WhatsApp"): el texto de arriba, el de abajo y que
// datos van. Abajo, como queda, con dos equipos de ejemplo.
function SeccionLista({ lista, alCambiar, problema, ejemplo }) {
  const fijar = (cambios) => alCambiar({ ...lista, ...cambios })

  return (
    <section className="tarjeta space-y-3 p-3">
      <Titulo
        texto="Lista para compartir por WhatsApp"
        ayuda="Es el mensaje del botón «Compartir lista por WhatsApp» del catálogo. Quien lo toca lo puede retocar antes de mandarlo. Para negrita, el texto entre asteriscos: *así*."
      />
      <label className="etiqueta">
        Texto de arriba
        <textarea
          className="campo min-h-16"
          rows={2}
          value={lista.encabezado}
          onChange={(evento) => fijar({ encabezado: evento.target.value })}
          maxLength={LARGO_ENCABEZADO}
          placeholder="Opcional: por ejemplo, *Import Salta* · Lista de precios"
        />
      </label>
      <label className="etiqueta">
        Texto de abajo
        <textarea
          className="campo min-h-16"
          rows={2}
          value={lista.pie}
          onChange={(evento) => fijar({ pie: evento.target.value })}
          maxLength={LARGO_PIE}
          placeholder="Opcional: por ejemplo, Escribinos para reservar el tuyo"
        />
      </label>
      <fieldset>
        <legend className="etiqueta mb-1.5">Qué datos van</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {DATOS_DE_LISTA.map((dato) => (
            <label key={dato.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-black" checked={lista[dato.id]} onChange={(evento) => fijar({ [dato.id]: evento.target.checked })} />
              {dato.nombre}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="button" className="boton boton-claro boton-chico" onClick={() => alCambiar(LISTA_DE_FABRICA)}>
        Volver a como venía
      </button>
      {problema && <p className="text-xs text-red-700">{problema}</p>}
      <div>
        <p className="etiqueta mb-1">Así queda (con dos equipos de ejemplo)</p>
        <pre className="max-h-72 overflow-auto rounded-lg bg-neutral-100 px-3 py-2 font-sans text-xs leading-relaxed break-words whitespace-pre-wrap text-neutral-800">
          {textoDeLista(ejemplo, 'celulares', `${window.location.origin}/`)}
        </pre>
      </div>
    </section>
  )
}

// Los puntos que se revisan con el cliente en el acta de entrega y garantia,
// y las condiciones que firma.
function SeccionRevision({ puntos, alCambiar, condiciones, alCambiarCondiciones }) {
  const [nuevo, setNuevo] = useState('')
  const limpio = nuevo.replace(/\s+/g, ' ').trim()
  const repetido = puntos.some((punto) => punto.toLowerCase() === limpio.toLowerCase())

  function agregar() {
    if (!limpio || repetido || puntos.length >= 40) return
    alCambiar([...puntos, limpio])
    setNuevo('')
  }

  // Sube o baja un punto: el orden de la lista es el orden en que se revisa.
  function mover(posicion, salto) {
    const destino = posicion + salto
    if (destino < 0 || destino >= puntos.length) return
    const lista = [...puntos]
    lista[posicion] = puntos[destino]
    lista[destino] = puntos[posicion]
    alCambiar(lista)
  }

  return (
    <section className="tarjeta space-y-3 p-3">
      <Titulo
        texto="Acta de entrega y garantía"
        ayuda="Lo que se revisa con el cliente antes de entregar un celular. En el acta se marca cada punto y firman el cliente y el vendedor."
      />
      <ol className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200">
        {puntos.map((punto, posicion) => (
          <li key={punto} className="flex items-center gap-1 px-2.5 py-1.5 text-sm">
            <span className="w-5 shrink-0 text-right text-xs text-neutral-500">{posicion + 1}.</span>
            <span className="ml-1 min-w-0 flex-1 break-words">{punto}</span>
            <BotonIcono disabled={posicion === 0} onClick={() => mover(posicion, -1)} etiqueta={`Subir ${punto}`} trazo="M6 15l6-6 6 6" />
            <BotonIcono disabled={posicion === puntos.length - 1} onClick={() => mover(posicion, 1)} etiqueta={`Bajar ${punto}`} trazo="M6 9l6 6 6-6" />
            <BotonIcono
              disabled={puntos.length === 1}
              onClick={() => alCambiar(puntos.filter((_, indice) => indice !== posicion))}
              etiqueta={`Quitar ${punto}`}
              trazo="M6 6l12 12M18 6L6 18"
            />
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <input
          className="campo"
          value={nuevo}
          onChange={(evento) => setNuevo(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault()
              agregar()
            }
          }}
          maxLength={60}
          placeholder="Otro punto: Linterna, Lector de huella..."
          aria-label="Punto nuevo de la revisión"
        />
        <button type="button" className="boton boton-claro shrink-0" disabled={!limpio || repetido || puntos.length >= 40} onClick={agregar}>
          Agregar
        </button>
      </div>
      {repetido && <p className="text-xs text-amber-700">Ese punto ya está en la lista.</p>}
      <label className="etiqueta">
        Condiciones de la garantía (salen en el acta, arriba de las firmas)
        <textarea className="campo" rows={5} value={condiciones} onChange={alCambiarCondiciones} maxLength={2000} />
      </label>
      <p className="text-xs text-neutral-500">Cada acta guarda las condiciones del día en que se firmó: cambiarlas acá no cambia las actas anteriores.</p>
    </section>
  )
}

function BotonIcono({ etiqueta, trazo, ...resto }) {
  return (
    <button
      type="button"
      className="shrink-0 rounded p-1 text-neutral-500 transition-colors duration-200 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30"
      aria-label={etiqueta}
      {...resto}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d={trazo} />
      </svg>
    </button>
  )
}

function Titulo({ texto, ayuda }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{texto}</h3>
      <p className="text-xs text-neutral-500">{ayuda}</p>
    </div>
  )
}

// Las listas de los desplegables de carga. Cada cambio se guarda en el acto.
// Sacar una opcion no cambia lo que ya esta cargado con ese valor.
function ListasDeOpciones() {
  const [abierta, setAbierta] = useState('modelo')
  return (
    <section className="tarjeta space-y-3 p-3">
      <Titulo
        texto="Listas de opciones"
        ayuda="Lo que aparece en los desplegables al cargar stock y quiénes atienden (sale en el ticket). Lo que se escribe con Otro (escribir) se suma solo."
      />
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1 sm:grid-cols-5" role="tablist" aria-label="Qué lista editar">
        {LISTAS.map((lista) => (
          <button
            key={lista.id}
            type="button"
            role="tab"
            aria-selected={abierta === lista.id}
            onClick={() => setAbierta(lista.id)}
            className={`min-w-0 truncate rounded-lg px-1 py-1.5 text-xs font-medium transition-colors duration-200 ${
              abierta === lista.id ? 'bg-black text-white shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            {lista.nombre}
          </button>
        ))}
      </div>
      {/* key: al cambiar de lista, el campo de agregar arranca vacio. */}
      <EditorDeLista key={abierta} lista={abierta} />
    </section>
  )
}

function EditorDeLista({ lista }) {
  const { datos, recargar } = usePanel()
  const [nuevo, setNuevo] = useState('')
  const [ocupado, ejecutar] = useAccion()
  const valores = datos.opciones.filter((opcion) => opcion.lista === lista).map((opcion) => opcion.valor)
  const orden = new Intl.Collator('es', { numeric: true })

  function agregar(evento) {
    evento.preventDefault()
    if (!nuevo.trim()) return
    ejecutar(
      async () => {
        await agregarOpcion(lista, nuevo)
        await recargar()
        setNuevo('')
      },
      { exito: 'Agregado' },
    )
  }

  function quitar(valor) {
    ejecutar(async () => {
      await quitarOpcion(lista, valor)
      await recargar()
      toast.success(`${valor} ya no aparece en la lista`)
    })
  }

  return (
    <div className="space-y-3">
      <form onSubmit={agregar} className="flex gap-2">
        <input
          className="campo"
          value={nuevo}
          onChange={(evento) => setNuevo(evento.target.value)}
          maxLength={80}
          placeholder={{ modelo: 'IPHONE 18 PRO MAX', vendedor: 'Nombre de quien atiende' }[lista] ?? 'Escribí la opción nueva'}
          aria-label="Opción nueva"
        />
        <button type="submit" className="boton boton-oscuro shrink-0" disabled={ocupado || !nuevo.trim()}>
          Agregar
        </button>
      </form>
      <ul className="flex flex-wrap gap-1.5">
        {[...valores].sort(orden.compare).map((valor) => (
          <li key={valor} className="flex items-center gap-1 rounded-full bg-neutral-100 py-1 pr-1 pl-2.5 text-xs">
            <span className="break-all">{valor}</span>
            <button
              type="button"
              className="rounded-full px-1.5 text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900 disabled:opacity-50"
              disabled={ocupado}
              onClick={() => quitar(valor)}
              aria-label={`Quitar ${valor}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {valores.length === 0 && <p className="text-xs text-neutral-500">La lista está vacía.</p>}
    </div>
  )
}
