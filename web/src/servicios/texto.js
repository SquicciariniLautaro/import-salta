// servicios/texto.js
// Funciones puras para comparar y describir textos.
// "Pura" quiere decir que solo depende de lo que recibe: no toca la base ni
// la red, y por eso se puede probar con un script sin levantar nada.
//
// La clave que decide que unidades forman un lote NO se calcula aca: la
// calcula la base (columna "clave") para que haya una sola fuente de verdad.

// Deja un texto listo para comparar: sin tildes, en mayusculas, sin simbolos
// raros y con un solo espacio entre palabras. Se usa en el buscador.
// "  iPhone   13 pró " -> "IPHONE 13 PRO"
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD') // separa cada letra de su tilde...
    .replace(/[̀-ͯ]/g, '') // ...y borra las tildes
    .toUpperCase()
    .replace(/[^A-Z0-9%+./ -]/g, ' ') // todo lo que no sea letra, numero o % + . / - pasa a espacio
    .replace(/\s+/g, ' ')
    .trim()
}

// Nombre corto de una unidad o lote para renglones y mensajes.
// tabla: 'celulares' o 'accesorios'.
export function describir(item, tabla) {
  const partes =
    tabla === 'celulares' ? [item.modelo, item.capacidad, item.color] : [item.tipo, item.modelo, item.color]
  return partes.filter(Boolean).join(' ')
}

// Palabras que tienen su forma propia al escribirlas lindas.
const FORMAS = {
  IPHONE: 'iPhone', IPAD: 'iPad', IMAC: 'iMac', IPOD: 'iPod', AIRPODS: 'AirPods', AIRTAG: 'AirTag',
  MACBOOK: 'MacBook', MAGSAFE: 'MagSafe', 'USB-C': 'USB-C', JBL: 'JBL',
}

// El modelo como se escribe en el catalogo: "IPHONE 13 PRO MAX 256GB" ->
// "iPhone 13 Pro Max 256GB". Los modelos con letras (SE, XR, XS), las
// capacidades (128GB, 1TB) y lo que tiene numeros quedan en mayusculas.
export function nombreDeModelo(texto) {
  return String(texto ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => {
      const mayusculas = palabra.toUpperCase()
      if (FORMAS[mayusculas]) return FORMAS[mayusculas]
      if (/\d/.test(palabra) || palabra.length <= 2) return mayusculas
      return mayusculas.charAt(0) + mayusculas.slice(1).toLowerCase()
    })
    .join(' ')
}
