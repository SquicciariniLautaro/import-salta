// panel/useAccion.js
// Bloqueo contra el doble toque, en un solo lugar.
//
// Toda accion que escribe en la base pasa por aca. Con mala senal, un doble
// toque mandaba dos veces el mismo ingreso o la misma venta. Se usan dos cosas:
//   * un "ref": corta el segundo toque al instante (un estado tarda un momento
//     en actualizarse y los dos toques llegan a entrar);
//   * un estado: es el que deshabilita el boton a la vista.
//
// Uso:
//   const [ocupado, ejecutar] = useAccion()
//   <button disabled={ocupado} onClick={() => ejecutar(() => vender(...), { exito: 'Venta registrada' })}>

import { useCallback, useRef, useState } from 'react'
import toast from 'react-hot-toast'

export function useAccion() {
  const enCurso = useRef(false)
  const [ocupado, setOcupado] = useState(false)

  const ejecutar = useCallback(async (trabajo, { exito, alTerminar } = {}) => {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(true)
    try {
      const resultado = await trabajo()
      if (exito) toast.success(exito)
      // Se llama solo si salio bien (por ejemplo, para cerrar la ventana).
      alTerminar?.(resultado)
    } catch (error) {
      toast.error(error.message || 'Algo falló. Probá de nuevo.')
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }, [])

  return [ocupado, ejecutar]
}
