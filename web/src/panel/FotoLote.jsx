// panel/FotoLote.jsx
// La foto que muestra el catalogo para un lote (celular o accesorio).
// Se elige del celular o de la PC, se achica y pasa a webp (ver fotos.js), se
// sube a Cloudinary y la base guarda la direccion. La foto es del lote: los
// equipos que entren despues con los mismos datos salen con la misma foto.
// Se pone desde el boton del lote (ModalFoto) o al ingresar stock (CampoFoto).

import { useEffect, useRef, useState } from 'react'
import Modal from '../componentes/Modal.jsx'
import Foto from '../componentes/Foto.jsx'
import { guardarImagen, subirImagen } from '../apiAdmin.js'
import { describir } from '../servicios/texto.js'
import { fotoDelLote, prepararFoto } from './fotos.js'
import { usePanel } from './contexto.js'
import { useAccion } from './useAccion.js'

// Campo "Foto" de los formularios de ingreso. Solo elige y prepara la foto:
// el formulario la sube al guardar.
// foto: { archivo, vista } o null. actual: la direccion de la foto que ya
// tiene el lote (al editar), o null. ayuda: texto chico de abajo.
export function CampoFoto({ foto, alCambiar, actual = null, ayuda }) {
  const selector = useRef(null)
  const [preparando, setPreparando] = useState(false)
  const [error, setError] = useState('')

  // La vista previa ocupa memoria: se libera al cambiarla o al cerrar.
  useEffect(() => () => foto && URL.revokeObjectURL(foto.vista), [foto])

  async function elegir(evento) {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo) return
    setError('')
    setPreparando(true)
    try {
      const preparada = await prepararFoto(archivo)
      alCambiar({ archivo: preparada, vista: URL.createObjectURL(preparada) })
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setPreparando(false)
    }
  }

  return (
    <div>
      <p className="etiqueta mb-1">Foto para el catálogo (opcional)</p>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
          {foto ? (
            <img src={foto.vista} alt="Foto elegida" className="h-full w-full object-cover" />
          ) : actual ? (
            <Foto url={actual} ancho={64} alto={64} alt="Foto actual" className="h-full w-full" />
          ) : (
            <span className="flex h-full items-center justify-center text-[10px] text-neutral-500">Sin foto</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <button type="button" className="boton boton-claro boton-chico" disabled={preparando} onClick={() => selector.current.click()}>
            {preparando ? 'Preparando...' : foto || actual ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {foto && (
            <button type="button" className="boton boton-claro boton-chico" onClick={() => alCambiar(null)}>
              No usar esta foto
            </button>
          )}
        </div>
      </div>
      <input ref={selector} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={elegir} />
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
      {ayuda && <p className="mt-1 text-[11px] text-neutral-500">{ayuda}</p>}
    </div>
  )
}

export function ModalFoto({ lote, alCerrar }) {
  const { datos, recargar } = usePanel()
  const actual = fotoDelLote(datos, lote)
  const selector = useRef(null)
  // La foto elegida y ya preparada: { archivo, vista } (vista = para mostrarla aca).
  const [nueva, setNueva] = useState(null)
  const [preparando, setPreparando] = useState(false)
  const [error, setError] = useState('')
  const [ocupado, ejecutar] = useAccion()

  // La vista previa ocupa memoria: se libera al cambiarla o al cerrar.
  useEffect(() => () => nueva && URL.revokeObjectURL(nueva.vista), [nueva])

  async function elegir(evento) {
    const archivo = evento.target.files?.[0]
    // Se vacia para que elegir la misma foto otra vez tambien avise.
    evento.target.value = ''
    if (!archivo) return
    setError('')
    setPreparando(true)
    try {
      const foto = await prepararFoto(archivo)
      setNueva({ archivo: foto, vista: URL.createObjectURL(foto) })
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      setPreparando(false)
    }
  }

  function guardar() {
    ejecutar(
      async () => {
        const url = await subirImagen(nueva.archivo)
        await guardarImagen(lote.tabla, lote.clave, url)
        await recargar()
      },
      { exito: 'Foto guardada', alTerminar: alCerrar },
    )
  }

  function quitar() {
    ejecutar(
      async () => {
        await guardarImagen(lote.tabla, lote.clave, null)
        await recargar()
      },
      { exito: 'Foto quitada', alTerminar: alCerrar },
    )
  }

  return (
    <Modal titulo={`Foto · ${describir(lote, lote.tabla)}`} alCerrar={alCerrar} ancho="max-w-sm">
      <div className="mx-auto aspect-square w-full max-w-64 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
        {nueva ? (
          <img src={nueva.vista} alt="Foto nueva" className="h-full w-full object-cover" />
        ) : actual ? (
          <Foto url={actual} ancho={256} alto={256} alt="Foto actual" className="h-full w-full" />
        ) : (
          <p className="flex h-full items-center justify-center p-6 text-center text-xs text-neutral-500">
            Todavía no tiene foto.
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-neutral-600">
        Se ve en el catálogo al lado del producto. Conviene una foto cuadrada, con el producto centrado y fondo liso. Se guarda en
        webp y achicada, así carga rápido.
      </p>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <input ref={selector} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={elegir} />

      <div className="mt-4 grid gap-2">
        <button type="button" className="boton boton-claro" disabled={ocupado || preparando} onClick={() => selector.current.click()}>
          {preparando ? 'Preparando la foto...' : nueva || actual ? 'Elegir otra foto' : 'Elegir foto'}
        </button>
        <button type="button" className="boton boton-oscuro" disabled={!nueva || ocupado || preparando} onClick={guardar}>
          {ocupado && nueva ? 'Subiendo...' : 'Guardar foto'}
        </button>
        {actual && !nueva && (
          <button type="button" className="boton boton-peligro boton-chico" disabled={ocupado} onClick={quitar}>
            Quitar foto
          </button>
        )}
      </div>
    </Modal>
  )
}
