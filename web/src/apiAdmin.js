// apiAdmin.js
// Todo lo que el panel le pide a Supabase. Solo lo importan los archivos del
// panel, asi que se descarga recien al entrar a /admin.
//
// El panel no escribe en las tablas: cada accion del negocio es una funcion
// de la base (ver supabase/migrations/) y aca hay un atajo por cada una.
// Lo que un usuario puede ver o cambiar lo decide la base, no este archivo.

import { createClient } from '@supabase/supabase-js'
import { ErrorApi, MODO_PRUEBA, SIN_CONEXION, SUPABASE } from './api.js'

// null si faltan las variables de entorno: las funciones avisan en vez de
// romper la pagina al cargar.
const supabase = SUPABASE.url && SUPABASE.clave ? createClient(SUPABASE.url, SUPABASE.clave) : null

function cliente() {
  if (!supabase) throw new ErrorApi('Falta configurar la conexión con Supabase.')
  return supabase
}

// Traduce un error de la base a un mensaje para mostrar.
// "code" es el codigo de error de Postgres.
function traducirError(error, estado) {
  // P0001: un "raise exception" de nuestras funciones. Su mensaje ya esta
  // escrito para el usuario.
  if (error.code === 'P0001') return new ErrorApi(error.message, 400)
  // 23505: se repitio un valor que tiene que ser unico. El unico caso posible
  // desde el panel es el IMEI.
  if (error.code === '23505') return new ErrorApi('Ese IMEI ya está cargado en otro equipo.', 409)
  // 23514: no paso una regla de la tabla (un texto demasiado largo, una cotizacion en cero...).
  if (error.code === '23514') return new ErrorApi('Hay un dato inválido o demasiado largo.', 400)
  if (error.code === '42501' || estado === 401 || estado === 403) {
    return new ErrorApi('No tenés permiso para hacer eso. Volvé a iniciar sesión.', 401)
  }
  // Cuando no hay red, la libreria informa un error sin codigo HTTP.
  if (!estado && /fetch|network/i.test(error.message || '')) return new ErrorApi(SIN_CONEXION)
  return new ErrorApi('Algo falló. Probá de nuevo.', estado || 0)
}

// Llama a una funcion de la base y devuelve su resultado, o tira un ErrorApi.
async function llamar(nombre, argumentos = {}) {
  // Ver la nota sobre esta condicion en api.js.
  if ((import.meta.env.DEV || import.meta.env.MODE === 'demo') && MODO_PRUEBA) {
    const { rpcDePrueba } = await import('./pruebas/modoPrueba.js')
    try {
      return await rpcDePrueba(nombre, argumentos)
    } catch (error) {
      throw traducirError(error, 400)
    }
  }

  const { data, error, status } = await cliente().rpc(nombre, argumentos)
  if (error) throw traducirError(error, status)
  return data
}

// --- Sesion ----------------------------------------------------------------

// El mismo mensaje para "ese correo no existe", "contrasena incorrecta" y
// "ese usuario no es administrador": no se dan pistas de cual fue.
const ERROR_INICIO = 'Correo o contraseña incorrectos'

// En modo prueba la "sesion" es una marca en la memoria de la pestana.
const MARCA_PRUEBA = 'sesion-de-prueba'

// El usuario del boceto de GitHub Pages, para que el cliente lo pruebe. No es
// un usuario de verdad: el boceto no tiene base real y sus datos son de
// mentira. En "npm run dev:prueba" sigue entrando cualquier dato.
const USUARIO_DEL_BOCETO = { correo: 'admin@admin.com', clave: 'admin123' }

// Dice si hay una sesion abierta y es de un administrador.
export async function verSesion() {
  if (MODO_PRUEBA) {
    const correo = sessionStorage.getItem(MARCA_PRUEBA)
    return correo ? { activa: true, correo } : { activa: false }
  }

  const { data, error } = await cliente().auth.getSession()
  if (error || !data.session) return { activa: false }

  if ((await llamar('es_admin')) !== true) {
    await cliente().auth.signOut({ scope: 'local' })
    return { activa: false }
  }
  return { activa: true, correo: data.session.user.email }
}

