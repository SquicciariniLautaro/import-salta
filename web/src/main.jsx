import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Solo los pesos de Poppins que se usan y solo el alfabeto latino.
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import './index.css'
import App from './App.jsx'

// En iPhone y iPad, Safari agranda la pagina al tocar un campo de texto y no
// vuelve solo. maximum-scale=1 lo evita. Se agrega unicamente ahi porque en
// Android esa misma opcion le impediria al usuario hacer zoom con los dedos.
// (Los iPad modernos se presentan como "MacIntel" con pantalla tactil.)
const esAppleTactil =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

if (esAppleTactil) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
