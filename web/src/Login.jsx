// Login.jsx
// Formulario de ingreso al panel. No hay registro: los usuarios se crean a
// mano en Supabase (ver DESPLIEGUE.md).

import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { iniciarSesion } from './apiAdmin.js'
import { NEGOCIO } from './negocio.js'

// Mismo estilo para los dos campos (ver .campo en index.css).
const CAMPO = 'campo mt-1'

export default function Login({ alEntrar }) {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')

  // Bloqueo contra el doble toque. El ref corta el segundo toque al instante
  // (un estado tarda un momento en actualizarse y con mala senal entran los
  // dos); el estado es el que deshabilita el boton a la vista.
  const ocupado = useRef(false)
  const [enviando, setEnviando] = useState(false)

  async function entrar(evento) {
    evento.preventDefault()
    if (ocupado.current) return
    ocupado.current = true
    setEnviando(true)
    setError('')
    try {
      const sesion = await iniciarSesion(correo, clave)
      alEntrar(sesion)
    } catch (fallo) {
      setError(fallo.message)
    } finally {
      ocupado.current = false
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-negro px-4 py-8">
      <form onSubmit={entrar} className="animate-aparecer w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold">{NEGOCIO.nombre}</h1>
        <p className="text-center text-xs text-neutral-500">Panel de administración</p>

        <label className="mt-5 block text-sm font-medium text-neutral-700">
          Correo
          <input
            type="email"
            // autoComplete le dice al navegador que puede ofrecer el dato guardado.
            autoComplete="username"
            required
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            className={CAMPO}
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-neutral-700">
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={clave}
            onChange={(evento) => setClave(evento.target.value)}
            className={CAMPO}
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm break-words text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="boton boton-oscuro mt-5 w-full py-2.5"
        >
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="mt-4 text-center">
          <Link to="/" className="enlace-raya text-xs text-neutral-500 hover:text-black">
            Volver al catálogo
          </Link>
        </p>
      </form>
    </div>
  )
}