export async function iniciarSesion(correo, clave) {
  if (MODO_PRUEBA) {
    // En el boceto entra solo su usuario; en desarrollo, cualquiera.
    const esBoceto = import.meta.env.MODE === 'demo'
    if (esBoceto && (correo.trim().toLowerCase() !== USUARIO_DEL_BOCETO.correo || clave !== USUARIO_DEL_BOCETO.clave)) {
      throw new ErrorApi(ERROR_INICIO, 401)
    }
    sessionStorage.setItem(MARCA_PRUEBA, correo.trim() || 'prueba@local')
    return { activa: true, correo: sessionStorage.getItem(MARCA_PRUEBA) }
  }

  const { data, error } = await cliente().auth.signInWithPassword({ email: correo.trim(), password: clave })
  if (error) {
    // 429 = Supabase corto los intentos por repetidos.
    if (error.status === 429) throw new ErrorApi('Demasiados intentos. Esperá unos minutos y volvé a probar.', 429)
    if (!error.status) throw new ErrorApi(SIN_CONEXION)
    throw new ErrorApi(ERROR_INICIO, error.status)
  }

  // La contrasena estaba bien, pero falta saber si es administrador.
  if ((await llamar('es_admin')) !== true) {
    await cliente().auth.signOut({ scope: 'local' })
    throw new ErrorApi(ERROR_INICIO, 401)
  }
  return { activa: true, correo: data.user.email }
}

export async function cerrarSesion() {
  if (MODO_PRUEBA) {
    sessionStorage.removeItem(MARCA_PRUEBA)
    return
  }
  // scope local: cierra la sesion de este navegador, no la de otros dispositivos.
  await cliente().auth.signOut({ scope: 'local' })
}

// El panel se anota aca para enterarse cuando la sesion se cerro o vencio y
// volver al formulario de ingreso. Devuelve la funcion para dejar de escuchar.
export function alVencerSesion(funcion) {
  if (MODO_PRUEBA || !supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') funcion()
  })
  return () => data.subscription.unsubscribe()
}

// --- Lecturas --------------------------------------------------------------

// Todo lo no vendido: stock, cuentas, pagos sin cerrar, escalas, ajustes,
// proveedores y lotes agotados.
export const leerPanel = () => llamar('panel_datos')

// Todas las unidades vendidas (el historial).
export const leerVentas = () => llamar('ventas_datos')

export const buscarImei = (imei) => llamar('buscar_imei', { p_imei: imei })

// Un comprobante con sus unidades: lo que hace falta para imprimir el ticket.
export const leerComprobante = (id) => llamar('comprobante_datos', { p_id: id })

// Toda la plata que entro y salio.
export const leerCaja = () => llamar('caja_datos')

export const leerServicios = () => llamar('servicios_datos')

export const leerGarantias = () => llamar('garantias_datos')

// --- Configuracion ---------------------------------------------------------

export const guardarConfiguracion = ({ cotizacion_dolar, cotizacion_costo }) =>
  llamar('guardar_configuracion', { p_cotizacion_dolar: cotizacion_dolar, p_cotizacion_costo: cotizacion_costo })

// ajustes: los campos que cambian (datos del comercio, garantias, avisos, papel).
export const guardarAjustes = (ajustes) => llamar('guardar_ajustes', { p_datos: ajustes })

// --- Stock -----------------------------------------------------------------

