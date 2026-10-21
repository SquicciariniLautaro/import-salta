// scripts/probar-base.js
// Prueba las migraciones, los permisos y las reglas de negocio de la base SIN
// tocar Supabase.
// Uso:  npm run probar-base
//
// Levanta un Postgres en memoria (ver src/pruebas/baseLocal.js), le aplica los
// archivos de supabase/migrations/ y los datos de prueba, y despues se hace
// pasar por cada tipo de usuario. Sirve para probar una migracion nueva antes
// de aplicarla en el proyecto real.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { ADMIN_DE_PRUEBA as ADMIN, crearBaseLocal } from '../src/pruebas/baseLocal.js'
import { armarCatalogo } from '../src/servicios/catalogo.js'
import { armarStock } from '../src/servicios/stock.js'
import { armarCuentas } from '../src/servicios/cuentas.js'
import { armarVentas, totalizar } from '../src/servicios/ventas.js'
import { armarAvisos } from '../src/servicios/avisos.js'
import { armarCaja, resumirCaja } from '../src/servicios/caja.js'
import { armarComprobante } from '../src/servicios/comprobante.js'
import { armarGarantias } from '../src/servicios/garantias.js'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase')
const carpeta = path.join(raiz, 'migrations')
// El numero al principio del nombre define el orden.
const archivos = fs.readdirSync(carpeta).filter((nombre) => nombre.endsWith('.sql')).sort()
const migraciones = archivos.map((archivo) => fs.readFileSync(path.join(carpeta, archivo), 'utf8'))

// Tres usuarios: un administrador, alguien que no figura en la lista y
// alguien que se registro con el correo de un administrador sin confirmarlo.
const AJENO = '22222222-2222-2222-2222-222222222222'
const SIN_CONFIRMAR = '33333333-3333-3333-3333-333333333333'

const { base, como, rpc } = await crearBaseLocal({
  PGlite,
  migraciones,
  semilla: `
    ${fs.readFileSync(path.join(raiz, 'datos_prueba.sql'), 'utf8')}
    insert into auth.users (id, email, email_confirmed_at) values
      ('${ADMIN}', 'LautaroRodriguezSquicciarini@gmail.com', now()),
      ('${AJENO}', 'curioso@example.com', now()),
      ('${SIN_CONFIRMAR}', 'lautarorodriguezsquicciarini@gmail.com', null);
  `,
})
console.log(`migraciones aplicadas: ${archivos.join(', ')}`)

// Atajos.
const admin = (nombre, argumentos) => rpc(nombre, argumentos, { usuario: ADMIN })
const sql = async (texto, parametros) => (await base.query(texto, parametros)).rows
const rechaza = (promesa, patron) => assert.rejects(promesa, patron)
// Los ids de las unidades de un modelo, en un estado.
const idsDe = async (tabla, modelo, estado = 'disponible') =>
  (await sql(`select id from public.${tabla} where modelo = $1 and estado = $2 order by id`, [modelo, estado])).map((fila) => Number(fila.id))
const unidad = async (tabla, id) => (await sql(`select * from public.${tabla} where id = $1`, [id]))[0]

let fallas = 0
async function probar(nombre, prueba) {
  try {
    await prueba()
    console.log(`  ok    ${nombre}`)
  } catch (error) {
    fallas += 1
    console.log(`  FALLA ${nombre}`)
    console.log(`        ${String(error.message).split('\n').join('\n        ')}`)
  }
}

const TABLAS = [
  'configuracion', 'celulares', 'accesorios', 'pagos_revendedor', 'pagos_sena',
  'escalas_precio', 'revendedores_lista', 'administradores',
  'proveedores', 'comprobantes', 'movimientos_caja', 'servicios',
  'compras', 'opciones', 'combos', 'combo_partes',
  'clientes', 'cuenta_clientes', 'deudas_proveedor', 'envios_proveedor',
]

// ===========================================================================
console.log('\nvisitante sin sesion')
await probar('no puede leer ni escribir ninguna tabla', async () => {
  for (const tabla of TABLAS) await rechaza(como('anon', null, `select * from public.${tabla}`), /permission denied/)
  await rechaza(como('anon', null, `insert into public.celulares (modelo) values ('X')`), /permission denied/)
  await rechaza(como('anon', null, `update public.configuracion set cotizacion_dolar = 1`), /permission denied/)
  await rechaza(como('anon', null, `delete from public.celulares`), /permission denied/)
})
await probar('no puede llamar a ninguna funcion del panel', async () => {
  await rechaza(rpc('es_admin'), /permission denied/)
  await rechaza(rpc('panel_datos'), /permission denied/)
  await rechaza(rpc('ventas_datos'), /permission denied/)
  await rechaza(rpc('vender', { p_celulares: [{ id: 1, precio_usd: 1 }], p_accesorios: [] }), /permission denied/)
  await rechaza(rpc('guardar_configuracion', { p_cotizacion_dolar: 1, p_cotizacion_costo: null }), /permission denied/)
  await rechaza(rpc('buscar_imei', { p_imei: '3500' }), /permission denied/)
  await rechaza(rpc('borrar_unidades', { p_tabla: 'celulares', p_ids: [1] }), /permission denied/)
  for (const lectura of ['caja_datos', 'servicios_datos', 'garantias_datos']) await rechaza(rpc(lectura), /permission denied/)
  await rechaza(rpc('comprobante_datos', { p_id: 1 }), /permission denied/)
  await rechaza(rpc('guardar_ajustes', { p_datos: { negocio_nombre: 'X' } }), /permission denied/)
  await rechaza(rpc('guardar_movimiento', { p_id: null, p_datos: { tipo: 'ingreso', categoria: 'X', monto_ars: 1 } }), /permission denied/)
  await rechaza(rpc('guardar_servicio', { p_id: null, p_datos: { cliente: 'X', equipo: 'X' } }), /permission denied/)
  await rechaza(rpc('proveedor_por_nombre', { p_nombre: 'X' }), /permission denied/)
  await rechaza(rpc('ingresar_compra', { p_proveedor: 'X', p_nota: '', p_celulares: [] }), /permission denied/)
  await rechaza(rpc('cargar_imeis', { p_clave: 'X', p_imeis: ['1'] }), /permission denied/)
  await rechaza(rpc('agregar_opcion', { p_lista: 'modelo', p_valor: 'X' }), /permission denied/)
  await rechaza(rpc('guardar_combo', { p_id: null, p_datos: { nombre: 'X' } }), /permission denied/)
  await rechaza(rpc('guardar_cliente', { p_id: null, p_datos: { nombre: 'X' } }), /permission denied/)
  await rechaza(rpc('cuenta_cliente', { p_id: 1 }), /permission denied/)
  await rechaza(rpc('cuenta_proveedor', { p_id: 1 }), /permission denied/)
  await rechaza(rpc('anotar_deuda_proveedor', { p_proveedor: 1, p_monto_usd: 1 }), /permission denied/)
  await rechaza(rpc('envios_datos'), /permission denied/)
  await rechaza(rpc('anotar_envio', { p_datos: { proveedor: 'X', equipo: 'X' } }), /permission denied/)
  await rechaza(rpc('marcar_envio', { p_id: 1, p_estado: 'enviado' }), /permission denied/)
  await rechaza(rpc('eliminar_envio', { p_id: 1 }), /permission denied/)
  await rechaza(rpc('aplicar_a_equipos', { p_nombre: 'X' }), /permission denied/)
})
await probar('catalogo_publico solo trae campos publicos y unidades disponibles', async () => {
  const catalogo = await rpc('catalogo_publico')

  const campos = new Set()
  const juntar = (valor) => {
    if (Array.isArray(valor)) valor.forEach(juntar)
    else if (valor && typeof valor === 'object') {
      for (const [nombre, contenido] of Object.entries(valor)) {
        campos.add(nombre)
        juntar(contenido)
      }
    }
  }
  juntar(catalogo)
  // Lista cerrada: un campo que no este aca hace fallar la prueba.
  const permitidos = new Set([
    'cotizacion', 'celulares', 'accesorios', 'escalas', 'modelo', 'capacidad', 'color', 'bateria',
    'detalles', 'tipo', 'cantidad', 'suma_precio', 'clave', 'desde', 'moneda', 'precio',
    'combos', 'nombre', 'detalle',
    // Los planes de cuotas: { cuotas: { planes: [{ cuotas, recargo }], leyenda, accesorios } }.
    'cuotas', 'planes', 'recargo', 'leyenda',
  ])
  assert.deepEqual([...campos].filter((campo) => !permitidos.has(campo)), [])
  const texto = JSON.stringify(catalogo)
  for (const prohibido of ['costo', 'imei', 'revendedor', 'fecha_venta', 'permuta', 'PERSONA DE PRUEBA', '@']) {
    assert.ok(!texto.includes(prohibido), `aparece "${prohibido}"`)
  }

  const armado = armarCatalogo(catalogo)
  assert.deepEqual(
    armado.celulares.map((lote) => `${lote.familia} ${lote.capacidad} x${lote.cantidad} ${lote.precio_usd}`),
    [
      'SE 64GB x1 140', 'XR 64GB x1 175', '11 64GB x2 230', '11 128GB x1 255',
      '13 128GB x4 405', // 3 a 400 y 1 a 420
      '13 PRO 256GB x1 540', '14 128GB x2 610', '15 PRO MAX 256GB x1 980',
      'MOTOROLA G54 256GB x2 195', 'SAMSUNG S23 256GB x1 460',
    ],
  )
  const funda = armado.accesorios.find((lote) => lote.modelo === 'SILICONA IPHONE 13')
  assert.equal(funda.cantidad, 10)
  assert.deepEqual(funda.escalas, [
    { desde: 3, precio_ars: 5000, precio_usd: 5 },
    { desde: 10, precio_ars: 4000, precio_usd: 4 },
  ])
})

// ===========================================================================
console.log('\nusuario con sesion que NO es administrador')
for (const [descripcion, usuario] of [['no figura en la lista', AJENO], ['correo de admin sin confirmar', SIN_CONFIRMAR]]) {
  await probar(`${descripcion}: no ve ni cambia nada`, async () => {
    assert.equal(await rpc('es_admin', {}, { usuario }), false)
    for (const tabla of TABLAS) {
      assert.equal((await como('authenticated', usuario, `select * from public.${tabla}`)).length, 0, tabla)
    }
    await rechaza(como('authenticated', usuario, `insert into public.celulares (modelo) values ('X')`), /row-level security/)
    await como('authenticated', usuario, `update public.configuracion set cotizacion_dolar = 1`)
    await como('authenticated', usuario, `delete from public.celulares`)
    await rechaza(rpc('panel_datos', {}, { usuario }), /No autorizado/)
    await rechaza(rpc('ventas_datos', {}, { usuario }), /No autorizado/)
    await rechaza(rpc('vender', { p_celulares: [{ id: 1, precio_usd: 1 }], p_accesorios: [] }, { usuario }), /No autorizado/)
    await rechaza(rpc('guardar_configuracion', { p_cotizacion_dolar: 1, p_cotizacion_costo: null }, { usuario }), /No autorizado/)
    await rechaza(rpc('ingresar_accesorios', { p_tipo: 'X', p_modelo: '', p_color: '', p_detalles: '', p_costo_usd: 1, p_precio_usd: 1, p_cantidad: 1 }, { usuario }), /No autorizado/)
    await rechaza(rpc('registrar_pago', { p_tipo: 'sena', p_nombre: 'X', p_monto_ars: 10 }, { usuario }), /No autorizado/)
    await rechaza(rpc('caja_datos', {}, { usuario }), /No autorizado/)
    await rechaza(rpc('servicios_datos', {}, { usuario }), /No autorizado/)
    await rechaza(rpc('garantias_datos', {}, { usuario }), /No autorizado/)
    await rechaza(rpc('guardar_ajustes', { p_datos: { negocio_nombre: 'X' } }, { usuario }), /No autorizado/)
    await rechaza(rpc('guardar_movimiento', { p_id: null, p_datos: { tipo: 'ingreso', categoria: 'X', monto_ars: 1 } }, { usuario }), /No autorizado/)
    await rechaza(rpc('guardar_servicio', { p_id: null, p_datos: { cliente: 'X', equipo: 'X' } }, { usuario }), /No autorizado/)
    await rechaza(rpc('guardar_proveedor', { p_id: null, p_datos: { nombre: 'X' } }, { usuario }), /No autorizado/)
    await rechaza(rpc('ingresar_compra', { p_proveedor: 'X', p_nota: '', p_celulares: [] }, { usuario }), /No autorizado/)
    await rechaza(rpc('cargar_imeis', { p_clave: 'X', p_imeis: ['1'] }, { usuario }), /No autorizado/)
    await rechaza(rpc('agregar_opcion', { p_lista: 'modelo', p_valor: 'X' }, { usuario }), /No autorizado/)
    await rechaza(rpc('guardar_combo', { p_id: null, p_datos: { nombre: 'X' } }, { usuario }), /No autorizado/)
    // Las ayudas internas no revisan el permiso ellas mismas: las frena la tabla.
    await rechaza(rpc('proveedor_por_nombre', { p_nombre: 'X' }, { usuario }), /row-level security/)
    const [{ dolar, equipos }] = await sql(
      `select (select cotizacion_dolar from public.configuracion) as dolar, (select count(*)::int from public.celulares) as equipos`,
    )
    assert.equal(Number(dolar), 1000)
    assert.equal(equipos, 19)
  })
}

