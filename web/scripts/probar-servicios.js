// scripts/probar-servicios.js
// Prueba las funciones puras de web/src/servicios/. No necesita base ni red.
// Uso:  npm run probar

import assert from 'node:assert/strict'
import { describir, normalizar } from '../src/servicios/texto.js'
import { aDiezmilesimos, promediar, promedio, sumar } from '../src/servicios/lotes.js'
import { familiaDeCelular, marcaDe, ordenarLotes } from '../src/servicios/orden.js'
import { aDolares, aPesos, precioPorCantidad, resolverTramo } from '../src/servicios/precios.js'
import { armarCatalogo } from '../src/servicios/catalogo.js'
import { agruparPorFamilia, armarStock, resumirStock, tituloDeFamilia } from '../src/servicios/stock.js'
import { armarCuentas, equiposCubiertos } from '../src/servicios/cuentas.js'
import { aCsv, armarVentas, calcularUnidad, mesDe, totalizar } from '../src/servicios/ventas.js'
import zxing from '@zxing/library'
import { armarAvisos } from '../src/servicios/avisos.js'
import { armarCaja, cajaACsv, diaDe, filtrarCaja, resumirCaja } from '../src/servicios/caja.js'
import { PATRONES, codificar128 } from '../src/servicios/codigo128.js'
import {
  DEUDA_VACIA, armarComprobante, codigoDeServicio, codigoDeVenta, leerCodigoDeTicket, montoDeDeuda, numeroDeTicket, paginaDeTicket, problemaDeDeuda, repartirCobro,
  cobroParaLaBase, pagoConTarjeta, textoDeTarjeta,
} from '../src/servicios/comprobante.js'
import { armarGarantias, textoDeGarantia, venceGarantia } from '../src/servicios/garantias.js'
import { cuotasDe, nombreDePlan, planMasLargo, planesPara, problemaDePlanes, textoDeRecargo } from '../src/servicios/cuotas.js'
import { firmaATexto, hayFirma, marcarRestantes, problemaDeActa, revisionInicial } from '../src/servicios/actas.js'
import { nombreDeModelo } from '../src/servicios/texto.js'
import { armarCombos, venderCombo } from '../src/servicios/combos.js'
import { proveedoresDelLote } from '../src/servicios/stock.js'
import { extraerImeis } from '../src/formato.js'
import {
  aEscPos, codificar, columnasDe, fila, mapaDeCodigo, mapaDeImagen, partir, renglonesDeEtiquetas, renglonesDeServicio, renglonesDeVenta,
  ticketDeVenta,
} from '../src/servicios/escpos.js'

