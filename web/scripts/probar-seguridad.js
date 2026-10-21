// scripts/probar-seguridad.js
// Pruebas de seguridad contra el proyecto REAL de Supabase, haciendose pasar
// por un visitante sin sesion. Se repiten cada vez que se toca un permiso.
// Uso:  npm run probar-seguridad
//
// Lee la direccion y la clave publica de web/.env.local. Solo lee: no crea
// usuarios ni modifica datos (los intentos de escritura tienen que fallar).

import path from 'node:path'
import { fileURLToPath } from 'node:url'

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local'))
} catch {
  // Sin .env.local se usan las variables que ya esten definidas.
}

const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const clave = process.env.VITE_SUPABASE_CLAVE_PUBLICA || ''
if (!url || !clave) {
  console.error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_CLAVE_PUBLICA en web/.env.local')
  process.exit(1)
}

let fallas = 0
function informar(pasa, texto, detalle = '') {
  if (!pasa) fallas += 1
  console.log(`  ${pasa ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ` -> ${detalle}` : ''}`)
}

// Un pedido como lo haria cualquiera desde su navegador, sin sesion.
function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  return fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { apikey: clave, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
}

// Junta los nombres de TODOS los campos de una respuesta, a cualquier profundidad.
function nombresDeCampos(valor, encontrados = new Set()) {
  if (Array.isArray(valor)) {
    for (const item of valor) nombresDeCampos(item, encontrados)
  } else if (valor && typeof valor === 'object') {
    for (const [nombre, contenido] of Object.entries(valor)) {
      encontrados.add(nombre)
      nombresDeCampos(contenido, encontrados)
    }
  }
  return encontrados
}

console.log(`Proyecto: ${url}\n`)