// ===========================================================================
console.log('\nadministrador: configuracion')
await probar('es_admin da true aunque el correo tenga mayusculas', async () => {
  assert.equal(await admin('es_admin'), true)
})
await probar('guarda las dos cotizaciones y rechaza las invalidas', async () => {
  assert.deepEqual(await admin('guardar_configuracion', { p_cotizacion_dolar: 1450, p_cotizacion_costo: 1400 }), {
    cotizacion_dolar: 1450,
    cotizacion_costo: 1400,
  })
  await rechaza(admin('guardar_configuracion', { p_cotizacion_dolar: 0, p_cotizacion_costo: null }), /configuracion_dolar_positivo/)
  await rechaza(admin('guardar_configuracion', { p_cotizacion_dolar: 1450, p_cotizacion_costo: -5 }), /configuracion_costo_positivo/)
})
await probar('no puede tocar la lista de administradores', async () => {
  await rechaza(como('authenticated', ADMIN, `insert into public.administradores (correo) values ('otro@example.com')`), /permission denied/)
  await rechaza(como('authenticated', ADMIN, `delete from public.administradores`), /permission denied/)
})

// ===========================================================================
console.log('\ncarga de stock')
const nuevo = { p_modelo: '  iphone   16 ', p_capacidad: '256gb', p_color: 'Negro', p_bateria: '100%', p_detalles: '' }
await probar('ingresa unidades en mayusculas y sin espacios de mas', async () => {
  assert.equal(await admin('ingresar_celulares', { ...nuevo, p_costo_usd: 700, p_precio_usd: 800, p_cantidad: 3 }), 3)
  const filas = await sql(`select modelo, capacidad, color, clave, promediado from public.celulares where modelo = 'IPHONE 16'`)
  assert.equal(filas.length, 3)
  assert.deepEqual(filas[0], { modelo: 'IPHONE 16', capacidad: '256GB', color: 'NEGRO', clave: 'IPHONE 16|256GB|NEGRO|100%|', promediado: false })
})
await probar('promedio ponderado: 3 a 700 y 1 a 720 da 705 en todas, y queda marcado', async () => {
  await admin('ingresar_celulares', { ...nuevo, p_modelo: 'IPHONE 16', p_color: 'NEGRÓ', p_costo_usd: 720, p_precio_usd: 820, p_cantidad: 1, p_imeis: ['356789012345678'] })
  const filas = await sql(`select costo_usd, precio_usd, promediado, imei from public.celulares where clave = 'IPHONE 16|256GB|NEGRO|100%|' order by id`)
  assert.equal(filas.length, 4)
  for (const fila of filas) {
    assert.equal(Number(fila.costo_usd), 705)
    assert.equal(Number(fila.precio_usd), 805)
    assert.equal(fila.promediado, true)
  }
  assert.equal(filas[3].imei, '356789012345678')
})
await probar('rechaza un IMEI repetido, cantidades y precios invalidos, y mas IMEI que equipos', async () => {
  await rechaza(admin('ingresar_celulares', { ...nuevo, p_costo_usd: 1, p_precio_usd: 1, p_cantidad: 1, p_imeis: ['356789012345678'] }), /celulares_imei_key|duplicate key/)
  await rechaza(admin('ingresar_celulares', { ...nuevo, p_costo_usd: 1, p_precio_usd: 1, p_cantidad: 0 }), /cantidad/)
  await rechaza(admin('ingresar_celulares', { ...nuevo, p_costo_usd: -1, p_precio_usd: 1, p_cantidad: 1 }), /negativos/)
  await rechaza(admin('ingresar_celulares', { ...nuevo, p_costo_usd: 1, p_precio_usd: 1, p_cantidad: 1, p_imeis: ['111111111111111', '222222222222222'] }), /más IMEI/)
  await rechaza(admin('ingresar_celulares', { ...nuevo, p_modelo: '  ', p_costo_usd: 1, p_precio_usd: 1, p_cantidad: 1 }), /modelo/)
  // Nada de lo rechazado quedo a medias.
  assert.equal((await idsDe('celulares', 'IPHONE 16')).length, 4)
})
await probar('editar un lote cambia sus datos, quita la marca de promediado y devuelve la clave nueva', async () => {
  const clave = await admin('editar_lote', {
    p_tabla: 'celulares', p_clave: 'IPHONE 16|256GB|NEGRO|100%|',
    p_datos: { modelo: 'iphone 16', capacidad: '256GB', color: 'negro', bateria: '100%', detalles: 'sellado' },
    p_costo_usd: 710, p_precio_usd: 810,
  })
  assert.equal(clave, 'IPHONE 16|256GB|NEGRO|100%|SELLADO')
  const filas = await sql(`select costo_usd, precio_usd, promediado from public.celulares where clave = $1`, [clave])
  assert.equal(filas.length, 4)
  assert.deepEqual(filas.map((fila) => [Number(fila.costo_usd), Number(fila.precio_usd), fila.promediado]), Array(4).fill([710, 810, false]))
  await rechaza(admin('editar_lote', { p_tabla: 'celulares', p_clave: 'NO EXISTE', p_datos: { modelo: 'X' }, p_costo_usd: 1, p_precio_usd: 1 }), /ya no existe/)
  await rechaza(admin('editar_lote', { p_tabla: 'administradores', p_clave: 'X', p_datos: {}, p_costo_usd: 1, p_precio_usd: 1 }), /Tabla desconocida/)
})
await probar('editar un accesorio arrastra sus precios por cantidad', async () => {
  const clave = await admin('editar_lote', {
    p_tabla: 'accesorios', p_clave: 'FUNDA|SILICONA IPHONE 13|NEGRO|',
    p_datos: { tipo: 'FUNDA', modelo: 'SILICONA IPHONE 13', color: 'NEGRO', detalles: 'MAGSAFE' },
    p_costo_usd: 1.5, p_precio_usd: 6,
  })
  assert.equal(clave, 'FUNDA|SILICONA IPHONE 13|NEGRO|MAGSAFE')
  assert.equal((await sql(`select 1 from public.escalas_precio where clave = $1`, [clave])).length, 2)
})
await probar('editar_imei asigna y borra, y borrar_unidades solo borra lo que esta en el local', async () => {
  const [primero, segundo] = await idsDe('celulares', 'IPHONE 16')
  await admin('editar_imei', { p_id: primero, p_imei: ' 351111111111111 ' })
  assert.equal((await unidad('celulares', primero)).imei, '351111111111111')
  await admin('editar_imei', { p_id: primero, p_imei: '' })
  assert.equal((await unidad('celulares', primero)).imei, null)

  assert.equal(await admin('borrar_unidades', { p_tabla: 'celulares', p_ids: [segundo] }), 1)
  const [vendido] = await idsDe('celulares', 'IPHONE 14 PRO', 'vendido')
  await rechaza(admin('borrar_unidades', { p_tabla: 'celulares', p_ids: [primero, vendido] }), /stock cambió/)
  assert.ok(await unidad('celulares', primero), 'el borrado rechazado no tiene que borrar nada')
})

// ===========================================================================
console.log('\nventas')
let vendidos16
await probar('una venta marca todo junto: precio real, misma fecha y las dos cotizaciones del dia', async () => {
  const disponibles = await idsDe('celulares', 'IPHONE 16')
  vendidos16 = disponibles.slice(0, 2)
  const fundas = (await idsDe('accesorios', 'SILICONA IPHONE 13')).slice(0, 2)
  const total = await admin('vender', {
    p_celulares: vendidos16.map((id) => ({ id, precio_usd: 790 })),
    // Una funda a precio y otra de regalo.
    p_accesorios: [{ id: fundas[0], precio_usd: 5 }, { id: fundas[1], precio_usd: 0 }],
  })
  assert.equal(total.unidades, 4)
  assert.ok(total.comprobante > 0)
  const celular = await unidad('celulares', vendidos16[0])
  const regalo = await unidad('accesorios', fundas[1])
  assert.equal(celular.estado, 'vendido')
  assert.equal(Number(celular.precio_usd), 790)
  assert.equal(Number(celular.cotizacion_venta), 1450)
  assert.equal(Number(celular.cotizacion_costo), 1400)
  assert.equal(Number(regalo.precio_usd), 0)
  assert.equal(String(celular.fecha_venta), String(regalo.fecha_venta))
})
await probar('no se puede vender dos veces la misma unidad, y la venta rechazada no deja nada a medias', async () => {
  const [libre] = await idsDe('celulares', 'IPHONE 16')
  await rechaza(
    admin('vender', { p_celulares: [{ id: libre, precio_usd: 800 }, { id: vendidos16[0], precio_usd: 800 }], p_accesorios: [] }),
    /stock cambió/,
  )
  assert.equal((await unidad('celulares', libre)).estado, 'disponible')
  await rechaza(admin('vender', { p_celulares: [{ id: libre, precio_usd: -1 }], p_accesorios: [] }), /negativo/)
  await rechaza(admin('vender', { p_celulares: [], p_accesorios: [] }), /nada para vender/)
})
await probar('editar una venta corrige el precio; anularla devuelve la unidad al local con el precio del lote', async () => {
  await admin('editar_venta', { p_tabla: 'celulares', p_ids: vendidos16, p_precio_usd: 795 })
  assert.equal(Number((await unidad('celulares', vendidos16[0])).precio_usd), 795)

  await admin('anular_venta', { p_tabla: 'celulares', p_ids: [vendidos16[1]] })
  const devuelta = await unidad('celulares', vendidos16[1])
  assert.equal(devuelta.estado, 'disponible')
  assert.equal(devuelta.fecha_venta, null)
  assert.equal(devuelta.cotizacion_venta, null)
  assert.equal(Number(devuelta.precio_usd), 810) // el de lista del lote, no los 795 de la venta
  await rechaza(admin('anular_venta', { p_tabla: 'celulares', p_ids: [vendidos16[1]] }), /venta cambió/)
})

// ===========================================================================
console.log('\npermuta')
await probar('el equipo recibido entra al stock a su valor de toma y el entregado guarda la permuta', async () => {
  const [entregado] = await idsDe('celulares', 'IPHONE 15 PRO MAX')
  await admin('registrar_permuta', {
    p_recibido: { modelo: 'iphone 12 mini', capacidad: '64GB', color: 'ROJO', bateria: '79%', detalles: '', imei: '359999999999999', valor_usd: 150, precio_usd: 210 },
    p_entregado_id: entregado,
    p_entregado_precio_usd: 980,
  })
  const vendido = await unidad('celulares', entregado)
  assert.equal(vendido.estado, 'vendido')
  assert.equal(Number(vendido.precio_usd), 980)
  assert.equal(Number(vendido.permuta_usd), 150)

  const [recibido] = await sql(`select * from public.celulares where imei = '359999999999999'`)
  assert.equal(recibido.modelo, 'IPHONE 12 MINI')
  assert.equal(recibido.estado, 'disponible')
  assert.equal(Number(recibido.costo_usd), 150)
  assert.equal(Number(recibido.precio_usd), 210)
})
await probar('una permuta que falla no deja el equipo recibido cargado', async () => {
  await rechaza(
    admin('registrar_permuta', {
      p_recibido: { modelo: 'IPHONE 8', capacidad: '', color: '', bateria: '', detalles: '', imei: '', valor_usd: 50, precio_usd: 80 },
      p_entregado_id: vendidos16[0], // ya esta vendido
      p_entregado_precio_usd: 500,
    }),
    /stock cambió/,
  )
  assert.equal((await sql(`select 1 from public.celulares where modelo = 'IPHONE 8'`)).length, 0)
})

