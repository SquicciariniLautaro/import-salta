// componentes/CampoPesos.jsx
// Campo para cargar un monto en pesos. Muestra los puntos de miles mientras
// se escribe ("1.450.000") pero hacia afuera entrega el numero puro (1450000),
// o null si esta vacio.

import { conMiles } from '../formato.js'

export default function CampoPesos({ id, valor, alCambiar, placeholder, disabled }) {
  function alEscribir(evento) {
    // Se queda solo con los digitos: descarta puntos, espacios y letras.
    const digitos = evento.target.value.replace(/\D/g, '')
    alCambiar(digitos === '' ? null : Number(digitos))
  }

  return (
    <input
      id={id}
      type="text"
      // Abre el teclado numerico en el celular.
      inputMode="numeric"
      autoComplete="off"
      value={valor === null || valor === undefined ? '' : conMiles(valor)}
      onChange={alEscribir}
      placeholder={placeholder}
      disabled={disabled}
      // "campo" trae los 16 px de letra en celular (ver index.css).
      className="campo"
    />
  )
}