// ---------------------------------------------------------------------------
console.log('1. El catalogo publico no filtra datos privados')
{
  const respuesta = await pedir('/rest/v1/rpc/catalogo_publico', { metodo: 'POST', cuerpo: {} })
  informar(respuesta.status === 200, 'responde 200 sin sesion', `estado ${respuesta.status}`)
  const texto = await respuesta.text()

  if (respuesta.status === 200) {
    // Lista cerrada: si aparece un campo que no esta aca, la prueba falla.
    const permitidos = new Set([
      'cotizacion', 'celulares', 'accesorios', 'escalas', 'modelo', 'capacidad', 'color', 'bateria',
      'detalles', 'tipo', 'cantidad', 'suma_precio', 'clave', 'desde', 'moneda', 'precio',
      'combos', 'nombre', 'detalle',
      // Los planes de cuotas: { cuotas: { planes: [{ cuotas, recargo }], leyenda, accesorios } }.
      'cuotas', 'planes', 'recargo', 'leyenda',
    ])
    const sobran = [...nombresDeCampos(JSON.parse(texto))].filter((campo) => !permitidos.has(campo))
    informar(sobran.length === 0, 'solo trae campos publicos', sobran.join(', '))
    for (const prohibido of ['costo', 'imei', 'revendedor', 'fecha_venta', 'permuta', 'proveedor', 'comprobante', 'garantia', 'cliente', 'mayorista']) {
      informar(!texto.includes(prohibido), `no aparece "${prohibido}"`)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n2. Un visitante no puede leer ni escribir ninguna tabla')
{
  const tablas = [
    'configuracion', 'celulares', 'accesorios', 'pagos_revendedor', 'pagos_sena',
    'escalas_precio', 'revendedores_lista', 'administradores',
    'proveedores', 'comprobantes', 'movimientos_caja', 'servicios',
    'compras', 'opciones', 'combos', 'combo_partes',
    'clientes', 'cuenta_clientes', 'deudas_proveedor', 'envios_proveedor', 'actas',
  ]
  for (const tabla of tablas) {
    const respuesta = await pedir(`/rest/v1/${tabla}?select=*&limit=1`)
    // Tiene que ser un rechazo (401 o 403), no una lista, ni siquiera vacia.
    informar(respuesta.status === 401 || respuesta.status === 403, `leer ${tabla}`, `estado ${respuesta.status}`)
  }

  const escrituras = [
    ['POST', '/rest/v1/celulares', { modelo: 'PRUEBA DE SEGURIDAD' }],
    ['PATCH', '/rest/v1/configuracion?id=eq.1', { cotizacion_dolar: 1 }],
    ['DELETE', '/rest/v1/celulares?id=gt.0', undefined],
    ['POST', '/rest/v1/administradores', { correo: 'intruso@example.com' }],
    ['POST', '/rest/v1/movimientos_caja', { tipo: 'ingreso', categoria: 'PRUEBA DE SEGURIDAD', monto_ars: 1 }],
    ['POST', '/rest/v1/servicios', { cliente: 'PRUEBA DE SEGURIDAD', equipo: 'X' }],
    ['POST', '/rest/v1/opciones', { lista: 'modelo', valor: 'PRUEBA DE SEGURIDAD' }],
    ['DELETE', '/rest/v1/opciones?id=gt.0', undefined],
    ['POST', '/rest/v1/actas', { cliente: 'PRUEBA DE SEGURIDAD', equipo: 'X' }],
    ['DELETE', '/rest/v1/actas?id=gt.0', undefined],
  ]
  for (const [metodo, ruta, cuerpo] of escrituras) {
    const respuesta = await pedir(ruta, { metodo, cuerpo })
    informar(respuesta.status === 401 || respuesta.status === 403, `${metodo} ${ruta.split('?')[0]}`, `estado ${respuesta.status}`)
  }

  // Las funciones del panel tampoco: ninguna puede responder bien sin sesion.
  const funciones = [
    ['es_admin', {}],
    ['panel_datos', {}],
    ['ventas_datos', {}],
    ['buscar_imei', { p_imei: '3500' }],
    ['guardar_configuracion', { p_cotizacion_dolar: 1, p_cotizacion_costo: null }],
    ['vender', { p_celulares: [], p_accesorios: [] }],
    ['borrar_unidades', { p_tabla: 'celulares', p_ids: [] }],
    ['registrar_pago', { p_tipo: 'sena', p_nombre: 'X', p_monto_ars: 1 }],
    ['entregado_de_cuenta', { p_tipo: 'sena', p_nombre: 'X' }],
    ['caja_datos', {}],
    ['servicios_datos', {}],
    ['garantias_datos', {}],
    ['comprobante_datos', { p_id: 1 }],
    ['guardar_ajustes', { p_datos: {} }],
    ['guardar_movimiento', { p_id: null, p_datos: { tipo: 'ingreso', categoria: 'X', monto_ars: 1 } }],
    ['guardar_servicio', { p_id: null, p_datos: { cliente: 'X', equipo: 'X' } }],
    ['guardar_proveedor', { p_id: null, p_datos: { nombre: 'X' } }],
    ['proveedor_por_nombre', { p_nombre: 'X' }],
    ['ingresar_compra', { p_proveedor: 'X', p_nota: '', p_celulares: [] }],
    ['cargar_imeis', { p_clave: 'X', p_imeis: ['1'] }],
    ['agregar_opcion', { p_lista: 'modelo', p_valor: 'X' }],
    ['guardar_combo', { p_id: null, p_datos: { nombre: 'X' } }],
    ['registrar_acta', { p_datos: { equipo: 'X', cliente: 'X', vendedor: 'X' } }],
    ['actas_datos', {}],
    ['acta_datos', { p_id: 1 }],
    ['eliminar_acta', { p_id: 1 }],
  ]
  for (const [nombre, argumentos] of funciones) {
    const respuesta = await pedir(`/rest/v1/rpc/${nombre}`, { metodo: 'POST', cuerpo: argumentos })
    informar(respuesta.status >= 400, `llamar a ${nombre}`, `estado ${respuesta.status}`)
  }
}

// ---------------------------------------------------------------------------
console.log('\n3. Nadie puede registrarse por su cuenta')
{
  // Supabase publica su configuracion de ingreso; se lee, no se intenta un registro.
  const respuesta = await pedir('/auth/v1/settings')
  if (respuesta.status !== 200) {
    informar(false, 'leer la configuracion de ingreso', `estado ${respuesta.status}`)
  } else {
    const ajustes = await respuesta.json()
    informar(ajustes.disable_signup === true, 'el registro de usuarios nuevos esta apagado')
  }
}

console.log(fallas ? `\n${fallas} prueba(s) FALLARON.` : '\nTodas las pruebas pasaron.')
process.exitCode = fallas ? 1 : 0