// ===========================================================================
console.log('\ncuentas de revendedores')
const [xr] = await idsDe('celulares', 'IPHONE XR')
const [se] = await idsDe('celulares', 'IPHONE SE')
const pagosDe = (tabla, nombre) => sql(`select * from public.${tabla} where revendedor = $1 order by id`, [nombre])
await probar('entregar equipos: quedan a su nombre, se guarda el revendedor y el pago se pasa a dolares', async () => {
  const nombre = await admin('entregar_a_cuenta', {
    p_tipo: 'revendedor', p_nombre: ' juan  pérez ',
    p_celulares: [{ id: xr, precio_usd: 170 }, { id: se, precio_usd: 135 }], p_accesorios: [],
    p_pago_ars: 145000, // 100 USD a 1450
  })
  assert.equal(nombre, 'JUAN PÉREZ')
  const equipo = await unidad('celulares', xr)
  assert.equal(equipo.estado, 'revendedor')
  assert.equal(equipo.revendedor, 'JUAN PÉREZ')
  assert.equal(Number(equipo.precio_revendedor), 170)
  assert.equal(Number(equipo.precio_usd), 175) // el de lista no se toca
  assert.equal((await sql(`select 1 from public.revendedores_lista where clave = 'JUAN PEREZ'`)).length, 1)
  const [pago] = await pagosDe('pagos_revendedor', 'JUAN PÉREZ')
  assert.equal(Number(pago.monto_usd), 100)
  assert.equal(pago.aplicado, false)
})
await probar('lo que tiene un revendedor no aparece en el catalogo publico', async () => {
  const catalogo = await rpc('catalogo_publico')
  assert.ok(!catalogo.celulares.some((lote) => ['IPHONE XR', 'IPHONE SE'].includes(lote.modelo)))
})
await probar('un pago con el nombre escrito distinto va a la misma cuenta y no la cierra si falta', async () => {
  assert.equal(await admin('registrar_pago', { p_tipo: 'revendedor', p_nombre: 'Juan Perez', p_monto_ars: 72500 }), false)
  assert.equal((await pagosDe('pagos_revendedor', 'JUAN PÉREZ')).length, 2)
  assert.equal(Number(await admin('entregado_de_cuenta', { p_tipo: 'revendedor', p_nombre: 'JUAN PÉREZ' })), 150)
})
await probar('"pagado" descuenta lo entregado con una fila negativa y vende al precio acordado', async () => {
  await admin('marcar_pagado', { p_tipo: 'revendedor', p_nombre: 'JUAN PÉREZ', p_celulares: [se], p_accesorios: [] })
  const equipo = await unidad('celulares', se)
  assert.equal(equipo.estado, 'vendido')
  assert.equal(Number(equipo.precio_usd), 135)
  const pagos = await pagosDe('pagos_revendedor', 'JUAN PÉREZ')
  assert.deepEqual(pagos.map((pago) => Number(pago.monto_usd)), [100, 50, -135])
  assert.ok(pagos.every((pago) => pago.aplicado === false), 'le queda un equipo: la cuenta sigue abierta')
  assert.equal(Number(await admin('entregado_de_cuenta', { p_tipo: 'revendedor', p_nombre: 'JUAN PÉREZ' })), 15)
})
await probar('no deja bajar un pago por debajo de lo ya usado, ni eliminar al revendedor con cuenta abierta', async () => {
  const [primero] = await pagosDe('pagos_revendedor', 'JUAN PÉREZ')
  await rechaza(admin('editar_pago', { p_tipo: 'revendedor', p_id: Number(primero.id), p_monto_ars: 0 }), /ya se usó/)
  await rechaza(admin('editar_pago', { p_tipo: 'revendedor', p_id: Number(primero.id), p_monto_ars: 1000 }), /ya se usó/)
  assert.equal((await pagosDe('pagos_revendedor', 'JUAN PÉREZ')).length, 3)
  const [{ id }] = await sql(`select id from public.revendedores_lista where clave = 'JUAN PEREZ'`)
  await rechaza(admin('eliminar_revendedor', { p_id: Number(id) }), /No se puede eliminar/)
})
await probar('el pago que cubre el saldo cierra la cuenta sola', async () => {
  // Debe 170 y tiene 15 entregados: faltan 155 USD = 224.750 pesos.
  assert.equal(await admin('registrar_pago', { p_tipo: 'revendedor', p_nombre: 'JUAN PÉREZ', p_monto_ars: 224750 }), true)
  const equipo = await unidad('celulares', xr)
  assert.equal(equipo.estado, 'vendido')
  assert.equal(Number(equipo.precio_usd), 170)
  assert.ok((await pagosDe('pagos_revendedor', 'JUAN PÉREZ')).every((pago) => pago.aplicado === true))
  const [{ id }] = await sql(`select id from public.revendedores_lista where clave = 'JUAN PEREZ'`)
  await admin('eliminar_revendedor', { p_id: Number(id) })
  assert.equal((await sql(`select 1 from public.revendedores_lista`)).length, 0)
})
await probar('guardar_revendedor crea y actualiza el celular sin duplicar', async () => {
  await admin('guardar_revendedor', { p_nombre: 'ana gomez', p_celular: '387 111111' })
  await admin('guardar_revendedor', { p_nombre: 'Ana Gómez', p_celular: '387 222222' })
  assert.deepEqual(await sql(`select nombre, celular from public.revendedores_lista`), [{ nombre: 'ANA GOMEZ', celular: '387 222222' }])
})

// ===========================================================================
console.log('\nseñas')
const [catorce, otroCatorce] = await idsDe('celulares', 'IPHONE 14')
await probar('señar reserva el equipo; cancelar lo devuelve al local', async () => {
  await admin('entregar_a_cuenta', {
    p_tipo: 'sena', p_nombre: 'Cliente Uno', p_celulares: [{ id: catorce, precio_usd: 600 }], p_accesorios: [], p_pago_ars: 145000,
  })
  assert.equal((await unidad('celulares', catorce)).estado, 'senado')
  // Las señas no se guardan en la lista de revendedores.
  assert.equal((await sql(`select 1 from public.revendedores_lista where clave = 'CLIENTE UNO'`)).length, 0)

  assert.equal(await admin('devolver_unidades', { p_tipo: 'sena', p_celulares: [catorce], p_accesorios: [] }), 1)
  const equipo = await unidad('celulares', catorce)
  assert.equal(equipo.estado, 'disponible')
  assert.equal(equipo.revendedor, null)
  // Un equipo señado no se puede devolver como si fuera de un revendedor.
  await rechaza(admin('devolver_unidades', { p_tipo: 'revendedor', p_celulares: [catorce], p_accesorios: [] }), /cuenta cambió/)
})
await probar('el pago de una seña se puede corregir y eliminar', async () => {
  const [pago] = await pagosDe('pagos_sena', 'CLIENTE UNO')
  await admin('editar_pago', { p_tipo: 'sena', p_id: Number(pago.id), p_monto_ars: 290000 })
  assert.equal(Number((await pagosDe('pagos_sena', 'CLIENTE UNO'))[0].monto_usd), 200)
  await admin('editar_pago', { p_tipo: 'sena', p_id: Number(pago.id), p_monto_ars: 0 })
  assert.equal((await pagosDe('pagos_sena', 'CLIENTE UNO')).length, 0)
})
await probar('una seña por el precio completo queda vendida en el acto', async () => {
  await admin('entregar_a_cuenta', {
    p_tipo: 'sena', p_nombre: 'Cliente Dos', p_celulares: [{ id: otroCatorce, precio_usd: 600 }], p_accesorios: [], p_pago_ars: 870000,
  })
  assert.equal((await unidad('celulares', otroCatorce)).estado, 'vendido')
  assert.ok((await pagosDe('pagos_sena', 'CLIENTE DOS')).every((pago) => pago.aplicado))
})
await probar('rechaza un carrito vacio, un tipo inventado y un nombre vacio', async () => {
  await rechaza(admin('entregar_a_cuenta', { p_tipo: 'sena', p_nombre: 'X', p_celulares: [], p_accesorios: [], p_pago_ars: 0 }), /carrito está vacío/)
  await rechaza(admin('entregar_a_cuenta', { p_tipo: 'regalo', p_nombre: 'X', p_celulares: [{ id: catorce, precio_usd: 1 }], p_accesorios: [], p_pago_ars: 0 }), /Tipo de cuenta desconocido/)
  await rechaza(admin('entregar_a_cuenta', { p_tipo: 'sena', p_nombre: '  ', p_celulares: [{ id: catorce, precio_usd: 1 }], p_accesorios: [], p_pago_ars: 0 }), /Falta el nombre/)
  assert.equal((await unidad('celulares', catorce)).estado, 'disponible')
})

// ===========================================================================
console.log('\nprecios por cantidad')
await probar('guardar_escalas reemplaza la escala completa y rechaza tramos repetidos o invalidos', async () => {
  const clave = 'CARGADOR|20W USB-C|BLANCO|ORIGINAL'
  await admin('guardar_escalas', { p_clave: clave, p_tramos: [{ desde: 2, moneda: 'ars', precio: 24000 }, { desde: 5, moneda: 'usd', precio: 15 }] })
  await admin('guardar_escalas', { p_clave: clave, p_tramos: [{ desde: 3, moneda: 'usd', precio: 16 }] })
  assert.deepEqual(await sql(`select desde, moneda from public.escalas_precio where clave = $1`, [clave]), [{ desde: 3, moneda: 'usd' }])
  await rechaza(admin('guardar_escalas', { p_clave: clave, p_tramos: [{ desde: 3, moneda: 'usd', precio: 1 }, { desde: 3, moneda: 'ars', precio: 2 }] }), /misma cantidad/)
  await rechaza(admin('guardar_escalas', { p_clave: clave, p_tramos: [{ desde: 0, moneda: 'usd', precio: 1 }] }), /Revisá los tramos/)
  await rechaza(admin('guardar_escalas', { p_clave: clave, p_tramos: [{ desde: 2, moneda: 'eur', precio: 1 }] }), /Revisá los tramos/)
  // Un rechazo no borra la escala que ya estaba.
  assert.equal((await sql(`select 1 from public.escalas_precio where clave = $1`, [clave])).length, 1)
})
await probar('el catalogo no muestra escalas de accesorios que no estan en el local', async () => {
  await admin('guardar_escalas', { p_clave: 'FUNDA|QUE NO EXISTE||', p_tramos: [{ desde: 2, moneda: 'usd', precio: 1 }] })
  const catalogo = await rpc('catalogo_publico')
  assert.ok(!catalogo.escalas.some((escala) => escala.clave === 'FUNDA|QUE NO EXISTE||'))
  assert.ok(catalogo.escalas.some((escala) => escala.clave === 'CARGADOR|20W USB-C|BLANCO|ORIGINAL'))
})

// ===========================================================================
console.log('\nbusqueda de IMEI')
await probar('encuentra un equipo por una parte del IMEI, en cualquier estado', async () => {
  const [encontrado] = await admin('buscar_imei', { p_imei: '99999999' })
  assert.equal(encontrado.modelo, 'IPHONE 12 MINI')
  assert.deepEqual(await admin('buscar_imei', { p_imei: '0000000000' }), [])
  // % no funciona como comodin: no devuelve todo.
  assert.deepEqual(await admin('buscar_imei', { p_imei: '%%%%' }), [])
  await rechaza(admin('buscar_imei', { p_imei: '35' }), /al menos 4/)
})

// ===========================================================================
console.log('\nlecturas del panel')
await probar('panel_datos trae lo no vendido y arma stock y cuentas', async () => {
  const datos = await admin('panel_datos')
  assert.equal(datos.configuracion.cotizacion_dolar, 1450)
  assert.equal(datos.configuracion.cotizacion_costo, 1400)
  assert.equal(datos.configuracion.negocio_nombre, 'Import Salta')
  assert.ok(!('id' in datos.configuracion))
  assert.ok(datos.celulares.every((fila) => fila.estado !== 'vendido'))

  const stock = armarStock(datos.celulares, 'celulares')
  const doce = stock.filter((lote) => lote.modelo === 'IPHONE 12')
  // Los dos IPHONE 12 de prueba estan afuera: figuran con 0 en el local.
  assert.deepEqual(doce.map((lote) => [lote.cantidad, lote.conRevendedores.length, lote.senadas.length]).sort(), [[0, 0, 1], [0, 1, 0]])

  const cuentas = armarCuentas({
    tipo: 'revendedor', celulares: datos.celulares, accesorios: datos.accesorios,
    pagos: datos.pagos_revendedor, lista: datos.revendedores, cotizaciones: { venta: 1450, costo: 1400 },
  })
  assert.deepEqual(cuentas.map((cuenta) => [cuenta.nombre, cuenta.unidades.length, cuenta.saldo_usd]), [
    ['ANA GOMEZ', 0, 0],
    ['PERSONA DE PRUEBA', 1, 340],
  ])
})
await probar('ventas_datos alimenta el historial: unidades iguales de una venta van en un renglon', async () => {
  const vendidas = await admin('ventas_datos')
  const { renglones, meses } = armarVentas(vendidas)
  const dieciseis = renglones.find((renglon) => renglon.descripcion.startsWith('IPHONE 16'))
  assert.equal(dieciseis.cantidad, 1) // se vendieron 2 y se anulo 1
  assert.equal(dieciseis.cobrado_ars, 795 * 1450)
  // Ganancia: 795 x 1450 cobrados menos 710 x 1400 de costo, mostrada en USD de venta.
  assert.ok(Math.abs(dieciseis.ganancia_usd - (795 * 1450 - 710 * 1400) / 1450) < 0.0001)

  // La permuta cuenta como cobrado solo la diferencia.
  const promax = renglones.find((renglon) => renglon.descripcion.startsWith('IPHONE 15 PRO MAX'))
  assert.equal(promax.cobrado_ars, (980 - 150) * 1450)

  const total = totalizar(renglones)
  assert.equal(total.unidades, vendidas.celulares.length + vendidas.accesorios.length)
  assert.equal(meses.reduce((suma, mes) => suma + mes.unidades, 0), total.unidades)
})