export const ingresarCelulares = (datos) =>
  llamar('ingresar_celulares', {
    p_modelo: datos.modelo,
    p_capacidad: datos.capacidad,
    p_color: datos.color,
    p_bateria: datos.bateria,
    p_detalles: datos.detalles,
    p_costo_usd: datos.costo_usd,
    p_precio_usd: datos.precio_usd,
    p_cantidad: datos.cantidad,
    p_imeis: datos.imeis?.length ? datos.imeis : null,
    // El nombre del proveedor; si es nuevo, la base lo crea.
    p_proveedor: datos.proveedor || null,
    // Opcional: sin precio, las unidades toman el que ya tenia el lote.
    p_precio_mayorista_usd: datos.precio_mayorista_usd ?? null,
  })

export const ingresarAccesorios = (datos) =>
  llamar('ingresar_accesorios', {
    p_tipo: datos.tipo,
    p_modelo: datos.modelo,
    p_color: datos.color,
    p_detalles: datos.detalles,
    p_costo_usd: datos.costo_usd,
    p_precio_usd: datos.precio_usd,
    p_cantidad: datos.cantidad,
    p_proveedor: datos.proveedor || null,
    p_precio_mayorista_usd: datos.precio_mayorista_usd ?? null,
  })

// tabla: 'celulares' o 'accesorios'. datos: los campos que identifican el lote.
// proveedor: null = no tocarlo; '' = sacarlo; un nombre = ese (se crea si es nuevo).
// mayorista: el precio por mayor en USD (null = sin mayorista); undefined = no tocarlo.
export const editarLote = (tabla, clave, datos, costo_usd, precio_usd, proveedor = null, mayorista = undefined) =>
  llamar('editar_lote', {
    p_tabla: tabla,
    p_clave: clave,
    p_datos: datos,
    p_costo_usd: costo_usd,
    p_precio_usd: precio_usd,
    p_proveedor: proveedor,
    p_precio_mayorista_usd: mayorista ?? null,
    p_cambiar_mayorista: mayorista !== undefined,
  })

// Reparte una lista de IMEI entre los equipos del lote que no tienen.
// compra: opcional, para usar solo los equipos de ese lote de compra.
export const cargarImeis = (clave, imeis, compra = null) =>
  llamar('cargar_imeis', { p_clave: clave, p_imeis: imeis, p_compra: compra })

// Un lote de compra: proveedor y la lista de modelos que vinieron.
// celulares: [{ modelo, capacidad, color, bateria, detalles, costo_usd, precio_usd, cantidad, imeis }].
// deudaUsd: lo que queda debiendose al proveedor por este lote (0 = pagado).
// Devuelve { compra, unidades }.
export const ingresarCompra = (proveedor, nota, celulares, deudaUsd = 0) =>
  llamar('ingresar_compra', { p_proveedor: proveedor, p_nota: nota, p_celulares: celulares, p_deuda_usd: deudaUsd || null })

// --- Listas de opciones y combos ---------------------------------------------
// lista: 'modelo', 'capacidad', 'color' o 'tipo'.

export const agregarOpcion = (lista, valor) => llamar('agregar_opcion', { p_lista: lista, p_valor: valor })

export const quitarOpcion = (lista, valor) => llamar('quitar_opcion', { p_lista: lista, p_valor: valor })

// datos: { nombre, precio_usd, partes: [{ clave, cantidad }] }. id null = nuevo.
export const guardarCombo = (id, datos) => llamar('guardar_combo', { p_id: id, p_datos: datos })

export const eliminarCombo = (id) => llamar('eliminar_combo', { p_id: id })

export const editarImei = (id, imei) => llamar('editar_imei', { p_id: id, p_imei: imei })

export const borrarUnidades = (tabla, ids) => llamar('borrar_unidades', { p_tabla: tabla, p_ids: ids })

export const guardarEscalas = (clave, tramos) => llamar('guardar_escalas', { p_clave: clave, p_tramos: tramos })

// --- Ventas y permutas -----------------------------------------------------

// celulares y accesorios: listas [{ id, precio_usd }].
// datos: { cliente, telefono, medio, efectivo_ars, debe_ars, garantia_celulares, garantia_accesorios }.
// debe_ars: lo que queda en la cuenta del cliente (hace falta su nombre).
// Devuelve { unidades, comprobante }: el comprobante es el numero de ticket.
export const vender = (celulares, accesorios, datos = {}) =>
  llamar('vender', { p_celulares: celulares, p_accesorios: accesorios, p_datos: datos })

