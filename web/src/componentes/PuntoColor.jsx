// componentes/PuntoColor.jsx
// El color se guarda como texto libre ("AZUL", "Titanio natural"...). Este
// componente lo traduce a un circulo de color buscando palabras clave.
// Si no reconoce ninguna, muestra el texto tal cual.

import { normalizar } from '../formato.js'

// Se recorre en orden y gana la primera que aparezca en el texto. Por eso las
// frases de dos palabras van antes que las de una ("TITANIO NEGRO" antes que "NEGRO").
const COLORES = [
  ['TITANIO NATURAL', '#b9b1a5'],
  ['TITANIO NEGRO', '#3a3a3c'],
  ['TITANIO BLANCO', '#f0efea'],
  ['TITANIO AZUL', '#44505f'],
  ['TITANIO DESIERTO', '#c8a98a'],
  ['GRIS ESPACIAL', '#55544f'],
  ['BLANCO ESTELAR', '#f3efe6'],
  ['AZUL SIERRA', '#a5c3dc'],
  ['VERDE ALPINO', '#56634f'],
  ['MEDIANOCHE', '#1f232b'],
  ['MIDNIGHT', '#1f232b'],
  ['STARLIGHT', '#f3efe6'],
  ['GRAFITO', '#55544f'],
  ['GRAPHITE', '#55544f'],
  ['DESIERTO', '#c8a98a'],
  ['NATURAL', '#b9b1a5'],
  ['NEGRO', '#1c1c1e'],
  ['BLACK', '#1c1c1e'],
  ['BLANCO', '#fafafa'],
  ['WHITE', '#fafafa'],
  ['PLATA', '#e2e3e5'],
  ['PLATEADO', '#e2e3e5'],
  ['SILVER', '#e2e3e5'],
  ['GRIS', '#8e8e93'],
  ['GRAY', '#8e8e93'],
  ['DORADO', '#f0d8a8'],
  ['GOLD', '#f0d8a8'],
  ['ORO', '#f0d8a8'],
  ['ROSA', '#f7c6d2'],
  ['PINK', '#f7c6d2'],
  ['CORAL', '#ff6f61'],
  ['ROJO', '#d6282d'],
  ['RED', '#d6282d'],
  ['NARANJA', '#f28b3c'],
  ['AMARILLO', '#f6dd6b'],
  ['YELLOW', '#f6dd6b'],
  ['CELESTE', '#9fcdea'],
  ['AZUL', '#2f5f8f'],
  ['BLUE', '#2f5f8f'],
  ['VERDE', '#3f6b4f'],
  ['GREEN', '#3f6b4f'],
  ['VIOLETA', '#b7a4d6'],
  ['LILA', '#cdbfe6'],
  ['MORADO', '#7d5ba6'],
  ['PURPURA', '#7d5ba6'],
  ['PURPLE', '#7d5ba6'],
  ['TITANIO', '#9b968d'],
]

function buscarColor(texto) {
  const normalizado = normalizar(texto)
  const encontrado = COLORES.find(([palabra]) => normalizado.includes(palabra))
  return encontrado ? encontrado[1] : null
}

export default function PuntoColor({ color }) {
  if (!color) return null

  const codigo = buscarColor(color)
  if (!codigo) return <span className="break-words text-xs text-neutral-600">{color}</span>

  return (
    <span
      // El borde gris hace que los colores claros se vean sobre fondo blanco.
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-neutral-400 align-middle"
      style={{ backgroundColor: codigo }}
      // Para quien pasa el mouse y para lectores de pantalla.
      title={color}
      role="img"
      aria-label={`Color ${color}`}
    />
  )
}