// ===========================================================================
console.log('\ncomprobantes: cliente, medio de pago y garantia')
let comprobante
const cuantos = async (tabla, condicion = 'true') => (await sql(`select count(*)::int as n from public.${tabla} where ${condicion}`))[0].n
await probar('una venta guarda quien compro, como pago y los dias de garantia de Ajustes', async () => {
  const [once] = await idsDe('celulares', 'IPHONE 11')
  const [vidrio] = await idsDe('accesorios', 'IPHONE 11 / XR')
  const resultado = await admin('vender', {
    p_celulares: [{ id: once, precio_usd: 240 }],
    p_accesorios: [{ id: vidrio, precio_usd: 3 }],
    p_datos: { cliente: ' maría  lópez ', telefono: '387 123456', medio: 'mixto', efectivo_ars: 200000 },
  })
  assert.equal(resultado.unidades, 2)
  comprobante = resultado.comprobante

  const datos = await admin('comprobante_datos', { p_id: comprobante })
  assert.deepEqual([datos.origen, datos.cliente, datos.telefono, datos.medio, datos.efectivo_ars], ['mostrador', 'MARÍA LÓPEZ', '387 123456', 'mixto', 200000])
  assert.equal(datos.celulares[0].garantia_dias, 30)
  assert.equal(datos.accesorios[0].garantia_dias, 0)

  const ticket = armarComprobante(datos)
  assert.equal(ticket.total_ars, 243 * 1450)
  assert.deepEqual(ticket.pagos, [{ nombre: 'Efectivo', monto_ars: 200000 }, { nombre: 'Transferencia', monto_ars: 152350 }])
})
await probar('un medio de pago invalido rechaza la venta entera; sin datos, es efectivo', async () => {
  const [otro] = await idsDe('celulares', 'IPHONE 11')
  const antes = await cuantos('comprobantes')
  const venta = (datos) => admin('vender', { p_celulares: [{ id: otro, precio_usd: 240 }], p_accesorios: [], p_datos: datos })
  await rechaza(venta({ medio: 'cheque' }), /Medio de pago desconocido/)
  await rechaza(venta({ medio: 'mixto' }), /cuánto pagó en efectivo/)
  await rechaza(venta({ garantia_celulares: -1 }), /garantía/)
  assert.equal((await unidad('celulares', otro)).estado, 'disponible')
  assert.equal(await cuantos('comprobantes'), antes)

  // La garantia se puede cambiar en cada venta.
  const { comprobante: numero } = await venta({ garantia_celulares: 90 })
  assert.equal((await unidad('celulares', otro)).garantia_dias, 90)
  assert.equal((await admin('comprobante_datos', { p_id: numero })).medio, 'efectivo')

  // Anular todas sus unidades borra el comprobante y la garantia.
  await admin('anular_venta', { p_tabla: 'celulares', p_ids: [otro] })
  assert.equal(await cuantos('comprobantes', `id = ${numero}`), 0)
  assert.equal((await unidad('celulares', otro)).garantia_dias, null)
  await rechaza(admin('comprobante_datos', { p_id: numero }), /ya no existe/)
})
await probar('editar_comprobante corrige el cliente y el medio de pago', async () => {
  await admin('editar_comprobante', { p_id: comprobante, p_datos: { cliente: 'Maria Lopez', telefono: '', medio: 'transferencia' } })
  let datos = await admin('comprobante_datos', { p_id: comprobante })
  assert.deepEqual([datos.cliente, datos.telefono, datos.medio, datos.efectivo_ars], ['MARIA LOPEZ', '', 'transferencia', null])
  await admin('editar_comprobante', { p_id: comprobante, p_datos: { cliente: 'María López', telefono: '387 123456', medio: 'mixto', efectivo_ars: 200000 } })
  datos = await admin('comprobante_datos', { p_id: comprobante })
  assert.deepEqual([datos.cliente, datos.medio, datos.efectivo_ars], ['MARÍA LÓPEZ', 'mixto', 200000])
  await rechaza(admin('editar_comprobante', { p_id: 999999, p_datos: {} }), /ya no existe/)
})
await probar('las permutas y las cuentas tambien dejan su comprobante', async () => {
  const [permuta] = await sql(`select c.origen, c.nota, c.medio from public.comprobantes c join public.celulares u on u.comprobante_id = c.id where u.modelo = 'IPHONE 15 PRO MAX'`)
  assert.deepEqual(permuta, { origen: 'permuta', nota: 'Recibido en parte de pago: IPHONE 12 MINI 64GB ROJO IMEI 359999999999999', medio: 'efectivo' })
  const [cuenta] = await sql(`select c.origen, c.cliente, c.medio from public.comprobantes c join public.celulares u on u.comprobante_id = c.id where u.modelo = 'IPHONE XR'`)
  assert.deepEqual(cuenta, { origen: 'revendedor', cliente: 'JUAN PÉREZ', medio: null })
  const [sena] = await sql(`select c.origen, c.cliente from public.comprobantes c join public.celulares u on u.comprobante_id = c.id where u.revendedor = 'CLIENTE DOS'`)
  assert.deepEqual(sena, { origen: 'sena', cliente: 'CLIENTE DOS' })
})
await probar('"pagado" anota como pago lo que se cobra en el momento, con su medio', async () => {
  const [pro] = await idsDe('celulares', 'IPHONE 13 PRO')
  await admin('entregar_a_cuenta', {
    p_tipo: 'revendedor', p_nombre: 'ana gomez', p_celulares: [{ id: pro, precio_usd: 500 }], p_accesorios: [],
    p_pago_ars: 145000, p_medio: 'transferencia', // 100 USD
  })
  await rechaza(admin('registrar_pago', { p_tipo: 'revendedor', p_nombre: 'ANA GOMEZ', p_monto_ars: 1000, p_medio: 'cheque' }), /Medio de pago desconocido/)
  // Debe 500 y entrego 100: al marcar pagado, los 400 que faltan se cobran ahora.
  await admin('marcar_pagado', { p_tipo: 'revendedor', p_nombre: 'ANA GOMEZ', p_celulares: [pro], p_accesorios: [], p_medio: 'efectivo' })
  const pagos = await pagosDe('pagos_revendedor', 'ANA GOMEZ')
  assert.deepEqual(pagos.map((pago) => [Number(pago.monto_usd), Number(pago.monto_ars), pago.medio, pago.aplicado]), [
    [100, 145000, 'transferencia', true],
    [400, 580000, 'efectivo', true],
    [-500, -725000, 'efectivo', true],
  ])
  assert.equal((await unidad('celulares', pro)).estado, 'vendido')
})

// ===========================================================================
console.log('\ncaja')
let gasto
await probar('junta ventas, pagos de cuentas y permutas, cada uno por su medio', async () => {
  const caja = armarCaja(await admin('caja_datos'))
  const venta = caja.find((fila) => fila.origen === 'venta' && fila.id === comprobante)
  assert.deepEqual([venta.concepto, venta.detalle, venta.persona, venta.efectivo_ars, venta.transferencia_ars], ['Venta', '2 productos', 'MARÍA LÓPEZ', 200000, 152350])

  // La permuta entra por la diferencia cobrada.
  const permuta = caja.find((fila) => fila.concepto === 'Venta con permuta')
  assert.deepEqual([permuta.detalle, permuta.efectivo_ars], ['IPHONE 15 PRO MAX 256GB', (980 - 150) * 1450])

  // Lo que se vendio por una cuenta no figura como venta: entro con los pagos.
  assert.ok(!caja.some((fila) => fila.origen === 'venta' && ['JUAN PÉREZ', 'ANA GOMEZ', 'CLIENTE DOS'].includes(fila.persona)))
  const pagos = (nombre) => caja.filter((fila) => fila.origen.startsWith('pago_') && fila.persona === nombre)
  assert.deepEqual(pagos('JUAN PÉREZ').map((fila) => fila.efectivo_ars).sort((a, b) => a - b), [72500, 145000, 224750])
  assert.deepEqual(pagos('ANA GOMEZ').map((fila) => [fila.efectivo_ars, fila.transferencia_ars]).sort((a, b) => a[0] - b[0]), [[0, 145000], [580000, 0]])
  assert.deepEqual(pagos('CLIENTE DOS').map((fila) => [fila.concepto, fila.efectivo_ars]), [['Seña', 870000]])
  // Las filas negativas (descuentos) no son plata: no aparecen.
  assert.ok(caja.every((fila) => fila.origen === 'movimiento' || fila.total_ars >= 0))

  // La venta de los datos de prueba es de antes de los comprobantes: cuenta como efectivo.
  const vieja = caja.find((fila) => fila.origen === 'venta' && fila.id === null && fila.detalle === 'IPHONE 14 PRO 256GB')
  assert.equal(vieja.efectivo_ars, 700000)
})
await probar('gastos e ingresos a mano: se crean, se corrigen y se eliminan', async () => {
  const movimiento = (datos, id = null) => admin('guardar_movimiento', { p_id: id, p_datos: datos })
  const antes = resumirCaja(armarCaja(await admin('caja_datos')))

  gasto = await movimiento({ tipo: 'egreso', categoria: ' alquiler ', detalle: 'Octubre', monto_ars: 300000, medio: 'transferencia' })
  await movimiento({ tipo: 'egreso', categoria: 'Proveedor', monto_ars: 500000, proveedor: 'Mayorista Norte' })
  const aparte = await movimiento({ tipo: 'ingreso', categoria: 'venta aparte', detalle: 'Cambio de vidrio', cliente: 'pedro', monto_ars: 20000, fecha: '2026-09-30T15:00:00Z' })
  await movimiento({ tipo: 'egreso', categoria: 'alquiler', detalle: 'Octubre', monto_ars: 310000, medio: 'transferencia' }, gasto)

  let caja = armarCaja(await admin('caja_datos'))
  const fila = (id) => caja.find((otra) => otra.origen === 'movimiento' && otra.id === id)
  assert.deepEqual([fila(gasto).concepto, fila(gasto).tipo, fila(gasto).efectivo_ars, fila(gasto).transferencia_ars], ['ALQUILER', 'egreso', 0, -310000])
  assert.deepEqual([fila(aparte).persona, fila(aparte).efectivo_ars, fila(aparte).fecha.slice(0, 10)], ['PEDRO', 20000, '2026-09-30'])
  assert.equal(caja.find((otra) => otra.proveedor === 'MAYORISTA NORTE').efectivo_ars, -500000)

  const despues = resumirCaja(caja)
  assert.equal(despues.egresos - antes.egresos, 810000)
  assert.equal(despues.efectivo - antes.efectivo, 20000 - 500000)
  assert.equal(despues.transferencia - antes.transferencia, -310000)

  await rechaza(movimiento({ tipo: 'egreso', categoria: 'X', monto_ars: 0 }), /mayor que cero/)
  await rechaza(movimiento({ tipo: 'regalo', categoria: 'X', monto_ars: 10 }), /Tipo de movimiento/)
  await rechaza(movimiento({ tipo: 'egreso', categoria: '  ', monto_ars: 10 }), /categoría/)
  await rechaza(movimiento({ tipo: 'egreso', categoria: 'X', monto_ars: 10 }, 999999), /ya no existe/)

  await admin('eliminar_movimiento', { p_id: aparte })
  caja = armarCaja(await admin('caja_datos'))
  assert.ok(!caja.some((otra) => otra.origen === 'movimiento' && otra.id === aparte))
  await rechaza(admin('eliminar_movimiento', { p_id: aparte }), /ya no existe/)
})

// ===========================================================================
console.log('\nproveedores')
await probar('cargar stock con un proveedor lo usa si existe (aunque se escriba distinto) o lo crea', async () => {
  await admin('ingresar_accesorios', { p_tipo: 'cable', p_modelo: 'usb-c 1m', p_color: '', p_detalles: '', p_costo_usd: 2, p_precio_usd: 6, p_cantidad: 4, p_proveedor: ' mayorista  norte ' })
  await admin('ingresar_celulares', { ...nuevo, p_modelo: 'IPHONE 17', p_costo_usd: 900, p_precio_usd: 1100, p_cantidad: 1, p_imeis: ['358888888888888'], p_proveedor: 'Importadora Sur' })
  assert.equal(await cuantos('proveedores'), 2)

  const { proveedores } = await admin('panel_datos')
  assert.deepEqual(proveedores.map((proveedor) => [proveedor.nombre, proveedor.unidades, proveedor.pagado_ars]), [
    ['IMPORTADORA SUR', 1, 0],
    ['MAYORISTA NORTE', 4, 500000],
  ])
  const [encontrado] = await admin('buscar_imei', { p_imei: '358888888888888' })
  assert.equal(encontrado.proveedor, 'IMPORTADORA SUR')
})
await probar('guardar_proveedor no duplica nombres y eliminar_proveedor cuida el que tiene movimientos', async () => {
  const [{ id }] = await sql(`select id from public.proveedores where clave = 'MAYORISTA NORTE'`)
  await rechaza(admin('guardar_proveedor', { p_id: null, p_datos: { nombre: 'mayorista norte' } }), /Ya hay un proveedor/)
  await rechaza(admin('guardar_proveedor', { p_id: null, p_datos: { nombre: ' ' } }), /Falta el nombre/)
  assert.equal(await admin('guardar_proveedor', { p_id: Number(id), p_datos: { nombre: 'Mayorista Norte SRL', telefono: '387 000000', rubro: 'accesorios', notas: 'Paga a 15 días' } }), Number(id))
  assert.deepEqual((await sql(`select nombre, clave, telefono, rubro from public.proveedores where id = $1`, [id]))[0], {
    nombre: 'MAYORISTA NORTE SRL', clave: 'MAYORISTA NORTE SRL', telefono: '387 000000', rubro: 'ACCESORIOS',
  })
  await rechaza(admin('eliminar_proveedor', { p_id: Number(id) }), /No se puede eliminar/)

  const suelto = await admin('guardar_proveedor', { p_id: null, p_datos: { nombre: 'Sin uso' } })
  await admin('eliminar_proveedor', { p_id: suelto })
  assert.equal(await cuantos('proveedores'), 2)
})