// Corrige quien compro y como pago.
export const editarComprobante = (id, datos) => llamar('editar_comprobante', { p_id: id, p_datos: datos })

export const editarVenta = (tabla, ids, precio_usd) =>
  llamar('editar_venta', { p_tabla: tabla, p_ids: ids, p_precio_usd: precio_usd })

export const anularVenta = (tabla, ids) => llamar('anular_venta', { p_tabla: tabla, p_ids: ids })

// recibido: { modelo, capacidad, color, bateria, detalles, imei, valor_usd, precio_usd }.
// datos: lo mismo que en vender(). Devuelve { comprobante } (null si no se llevo nada).
export const registrarPermuta = (recibido, entregadoId, entregadoPrecioUsd, datos = {}) =>
  llamar('registrar_permuta', {
    p_recibido: recibido,
    p_entregado_id: entregadoId,
    p_entregado_precio_usd: entregadoPrecioUsd,
    p_datos: datos,
  })

// --- Cuentas: revendedores y senas -----------------------------------------
// tipo: 'revendedor' o 'sena'. medio: 'efectivo' o 'transferencia'.

export const entregarACuenta = (tipo, nombre, celulares, accesorios, pagoArs, medio = 'efectivo') =>
  llamar('entregar_a_cuenta', {
    p_tipo: tipo,
    p_nombre: nombre,
    p_celulares: celulares,
    p_accesorios: accesorios,
    p_pago_ars: pagoArs || 0,
    p_medio: medio,
  })

// Devuelve true si con ese pago la cuenta quedo cerrada.
export const registrarPago = (tipo, nombre, montoArs, medio = 'efectivo') =>
  llamar('registrar_pago', { p_tipo: tipo, p_nombre: nombre, p_monto_ars: montoArs, p_medio: medio })

// medio: como se cobra lo que falta despues de descontar lo ya entregado.
export const marcarPagado = (tipo, nombre, celulares, accesorios, medio = 'efectivo') =>
  llamar('marcar_pagado', { p_tipo: tipo, p_nombre: nombre, p_celulares: celulares, p_accesorios: accesorios, p_medio: medio })

export const devolverUnidades = (tipo, celulares, accesorios) =>
  llamar('devolver_unidades', { p_tipo: tipo, p_celulares: celulares, p_accesorios: accesorios })

// Con monto 0 elimina el pago. Sin medio, queda el que tenia.
export const editarPago = (tipo, id, montoArs, medio = null) =>
  llamar('editar_pago', { p_tipo: tipo, p_id: id, p_monto_ars: montoArs, p_medio: medio })

export const guardarRevendedor = (nombre, celular) =>
  llamar('guardar_revendedor', { p_nombre: nombre, p_celular: celular })

export const eliminarRevendedor = (id) => llamar('eliminar_revendedor', { p_id: id })

// --- Caja ------------------------------------------------------------------
// Movimientos anotados a mano. id null = nuevo.
// datos: { tipo, categoria, detalle, cliente, monto_ars, medio, proveedor, fecha }.

export const guardarMovimiento = (id, datos) => llamar('guardar_movimiento', { p_id: id, p_datos: datos })

export const eliminarMovimiento = (id) => llamar('eliminar_movimiento', { p_id: id })

// --- Proveedores -----------------------------------------------------------
// datos: { nombre, telefono, rubro, notas }. id null = nuevo.

export const guardarProveedor = (id, datos) => llamar('guardar_proveedor', { p_id: id, p_datos: datos })

export const eliminarProveedor = (id) => llamar('eliminar_proveedor', { p_id: id })

// Lo que se le debe a un proveedor, en dolares: sus deudas y sus pagos.
export const leerCuentaProveedor = (id) => llamar('cuenta_proveedor', { p_id: id })