let pasaron = 0
function probar(nombre, prueba) {
  try {
    prueba()
    pasaron += 1
    console.log(`  ok    ${nombre}`)
  } catch (error) {
    console.log(`  FALLA ${nombre}`)
    console.log(`        ${error.message.split('\n').join('\n        ')}`)
    process.exitCode = 1
  }
}
const cerca = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} no es ${b}`)

console.log('texto')
probar('normalizar saca tildes, simbolos y espacios de mas', () => {
  assert.equal(normalizar('  iPhone   13 pró '), 'IPHONE 13 PRO')
  assert.equal(normalizar('Funda (silicona) ñandú'), 'FUNDA SILICONA NANDU')
  assert.equal(normalizar(null), '')
})
probar('describir arma el nombre corto de celulares y accesorios', () => {
  assert.equal(describir({ modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL' }, 'celulares'), 'IPHONE 13 128GB AZUL')
  assert.equal(describir({ tipo: 'FUNDA', modelo: 'SILICONA', color: '' }, 'accesorios'), 'FUNDA SILICONA')
})

console.log('lotes')
probar('promedio ponderado: 3 a 700 y 1 a 720 da 705', () => {
  assert.equal(promedio(aDiezmilesimos(700) * 3 + aDiezmilesimos(720), 4), 705)
  assert.equal(promediar([700, 700, 700, 720]), 705)
})
probar('el promedio se redondea a 4 decimales', () => {
  assert.equal(promediar([100, 100, 101]), 100.3333)
  assert.equal(promediar([]), 0)
})
probar('sumar decimales no arrastra errores', () => {
  assert.equal(sumar([0.1, 0.2]), 0.3)
  assert.equal(sumar([1.1, 2.2, 3.3]), 6.6)
})

console.log('orden')
probar('marca: numero, IPHONE, SE, X, XR y XS son iPhone', () => {
  for (const modelo of ['IPHONE 13', '13 PRO', 'SE 2020', 'X', 'XR', 'XS MAX', 'iphone xr']) {
    assert.equal(marcaDe(modelo), 'IPHONE', modelo)
  }
  assert.equal(marcaDe('SAMSUNG S23'), 'SAMSUNG')
  // "XIAOMI" empieza con X pero no es la palabra X.
  assert.equal(marcaDe('XIAOMI 13'), 'XIAOMI')
})
probar('familia: el modelo sin la palabra IPHONE', () => {
  assert.equal(familiaDeCelular('IPHONE 13 PRO'), '13 PRO')
  assert.equal(familiaDeCelular('SAMSUNG S23'), 'SAMSUNG S23')
})
probar('orden: iPhone primero, letras antes que numeros, natural, y precio dentro de la familia', () => {
  const lote = (modelo, precio_usd) => ({ clave: `${modelo}|${precio_usd}`, marca: marcaDe(modelo), familia: familiaDeCelular(modelo), precio_usd })
  const ordenados = ordenarLotes([
    lote('SAMSUNG S23', 460), lote('IPHONE 14', 610), lote('IPHONE 13 PRO', 540), lote('MOTOROLA G54', 195),
    lote('IPHONE 13', 420), lote('IPHONE 13', 400), lote('IPHONE XR', 175), lote('IPHONE 8', 120),
    lote('IPHONE SE', 140), lote('IPHONE 11', 230),
  ]).map((l) => `${l.familia} ${l.precio_usd}`)
  assert.deepEqual(ordenados, [
    'SE 140', 'XR 175', '8 120', '11 230', '13 400', '13 420', '13 PRO 540', '14 610', 'MOTOROLA G54 195', 'SAMSUNG S23 460',
  ])
})

console.log('precios')
probar('pesos se redondean a entero y dolares a 4 decimales', () => {
  assert.equal(aPesos(10.5, 1234.5), 12962)
  assert.equal(aDolares(400000, 1450), 275.8621)
})
probar('un tramo en pesos es fijo y uno en dolares sigue la cotizacion', () => {
  assert.deepEqual(resolverTramo({ desde: 3, moneda: 'ars', precio: 5000 }, 1000), { desde: 3, precio_ars: 5000, precio_usd: 5 })
  assert.deepEqual(resolverTramo({ desde: 10, moneda: 'usd', precio: 4 }, 1250), { desde: 10, precio_ars: 5000, precio_usd: 4 })
})
probar('precio por cantidad: vale el tramo con el mayor "desde" que no la supere', () => {
  const tramos = [{ desde: 10, moneda: 'usd', precio: 4 }, { desde: 3, moneda: 'ars', precio: 5000 }]
  const pedir = (cantidad) => precioPorCantidad({ tramos, cantidad, precioListaUsd: 6, cotizacion: 1000 })
  assert.deepEqual(pedir(2), { precio_ars: 6000, precio_usd: 6 }) // ningun tramo aplica: lista
  assert.deepEqual(pedir(3), { precio_ars: 5000, precio_usd: 5 })
  assert.deepEqual(pedir(9), { precio_ars: 5000, precio_usd: 5 })
  assert.deepEqual(pedir(500), { precio_ars: 4000, precio_usd: 4 })
  assert.deepEqual(precioPorCantidad({ tramos: [], cantidad: 20, precioListaUsd: 3, cotizacion: 1200 }), { precio_ars: 3600, precio_usd: 3 })
})

console.log('catalogo')
probar('armarCatalogo calcula el promedio del lote, ordena y cuelga las escalas', () => {
  const catalogo = armarCatalogo({
    cotizacion: 1000,
    celulares: [
      { clave: 'B', modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL', bateria: '88%', detalles: '', cantidad: 4, suma_precio: 1620 },
      { clave: 'A', modelo: 'IPHONE XR', capacidad: '64GB', color: 'CORAL', bateria: '80%', detalles: '', cantidad: 1, suma_precio: 175 },
    ],
    accesorios: [{ clave: 'F', tipo: 'Funda', modelo: 'SILICONA', color: '', detalles: '', cantidad: 10, suma_precio: 60 }],
    escalas: [{ clave: 'F', desde: 10, moneda: 'usd', precio: 4 }, { clave: 'F', desde: 3, moneda: 'ars', precio: 5000 }],
  })
  assert.deepEqual(catalogo.celulares.map((lote) => [lote.familia, lote.precio_usd, lote.cantidad]), [['XR', 175, 1], ['13', 405, 4]])
  assert.equal(catalogo.accesorios[0].familia, 'FUNDA')
  assert.deepEqual(catalogo.accesorios[0].escalas.map((tramo) => tramo.desde), [3, 10])
})

console.log('stock')
const unidad = (id, clave, modelo, estado, costo_usd, precio_usd, extra = {}) => ({
  id, clave, modelo, capacidad: '128GB', color: 'AZUL', bateria: '88%', detalles: '', estado, costo_usd, precio_usd, promediado: false, ...extra,
})
probar('armarStock separa lo del local de lo que esta afuera y mantiene los lotes en cero', () => {
  const stock = armarStock(
    [
      unidad(1, 'A', 'IPHONE 13', 'disponible', 330, 400),
      unidad(2, 'A', 'IPHONE 13', 'disponible', 345, 420, { promediado: true }),
      unidad(3, 'A', 'IPHONE 13', 'revendedor', 330, 400),
      unidad(4, 'B', 'IPHONE 12', 'senado', 250, 310),
    ],
    'celulares',
  )
  const [doce, trece] = stock
  assert.deepEqual([doce.familia, doce.cantidad, doce.senadas.length, doce.precio_usd], ['12', 0, 1, 310])
  assert.deepEqual([trece.cantidad, trece.conRevendedores.length, trece.costo_usd, trece.precio_usd, trece.promediado], [2, 1, 337.5, 410, true])
  // El total cuenta todo; la plata, solo lo que esta en el local, con las sumas reales.
  assert.deepEqual(resumirStock(stock), { total: 4, unidades: 2, conRevendedores: 1, senadas: 1, costo_usd: 675, venta_usd: 820 })
})
probar('agruparPorFamilia corta por familia y arma el titulo', () => {
  const grupos = agruparPorFamilia([
    { marca: 'IPHONE', familia: '13' }, { marca: 'IPHONE', familia: '13' }, { marca: 'SAMSUNG', familia: 'SAMSUNG S23' },
  ])
  assert.deepEqual(grupos.map((grupo) => [tituloDeFamilia(grupo), grupo.lotes.length]), [['iPhone 13', 2], ['SAMSUNG S23', 1]])
})

console.log('cuentas')
probar('saldo = valor de los equipos al precio acordado menos lo entregado', () => {
  const cuentas = armarCuentas({
    tipo: 'revendedor',
    celulares: [
      unidad(1, 'A', 'IPHONE 13', 'revendedor', 300, 400, { revendedor: 'JUAN', precio_revendedor: 380 }),
      unidad(2, 'A', 'IPHONE 13', 'revendedor', 300, 400, { revendedor: 'JUAN', precio_revendedor: 380 }),
      unidad(3, 'B', 'IPHONE 12', 'senado', 250, 310, { revendedor: 'JUAN', precio_revendedor: 300 }), // es una seña: no cuenta aca
    ],
    accesorios: [],
    pagos: [
      { id: 1, revendedor: 'JUAN', monto_ars: 145000, monto_usd: 100, fecha: '2026-10-01T12:00:00Z' },
      { id: 2, revendedor: 'JUAN', monto_ars: -72500, monto_usd: -50, fecha: '2026-10-02T12:00:00Z' },
    ],
    lista: [{ id: 7, nombre: 'ANA', celular: '388' }, { id: 8, nombre: 'JUAN', celular: '' }],
    cotizaciones: { venta: 1000, costo: 900 },
  })
  const [ana, juan] = cuentas
  assert.deepEqual([ana.nombre, ana.id, ana.saldo_usd, ana.unidades.length], ['ANA', 7, 0, 0])
  // Cada celular va en su propio renglon, aunque sean iguales.
  assert.deepEqual([juan.valor_usd, juan.entregado_usd, juan.saldo_usd, juan.renglones.length, juan.renglones[0].unidades.length], [760, 50, 710, 2, 1])
  // Margen: 760 de precio contra 600 x 0,9 de costo en dolares de venta.
  cerca(juan.margen, (760 - 540) / 760)
})
probar('lo entregado se reparte equipo por equipo, del primero que se llevo al ultimo', () => {
  const cuentas = armarCuentas({
    tipo: 'revendedor',
    celulares: [
      unidad(5, 'A', 'IPHONE 13', 'revendedor', 300, 400, { revendedor: 'JUAN', precio_revendedor: 380, fecha_revendedor: '2026-10-05T12:00:00Z' }),
      unidad(9, 'B', 'IPHONE 12', 'revendedor', 250, 310, { revendedor: 'JUAN', precio_revendedor: 300, fecha_revendedor: '2026-10-01T12:00:00Z' }),
    ],
    accesorios: [
      { id: 1, clave: 'F', tipo: 'FUNDA', modelo: '', color: '', estado: 'revendedor', revendedor: 'JUAN', precio_revendedor: 10, costo_usd: 2, fecha_revendedor: '2026-10-05T12:00:00Z' },
      { id: 2, clave: 'F', tipo: 'FUNDA', modelo: '', color: '', estado: 'revendedor', revendedor: 'JUAN', precio_revendedor: 10, costo_usd: 2, fecha_revendedor: '2026-10-05T12:00:00Z' },
    ],
    pagos: [{ id: 1, revendedor: 'JUAN', monto_ars: 320000, monto_usd: 320, fecha: '2026-10-06T12:00:00Z' }],
    cotizaciones: { venta: 1000, costo: 900 },
  })
  const [juan] = cuentas
  // Primero el 12 (se lo llevo antes), despues las fundas (misma hora que el 13) y al final el 13.
  assert.deepEqual(juan.unidades.map((u) => [u.id, u.pagado_usd]), [[9, 300], [1, 10], [2, 10], [5, 0]])
  // Las fundas iguales van juntas.
  assert.deepEqual(juan.renglones.map((r) => [r.unidades.length, r.pagado_usd]), [[1, 300], [2, 20], [1, 0]])
  // Con 380 mas queda pagado tambien el 13; con 379 no.
  assert.equal(equiposCubiertos(juan, 380), 4)
  assert.equal(equiposCubiertos(juan, 379), 3)
  assert.equal(equiposCubiertos(juan, 0), 3)
})

console.log('ventas')
probar('la ganancia usa las dos cotizaciones del dia y se muestra en dolares de venta', () => {
  const numeros = calcularUnidad({ precio_usd: 400, costo_usd: 300, cotizacion_venta: 1000, cotizacion_costo: 900, permuta_usd: null })
  assert.equal(numeros.cobrado_ars, 400000)
  assert.equal(numeros.ganancia_ars, 130000) // 400.000 cobrados menos 270.000 de costo
  cerca(numeros.ganancia_usd, 130)
})
probar('con permuta se cuenta como cobrado solo la diferencia, pero la ganancia es completa', () => {
  const numeros = calcularUnidad({ precio_usd: 980, costo_usd: 850, cotizacion_venta: 1000, cotizacion_costo: null, permuta_usd: 150 })
  assert.equal(numeros.cobrado_ars, 830000)
  cerca(numeros.ganancia_usd, 130)
})
probar('un regalo figura como perdida por su costo', () => {
  const numeros = calcularUnidad({ precio_usd: 0, costo_usd: 1.5, cotizacion_venta: 1000, cotizacion_costo: 1000 })
  assert.equal(numeros.cobrado_ars, 0)
  cerca(numeros.ganancia_usd, -1.5)
})
const vendida = (id, clave, fecha_venta, precio_usd, extra = {}) => ({
  id, clave, tipo: 'FUNDA', modelo: 'SILICONA', color: 'NEGRO', detalles: '', costo_usd: 1.5, precio_usd,
  fecha_venta, cotizacion_venta: 1000, cotizacion_costo: 1000, revendedor: null, ...extra,
})
probar('unidades iguales de una misma venta van en un renglon; los resumenes cuentan unidades', () => {
  const fecha = '2026-10-05T15:00:00Z'
  const { renglones, meses } = armarVentas({
    celulares: [],
    accesorios: [
      ...Array.from({ length: 20 }, (_, i) => vendida(i + 1, 'F', fecha, 4)),
      vendida(30, 'F', fecha, 0), // misma venta, de regalo: renglon aparte
      vendida(31, 'F', '2026-09-20T15:00:00Z', 6), // otra venta
    ],
  })
  assert.deepEqual(renglones.map((renglon) => [renglon.cantidad, renglon.precio_usd, renglon.cobrado_ars]).sort((a, b) => b[0] - a[0] || b[1] - a[1]), [
    [20, 4, 80000], [1, 6, 6000], [1, 0, 0],
  ])
  assert.equal(new Date(renglones[0].fecha) >= new Date(renglones[2].fecha), true) // lo mas nuevo primero
  assert.deepEqual(meses.map((mes) => [mes.mes, mes.unidades, mes.cobrado_ars]), [[mesDe(fecha), 21, 80000], ['2026-09', 1, 6000]])
  assert.deepEqual(totalizar(renglones), { unidades: 22, cobrado_ars: 86000, ganancia_usd: 20 * 2.5 - 1.5 + 4.5 })
})
probar('los pagos a cuenta figuran como cobro con ganancia estimada, y los descuentos restan', () => {
  const { renglones, meses } = armarVentas({ celulares: [], accesorios: [] }, [
    {
      tipo: 'revendedor', nombre: 'JUAN', margen: 0.25,
      pagos: [
        { id: 1, monto_ars: 100000, monto_usd: 100, fecha: '2026-10-01T12:00:00Z' },
        { id: 2, monto_ars: -40000, monto_usd: -40, fecha: '2026-10-03T12:00:00Z' },
      ],
    },
  ])
  assert.equal(renglones.length, 2)
  assert.ok(renglones.every((renglon) => renglon.clase === 'pago' && renglon.cantidad === 0))
  assert.deepEqual(meses.map((mes) => [mes.unidades, mes.cobrado_ars, mes.ganancia_usd]), [[0, 60000, 15]])
})
probar('el CSV escapa comillas y separa con punto y coma', () => {
  const csv = aCsv([{ fecha: '2026-10-05T15:00:00Z', descripcion: 'FUNDA "PRO"', detalle: '', cantidad: 2, precio_usd: 4, cobrado_ars: 8000, ganancia_usd: 5, comprador: '' }])
  const [encabezado, fila] = csv.split('\r\n')
  assert.equal(encabezado.split(';').length, 8)
  assert.ok(fila.includes('"FUNDA ""PRO"""'))
  assert.ok(fila.includes('"8000";"5.00"'))
})

console.log('comprobante')
const unidadVendida = (datos) => ({ clave: 'X', precio_usd: 400, cotizacion_venta: 1450, garantia_dias: 30, fecha_venta: '2026-10-05T15:00:00Z', ...datos })
probar('el ticket junta lo igual sin IMEI, separa los equipos con IMEI y reparte el pago mixto', () => {
  const ticket = armarComprobante({
    id: 12, fecha: '2026-10-05T15:00:00Z', origen: 'mostrador', cliente: 'MARIA', telefono: '', medio: 'mixto', efectivo_ars: 500000, nota: '',
    celulares: [
      unidadVendida({ id: 1, modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL', bateria: '88%', detalles: '', imei: '356789012345678' }),
      unidadVendida({ id: 2, modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL', bateria: '88%', detalles: '', imei: '356789012345679' }),
    ],
    accesorios: [
      unidadVendida({ id: 5, clave: 'F', tipo: 'FUNDA', modelo: 'SILICONA', color: '', detalles: '', precio_usd: 5, garantia_dias: 0 }),
      unidadVendida({ id: 6, clave: 'F', tipo: 'FUNDA', modelo: 'SILICONA', color: '', detalles: '', precio_usd: 5, garantia_dias: 0 }),
      // De regalo: mismo lote, otro precio, va en su propio renglon.
      unidadVendida({ id: 7, clave: 'F', tipo: 'FUNDA', modelo: 'SILICONA', color: '', detalles: '', precio_usd: 0, garantia_dias: 0 }),
    ],
  })
  assert.deepEqual(ticket.renglones.map((r) => [r.cantidad, r.descripcion, r.precio_ars, r.importe_ars, r.imei]), [
    [1, 'IPHONE 13 128GB AZUL', 580000, 580000, '356789012345678'],
    [1, 'IPHONE 13 128GB AZUL', 580000, 580000, '356789012345679'],
    [2, 'FUNDA SILICONA', 7250, 14500, ''],
    [1, 'FUNDA SILICONA', 0, 0, ''],
  ])
  assert.equal(ticket.total_ars, 1174500)
  assert.equal(ticket.permuta_ars, 0)
  assert.deepEqual(ticket.pagos, [{ nombre: 'Efectivo', monto_ars: 500000 }, { nombre: 'Transferencia', monto_ars: 674500 }])
  assert.equal(ticket.renglones[0].vence.toISOString(), '2026-11-04T15:00:00.000Z')
  assert.equal(ticket.renglones[2].vence, null)
  assert.equal(numeroDeTicket(ticket.numero), '000012')
})
probar('con permuta el total es solo la diferencia, y una cuenta no muestra montos de pago', () => {
  const permuta = armarComprobante({
    id: 3, origen: 'permuta', medio: 'efectivo',
    celulares: [unidadVendida({ id: 1, modelo: 'IPHONE 15', capacidad: '', color: '', precio_usd: 980, permuta_usd: 150 })], accesorios: [],
  })
  assert.equal(permuta.subtotal_ars, 1421000)
  assert.equal(permuta.permuta_ars, 217500)
  assert.equal(permuta.total_ars, 1203500)
  const cuenta = armarComprobante({ id: 4, origen: 'revendedor', medio: null, celulares: [unidadVendida({ id: 1, modelo: 'X' })], accesorios: [] })
  assert.deepEqual(cuenta.pagos, [{ nombre: 'Cuenta de revendedor', monto_ars: null }])
})
probar('lo que queda debiendo sale aparte y los pagos son solo por lo que se pago', () => {
  const fiado = armarComprobante({
    id: 8, origen: 'mostrador', cliente: 'MARIA', medio: 'transferencia', debe_ars: 180000,
    celulares: [unidadVendida({ id: 1, modelo: 'IPHONE 13', capacidad: '', color: '' })], accesorios: [],
  })
  assert.equal(fiado.total_ars, 580000)
  assert.equal(fiado.debe_ars, 180000)
  assert.deepEqual(fiado.pagos, [{ nombre: 'Transferencia', monto_ars: 400000 }])
  // Todo a cuenta: no hay pagos, y la deuda nunca pasa el total.
  const todo = armarComprobante({ id: 9, origen: 'mostrador', medio: 'efectivo', debe_ars: 9999999, celulares: [unidadVendida({ id: 1, modelo: 'X' })], accesorios: [] })
  assert.equal(todo.debe_ars, 580000)
  assert.deepEqual(todo.pagos, [])
})
probar('la deuda de un formulario: activa, con monto, sin pasar el total y con cliente', () => {
  assert.equal(montoDeDeuda(DEUDA_VACIA), 0)
  assert.equal(montoDeDeuda({ activa: true, monto: 1000 }), 1000)
  assert.equal(problemaDeDeuda(DEUDA_VACIA, 5000, ''), '')
  assert.match(problemaDeDeuda({ activa: true, monto: null }, 5000, 'ANA'), /cuánto/)
  assert.match(problemaDeDeuda({ activa: true, monto: 6000 }, 5000, 'ANA'), /más que el total/)
  assert.match(problemaDeDeuda({ activa: true, monto: 1000 }, 5000, ' '), /nombre del cliente/)
  assert.equal(problemaDeDeuda({ activa: true, monto: 5000 }, 5000, 'ANA'), '')
  assert.deepEqual(paginaDeTicket({ ticket_ancho_mm: 50, ticket_alto_mm: 60 }), { ancho: 50, alto: 60 })
  assert.deepEqual(paginaDeTicket({ ticket_ancho_mm: 80, ticket_alto_mm: 0 }), { ancho: 80, alto: undefined })
})
probar('repartirCobro: el efectivo de un pago mixto nunca supera el total', () => {
  assert.deepEqual(repartirCobro({ medio: 'efectivo' }, 1000), { efectivo_ars: 1000, transferencia_ars: 0 })
  assert.deepEqual(repartirCobro({ medio: 'transferencia' }, 1000), { efectivo_ars: 0, transferencia_ars: 1000 })
  assert.deepEqual(repartirCobro({ medio: 'mixto', efectivo_ars: 5000 }, 1000), { efectivo_ars: 1000, transferencia_ars: 0 })
  assert.deepEqual(repartirCobro({ medio: 'mixto', efectivo_ars: 300 }, 1000), { efectivo_ars: 300, transferencia_ars: 700 })
  // Sin medio (ventas viejas) cuenta como efectivo.
  assert.deepEqual(repartirCobro({ medio: null }, 1000), { efectivo_ars: 1000, transferencia_ars: 0 })
})

console.log('garantias')
probar('vencimiento y texto de una garantia', () => {
  assert.equal(venceGarantia('2026-10-01T12:00:00Z', 30).toISOString(), '2026-10-31T12:00:00.000Z')
  assert.equal(venceGarantia('2026-10-01T12:00:00Z', 0), null)
  assert.deepEqual([0, 1, 30, 45, 90, 365, 730].map(textoDeGarantia), ['Sin garantía', '1 día', '30 días', '45 días', '3 meses', '1 año', '2 años'])
})
probar('las vigentes van primero (la que vence antes arriba) y los accesorios iguales se juntan', () => {
  const ahora = new Date('2026-10-13T12:00:00Z')
  const fila = (datos) => ({ tabla: 'celulares', imei: '', cliente: '', telefono: '', comprobante_id: 1, dias: 30, ...datos })
  const lista = armarGarantias([
    fila({ id: 1, descripcion: 'VENCIDA', imei: '1', desde: '2026-08-01T12:00:00Z' }),
    fila({ id: 2, descripcion: 'LARGA', imei: '2', desde: '2026-10-10T12:00:00Z', dias: 365 }),
    fila({ id: 3, descripcion: 'CORTA', imei: '3', desde: '2026-10-01T12:00:00Z' }),
    fila({ id: 4, tabla: 'accesorios', descripcion: 'CARGADOR', desde: '2026-10-12T12:00:00Z' }),
    fila({ id: 5, tabla: 'accesorios', descripcion: 'CARGADOR', desde: '2026-10-12T12:00:00Z' }),
  ], ahora)
  assert.deepEqual(lista.map((g) => [g.descripcion, g.cantidad, g.vigente, g.dias_restantes]), [
    ['CORTA', 1, true, 18], ['CARGADOR', 2, true, 29], ['LARGA', 1, true, 362], ['VENCIDA', 1, false, -43],
  ])
})

console.log('caja')
probar('suma ingresos y egresos y separa efectivo de transferencia', () => {
  const caja = armarCaja([
    { origen: 'venta', id: 1, fecha: '2026-10-13T15:00:00Z', efectivo_ars: 200000, transferencia_ars: 152350 },
    { origen: 'movimiento', id: 1, fecha: '2026-10-13T16:00:00Z', efectivo_ars: 0, transferencia_ars: -300000 },
    { origen: 'venta', id: null, fecha: '2026-09-02T15:00:00Z', efectivo_ars: 700000, transferencia_ars: 0 },
  ])
  assert.deepEqual(caja.map((m) => [m.llave, m.total_ars]), [['venta|1', 352350], ['movimiento|1', -300000], ['venta|2026-09-02T15:00:00Z', 700000]])
  assert.deepEqual(resumirCaja(caja), { ingresos: 1052350, egresos: 300000, resultado: 752350, efectivo: 900000, transferencia: -147650 })
})
probar('filtra por hoy, 7 dias y mes', () => {
  const ahora = new Date(2026, 9, 13, 18, 0)
  const en = (anio, mes, dia) => ({ fecha: new Date(anio, mes, dia, 10, 0).toISOString() })
  const lista = [en(2026, 9, 13), en(2026, 9, 7), en(2026, 9, 6), en(2026, 9, 1), en(2026, 8, 30)]
  assert.equal(diaDe(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
  assert.deepEqual(['hoy', 'semana', 'mes', 'todo'].map((periodo) => filtrarCaja(lista, periodo, ahora).length), [1, 2, 4, 5])
})
probar('el CSV de la caja redondea a pesos', () => {
  const [, fila] = cajaACsv(armarCaja([{ origen: 'venta', id: 1, fecha: '2026-10-13T15:00:00Z', concepto: 'Venta', detalle: 'X', persona: 'ANA', efectivo_ars: 100.4, transferencia_ars: 0 }])).split('\r\n')
  assert.ok(fila.endsWith('"Venta";"X";"ANA";"100";"0";"100"'))
})

console.log('avisos de stock')
probar('separa lo que no tiene stock de lo que tiene poco, segun el limite de cada tabla', () => {
  const lote = (modelo, cantidad, afuera = 0) => ({
    clave: modelo, modelo, capacidad: '', color: '', tipo: 'FUNDA', bateria: '', detalles: '',
    cantidad, conRevendedores: Array(afuera).fill({}), senadas: [],
  })
  const avisos = armarAvisos({
    stock: { celulares: [lote('A', 1), lote('B', 0, 2)], accesorios: [lote('C', 3), lote('D', 4), lote('E', 1)] },
    agotados: [{ tabla: 'celulares', clave: 'Z', modelo: 'Z', capacidad: '64GB', color: '', bateria: '', detalles: '', ultima_venta: '2026-10-10T12:00:00Z' }],
    configuracion: { aviso_celulares: 0, aviso_accesorios: 3 },
  })
  // Con el limite en 0 los celulares no avisan por "queda poco".
  assert.deepEqual(avisos.celulares.poco, [])
  assert.deepEqual(avisos.celulares.sinStock.map((a) => [a.descripcion, a.afuera, a.ultima_venta]), [['B', 2, null], ['Z 64GB', 0, '2026-10-10T12:00:00Z']])
  assert.deepEqual(avisos.accesorios.poco.map((a) => [a.descripcion, a.cantidad]), [['FUNDA E', 1], ['FUNDA C', 3]])
  assert.equal(avisos.accesorios.total, 2)
})
probar('avisa los celulares sin IMEI, esten en el local o afuera', () => {
  const lote = (modelo, imeis, afuera = []) => ({
    clave: modelo, modelo, capacidad: '', color: '', bateria: '', detalles: '',
    cantidad: imeis.length, disponibles: imeis.map((imei) => ({ imei })), conRevendedores: afuera.map((imei) => ({ imei })), senadas: [],
  })
  const avisos = armarAvisos({
    stock: { celulares: [lote('A', ['356789012345678', null]), lote('B', ['356789012345679']), lote('C', [null, null], [null])], accesorios: [] },
    configuracion: { aviso_celulares: 0, aviso_accesorios: 0 },
  })
  assert.deepEqual(avisos.celulares.sinImei.lotes.map((a) => [a.descripcion, a.faltan]), [['C', 3], ['A', 1]])
  assert.equal(avisos.celulares.sinImei.equipos, 4)
  assert.equal(avisos.celulares.total, 2)
  // Los accesorios no tienen IMEI.
  assert.equal(avisos.accesorios.sinImei.equipos, 0)
})

console.log('lotes, IMEI y combos')
probar('extraerImeis saca todos los IMEI de una lista pegada, sin repetir', () => {
  const lista = 'IMEI: 356789012345678\n356789012345679, 356789012345678;\tserie F2LXK 12345 y 3567890123456789'
  assert.deepEqual(extraerImeis(lista), ['356789012345678', '356789012345679'])
  assert.deepEqual(extraerImeis(''), [])
})
probar('proveedoresDelLote dice de quien es cada unidad', () => {
  const proveedores = [{ id: 1, nombre: 'MAYORISTA' }, { id: 2, nombre: 'SUR' }]
  const lote = (ids) => ({ disponibles: ids.map((proveedor_id) => ({ proveedor_id })), conRevendedores: [], senadas: [] })
  assert.equal(proveedoresDelLote(lote([1, 1]), proveedores).texto, 'MAYORISTA')
  assert.equal(proveedoresDelLote(lote([2, 1, 1, null]), proveedores).texto, 'MAYORISTA (2) · SUR (1) · SIN PROVEEDOR (1)')
})
const fuentes = { clave: 'FUENTE', tipo: 'FUENTE', modelo: '20W', color: '', precio_usd: 15, costo_usd: 6, cantidad: 3, disponibles: [{ id: 1 }, { id: 2 }, { id: 3 }] }
const cables = { clave: 'CABLE', tipo: 'CABLE', modelo: 'USB-C', color: '', precio_usd: 5, costo_usd: 1, cantidad: 4, disponibles: [{ id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }] }
probar('armarCombos cuenta cuantos combos se pueden armar con la parte mas escasa', () => {
  const [combo, roto] = armarCombos(
    [
      { id: 1, nombre: 'CARGADOR', precio_usd: 18, partes: [{ clave: 'FUENTE', cantidad: 1 }, { clave: 'CABLE', cantidad: 2 }] },
      { id: 2, nombre: 'ROTO', precio_usd: 1, partes: [{ clave: 'NO EXISTE', cantidad: 1 }] },
    ],
    [fuentes, cables],
  )
  assert.equal(combo.disponibles, 2) // 4 cables, de a 2
  assert.equal(combo.descripcion, 'FUENTE 20W + 2 x CABLE USB-C')
  assert.equal(combo.lista_usd, 25)
  assert.equal(combo.costo_usd, 8)
  assert.equal(roto.disponibles, 0)
})
probar('venderCombo reparte el precio segun la lista y la suma da exacta', () => {
  const [combo] = armarCombos([{ id: 1, nombre: 'C', precio_usd: 18, partes: [{ clave: 'FUENTE', cantidad: 1 }, { clave: 'CABLE', cantidad: 2 }] }], [fuentes, cables])
  const items = venderCombo(combo, 2, 20)
  assert.deepEqual(items.map((item) => item.id), [1, 11, 12, 2, 13, 14])
  // 20 dolares en proporcion 15 : 5 : 5 = 12 + 4 + 4.
  assert.deepEqual(items.slice(0, 3).map((item) => item.precio_usd), [12, 4, 4])
  // Con decimales que no cierran, lo que sobra va a la primera unidad.
  const raros = venderCombo(combo, 1, 10)
  assert.equal(Math.round(raros.reduce((suma, item) => suma + item.precio_usd, 0) * 10000), 100000)
  assert.equal(venderCombo(combo, 3, 20), null)
})
probar('armarCatalogo suma los combos a los accesorios, en la familia COMBOS', () => {
  const catalogo = armarCatalogo({
    cotizacion: 1000, celulares: [], escalas: [],
    accesorios: [{ clave: 'FUNDA||', tipo: 'FUNDA', modelo: '', color: '', detalles: '', cantidad: 1, suma_precio: 5 }],
    combos: [{ clave: 'COMBO|1', nombre: 'COMBO CARGADOR', detalle: 'FUENTE + CABLE', cantidad: 2, precio: 18 }],
  })
  const combo = catalogo.accesorios.find((lote) => lote.clave === 'COMBO|1')
  assert.deepEqual([combo.familia, combo.modelo, combo.detalles, combo.precio_usd, combo.cantidad], ['COMBOS', 'COMBO CARGADOR', 'FUENTE + CABLE', 18, 2])
})

console.log('codigo de barras')
probar('usa los mismos dibujos que el lector y lo que se imprime se vuelve a leer igual', () => {
  const { BitArray, Code128Reader } = zxing
  assert.deepEqual(PATRONES.map((patron) => patron.split('').map(Number)), Code128Reader.CODE_PATTERNS.map((patron) => Array.from(patron)))

  // Dibuja el codigo en una fila de puntos (2 por modulo, con margen blanco) y lo lee.
  const leer = (texto) => {
    const modulos = codificar128(texto)
    const fila = new BitArray(modulos.length * 2 + 40)
    for (let i = 0; i < modulos.length; i += 1) {
      if (modulos[i] === '1') {
        fila.set(20 + i * 2)
        fila.set(21 + i * 2)
      }
    }
    return new Code128Reader().decodeRow(0, fila, null).getText()
  }
  for (const texto of ['356789012345678', '12345678', 'ORDEN-12', '7']) assert.equal(leer(texto), texto)
  // Un IMEI entra en 134 modulos: 12 simbolos de 11 mas los 2 del cierre.
  assert.equal(codificar128('356789012345678').length, 134)
  assert.equal(codificar128(''), '')
  assert.equal(codificar128('ñ'), '')
})

console.log('ticketera (ESC/POS)')
probar('partir corta por palabras y solo parte lo que no entra en un renglon', () => {
  assert.deepEqual(partir('IPHONE 13 PRO MAX 256GB AZUL ALPINO', 16), ['IPHONE 13 PRO', 'MAX 256GB AZUL', 'ALPINO'])
  assert.deepEqual(partir('IMEI 356789012345678', 10), ['IMEI', '3567890123', '45678'])
  assert.deepEqual(partir('', 32), [])
  assert.deepEqual(partir(null, 32), [])
})
probar('fila pega el monto al margen derecho, o lo baja si no entra', () => {
  assert.deepEqual(fila('TOTAL', '$ 405.000', 20), ['TOTAL      $ 405.000'])
  assert.deepEqual(fila('1 x IPHONE 13 128GB AZUL', '$ 400.000', 20), ['1 x IPHONE 13 128GB', 'AZUL       $ 400.000'])
  assert.deepEqual(fila('Comprobante N° 000012', '19/10/26, 21:40', 32), ['Comprobante N° 000012', '                 19/10/26, 21:40'])
  assert.deepEqual(fila('Efectivo', '', 32), ['Efectivo'])
})
probar('58 mm son 32 letras por renglon y 80 mm, 48', () => {
  assert.equal(columnasDe(50), 32)
  assert.equal(columnasDe(58), 32)
  assert.equal(columnasDe(80), 48)
})
probar('las tildes van en la tabla 850 y lo que no esta sale sin tilde', () => {
  assert.deepEqual(codificar('Garantía'), [71, 97, 114, 97, 110, 116, 0xa1, 97])
  assert.deepEqual(codificar('ÑN° ç'), [0xa5, 78, 0xf8, 32, 99])
  assert.deepEqual(codificar('€'), [0x3f])
})
const AJUSTES = {
  negocio_nombre: 'Import Salta', negocio_direccion: 'Salta Capital', negocio_telefono: '387 479-6029', negocio_cuit: '',
  ticket_pie: 'Gracias por su compra', ticket_ancho_mm: 58,
  ticket_condiciones: 'La garantía cubre fallas de funcionamiento. Sin el ticket no se puede retirar nada.', ticket_duplicado: false,
}
// Lee un codigo de barras de un mapa de bits, en su fila del medio, como la pistola.
function leerMapa(mapa) {
  const { BitArray, Code128Reader } = zxing
  const fila = new BitArray(mapa.ancho)
  const y = Math.floor(mapa.alto / 2)
  for (let x = 0; x < mapa.ancho; x += 1) {
    if (mapa.bytes[y * (mapa.ancho / 8) + (x >> 3)] & (0x80 >> (x & 7))) fila.set(x)
  }
  return new Code128Reader().decodeRow(0, fila, null).getText()
}
const textosDe = (renglones) => renglones.filter((renglon) => !renglon.imagen).map((renglon) => renglon.texto)
const VENTA = armarComprobante({
  id: 12, fecha: '2026-10-19T21:40:00Z', origen: 'mostrador', cliente: 'JUAN PEREZ', medio: 'efectivo', debe_ars: 0, vendedor: 'ROMÁN',
  celulares: [{
    id: 1, clave: 'A', modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL', bateria: '88%', detalles: '', imei: '356789012345678',
    precio_usd: 400, cotizacion_venta: 1000, garantia_dias: 30, fecha_venta: '2026-10-19T21:40:00Z',
  }],
  accesorios: [],
})
probar('el ticket de venta entra en el rollo y dice lo mismo que el de la pantalla', () => {
  const renglones = renglonesDeVenta(VENTA, AJUSTES)
  // Lo grande ocupa el doble de ancho.
  for (const renglon of renglones) {
    if (!renglon.imagen) assert.ok(renglon.texto.length <= (renglon.tamano === 'grande' ? 16 : 32), renglon.texto)
  }
  const textos = textosDe(renglones)
  assert.equal(renglones[0].tamano, 'grande')
  assert.ok(textos.includes('Comprobante N° 000012'))
  assert.ok(textos.some((texto) => /^Fecha: \d\d\/\d\d\/2026 \d\d:\d\d$/.test(texto)))
  assert.ok(textos.includes('Atendido por: ROMÁN'))
  assert.ok(textos.includes('  IMEI 356789012345678'))
  assert.ok(textos.some((texto) => /^TOTAL +\$ 400\.000$/.test(texto)))
  // Con el año completo la garantia ocupa dos renglones.
  assert.match(textos.join('\n'), /\n {2}Garantía: 30 días, hasta el\n {2}\d\d\/\d\d\/2026\n/)
  assert.ok(textos.includes('La garantía cubre fallas de'))
  assert.ok(textos.includes('Documento no válido como factura'))
  assert.equal(textos.at(-1), 'V000012')
  assert.ok(!textos.some((texto) => texto.startsWith('Firma')))
})
probar('el codigo de barras del ticket lo lee la pistola y lleva al comprobante', () => {
  const [codigo] = renglonesDeVenta(VENTA, AJUSTES).filter((renglon) => renglon.imagen)
  assert.equal(codigo.imagen.ancho, 384)
  assert.equal(leerMapa(codigo.imagen), 'V000012')
  assert.deepEqual(leerCodigoDeTicket('V000012'), { tipo: 'venta', numero: 12 })
  assert.deepEqual(leerCodigoDeTicket(' s000007 '), { tipo: 'servicio', numero: 7 })
  assert.equal(leerCodigoDeTicket('356789012345678'), null)
  assert.equal(codigoDeVenta(12), 'V000012')
  assert.equal(codigoDeServicio(7), 'S000007')
})
probar('con logo va el dibujo en vez del nombre; el duplicado va sin logo y con firma', () => {
  const logo = mapaDeImagen(new Uint8ClampedArray(16 * 2 * 4), 16, 2, 384)
  const renglones = renglonesDeVenta(VENTA, AJUSTES, { logo })
  assert.equal(renglones[0].imagen, logo)
  assert.ok(!textosDe(renglones).includes('Import Salta'))
  const duplicado = textosDe(renglonesDeVenta(VENTA, AJUSTES, { logo, duplicado: true }))
  assert.equal(duplicado[0], 'Import Salta')
  assert.ok(duplicado.includes('DUPLICADO PARA EL LOCAL'))
  assert.ok(duplicado.some((texto) => /^Firma: _+$/.test(texto) && texto.length === 32))
  // Con el duplicado prendido salen dos tickets en un solo envio.
  const unaVez = ticketDeVenta(VENTA, AJUSTES).length
  const dosVeces = ticketDeVenta(VENTA, { ...AJUSTES, ticket_duplicado: true })
  assert.ok(dosVeces.length > unaVez * 1.5)
  assert.equal([...dosVeces].filter((byte, i) => byte === 0x1b && dosVeces[i + 1] === 0x40).length >= 2, true)
})
probar('un dibujo se centra en el papel y lo oscuro queda negro', () => {
  // 8 x 1: negro, blanco, negro... y el ultimo transparente.
  const rgba = new Uint8ClampedArray(8 * 4)
  for (let x = 0; x < 8; x += 1) rgba.set(x % 2 ? [255, 255, 255, 255] : [0, 0, 0, x === 6 ? 0 : 255], x * 4)
  const mapa = mapaDeImagen(rgba, 8, 1, 24)
  assert.deepEqual([...mapa.bytes], [0, 0b10101000, 0])
})
probar('las etiquetas salen una abajo de la otra con su codigo de barras legible', () => {
  const renglones = renglonesDeEtiquetas(
    [{ titulo: 'IPHONE 13 128GB AZUL', detalle: '88%', codigo: '356789012345678' }, { titulo: 'FUNDA', detalle: '', codigo: '' }],
    AJUSTES,
  )
  const textos = textosDe(renglones)
  assert.deepEqual(textos.slice(0, 3), ['IPHONE 13 128GB AZUL', '88%', '356789012345678'])
  assert.ok(textos.includes('- '.repeat(16).trim()))
  assert.equal(textos.at(-1), 'FUNDA')
  const [codigo] = renglones.filter((renglon) => renglon.imagen)
  assert.equal(leerMapa(codigo.imagen), '356789012345678')
  assert.equal(mapaDeCodigo('ñ', 384, 10), null)
})
probar('la orden de servicio sin entregar muestra estado y presupuesto', () => {
  const orden = {
    id: 7, estado: 'reparando', fecha_ingreso: '2026-10-19T12:00:00Z', cliente: 'ANA', telefono: '', equipo: 'IPHONE 11',
    imei: '', falla: 'No carga', trabajo: '', en_garantia: false, presupuesto_ars: 50000,
  }
  const renglones = renglonesDeServicio(orden, { ...AJUSTES, ticket_ancho_mm: 80 })
  const textos = textosDe(renglones)
  assert.ok(textos.includes('SERVICIO TÉCNICO'))
  assert.equal(textos.at(-1), 'S000007')
  assert.equal(leerMapa(renglones.find((renglon) => renglon.imagen).imagen), 'S000007')
  assert.ok(textos.includes(`Estado${' '.repeat(48 - 6 - 13)}En reparación`))
  for (const texto of textos) assert.ok(texto.length <= 48, texto)
})
probar('los bytes arrancan la ticketera, ponen la tabla 850 y terminan avanzando el papel', () => {
  const bytes = aEscPos([{ texto: 'Hola', centrado: true, negrita: true, tamano: 'alto' }])
  assert.deepEqual([...bytes.slice(0, 7)], [0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 2])
  assert.deepEqual([...bytes.slice(7, 21)], [0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 1, 72, 111, 108, 97, 0x0a])
  assert.deepEqual([...bytes.slice(-3)], [0x1b, 0x64, 4])
  // Un dibujo de 16 x 2 puntos: GS v 0, 2 bytes por fila, 2 filas.
  const mapa = { ancho: 16, alto: 2, bytes: Uint8Array.from([1, 2, 3, 4]) }
  const conDibujo = aEscPos([{ imagen: mapa }])
  assert.deepEqual([...conDibujo.slice(7, 22)], [0x1b, 0x61, 0, 0x1d, 0x76, 0x30, 0, 2, 0, 2, 0, 1, 2, 3, 4])
})

console.log('\ncuotas con tarjeta')
const PLANES = [{ cuotas: 3, recargo: 0 }, { cuotas: 6, recargo: 12.5 }, { cuotas: 12, recargo: 30 }]
probar('cada plan da su total con recargo y lo que queda cada cuota, en pesos enteros', () => {
  assert.deepEqual(cuotasDe(600000, PLANES), [
    { cuotas: 3, recargo: 0, total_ars: 600000, cuota_ars: 200000, sin_interes: true },
    { cuotas: 6, recargo: 12.5, total_ars: 675000, cuota_ars: 112500, sin_interes: false },
    { cuotas: 12, recargo: 30, total_ars: 780000, cuota_ars: 65000, sin_interes: false },
  ])
  // Sin planes no hay cuotas.
  assert.deepEqual(cuotasDe(600000, []), [])
  assert.equal(cuotasDe(100000, [{ cuotas: 3, recargo: 0 }])[0].cuota_ars, 33333)
})
probar('los textos de los planes y el plan mas largo', () => {
  assert.equal(nombreDePlan(PLANES[0]), '3 cuotas sin interés')
  assert.equal(nombreDePlan(PLANES[1]), '6 cuotas')
  assert.equal(textoDeRecargo(12.5), '12,5 %')
  assert.equal(textoDeRecargo(0), 'Sin interés')
  assert.equal(planMasLargo(PLANES).cuotas, 12)
  assert.equal(planMasLargo([]), null)
})
probar('los accesorios muestran cuotas solo si el dueno lo eligio', () => {
  assert.equal(planesPara('celulares', { planes: PLANES, accesorios: false }).length, 3)
  assert.equal(planesPara('accesorios', { planes: PLANES, accesorios: false }).length, 0)
  assert.equal(planesPara('accesorios', { planes: PLANES, accesorios: true }).length, 3)
  assert.deepEqual(planesPara('celulares', undefined), [])
})
probar('los planes que se editan en Ajustes siguen las reglas de la base', () => {
  assert.equal(problemaDePlanes(PLANES), '')
  assert.equal(problemaDePlanes([{ cuotas: 1, recargo: 0 }]), 'Las cuotas van de 2 a 48.')
  assert.equal(problemaDePlanes([{ cuotas: 3, recargo: -2 }]), 'El recargo va de 0 % a 300 %.')
  assert.equal(problemaDePlanes([{ cuotas: 3, recargo: 0 }, { cuotas: 3, recargo: 5 }]), 'El plan de 3 cuotas está repetido.')
})
probar('cobrar con tarjeta manda las cuotas a la base y el ticket dice cuanto queda cada una', () => {
  assert.deepEqual(cobroParaLaBase({ medio: 'tarjeta', efectivo: 5, cuotas: 6, recargo: 12.5 }), { medio: 'tarjeta', efectivo_ars: null, cuotas: 6, recargo_pct: 12.5 })
  assert.deepEqual(cobroParaLaBase({ medio: 'efectivo', efectivo: null, cuotas: 6, recargo: 12.5 }), { medio: 'efectivo', efectivo_ars: null, cuotas: null, recargo_pct: null })
  assert.deepEqual(pagoConTarjeta({ medio: 'tarjeta', cuotas: 6, recargo: 12.5 }, 600000), { cuotas: 6, recargo: 12.5, total_ars: 675000, cuota_ars: 112500 })
  assert.equal(pagoConTarjeta({ medio: 'transferencia' }, 600000), null)

  const venta = {
    id: 9, fecha: '2026-10-21T15:00:00Z', origen: 'mostrador', medio: 'tarjeta', cuotas: 6, recargo_pct: 12.5, efectivo_ars: null,
    celulares: [{ id: 1, clave: 'A', modelo: 'IPHONE 13', capacidad: '128GB', color: 'AZUL', imei: '', precio_usd: 400, cotizacion_venta: 1500, garantia_dias: 30, fecha_venta: '2026-10-21T15:00:00Z' }],
    accesorios: [],
  }
  const comprobante = armarComprobante(venta)
  assert.deepEqual(comprobante.pagos, [{ nombre: 'Tarjeta, 6 cuotas', monto_ars: 600000 }])
  assert.deepEqual(comprobante.tarjeta, { cuotas: 6, recargo: 12.5, total_ars: 675000, cuota_ars: 112500 })
  assert.deepEqual(armarComprobante({ ...venta, cuotas: 1, recargo_pct: 0 }).pagos, [{ nombre: 'Tarjeta, 1 pago', monto_ars: 600000 }])
  assert.equal(armarComprobante({ ...venta, medio: 'efectivo', cuotas: null }).tarjeta, null)
  // En la caja, lo de la tarjeta va con lo del banco.
  assert.deepEqual(repartirCobro({ medio: 'tarjeta', efectivo_ars: 100 }, 5000), { efectivo_ars: 0, transferencia_ars: 5000 })
})
probar('el ticket dice en cuantas cuotas y de cuanto se paso la tarjeta', () => {
  assert.equal(textoDeTarjeta({ cuotas: 6, recargo: 12.5, total_ars: 675000, cuota_ars: 112500 }), 'Posnet: 6 cuotas de $ 112.500 (total $ 675.000, recargo 12,5 %)')
  assert.equal(textoDeTarjeta({ cuotas: 3, recargo: 0, total_ars: 600000, cuota_ars: 200000 }), 'Posnet: 3 cuotas sin interés de $ 200.000')
  assert.equal(textoDeTarjeta({ cuotas: 1, recargo: 0, total_ars: 600000, cuota_ars: 600000 }), 'Posnet: 1 pago de $ 600.000')
})
probar('los modelos se escriben lindos en el catalogo', () => {
  assert.equal(nombreDeModelo('IPHONE 13 PRO MAX'), 'iPhone 13 Pro Max')
  assert.equal(nombreDeModelo('iphone se 64gb'), 'iPhone SE 64GB')
  assert.equal(nombreDeModelo('  AIRPODS  PRO 2 '), 'AirPods Pro 2')
  assert.equal(nombreDeModelo('TITANIO NATURAL'), 'Titanio Natural')
  assert.equal(nombreDeModelo(''), '')
})

console.log('\nactas de entrega y garantia')
probar('la revision arranca sin revisar y se puede marcar lo que falta como Funciona', () => {
  const revision = revisionInicial(['Pantalla', 'Cámara'])
  assert.deepEqual(revision, [{ punto: 'Pantalla', estado: '', nota: '' }, { punto: 'Cámara', estado: '', nota: '' }])
  const conDetalle = [{ ...revision[0], estado: 'detalle', nota: 'Rayón' }, revision[1]]
  assert.deepEqual(marcarRestantes(conDetalle).map((item) => item.estado), ['detalle', 'ok'])
})
probar('una firma se guarda como trazos M y L, sin puntos repetidos y dentro del lienzo', () => {
  const trazos = [
    [{ x: 10.4, y: 20.6 }, { x: 10.9, y: 20.9 }, { x: 30, y: 40 }, { x: 700, y: -5 }],
    [{ x: 50, y: 50 }],
  ]
  assert.equal(firmaATexto(trazos), 'M 10 21 L 30 40 L 600 0 M 50 50 L 50 50')
  assert.match(firmaATexto(trazos), /^[ML0-9 ]+$/)
  assert.equal(firmaATexto([]), '')
  // Un toque no es una firma.
  assert.equal(hayFirma([[{ x: 1, y: 1 }]]), false)
  assert.equal(hayFirma([Array.from({ length: 10 }, (_, i) => ({ x: i * 5, y: i }))]), true)
})
probar('el acta no se guarda sin cliente, vendedor, revision completa y las dos firmas', () => {
  const firma = [Array.from({ length: 10 }, (_, i) => ({ x: i * 5, y: i }))]
  const completa = {
    cliente: 'Ana', vendedor: 'Facundo', firmaCliente: firma, firmaVendedor: firma,
    revision: [{ punto: 'Pantalla', estado: 'ok', nota: '' }, { punto: 'Batería', estado: 'detalle', nota: '89 %' }],
  }
  assert.equal(problemaDeActa(completa), '')
  assert.equal(problemaDeActa({ ...completa, cliente: ' ' }), 'Falta el nombre del cliente.')
  assert.equal(problemaDeActa({ ...completa, vendedor: '' }), 'Falta quién entrega el equipo.')
  assert.equal(problemaDeActa({ ...completa, revision: revisionInicial(['A', 'B']) }), 'Faltan revisar 2 puntos.')
  assert.equal(
    problemaDeActa({ ...completa, revision: [{ punto: 'Batería', estado: 'detalle', nota: ' ' }] }),
    'Escribí cuál es el detalle de: Batería.',
  )
  assert.equal(problemaDeActa({ ...completa, firmaCliente: [] }), 'Falta la firma del cliente.')
  assert.equal(problemaDeActa({ ...completa, firmaVendedor: [[{ x: 1, y: 1 }]] }), 'Falta la firma del vendedor.')
})

console.log(process.exitCode ? '\nHay pruebas que fallan.' : `\nLas ${pasaron} pruebas pasaron.`)