// ===========================================================================
console.log('\nservicio tecnico y garantias')
let orden
await probar('una orden entra, se arregla, se entrega y su cobro aparece en la caja', async () => {
  const guardar = (datos, id = null) => admin('guardar_servicio', { p_id: id, p_datos: datos })
  const base = { cliente: ' carla  ruiz ', telefono: '387 555555', equipo: 'iphone 11 negro', imei: '', falla: 'No carga', presupuesto_ars: 45000, costo_ars: 15000 }
  orden = await guardar(base)
  await rechaza(guardar({ ...base, cliente: '' }), /nombre del cliente/)
  await rechaza(guardar({ ...base, equipo: ' ' }), /Falta el equipo/)
  await rechaza(guardar({ ...base, estado: 'entregado' }), /Entregar/)
  await rechaza(guardar({ ...base, costo_ars: -1 }), /negativos/)
  await rechaza(guardar(base, 999999), /ya no existe/)

  assert.equal(await guardar({ ...base, estado: 'listo', trabajo: 'Cambio de pin de carga' }, orden), orden)
  await rechaza(admin('entregar_servicio', { p_id: orden, p_datos: { cobrado_ars: 45000, medio: 'mixto' } }), /cuánto pagó en efectivo/)
  await admin('entregar_servicio', { p_id: orden, p_datos: { cobrado_ars: 45000, medio: 'mixto', efectivo_ars: 20000 } })

  const entregada = (await admin('servicios_datos')).find((otra) => otra.id === orden)
  assert.deepEqual(
    [entregada.cliente, entregada.equipo, entregada.estado, entregada.trabajo, entregada.cobrado_ars, entregada.garantia_dias],
    ['CARLA RUIZ', 'IPHONE 11 NEGRO', 'entregado', 'Cambio de pin de carga', 45000, 30],
  )
  const enCaja = armarCaja(await admin('caja_datos')).find((fila) => fila.origen === 'servicio' && fila.id === orden)
  assert.deepEqual([enCaja.persona, enCaja.detalle, enCaja.efectivo_ars, enCaja.transferencia_ars], ['CARLA RUIZ', 'IPHONE 11 NEGRO', 20000, 25000])

  // Entregada, no se toca ni se borra.
  await rechaza(guardar(base, orden), /ya fue entregada/)
  await rechaza(admin('entregar_servicio', { p_id: orden, p_datos: { cobrado_ars: 1 } }), /ya fue entregada o cancelada/)
  await rechaza(admin('eliminar_servicio', { p_id: orden }), /No se puede borrar/)
})
await probar('garantias_datos junta lo vendido y lo arreglado que tiene garantia', async () => {
  const garantias = armarGarantias(await admin('garantias_datos'))
  const arreglo = garantias.find((garantia) => garantia.tabla === 'servicios')
  assert.deepEqual([arreglo.descripcion, arreglo.cliente, arreglo.dias, arreglo.vigente], ['ARREGLO IPHONE 11 NEGRO', 'CARLA RUIZ', 30, true])
  const equipo = garantias.find((garantia) => garantia.cliente === 'MARÍA LÓPEZ')
  assert.deepEqual([equipo.descripcion, equipo.dias, equipo.dias_restantes, equipo.telefono], ['IPHONE 11 64GB NEGRO', 30, 30, '387 123456'])
  // El vidrio de esa misma venta no tiene garantia: no figura.
  assert.ok(!garantias.some((garantia) => garantia.tabla === 'accesorios' && garantia.cliente === 'MARÍA LÓPEZ'))
  // Lo vendido por una cuenta figura a nombre del revendedor.
  assert.ok(garantias.some((garantia) => garantia.cliente === 'JUAN PÉREZ' && garantia.descripcion === 'IPHONE XR 64GB CORAL'))
})
await probar('reabrir una orden saca su cobro de la caja y permite borrarla', async () => {
  await admin('reabrir_servicio', { p_id: orden })
  assert.ok(!(await admin('caja_datos')).some((fila) => fila.origen === 'servicio'))
  await rechaza(admin('reabrir_servicio', { p_id: orden }), /no está entregada/)
  await admin('eliminar_servicio', { p_id: orden })
  assert.deepEqual(await admin('servicios_datos'), [])
})

// ===========================================================================
console.log('\najustes y avisos de stock')
await probar('guardar_ajustes cambia solo lo que se manda y respeta los limites', async () => {
  await admin('guardar_ajustes', { p_datos: { negocio_direccion: ' Av. San Martín  123 ', garantia_dias_celulares: 90, aviso_accesorios: 5 } })
  const { configuracion } = await admin('panel_datos')
  assert.deepEqual(
    [configuracion.negocio_nombre, configuracion.negocio_direccion, configuracion.garantia_dias_celulares, configuracion.garantia_dias_accesorios, configuracion.aviso_accesorios, configuracion.ticket_ancho_mm, configuracion.cotizacion_dolar],
    ['Import Salta', 'Av. San Martín 123', 90, 0, 5, 50, 1450],
  )
  await rechaza(admin('guardar_ajustes', { p_datos: { ticket_ancho_mm: 5 } }), /configuracion_ajustes_validos/)
  await rechaza(admin('guardar_ajustes', { p_datos: { negocio_nombre: '  ' } }), /configuracion_ajustes_validos/)

  // La proxima venta ya sale con la garantia nueva.
  const [moto] = await idsDe('celulares', 'MOTOROLA G54')
  await admin('vender', { p_celulares: [{ id: moto, precio_usd: 195 }], p_accesorios: [] })
  assert.equal((await unidad('celulares', moto)).garantia_dias, 90)
})
await probar('panel_datos avisa los lotes agotados y armarAvisos los junta con lo que queda poco', async () => {
  const datos = await admin('panel_datos')
  const agotados = datos.agotados.map((lote) => `${lote.tabla} ${lote.modelo} ${lote.capacidad}`)
  for (const esperado of ['celulares IPHONE 15 PRO MAX 256GB', 'celulares IPHONE XR 64GB', 'celulares IPHONE 14 PRO 256GB', 'celulares IPHONE 13 PRO 256GB']) {
    assert.ok(agotados.includes(esperado), `falta ${esperado}`)
  }
  // Un lote con unidades en el local no esta agotado.
  assert.ok(!agotados.some((texto) => texto.startsWith('celulares IPHONE 13 128GB')))
  assert.ok(!agotados.some((texto) => texto.startsWith('celulares MOTOROLA')))

  const avisos = armarAvisos({
    stock: { celulares: armarStock(datos.celulares, 'celulares'), accesorios: armarStock(datos.accesorios, 'accesorios') },
    agotados: datos.agotados,
    configuracion: datos.configuracion,
  })
  // Con el limite en 5: quedan 5 cargadores, 4 cables y 2 auriculares.
  assert.deepEqual(avisos.accesorios.poco.map((aviso) => [aviso.descripcion, aviso.cantidad]), [
    ['AURICULARES AIRPODS PRO 2 BLANCO', 2], ['CABLE USB-C 1M', 4], ['CARGADOR 20W USB-C BLANCO', 5],
  ])
  // El IPHONE 12 de la persona de prueba no esta en el local, pero sigue afuera.
  assert.ok(avisos.celulares.sinStock.some((aviso) => aviso.descripcion === 'IPHONE 12 128GB VIOLETA' && aviso.afuera === 1))
})

// ===========================================================================
console.log('\nlotes de compra y carga rapida de IMEI')
let compra
const opcion = async (lista, valor) => (await sql(`select 1 from public.opciones where lista = $1 and valor = $2`, [lista, valor])).length === 1
const CLAVE_18 = 'IPHONE 18 PRO|256GB|NARANJA|100%|'
await probar('un lote de compra carga varios modelos del mismo proveedor de una vez', async () => {
  const resultado = await admin('ingresar_compra', {
    p_proveedor: 'distribuidora centro',
    p_nota: 'Factura 0001-123',
    p_celulares: [
      { modelo: 'iphone 18 pro', capacidad: '256gb', color: 'naranja', bateria: '100%', detalles: '', costo_usd: 1100, precio_usd: 1300, cantidad: 3, imeis: ['351818181818181'] },
      { modelo: 'iphone fold', capacidad: '512GB', color: 'negro', bateria: '100%', detalles: 'sellado', costo_usd: 1800, precio_usd: 2100, cantidad: 2, imeis: [] },
    ],
  })
  compra = resultado.compra
  assert.equal(resultado.unidades, 5)
  const filas = await sql(`select u.modelo, u.compra_id, p.nombre from public.celulares u join public.proveedores p on p.id = u.proveedor_id where u.compra_id = $1`, [compra])
  assert.equal(filas.length, 5)
  assert.ok(filas.every((fila) => fila.nombre === 'DISTRIBUIDORA CENTRO'))
  assert.equal((await sql(`select nota from public.compras where id = $1`, [compra]))[0].nota, 'Factura 0001-123')
  // Lo nuevo que se escribio queda en los desplegables.
  assert.ok(await opcion('modelo', 'IPHONE FOLD'))
  assert.ok(await opcion('modelo', 'IPHONE 18 PRO'))
})
await probar('un lote con un error no carga nada', async () => {
  const antes = await cuantos('compras')
  const equipos = await cuantos('celulares')
  await rechaza(admin('ingresar_compra', { p_proveedor: ' ', p_nota: '', p_celulares: [{ modelo: 'X', costo_usd: 1, precio_usd: 1, cantidad: 1 }] }), /proveedor/)
  await rechaza(admin('ingresar_compra', { p_proveedor: 'X', p_nota: '', p_celulares: [] }), /al menos un modelo/)
  await rechaza(
    admin('ingresar_compra', {
      p_proveedor: 'Distribuidora Centro', p_nota: '',
      p_celulares: [
        { modelo: 'IPHONE 15', capacidad: '', color: '', bateria: '', detalles: '', costo_usd: 1, precio_usd: 2, cantidad: 1 },
        { modelo: 'IPHONE 15', capacidad: '', color: '', bateria: '', detalles: '', costo_usd: 1, precio_usd: 2, cantidad: 0 },
      ],
    }),
    /cantidad/,
  )
  assert.equal(await cuantos('compras'), antes)
  assert.equal(await cuantos('celulares'), equipos)
})
await probar('panel_datos trae las compras con cuantos equipos de cada modelo siguen sin IMEI', async () => {
  const { compras, celulares } = await admin('panel_datos')
  const lote = compras.find((otra) => otra.id === compra)
  assert.deepEqual(lote.modelos.map((modelo) => [modelo.modelo, modelo.unidades, modelo.sin_imei, modelo.costo_usd]), [
    ['IPHONE 18 PRO', 3, 2, 3300],
    ['IPHONE FOLD', 2, 2, 3600],
  ])
  const unidad18 = celulares.find((otra) => otra.clave === CLAVE_18)
  assert.equal(unidad18.compra_id, compra)
  assert.ok(unidad18.proveedor_id > 0)
})
await probar('cargar_imeis reparte la lista entre los equipos sin IMEI y avisa los errores', async () => {
  const cargar = (imeis, extra = {}) => admin('cargar_imeis', { p_clave: CLAVE_18, p_imeis: imeis, p_compra: compra, ...extra })
  await rechaza(cargar(['351818181818182', ' 351818181818182 ']), /repetido/)
  await rechaza(cargar(['351818181818181']), /351818181818181 ya está cargado/)
  await rechaza(cargar([' ']), /No hay IMEI/)
  assert.equal(await cargar(['351818181818182', '351818181818183']), 2)
  const imeis = (await sql(`select imei from public.celulares where clave = $1 order by id`, [CLAVE_18])).map((fila) => fila.imei)
  assert.deepEqual(imeis, ['351818181818181', '351818181818182', '351818181818183'])
  await rechaza(cargar(['351818181818184']), /solo 0 equipos/)
  // Un rechazo no deja IMEI a medias.
  assert.equal((await sql(`select 1 from public.celulares where imei = '351818181818184'`)).length, 0)
})
await probar('editar un lote pone, cambia o saca el proveedor de sus unidades', async () => {
  const claveFold = 'IPHONE FOLD|512GB|NEGRO|100%|SELLADO'
  const editar = (proveedor) => admin('editar_lote', {
    p_tabla: 'celulares', p_clave: claveFold,
    p_datos: { modelo: 'IPHONE FOLD', capacidad: '512GB', color: 'NEGRO', bateria: '100%', detalles: 'SELLADO' },
    p_costo_usd: 1800, p_precio_usd: 2100, p_proveedor: proveedor,
  })
  const proveedores = async () => (await sql(`select p.nombre from public.celulares u left join public.proveedores p on p.id = u.proveedor_id where u.clave = $1`, [claveFold])).map((fila) => fila.nombre)
  await editar('importadora sur')
  assert.deepEqual(await proveedores(), ['IMPORTADORA SUR', 'IMPORTADORA SUR'])
  await editar(null)
  assert.deepEqual(await proveedores(), ['IMPORTADORA SUR', 'IMPORTADORA SUR'])
  await editar('')
  assert.deepEqual(await proveedores(), [null, null])
})

