// componentes/Pie.jsx
// Pie de pagina: firma de Lambda Soluciones Digitales (franja negra, lambda
// amarilla) y, en el catalogo, un candado discreto que lleva al panel.

import { Link } from 'react-router'
import { FIRMA } from '../negocio.js'

export default function Pie({ conCandado = false }) {
  const firma = (
    <>
      <span className="lambda inline-block text-lg leading-none font-bold text-yellow-400" aria-hidden="true">
        &lambda;
      </span>
      <span className="enlace-raya">{FIRMA.nombre}</span>
    </>
  )

  return (
    <footer className="mt-auto border-t border-neutral-200 bg-negro px-4 py-3 text-neutral-500">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 text-xs">
        {FIRMA.instagram ? (
          <a
            href={FIRMA.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="grupo-firma flex min-w-0 items-center gap-2 transition-colors duration-200 hover:text-blanco"
          >
            {firma}
          </a>
        ) : (
          <span className="grupo-firma flex min-w-0 items-center gap-2">{firma}</span>
        )}

        {conCandado && (
          <Link
            to="/admin"
            aria-label="Ingreso del administrador"
            className="shrink-0 p-1 text-neutral-400 transition-colors duration-200 hover:text-neutral-800"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </Link>
        )}
      </div>
    </footer>
  )
}
