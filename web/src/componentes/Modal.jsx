// componentes/Modal.jsx
// Ventana modal centrada (gris oscuro, sobre el fondo negro). Se usa para todos los formularios y
// confirmaciones del panel (las confirmaciones no van en avisos flotantes).

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAccion } from '../panel/useAccion.js'

export default function Modal({ titulo, alCerrar, children, ancho = 'max-w-md' }) {
  // Escape cierra la ventana, y mientras esta abierta el fondo no se desliza.
  useEffect(() => {
    const alTeclear = (evento) => evento.key === 'Escape' && alCerrar()
    document.addEventListener('keydown', alTeclear)
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = anterior
    }
  }, [alCerrar])

  // La ventana se dibuja colgada de <body> y no donde esta escrita (eso es un
  // "portal"). Hace falta porque el contenido del panel aparece con una
  // animacion que lo mueve, y un elemento "fixed" adentro de algo que se mueve
  // se centra en ese contenido en vez de en la pantalla: con una lista larga
  // la ventana quedaba fuera de la vista.
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-negro/75 p-3 backdrop-blur-[2px]"
      // Un clic en el fondo oscuro (y no adentro de la ventana) la cierra.
      onMouseDown={(evento) => evento.target === evento.currentTarget && alCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`animate-aparecer flex max-h-[92vh] w-full ${ancho} flex-col rounded-2xl border border-neutral-200 bg-white shadow-xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <h2 className="min-w-0 text-base font-semibold break-words">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1 text-neutral-500 transition-colors duration-200 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {/* El contenido se desliza por dentro si no entra en la pantalla. */}
        <div className="min-h-0 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

// Pregunta de si o no antes de una accion que no se puede deshacer facil.
// "alConfirmar" es una funcion async; el boton queda bloqueado mientras corre
// y la ventana se cierra sola si termino bien.
export function Confirmar({ titulo, children, textoBoton = 'Confirmar', peligro = false, alConfirmar, alCerrar }) {
  const [ocupado, ejecutar] = useAccion()

  return (
    <Modal titulo={titulo} alCerrar={alCerrar} ancho="max-w-sm">
      <div className="text-sm break-words text-neutral-700">{children}</div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="boton boton-claro" onClick={alCerrar} disabled={ocupado}>
          Cancelar
        </button>
        <button
          type="button"
          className={`boton ${peligro ? 'boton-peligro' : 'boton-oscuro'}`}
          disabled={ocupado}
          onClick={() => ejecutar(alConfirmar, { alTerminar: alCerrar })}
        >
          {ocupado ? 'Un momento...' : textoBoton}
        </button>
      </div>
    </Modal>
  )
}