// ===========================================================================
console.log('\nlistas de opciones y combos')
await probar('el dueno agrega y saca opciones de los desplegables', async () => {
  await admin('agregar_opcion', { p_lista: 'modelo', p_valor: ' iphone 18  pro max ' })
  assert.ok(await opcion('modelo', 'IPHONE 18 PRO MAX'))
  await admin('agregar_opcion', { p_lista: 'tipo', p_valor: 'cable magsafe' })
  assert.ok(await opcion('tipo', 'CABLE MAGSAFE'))
  await admin('quitar_opcion', { p_lista: 'tipo', p_valor: 'CABLE MAGSAFE' })
  assert.ok(!(await opcion('tipo', 'CABLE MAGSAFE')))
  await rechaza(admin('agregar_opcion', { p_lista: 'modelo', p_valor: '  ' }), /Escribí el valor/)
  await rechaza(admin('agregar_opcion', { p_lista: 'precio', p_valor: 'X' }), /Lista desconocida/)
  const { opciones } = await admin('panel_datos')
  assert.ok(opciones.some((otra) => otra.lista === 'tipo' && otra.valor === 'CABLE USB-C A LIGHTNING'))
})
let combo
const CARGADOR = 'CARGADOR|20W USB-C|BLANCO|ORIGINAL'
const CABLE = 'CABLE|USB-C 1M||'
await probar('un combo junta accesorios y el catalogo lo muestra mientras alcance el stock', async () => {
  combo = await admin('guardar_combo', { p_id: null, p_datos: { nombre: 'combo cargador completo', precio_usd: 25, partes: [{ clave: CARGADOR, cantidad: 1 }, { clave: CABLE, cantidad: 2 }] } })
  const catalogo = await rpc('catalogo_publico')
  assert.deepEqual(catalogo.combos, [
    // 5 cargadores y 4 cables: alcanzan para 2 combos (cada uno lleva 2 cables).
    { clave: `COMBO|${combo}`, nombre: 'COMBO CARGADOR COMPLETO', detalle: '2 x CABLE USB-C 1M + CARGADOR 20W USB-C', cantidad: 2, precio: 25 },
  ])
  const { combos } = await admin('panel_datos')
  assert.deepEqual(combos[0].partes, [{ clave: CABLE, cantidad: 2 }, { clave: CARGADOR, cantidad: 1 }])
})
await probar('guardar_combo rechaza nombres repetidos, partes que no existen y partes repetidas', async () => {
  const guardar = (datos, id = null) => admin('guardar_combo', { p_id: id, p_datos: { nombre: 'X', precio_usd: 1, partes: [{ clave: CABLE, cantidad: 1 }], ...datos } })
  await rechaza(guardar({ nombre: 'Combo Cargador Completo' }), /Ya hay un combo/)
  await rechaza(guardar({ partes: [{ clave: 'NO|EXISTE||', cantidad: 1 }] }), /ya no existe/)
  await rechaza(guardar({ partes: [{ clave: CABLE, cantidad: 1 }, { clave: CABLE, cantidad: 2 }] }), /dos veces/)
  await rechaza(guardar({ partes: [] }), /al menos un accesorio/)
  await rechaza(guardar({ precio_usd: -1 }), /negativo/)
  assert.equal(await cuantos('combos'), 1)
})
await probar('si se edita un accesorio del combo, el combo lo sigue; sin stock, sale del catalogo', async () => {
  const nueva = await admin('editar_lote', {
    p_tabla: 'accesorios', p_clave: CABLE,
    p_datos: { tipo: 'CABLE', modelo: 'USB-C 1M', color: '', detalles: 'REFORZADO' }, p_costo_usd: 2, p_precio_usd: 6,
  })
  assert.equal(nueva, 'CABLE|USB-C 1M||REFORZADO')
  assert.deepEqual((await sql(`select clave from public.combo_partes where combo_id = $1 order by clave`, [combo])).map((fila) => fila.clave), [nueva, CARGADOR])

  // Se venden 3 cables: queda 1 y el combo pide 2.
  const cables = (await sql(`select id from public.accesorios where clave = $1 and estado = 'disponible' order by id`, [nueva])).map((fila) => Number(fila.id))
  await admin('vender', { p_celulares: [], p_accesorios: cables.slice(0, 3).map((id) => ({ id, precio_usd: 6 })) })
  assert.deepEqual((await rpc('catalogo_publico')).combos, [])

  await admin('eliminar_combo', { p_id: combo })
  assert.equal(await cuantos('combo_partes'), 0)
})

// ===========================================================================
console.log('\nprecio mayorista')
const CLAVE_MAY = 'IPHONE 18 PRO MAX|256GB|NEGRO|100%|'
const mayoristas = async (clave) =>
  (await sql(`select precio_mayorista_usd as precio from public.celulares where clave = $1 and estado <> 'vendido' order by id`, [clave])).map((fila) => (fila.precio === null ? null : Number(fila.precio)))
await probar('un lote se carga con su precio mayorista y las unidades que se suman lo heredan', async () => {
  const datos = { p_modelo: 'iphone 18 pro max', p_capacidad: '256gb', p_color: 'negro', p_bateria: '100%', p_detalles: '', p_costo_usd: 1200, p_precio_usd: 1500 }
  await admin('ingresar_celulares', { ...datos, p_cantidad: 2, p_precio_mayorista_usd: 1350 })
  assert.deepEqual(await mayoristas(CLAVE_MAY), [1350, 1350])
  // Sin decir el mayorista, la unidad nueva toma el del lote.
  await admin('ingresar_celulares', { ...datos, p_cantidad: 1 })
  assert.deepEqual(await mayoristas(CLAVE_MAY), [1350, 1350, 1350])
  // Con otro mayorista, queda el ultimo para todas.
  await admin('ingresar_celulares', { ...datos, p_cantidad: 1, p_precio_mayorista_usd: 1320 })
  assert.deepEqual(await mayoristas(CLAVE_MAY), [1320, 1320, 1320, 1320])
  await rechaza(admin('ingresar_celulares', { ...datos, p_cantidad: 1, p_precio_mayorista_usd: -1 }), /mayorista no puede ser negativo/)
})
await probar('editar un lote cambia o saca el mayorista solo si se pide, y el catalogo nunca lo muestra', async () => {
  const editar = (extra) => admin('editar_lote', {
    p_tabla: 'celulares', p_clave: CLAVE_MAY,
    p_datos: { modelo: 'IPHONE 18 PRO MAX', capacidad: '256GB', color: 'NEGRO', bateria: '100%', detalles: '' },
    p_costo_usd: 1200, p_precio_usd: 1500, ...extra,
  })
  await editar({})
  assert.deepEqual(await mayoristas(CLAVE_MAY), [1320, 1320, 1320, 1320])
  await editar({ p_precio_mayorista_usd: 1300, p_cambiar_mayorista: true })
  assert.deepEqual(await mayoristas(CLAVE_MAY), [1300, 1300, 1300, 1300])
  const { celulares } = await admin('panel_datos')
  assert.equal(celulares.find((unidad) => unidad.clave === CLAVE_MAY).precio_mayorista_usd, 1300)
  const catalogo = JSON.stringify(await rpc('catalogo_publico'))
  assert.ok(!catalogo.includes('mayorista'))
  assert.ok(!catalogo.includes('1300'))
  await editar({ p_precio_mayorista_usd: null, p_cambiar_mayorista: true })
  assert.deepEqual(await mayoristas(CLAVE_MAY), [null, null, null, null])
})
await probar('un lote de compra guarda el mayorista de cada modelo', async () => {
  const { compra: numero } = await admin('ingresar_compra', {
    p_proveedor: 'Distribuidora Centro', p_nota: '',
    p_celulares: [{ modelo: 'IPHONE 17', capacidad: '128GB', color: 'BLANCO', bateria: '100%', detalles: '', costo_usd: 700, precio_usd: 850, precio_mayorista_usd: 790, cantidad: 2 }],
  })
  const filas = await sql(`select precio_mayorista_usd from public.celulares where compra_id = $1`, [numero])
  assert.deepEqual(filas.map((fila) => Number(fila.precio_mayorista_usd)), [790, 790])
})

// ===========================================================================
console.log('\nclientes y su deuda')
const CELULAR_CLIENTE = {
  p_modelo: 'IPHONE 12 MINI', p_capacidad: '64GB', p_color: 'NEGRO', p_bateria: '83%', p_detalles: '',
  p_costo_usd: 200, p_precio_usd: 300, p_cantidad: 2,
}
const filaDeCaja = async (origen, id) => (await admin('caja_datos')).find((fila) => fila.origen === origen && Number(fila.id) === Number(id))
const clienteLlamado = async (nombre) => (await admin('panel_datos')).clientes.find((cliente) => cliente.nombre === nombre)

await probar('vender con nombre registra al cliente, y lo que queda debiendo pasa a su cuenta', async () => {
  await admin('ingresar_celulares', CELULAR_CLIENTE)
  const [libre] = await idsDe('celulares', 'IPHONE 12 MINI')
  const { configuracion } = await admin('panel_datos')
  const total = Math.round(300 * configuracion.cotizacion_dolar)
  const venta = await admin('vender', {
    p_celulares: [{ id: libre, precio_usd: 300 }], p_accesorios: [],
    p_datos: { cliente: 'Marta Gómez', telefono: '388 1234', debe_ars: 100000 },
  })
  const cliente = await clienteLlamado('MARTA GÓMEZ')
  assert.equal(cliente.telefono, '388 1234')
  assert.equal(cliente.saldo_ars, 100000)
  assert.equal(cliente.compras, 1)
  // La caja ve solo lo cobrado en el momento.
  const fila = await filaDeCaja('venta', venta.comprobante)
  assert.equal(fila.efectivo_ars + fila.transferencia_ars, total - 100000)
  // El ticket sabe cuanto quedo debiendo.
  assert.equal((await admin('comprobante_datos', { p_id: venta.comprobante })).debe_ars, 100000)

  // Un pago baja la deuda y entra a la caja.
  const pago = await admin('anotar_cuenta_cliente', { p_cliente: cliente.id, p_tipo: 'pago', p_monto_ars: 40000, p_medio: 'transferencia' })
  assert.equal((await clienteLlamado('MARTA GÓMEZ')).saldo_ars, 60000)
  const cobro = await filaDeCaja('pago_cliente', pago)
  assert.equal(cobro.transferencia_ars, 40000)
  assert.equal(cobro.persona, 'MARTA GÓMEZ')

  const cuenta = await admin('cuenta_cliente', { p_id: cliente.id })
  assert.deepEqual(cuenta.movimientos.map((movimiento) => movimiento.tipo), ['pago', 'deuda'])
  assert.equal(cuenta.compras[0].total_ars, total)

  // La deuda de una venta no se borra a mano; el pago si.
  await rechaza(admin('eliminar_cuenta_cliente', { p_id: cuenta.movimientos[1].id }), /anulá la venta/)
  await rechaza(admin('eliminar_cliente', { p_id: cliente.id }), /tiene deudas o pagos/)
  await admin('eliminar_cuenta_cliente', { p_id: pago })
  assert.equal((await clienteLlamado('MARTA GÓMEZ')).saldo_ars, 100000)

  // Anular la venta entera borra la deuda que dejo.
  await admin('anular_venta', { p_tabla: 'celulares', p_ids: [libre] })
  assert.equal((await clienteLlamado('MARTA GÓMEZ')).saldo_ars, 0)
  await admin('eliminar_cliente', { p_id: cliente.id })
  assert.equal(await clienteLlamado('MARTA GÓMEZ'), undefined)
})
await probar('una deuda necesita al cliente y no puede pasar el total', async () => {
  const [libre] = await idsDe('celulares', 'IPHONE 12 MINI')
  await rechaza(
    admin('vender', { p_celulares: [{ id: libre, precio_usd: 300 }], p_accesorios: [], p_datos: { debe_ars: 1000 } }),
    /nombre del cliente/,
  )
  await rechaza(
    admin('vender', { p_celulares: [{ id: libre, precio_usd: 300 }], p_accesorios: [], p_datos: { cliente: 'X', debe_ars: 99999999 } }),
    /más que el total/,
  )
  // Nada quedo a medias: el equipo sigue en el local.
  assert.equal((await unidad('celulares', libre)).estado, 'disponible')
})
await probar('un cliente se carga a mano, con deuda vieja, y corregir su nombre corrige sus ventas', async () => {
  const id = await admin('guardar_cliente', { p_id: null, p_datos: { nombre: 'juan perez', documento: '30111222' } })
  await rechaza(admin('guardar_cliente', { p_id: null, p_datos: { nombre: 'Juan  Pérez' } }), /Ya hay un cliente/)
  await admin('anotar_cuenta_cliente', { p_cliente: id, p_tipo: 'deuda', p_monto_ars: 50000, p_detalle: 'Saldo anterior' })
  await rechaza(admin('anotar_cuenta_cliente', { p_cliente: id, p_tipo: 'pago', p_monto_ars: 0, p_medio: 'efectivo' }), /mayor que cero/)
  const [libre] = await idsDe('celulares', 'IPHONE 12 MINI')
  const venta = await admin('vender', { p_celulares: [{ id: libre, precio_usd: 300 }], p_accesorios: [], p_datos: { cliente: 'Juan Perez' } })
  assert.equal((await sql(`select cliente_id from public.comprobantes where id = $1`, [venta.comprobante]))[0].cliente_id, id)
  await admin('guardar_cliente', { p_id: id, p_datos: { nombre: 'Juan Carlos Perez', documento: '30111222' } })
  assert.equal((await sql(`select cliente from public.comprobantes where id = $1`, [venta.comprobante]))[0].cliente, 'JUAN CARLOS PEREZ')
  assert.equal((await clienteLlamado('JUAN CARLOS PEREZ')).saldo_ars, 50000)
})