// Una deuda anotada a mano (mercaderia de antes, un saldo que se arrastra).
export const anotarDeudaProveedor = (proveedorId, montoUsd, detalle = '') =>
  llamar('anotar_deuda_proveedor', { p_proveedor: proveedorId, p_monto_usd: montoUsd, p_detalle: detalle })

export const eliminarDeudaProveedor = (id) => llamar('eliminar_deuda_proveedor', { p_id: id })

// --- Garantias con el proveedor ----------------------------------------------
// Equipos que se le mandan al proveedor por garantia. Lo que se descuenta
// (monto_usd) baja la deuda con ese proveedor mientras no vuelva el equipo.

// Los envios abiertos y los cerrados hace menos de 90 dias.
export const leerEnvios = () => llamar('envios_datos')

// datos: { proveedor (nombre), celular_id, equipo, imei, cliente, falla,
//          monto_usd, enviado (true = ya se mando) }. Devuelve el id.
export const anotarEnvio = (datos) => llamar('anotar_envio', { p_datos: datos })

// estado: 'enviado' (ya lo tiene el proveedor), 'volvio' (lo devolvio o lo
// cambio: se quita el descuento) o 'descontado' (se lo quedo: queda).
export const marcarEnvio = (id, estado) => llamar('marcar_envio', { p_id: id, p_estado: estado })

export const eliminarEnvio = (id) => llamar('eliminar_envio', { p_id: id })

// --- Clientes --------------------------------------------------------------
// datos: { nombre, telefono, documento, notas }. id null = nuevo.

export const guardarCliente = (id, datos) => llamar('guardar_cliente', { p_id: id, p_datos: datos })

export const eliminarCliente = (id) => llamar('eliminar_cliente', { p_id: id })

// { movimientos, compras } de un cliente.
export const leerCuentaCliente = (id) => llamar('cuenta_cliente', { p_id: id })

// tipo: 'deuda' o 'pago'. medio: solo para los pagos.
export const anotarCuentaCliente = (clienteId, tipo, montoArs, medio = null, detalle = '') =>
  llamar('anotar_cuenta_cliente', { p_cliente: clienteId, p_tipo: tipo, p_monto_ars: montoArs, p_medio: medio, p_detalle: detalle })

export const eliminarCuentaCliente = (id) => llamar('eliminar_cuenta_cliente', { p_id: id })

// --- Servicio tecnico ------------------------------------------------------
// datos: { cliente, telefono, equipo, imei, falla, trabajo, notas, estado,
//          presupuesto_ars, costo_ars, en_garantia }. id null = orden nueva.
// Devuelve el numero de orden.

export const guardarServicio = (id, datos) => llamar('guardar_servicio', { p_id: id, p_datos: datos })

// cobro: { cobrado_ars, medio, efectivo_ars, garantia_dias }.
export const entregarServicio = (id, cobro) => llamar('entregar_servicio', { p_id: id, p_datos: cobro })

export const reabrirServicio = (id) => llamar('reabrir_servicio', { p_id: id })

export const eliminarServicio = (id) => llamar('eliminar_servicio', { p_id: id })

// --- Actas de entrega y garantia ---------------------------------------------
// El acta que firman el cliente y el vendedor al entregar un celular, con la
// revision punto por punto. Una vez guardada no se edita.

// datos: { celular_id, cliente, documento, telefono, vendedor, garantia_dias,
//          revision, observaciones, firma_cliente, firma_vendedor }.
// Devuelve el numero del acta.
export const registrarActa = (datos) => llamar('registrar_acta', { p_datos: datos })

// La lista, sin las firmas.
export const leerActas = () => llamar('actas_datos')

// Un acta completa, con las firmas, para verla o imprimirla.
export const leerActa = (id) => llamar('acta_datos', { p_id: id })

export const eliminarActa = (id) => llamar('eliminar_acta', { p_id: id })
