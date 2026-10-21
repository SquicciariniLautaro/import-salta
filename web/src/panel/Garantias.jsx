// panel/Garantias.jsx
// Pestana "Garantias": lo que se vendio o se arreglo con garantia.
// Sirve para contestar rapido "¿esto todavia esta en garantia?" y para abrir
// el reclamo, que es una orden de servicio tecnico marcada "por garantia".
// Arriba estan los equipos que se le mandan al proveedor por garantia (ver
// Envios.jsx): se anotan desde cada venta o a mano.
// Cada celular vendido muestra si ya tiene su acta de entrega y garantia
// firmada (ver Acta.jsx); si no, se puede hacer desde aca.

import { useEffect, useMemo, useState } from 'react'
import { leerEnvios, leerGarantias } from '../apiAdmin.js'
import { normalizar, soloFecha } from '../formato.js'
import { armarGarantias, textoDeGarantia } from '../servicios/garantias.js'
import { ListaDeEnvios, ModalEnvio } from './Envios.jsx'
import { CampoBusqueda } from './Imei.jsx'
import { ModalServicio } from './Servicio.jsx'
import { ModalActa, VentanaActa } from './Acta.jsx'
import { usePanel } from './contexto.js'

export default function PestanaGarantias() {
  const { datos, irA } = usePanel()
  // null mientras carga; despues, las filas de garantias_datos() y envios_datos().
  const [filas, setFilas] = useState(null)
  const [envios, setEnvios] = useState(null)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [verVencidas, setVerVencidas] = useState(false)
  const [reclamo, setReclamo] = useState(null)
  // Ventana para mandar al proveedor: { inicial } (vacio = anotado a mano).
  const [envio, setEnvio] = useState(null)
  // El equipo al que se le esta haciendo el acta, y el acta que se esta mirando.
  const [haciendoActa, setHaciendoActa] = useState(null)
  const [mirandoActa, setMirandoActa] = useState(null)
  // Las actas que se hicieron recien, hasta que se vuelva a leer la lista.
  const [actasNuevas, setActasNuevas] = useState({})

  useEffect(() => {
    let vigente = true
    Promise.all([leerGarantias(), leerEnvios()])
      .then(([garantias, enviados]) => {
        if (!vigente) return
        setFilas(garantias)
        setEnvios(enviados)
      })
      .catch((fallo) => vigente && setError(fallo.message))
    return () => {
      vigente = false
    }
  }, [datos])

  const garantias = useMemo(() => (filas ? armarGarantias(filas) : []), [filas])

  if (error) return <p className="tarjeta p-6 text-center text-sm text-red-700">{error}</p>
  if (!filas) return <p className="tarjeta p-6 text-center text-sm text-neutral-500">Cargando las garantías...</p>

  // Los equipos que ya estan anotados para el proveedor (y no volvieron).
  const enProveedor = new Set(
    envios.filter((otro) => otro.celular_id !== null && (otro.estado === 'por_enviar' || otro.estado === 'enviado')).map((otro) => otro.celular_id),
  )
  const nombreDeProveedor = new Map(datos.proveedores.map((proveedor) => [proveedor.id, proveedor.nombre]))

  function mandarAlProveedor(garantia) {
    setEnvio({
      inicial: {
        // Solo un celular se sigue por su id: es un equipo unico.
        celular_id: garantia.tabla === 'celulares' ? garantia.ids[0] : null,
        proveedor: nombreDeProveedor.get(garantia.proveedor_id) || '',
        equipo: garantia.descripcion,
        imei: garantia.imei,
        cliente: garantia.cliente,
        monto_usd: (garantia.costo_usd ?? 0) * garantia.cantidad,
      },
    })
  }

  const actaDe = (garantia) => (garantia.tabla === 'celulares' ? (garantia.acta_id ?? actasNuevas[garantia.ids[0]] ?? null) : null)
  const vigentes = garantias.filter((garantia) => garantia.vigente)
  const sinActa = vigentes.filter((garantia) => garantia.tabla === 'celulares' && !actaDe(garantia))
  const porVencer = vigentes.filter((garantia) => garantia.dias_restantes <= 7)
  const palabras = normalizar(busqueda).split(' ').filter(Boolean)
  const visibles = garantias.filter((garantia) => {
    // Al buscar se muestran todas: lo comun es que pregunten por una vencida.
    if (palabras.length === 0 && garantia.vigente === verVencidas) return false
    const texto = normalizar([garantia.descripcion, garantia.cliente, garantia.telefono, garantia.imei].join(' '))
    return palabras.every((palabra) => texto.includes(palabra))
  })

  return (
    <div className="space-y-3">
      <ListaDeEnvios envios={envios} alNuevo={() => setEnvio({ inicial: {} })} />

      <div className="grid grid-cols-3 gap-2">
        <div className="tarjeta min-w-0 px-3 py-2">
          <p className="truncate text-[10px] tracking-wide text-neutral-500 uppercase">Vigentes</p>
          <p className="text-sm font-semibold">{vigentes.length}</p>
        </div>
        <div className="tarjeta min-w-0 px-3 py-2">
          <p className="truncate text-[10px] tracking-wide text-neutral-500 uppercase">Vencen en 7 días</p>
          <p className="text-sm font-semibold">{porVencer.length}</p>
        </div>
        <div className={`tarjeta min-w-0 px-3 py-2 ${sinActa.length > 0 ? 'border-amber-300' : ''}`}>
          <p className="truncate text-[10px] tracking-wide text-neutral-500 uppercase">Sin acta firmada</p>
          <p className={`text-sm font-semibold ${sinActa.length > 0 ? 'text-amber-700' : ''}`}>{sinActa.length}</p>
        </div>
      </div>

      <button type="button" className="boton boton-claro boton-chico w-full" onClick={() => setHaciendoActa({})}>
        Acta de un equipo que no se vendió por el panel
      </button>

      <CampoBusqueda valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar: cliente, equipo o IMEI" etiqueta="Buscar una garantía" />

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-200 p-1" role="tablist" aria-label="Qué garantías ver">
        {[
          { vencidas: false, nombre: 'Vigentes' },
          { vencidas: true, nombre: 'Vencidas' },
        ].map((opcion) => (
          <button
            key={opcion.nombre}
            type="button"
            role="tab"
            aria-selected={verVencidas === opcion.vencidas}
            onClick={() => setVerVencidas(opcion.vencidas)}
            className={`rounded-lg px-1 py-1.5 text-xs font-medium transition-colors duration-200 ${
              verVencidas === opcion.vencidas ? 'bg-black text-white shadow-sm' : 'text-neutral-600 hover:text-black'
            }`}
          >
            {opcion.nombre}
          </button>
        ))}
      </div>

      {visibles.length === 0 && (
        <p className="tarjeta p-6 text-center text-sm text-neutral-500">
          {palabras.length > 0
            ? 'Nada coincide con la búsqueda.'
            : verVencidas
              ? 'No hay garantías vencidas en los últimos 90 días.'
              : 'No hay garantías vigentes. Los días de garantía se eligen al vender y se cambian en Ajustes.'}
        </p>
      )}

      {visibles.length > 0 && (
        <ul className="tarjeta divide-y divide-neutral-200 overflow-hidden">
          {visibles.map((garantia) => (
            <li key={garantia.llave} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">
                    {garantia.cantidad > 1 && `${garantia.cantidad} x `}
                    {garantia.descripcion}
                  </p>
                  <p className="text-xs break-words text-neutral-500">
                    {[garantia.cliente || 'Sin nombre de cliente', garantia.telefono].filter(Boolean).join(' · ')}
                  </p>
                  {garantia.imei && <p className="font-mono text-[11px] text-neutral-500">{garantia.imei}</p>}
                  {garantia.tabla === 'celulares' && (
                    <p className={`mt-0.5 text-[11px] font-medium ${actaDe(garantia) ? 'text-green-700' : 'text-amber-700'}`}>
                      {actaDe(garantia) ? `Acta firmada N° ${String(actaDe(garantia)).padStart(6, '0')}` : 'Sin acta firmada'}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-xs font-semibold whitespace-nowrap ${garantia.vigente ? (garantia.dias_restantes <= 7 ? 'text-amber-700' : 'text-green-700') : 'text-neutral-500'}`}>
                    {garantia.vigente
                      ? garantia.dias_restantes === 1
                        ? 'Queda 1 día'
                        : `Quedan ${garantia.dias_restantes} días`
                      : 'Vencida'}
                  </p>
                  <p className="text-[11px] whitespace-nowrap text-neutral-500">
                    {garantia.vigente ? 'hasta el' : 'el'} {soloFecha(garantia.vence)}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-neutral-500">
                {textoDeGarantia(garantia.dias)} desde el {soloFecha(garantia.desde)}
              </p>
              <div className={`mt-2 grid gap-2 ${garantia.tabla === 'servicios' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <button type="button" className="boton boton-claro boton-chico" onClick={() => setReclamo(garantia)}>
                  Abrir reclamo
                </button>
                {/* Un arreglo hecho en el local no se le manda a ningun proveedor. */}
                {garantia.tabla !== 'servicios' &&
                  (garantia.tabla === 'celulares' && enProveedor.has(garantia.ids[0]) ? (
                    <span className="flex items-center justify-center rounded-lg bg-blue-50 px-2 text-center text-xs font-medium text-blue-700">
                      Anotado para el proveedor
                    </span>
                  ) : (
                    <button type="button" className="boton boton-claro boton-chico" onClick={() => mandarAlProveedor(garantia)}>
                      Mandar al proveedor
                    </button>
                  ))}
                {garantia.tabla === 'celulares' &&
                  (actaDe(garantia) ? (
                    <button type="button" className="boton boton-claro boton-chico col-span-2" onClick={() => setMirandoActa(actaDe(garantia))}>
                      Ver e imprimir el acta
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="boton boton-oscuro boton-chico col-span-2"
                      onClick={() =>
                        setHaciendoActa({
                          celular_id: garantia.ids[0],
                          descripcion: garantia.descripcion,
                          imei: garantia.imei,
                          bateria: garantia.bateria || '',
                          cliente: garantia.cliente,
                          telefono: garantia.telefono,
                          garantia_dias: garantia.dias,
                        })
                      }
                    >
                      Hacer el acta (revisión y firmas)
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {envio && <ModalEnvio inicial={envio.inicial} alCerrar={() => setEnvio(null)} />}

      {haciendoActa && (
        <ModalActa
          equipo={haciendoActa}
          alCerrar={() => setHaciendoActa(null)}
          alGuardar={(id) => {
            if (haciendoActa.celular_id) setActasNuevas({ ...actasNuevas, [haciendoActa.celular_id]: id })
            setHaciendoActa(null)
            setMirandoActa(id)
          }}
        />
      )}
      {mirandoActa && <VentanaActa actaId={mirandoActa} alCerrar={() => setMirandoActa(null)} />}

      {reclamo && (
        <ModalServicio
          inicial={{
            cliente: reclamo.cliente,
            telefono: reclamo.telefono,
            // Un arreglo anterior figura como "ARREGLO IPHONE 11": queda solo el equipo.
            equipo: reclamo.descripcion.replace(/^ARREGLO /, ''),
            imei: reclamo.imei,
            en_garantia: reclamo.vigente,
          }}
          alCerrar={() => setReclamo(null)}
          // La orden nueva se sigue desde la pestana de servicio tecnico.
          alGuardar={() => irA('servicio')}
        />
      )}
    </div>
  )
}