// ===========================================================================
console.log('\ndeuda con proveedores')
await probar('un lote que queda debiendo suma a la cuenta del proveedor y los pagos la bajan', async () => {
  const { compra } = await admin('ingresar_compra', {
    p_proveedor: 'Importadora Norte', p_nota: '', p_deuda_usd: 1000,
    p_celulares: [{ modelo: 'IPHONE 16', capacidad: '256GB', color: 'ROSA', bateria: '100%', detalles: '', costo_usd: 500, precio_usd: 650, cantidad: 2 }],
  })
  const deLaLista = async () => (await admin('panel_datos')).proveedores.find((proveedor) => proveedor.nombre === 'IMPORTADORA NORTE')
  const proveedor = await deLaLista()
  assert.equal(proveedor.deuda_usd, 1000)
  assert.equal(proveedor.pagado_usd, 0)
  assert.equal((await admin('panel_datos')).compras.find((otra) => otra.id === compra).deuda_usd, 1000)

  // Un pago en pesos se pasa a dolares con el dolar de costo del dia.
  const { configuracion } = await admin('panel_datos')
  const dolarCosto = configuracion.cotizacion_costo ?? configuracion.cotizacion_dolar
  const pago = await admin('guardar_movimiento', {
    p_id: null, p_datos: { tipo: 'egreso', categoria: 'PROVEEDOR', monto_ars: 400 * dolarCosto, medio: 'efectivo', proveedor: 'Importadora Norte' },
  })
  assert.equal((await deLaLista()).pagado_usd, 400)
  // Si cambia el dolar, el pago sigue valiendo los dolares de ese dia.
  await admin('guardar_configuracion', { p_cotizacion_dolar: configuracion.cotizacion_dolar, p_cotizacion_costo: dolarCosto * 2 })
  await admin('guardar_movimiento', {
    p_id: pago, p_datos: { tipo: 'egreso', categoria: 'PROVEEDOR', monto_ars: 400 * dolarCosto, medio: 'efectivo', proveedor: 'Importadora Norte' },
  })
  assert.equal((await deLaLista()).pagado_usd, 400)
  await admin('guardar_configuracion', { p_cotizacion_dolar: configuracion.cotizacion_dolar, p_cotizacion_costo: configuracion.cotizacion_costo })

  const deuda = await admin('anotar_deuda_proveedor', { p_proveedor: proveedor.id, p_monto_usd: 250, p_detalle: 'Saldo anterior' })
  assert.equal((await deLaLista()).deuda_usd, 1250)
  const cuenta = await admin('cuenta_proveedor', { p_id: proveedor.id })
  assert.deepEqual(cuenta.map((fila) => fila.clase).sort(), ['deuda', 'deuda', 'pago'])
  assert.equal(cuenta.find((fila) => fila.clase === 'pago').monto_usd, 400)

  await rechaza(admin('eliminar_proveedor', { p_id: proveedor.id }), /No se puede eliminar/)
  await admin('eliminar_deuda_proveedor', { p_id: deuda })
  assert.equal((await deLaLista()).deuda_usd, 1000)
  await rechaza(admin('anotar_deuda_proveedor', { p_proveedor: proveedor.id, p_monto_usd: -5 }), /mayor que cero/)
})
await probar('un lote pagado en el momento no deja deuda', async () => {
  await admin('ingresar_compra', {
    p_proveedor: 'Importadora Sur', p_nota: '',
    p_celulares: [{ modelo: 'IPHONE 16', capacidad: '128GB', color: 'ROSA', bateria: '100%', detalles: '', costo_usd: 450, precio_usd: 600, cantidad: 1 }],
  })
  const proveedor = (await admin('panel_datos')).proveedores.find((otro) => otro.nombre === 'IMPORTADORA SUR')
  assert.equal(proveedor.deuda_usd, 0)
})

// ===========================================================================
console.log('\nIMEI de equipos que vuelven')
await probar('un equipo vendido puede volver a entrar con su IMEI, uno en el local no se repite', async () => {
  const imei = '359999000000017'
  await admin('ingresar_celulares', { ...CELULAR_CLIENTE, p_modelo: 'IPHONE 12 PRO', p_cantidad: 1, p_imeis: [imei] })
  const [equipo] = await idsDe('celulares', 'IPHONE 12 PRO')
  await rechaza(admin('ingresar_celulares', { ...CELULAR_CLIENTE, p_modelo: 'IPHONE 12 PRO', p_cantidad: 1, p_imeis: [imei] }), /duplicate key|celulares_imei_activo/)
  await admin('vender', { p_celulares: [{ id: equipo, precio_usd: 300 }], p_accesorios: [] })
  // Vuelve en una permuta, con el mismo IMEI.
  await admin('registrar_permuta', {
    p_recibido: { modelo: 'IPHONE 12 PRO', capacidad: '64GB', color: 'NEGRO', bateria: '80%', detalles: '', imei, valor_usd: 150 },
  })
  const encontrados = await admin('buscar_imei', { p_imei: imei })
  assert.deepEqual(encontrados.map((fila) => fila.estado).sort(), ['disponible', 'vendido'])
  await rechaza(admin('cargar_imeis', { p_clave: 'X', p_imeis: [imei] }), /ya está cargado/)
  // Anular la venta vieja chocaria con el que esta en el local.
  await rechaza(admin('anular_venta', { p_tabla: 'celulares', p_ids: [equipo] }), /duplicate key|celulares_imei_activo/)
})

// ===========================================================================
console.log('\npapel del ticket')
await probar('el alto de la hoja se guarda y 0 es rollo continuo', async () => {
  await admin('guardar_ajustes', { p_datos: { ticket_ancho_mm: 50, ticket_alto_mm: 60 } })
  let { configuracion } = await admin('panel_datos')
  assert.equal(configuracion.ticket_ancho_mm, 50)
  assert.equal(configuracion.ticket_alto_mm, 60)
  await admin('guardar_ajustes', { p_datos: { ticket_alto_mm: 0 } })
  ;({ configuracion } = await admin('panel_datos'))
  assert.equal(configuracion.ticket_alto_mm, 0)
  await rechaza(admin('guardar_ajustes', { p_datos: { ticket_alto_mm: 10 } }), /configuracion_ticket_alto_valido/)
})

// ===========================================================================
console.log('\nrevendedores: los pagos se descuentan equipo por equipo')
await probar('cada pago pasa a vendido los equipos que ya cubre, del primero que se llevo al ultimo', async () => {
  await admin('ingresar_celulares', { ...CELULAR_CLIENTE, p_modelo: 'IPHONE 11 PRO', p_cantidad: 3 })
  const [uno, dos, tres] = await idsDe('celulares', 'IPHONE 11 PRO')
  const { configuracion } = await admin('panel_datos')
  const dolar = configuracion.cotizacion_dolar
  await admin('entregar_a_cuenta', {
    p_tipo: 'revendedor', p_nombre: 'Pedro Ruiz', p_accesorios: [],
    p_celulares: [{ id: uno, precio_usd: 300 }, { id: dos, precio_usd: 300 }, { id: tres, precio_usd: 300 }],
    p_pago_ars: 100 * dolar,
  })
  assert.equal((await unidad('celulares', uno)).estado, 'revendedor', 'con 100 no alcanza para ninguno')

  // Entrega 250 mas: cubre el primero (300) y le quedan 50 a cuenta del segundo.
  assert.equal(await admin('registrar_pago', { p_tipo: 'revendedor', p_nombre: 'PEDRO RUIZ', p_monto_ars: 250 * dolar }), false)
  assert.deepEqual([(await unidad('celulares', uno)).estado, (await unidad('celulares', dos)).estado], ['vendido', 'revendedor'])
  assert.equal(Number((await unidad('celulares', uno)).precio_usd), 300)
  assert.equal(Number(await admin('entregado_de_cuenta', { p_tipo: 'revendedor', p_nombre: 'PEDRO RUIZ' })), 50)
  const [comprobante] = await sql(`select c.origen, c.cliente from public.comprobantes c join public.celulares u on u.comprobante_id = c.id where u.id = $1`, [uno])
  assert.deepEqual(comprobante, { origen: 'revendedor', cliente: 'PEDRO RUIZ' })

  // Lo que muestra el panel: la cuenta ya no tiene el primero y el segundo lleva 50 pagados.
  const panel = await admin('panel_datos')
  const [cuenta] = armarCuentas({
    tipo: 'revendedor', celulares: panel.celulares, accesorios: panel.accesorios,
    pagos: panel.pagos_revendedor, cotizaciones: { venta: dolar, costo: configuracion.cotizacion_costo },
  }).filter((otra) => otra.nombre === 'PEDRO RUIZ')
  assert.deepEqual(cuenta.unidades.map((equipo) => [equipo.id, equipo.pagado_usd]), [[dos, 50], [tres, 0]])

  // El pago que cubre todo cierra la cuenta como siempre.
  assert.equal(await admin('registrar_pago', { p_tipo: 'revendedor', p_nombre: 'PEDRO RUIZ', p_monto_ars: 550 * dolar }), true)
  assert.equal((await unidad('celulares', tres)).estado, 'vendido')
  assert.ok((await pagosDe('pagos_revendedor', 'PEDRO RUIZ')).every((pago) => pago.aplicado === true))
})
await probar('en las señas no se descuenta equipo por equipo', async () => {
  await admin('ingresar_celulares', { ...CELULAR_CLIENTE, p_modelo: 'IPHONE 11', p_cantidad: 2 })
  const [uno, dos] = await idsDe('celulares', 'IPHONE 11')
  const { configuracion } = await admin('panel_datos')
  await admin('entregar_a_cuenta', {
    p_tipo: 'sena', p_nombre: 'Cliente Tres', p_accesorios: [],
    p_celulares: [{ id: uno, precio_usd: 300 }, { id: dos, precio_usd: 300 }],
    p_pago_ars: 400 * configuracion.cotizacion_dolar,
  })
  assert.deepEqual([(await unidad('celulares', uno)).estado, (await unidad('celulares', dos)).estado], ['senado', 'senado'])
})

// ===========================================================================
console.log('\ngarantias con el proveedor')
await probar('mandar un equipo al proveedor descuenta su costo de la deuda', async () => {
  const deLaLista = async () => (await admin('panel_datos')).proveedores.find((proveedor) => proveedor.nombre === 'IMPORTADORA NORTE')
  const antes = (await deLaLista()).deuda_usd
  const [vendido] = await idsDe('celulares', 'IPHONE 11 PRO', 'vendido')

  const envio = await admin('anotar_envio', {
    p_datos: { proveedor: 'importadora norte', celular_id: vendido, equipo: 'iPhone 11 Pro 64GB', imei: '35-999', cliente: 'pedro', falla: 'No carga', monto_usd: 200 },
  })
  assert.equal((await deLaLista()).deuda_usd, antes - 200)
  await rechaza(admin('anotar_envio', { p_datos: { proveedor: 'Importadora Norte', celular_id: vendido, equipo: 'X', monto_usd: 200 } }), /ya está anotado/)

  let [fila] = (await admin('envios_datos')).filter((otro) => otro.id === envio)
  assert.deepEqual([fila.estado, fila.proveedor, fila.equipo, fila.imei, fila.cliente, fila.monto_usd], ['por_enviar', 'IMPORTADORA NORTE', 'IPHONE 11 PRO 64GB', '35999', 'PEDRO', 200])

  // En la cuenta del proveedor figura como garantia, y no se borra desde ahi.
  const cuenta = await admin('cuenta_proveedor', { p_id: fila.proveedor_id })
  const descuento = cuenta.find((otra) => otra.clase === 'garantia')
  assert.equal(descuento.monto_usd, 200)
  await rechaza(admin('eliminar_deuda_proveedor', { p_id: descuento.id }), /Garantías/)
  await rechaza(admin('eliminar_proveedor', { p_id: fila.proveedor_id }), /No se puede eliminar/)

  await admin('marcar_envio', { p_id: envio, p_estado: 'enviado' })
  ;[fila] = (await admin('envios_datos')).filter((otro) => otro.id === envio)
  assert.equal(fila.estado, 'enviado')
  assert.ok(fila.fecha_enviado)

  // Volvio arreglado: se le vuelve a deber.
  await admin('marcar_envio', { p_id: envio, p_estado: 'volvio' })
  assert.equal((await deLaLista()).deuda_usd, antes)
  await rechaza(admin('marcar_envio', { p_id: envio, p_estado: 'descontado' }), /ya está cerrado/)
})
await probar('si el proveedor se lo queda el descuento queda, y borrar el envio lo quita', async () => {
  const deLaLista = async () => (await admin('panel_datos')).proveedores.find((proveedor) => proveedor.nombre === 'IMPORTADORA SUR')
  const antes = (await deLaLista()).deuda_usd
  const envio = await admin('anotar_envio', { p_datos: { proveedor: 'Importadora Sur', equipo: 'iPhone 16 128GB', monto_usd: 450, enviado: true } })
  const [fila] = (await admin('envios_datos')).filter((otro) => otro.id === envio)
  assert.equal(fila.estado, 'enviado')
  await admin('marcar_envio', { p_id: envio, p_estado: 'descontado' })
  assert.equal((await deLaLista()).deuda_usd, antes - 450)

  // Sin descuento no queda nada en la cuenta.
  const sinMonto = await admin('anotar_envio', { p_datos: { proveedor: 'Importadora Sur', equipo: 'Funda', monto_usd: 0 } })
  assert.equal((await deLaLista()).deuda_usd, antes - 450)
  await admin('eliminar_envio', { p_id: sinMonto })
  await admin('eliminar_envio', { p_id: envio })
  assert.equal((await deLaLista()).deuda_usd, antes)
  await rechaza(admin('eliminar_envio', { p_id: envio }), /ya no existe/)
  await rechaza(admin('anotar_envio', { p_datos: { proveedor: '', equipo: 'X' } }), /proveedor/)
  await rechaza(admin('anotar_envio', { p_datos: { proveedor: 'Importadora Sur', equipo: ' ' } }), /qué equipo/)
  await rechaza(admin('anotar_envio', { p_datos: { proveedor: 'Importadora Sur', equipo: 'X', monto_usd: -1 } }), /negativo/)
})
await probar('las garantias de celulares traen el proveedor y el costo', async () => {
  // Uno de los IPHONE 16 del lote de Importadora Norte.
  const [{ id }] = await sql(`select id from public.celulares where modelo = 'IPHONE 16' and color = 'ROSA' and capacidad = '256GB' and estado = 'disponible' limit 1`)
  const libre = Number(id)
  await admin('vender', { p_celulares: [{ id: libre, precio_usd: 650 }], p_accesorios: [] })
  const celular = (await admin('garantias_datos')).find((fila) => fila.tabla === 'celulares' && fila.id === libre)
  const proveedor = (await admin('panel_datos')).proveedores.find((otro) => otro.id === celular.proveedor_id)
  assert.equal(proveedor.nombre, 'IMPORTADORA NORTE')
  assert.equal(celular.costo_usd, 500)
})

