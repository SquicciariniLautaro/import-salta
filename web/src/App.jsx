// App.jsx
// Define las dos caras del sistema: el catalogo publico (/) y el panel (/admin).

import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import Catalogo from './Catalogo.jsx'

// lazy() hace que el codigo del panel se descargue recien cuando alguien
// entra a /admin. Quien solo mira el catalogo no baja el panel ni la libreria
// de graficos: con mala senal eso se nota.
const Admin = lazy(() => import('./Admin.jsx'))

export default function App() {
  return (
    // basename: en el boceto de GitHub Pages el sitio vive en /import-salta/.
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <Routes>
        <Route path="/" element={<Catalogo />} />
        <Route
          path="/admin"
          element={
            // Suspense muestra esto mientras baja el codigo del panel.
            <Suspense fallback={<p className="p-6 text-center text-sm text-neutral-500">Cargando...</p>}>
              <Admin />
            </Suspense>
          }
        />
        {/* Cualquier otra direccion vuelve al catalogo. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
