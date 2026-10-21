// panel/useVendedor.js
// "Atendido por": quien hace la venta o recibe el equipo. Sale en el ticket.
// Los nombres son la lista "Vendedores" de Ajustes; si esta vacia, el campo
// (CampoVendedor, en Cobro.jsx) no aparece y no se anota nadie. Cada
// computadora recuerda el ultimo elegido.
//
// Uso:
//   const [vendedor, setVendedor, vendedores] = useVendedor()
//   <CampoVendedor vendedor={vendedor} alCambiar={setVendedor} opciones={vendedores} />

import { useState } from 'react'
import { usePanel } from './contexto.js'

const LLAVE_VENDEDOR = 'panel.vendedor'

// Devuelve [vendedor, elegir, opciones].
export function useVendedor() {
  const { datos } = usePanel()
  const opciones = datos.opciones.filter((opcion) => opcion.lista === 'vendedor').map((opcion) => opcion.valor).sort()
  const [elegido, setElegido] = useState(() => {
    try {
      return localStorage.getItem(LLAVE_VENDEDOR) || ''
    } catch {
      return ''
    }
  })
  function elegir(valor) {
    setElegido(valor)
    try {
      localStorage.setItem(LLAVE_VENDEDOR, valor)
    } catch {
      // Sin almacenamiento (ventana privada): se elige de nuevo la proxima vez.
    }
  }
  // Si el recordado ya no esta en la lista, el primero.
  return [opciones.includes(elegido) ? elegido : (opciones[0] ?? ''), elegir, opciones]
}