// ===========================================================================
console.log('\nticket: quien atendio, condiciones y duplicado')
await probar('la lista de vendedores se maneja como las demas', async () => {
  await admin('agregar_opcion', { p_lista: 'vendedor', p_valor: ' román ' })
  const opciones = (await admin('panel_datos')).opciones.filter((opcion) => opcion.lista === 'vendedor')
  assert.deepEqual(opciones.map((opcion) => opcion.valor), ['ROMÁN'])
  await rechaza(admin('agregar_opcion', { p_lista: 'otra', p_valor: 'X' }), /Lista desconocida/)
})
await probar('la venta guarda quien atendio y el ticket lo trae', async () => {
  const [libre] = await idsDe('celulares', 'IPHONE 13')
  const { comprobante: numero } = await admin('vender', {
    p_celulares: [{ id: libre, precio_usd: 400 }], p_accesorios: [], p_datos: { vendedor: ' román ' },
  })
  assert.equal((await admin('comprobante_datos', { p_id: numero })).vendedor, 'ROMÁN')
  await admin('anular_venta', { p_tabla: 'celulares', p_ids: [libre] })
  // Sin vendedor (o con el sitio viejo) queda vacio.
  const [otro] = await idsDe('celulares', 'IPHONE 13')
  const { comprobante: sinVendedor } = await admin('vender', { p_celulares: [{ id: otro, precio_usd: 400 }], p_accesorios: [] })
  assert.equal((await admin('comprobante_datos', { p_id: sinVendedor })).vendedor, '')
  await admin('anular_venta', { p_tabla: 'celulares', p_ids: [otro] })
})
await probar('la orden de servicio guarda quien la recibio y no cambia al editarla', async () => {
  const id = await admin('guardar_servicio', { p_id: null, p_datos: { cliente: 'ana', equipo: 'iphone 11', vendedor: 'román' } })
  await admin('guardar_servicio', { p_id: id, p_datos: { cliente: 'ana', equipo: 'iphone 11', vendedor: 'otro', estado: 'reparando' } })
  const orden = (await admin('servicios_datos')).find((fila) => Number(fila.id) === Number(id))
  assert.equal(orden.vendedor, 'ROMÁN')
  await admin('eliminar_servicio', { p_id: id })
})
await probar('condiciones de garantia y duplicado se cargan en Ajustes', async () => {
  let configuracion = (await admin('panel_datos')).configuracion
  assert.match(configuracion.ticket_condiciones, /^La garantía cubre fallas de funcionamiento\./)
  assert.equal(configuracion.ticket_duplicado, true)
  await admin('guardar_ajustes', { p_datos: { ticket_condiciones: '  Cambios   en 7 días ', ticket_duplicado: false } })
  configuracion = (await admin('panel_datos')).configuracion
  assert.equal(configuracion.ticket_condiciones, 'Cambios en 7 días')
  assert.equal(configuracion.ticket_duplicado, false)
  // Lo que no se manda queda como estaba.
  await admin('guardar_ajustes', { p_datos: { ticket_pie: 'Gracias' } })
  assert.equal((await admin('panel_datos')).configuracion.ticket_duplicado, false)
  await rechaza(admin('guardar_ajustes', { p_datos: { ticket_condiciones: 'x'.repeat(601) } }), /configuracion_ticket_condiciones_largo/)
})

// ===========================================================================
console.log('\nImport Salta: cuotas, tarjeta y actas de garantia')
// Un trazo de firma como lo manda el panel (ver panel/Firma.jsx).
const FIRMA = 'M 40 120 L 80 60 L 120 140 L 160 70'

await probar('los planes de cuotas se guardan ordenados y salen en el catalogo publico', async () => {
  await admin('guardar_ajustes', {
    p_datos: { cuotas_planes: [{ cuotas: 9, recargo: 25 }, { cuotas: 3, recargo: 0 }, { cuotas: 6, recargo: 12.5 }], cuotas_leyenda: '  Visa y  Master ' },
  })
  const configuracion = (await admin('panel_datos')).configuracion
  assert.deepEqual(configuracion.cuotas_planes, [{ cuotas: 3, recargo: 0 }, { cuotas: 6, recargo: 12.5 }, { cuotas: 9, recargo: 25 }])
  const publico = await rpc('catalogo_publico')
  assert.deepEqual(publico.cuotas, { planes: configuracion.cuotas_planes, leyenda: 'Visa y Master', accesorios: false })
  // Lo que no se manda queda como estaba.
  await admin('guardar_ajustes', { p_datos: { ticket_pie: 'Gracias' } })
  assert.equal((await admin('panel_datos')).configuracion.cuotas_planes.length, 3)
  await rechaza(admin('guardar_ajustes', { p_datos: { cuotas_planes: [{ cuotas: 3 }, { cuotas: 3 }] } }), /repetido/)
  await rechaza(admin('guardar_ajustes', { p_datos: { cuotas_planes: [{ cuotas: 1, recargo: 0 }] } }), /2 a 48/)
  await rechaza(admin('guardar_ajustes', { p_datos: { cuotas_planes: [{ cuotas: 6, recargo: -1 }] } }), /recargo/)
})

await probar('vender con tarjeta guarda las cuotas, y en la caja va con lo del banco', async () => {
  const [libre] = await idsDe('celulares', 'IPHONE 11')
  const { comprobante } = await admin('vender', {
    p_celulares: [{ id: libre, precio_usd: 200 }], p_accesorios: [],
    p_datos: { cliente: 'Juan Pérez', medio: 'tarjeta', cuotas: 6, recargo_pct: 12.5 },
  })
  const datos = await admin('comprobante_datos', { p_id: comprobante })
  assert.deepEqual([datos.medio, datos.cuotas, Number(datos.recargo_pct), datos.efectivo_ars], ['tarjeta', 6, 12.5, null])
  const fila = (await admin('caja_datos')).find((otra) => otra.origen === 'venta' && Number(otra.id) === comprobante)
  const cotizacion = (await admin('panel_datos')).configuracion.cotizacion_dolar
  assert.deepEqual([Number(fila.efectivo_ars), Number(fila.transferencia_ars)], [0, 200 * cotizacion])
  const venta = (await admin('ventas_datos')).comprobantes.find((otro) => Number(otro.id) === comprobante)
  assert.equal(venta.cuotas, 6)

  // Pasarla a efectivo borra las cuotas.
  await admin('editar_comprobante', { p_id: comprobante, p_datos: { cliente: 'Juan Pérez', medio: 'efectivo', cuotas: 6 } })
  const editada = await admin('comprobante_datos', { p_id: comprobante })
  assert.deepEqual([editada.medio, editada.cuotas, editada.recargo_pct], ['efectivo', null, null])
  // Con tarjeta y sin cuotas es un pago en 1.
  await admin('editar_comprobante', { p_id: comprobante, p_datos: { cliente: 'Juan Pérez', medio: 'tarjeta' } })
  assert.equal((await admin('comprobante_datos', { p_id: comprobante })).cuotas, 1)
  await rechaza(
    admin('editar_comprobante', { p_id: comprobante, p_datos: { cliente: 'Juan Pérez', medio: 'tarjeta', cuotas: 99 } }),
    /1 a 48/,
  )
  await admin('anular_venta', { p_tabla: 'celulares', p_ids: [libre] })
})

await probar('un acta necesita las dos firmas y la revision completa', async () => {
  // Un equipo nuevo, para no depender de lo que vendieron las pruebas anteriores.
  const [{ id: nuevo }] = await sql(`insert into public.celulares (modelo, capacidad, color, bateria, costo_usd, precio_usd)
                                     values ('IPHONE 13 PRO', '256GB', 'GRAFITO', '91%', 450, 540) returning id`)
  const libre = Number(nuevo)
  const { comprobante } = await admin('vender', {
    p_celulares: [{ id: libre, precio_usd: 540 }], p_accesorios: [],
    p_datos: { cliente: 'Lucía Gómez', telefono: '387 555555', garantia_celulares: 30 },
  })
  const revision = [
    { punto: 'Cámara trasera', estado: 'ok' },
    { punto: 'Batería', estado: 'detalle', nota: 'Condición 91 %' },
    { punto: 'Face ID', estado: 'ok' },
  ]
  const base = { celular_id: libre, vendedor: 'Facundo', revision, firma_cliente: FIRMA, firma_vendedor: FIRMA }

  await rechaza(admin('registrar_acta', { p_datos: { ...base, firma_cliente: '' } }), /firma del cliente/)
  await rechaza(admin('registrar_acta', { p_datos: { ...base, firma_vendedor: 'M 10 10' } }), /firma del vendedor/)
  await rechaza(admin('registrar_acta', { p_datos: { ...base, firma_cliente: '<script>' } }), /firma del cliente/)
  await rechaza(admin('registrar_acta', { p_datos: { ...base, vendedor: ' ' } }), /quién entrega/)
  await rechaza(admin('registrar_acta', { p_datos: { ...base, revision: [] } }), /revisión/)
  await rechaza(admin('registrar_acta', { p_datos: { ...base, revision: [{ punto: 'Pantalla', estado: '' }] } }), /Falta revisar: Pantalla/)
  await rechaza(admin('registrar_acta', { p_datos: { ...base, revision: [{ punto: 'Pantalla', estado: 'detalle' }] } }), /cuál es el detalle de: Pantalla/)
  assert.equal(Number((await sql('select count(*) from public.actas'))[0].count), 0)

  // Sin cliente escrito, toma el de la venta.
  const id = await admin('registrar_acta', { p_datos: base })
  const acta = await admin('acta_datos', { p_id: id })
  assert.deepEqual(
    [acta.equipo, acta.imei, acta.bateria, acta.cliente, acta.vendedor, acta.garantia_dias, Number(acta.comprobante_id)],
    ['IPHONE 13 PRO 256GB GRAFITO', '', '91%', 'LUCÍA GÓMEZ', 'FACUNDO', 30, comprobante],
  )
  assert.equal(acta.firma_cliente, FIRMA)
  assert.deepEqual(acta.revision[1], { punto: 'Batería', estado: 'detalle', nota: 'Condición 91 %' })
  assert.match(acta.condiciones, /^El comercio garantiza/)

  // Las condiciones quedan como estaban el dia que se firmo.
  await admin('guardar_ajustes', { p_datos: { acta_condiciones: 'Otras condiciones' } })
  assert.match((await admin('acta_datos', { p_id: id })).condiciones, /^El comercio garantiza/)

  // La lista no trae las firmas; la garantia sabe que ya tiene acta.
  const [enLista] = await admin('actas_datos')
  assert.deepEqual([Number(enLista.id), enLista.detalles, 'firma_cliente' in enLista], [id, 1, false])
  const garantia = (await admin('garantias_datos')).find((fila) => fila.tabla === 'celulares' && Number(fila.id) === libre)
  assert.equal(Number(garantia.acta_id), id)

  // Un equipo que no esta vendido no lleva acta; uno de afuera del panel, si, con su descripcion.
  const [enElLocal] = await idsDe('celulares', 'IPHONE 14')
  await rechaza(admin('registrar_acta', { p_datos: { ...base, celular_id: enElLocal } }), /no figura como vendido/)
  await rechaza(admin('registrar_acta', { p_datos: { ...base, celular_id: null, cliente: 'Ana' } }), /qué equipo/)
  const suelta = await admin('registrar_acta', { p_datos: { ...base, celular_id: null, cliente: 'Ana', equipo: 'iphone 12 negro' } })
  assert.equal((await admin('acta_datos', { p_id: suelta })).equipo, 'IPHONE 12 NEGRO')

  // Visitantes y usuarios ajenos no ven ni hacen actas.
  await rechaza(rpc('actas_datos'), /permission denied/)
  await rechaza(rpc('registrar_acta', { p_datos: base }, { usuario: AJENO }), /No autorizado/)
  await rechaza(como('anon', null, 'select * from public.actas'), /permission denied/)
  assert.deepEqual(await como('authenticated', AJENO, 'select * from public.actas'), [])

  await admin('eliminar_acta', { p_id: suelta })
  await rechaza(admin('acta_datos', { p_id: suelta }), /ya no existe/)
  await admin('guardar_ajustes', { p_datos: { acta_condiciones: 'El comercio garantiza el equipo.' } })
})

await probar('la lista de la revision se edita en Ajustes, sin repetidos ni vacios', async () => {
  await admin('guardar_ajustes', { p_datos: { revision_puntos: [' Pantalla ', 'pantalla', '', 'Cámara trasera'] } })
  assert.deepEqual((await admin('panel_datos')).configuracion.revision_puntos, ['Pantalla', 'Cámara trasera'])
  await rechaza(admin('guardar_ajustes', { p_datos: { revision_puntos: ['', ' '] } }), /al menos un punto/)
})

// ===========================================================================
console.log('\nlas migraciones se pueden aplicar dos veces sin romper nada')
await probar('segunda pasada', async () => {
  for (const migracion of migraciones) await base.exec(migracion)
  assert.equal((await admin('panel_datos')).configuracion.cotizacion_dolar, 1450)
  // Lo cargado sigue ahi, y las funciones viejas no quedaron duplicadas.
  assert.equal((await admin('panel_datos')).configuracion.garantia_dias_celulares, 90)
  const [libre] = await idsDe('celulares', 'IPHONE 13')
  const venta = await admin('vender', { p_celulares: [{ id: libre, precio_usd: 400 }], p_accesorios: [] })
  assert.equal(venta.unidades, 1)
  await admin('anular_venta', { p_tabla: 'celulares', p_ids: [libre] })
  await rechaza(rpc('panel_datos'), /permission denied/)
})

await base.close()
console.log(fallas ? `\n${fallas} prueba(s) FALLARON.` : '\nTodas las pruebas pasaron.')
process.exitCode = fallas ? 1 : 0
