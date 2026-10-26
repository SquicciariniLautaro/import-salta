// panel/contexto.js
// Un "contexto" de React es una forma de compartir datos con todos los
// componentes de adentro sin pasarlos de mano en mano. El panel lo usa para
// que cualquier pantalla tenga a mano el stock, las cotizaciones, el carrito
// y la funcion que vuelve a leer todo despues de un cambio.

import { createContext, useContext } from 'react'

export const ContextoPanel = createContext(null)

// Lo que devuelve (lo arma Admin.jsx):
//   datos        lo que trajo panel_datos()
//   cotizaciones { venta, costo } de hoy (costo ya resuelto: nunca null)
//   configuracion los ajustes del comercio (datos del ticket, garantias, avisos, papel)
//   stock        { celulares, accesorios }: lotes armados
//   avisos       { celulares, accesorios }: que se quedo sin stock o tiene poco
//   cuentas      { revendedor, sena }: cuentas armadas
//   recargar()   vuelve a leer todo de la base (y devuelve lo que leyo)
//   carrito, agregarAlCarrito(tipo, item), cambiarCarrito(carrito), vaciarCarrito()
//   irA(pestana) cambia de pestana
export function usePanel() {
  return useContext(ContextoPanel)
}
