// servicios/imagenes.js
// Las fotos de los productos estan en Cloudinary. En la base se guarda la
// direccion de la foto original; para mostrarla se le pide a Cloudinary una
// copia del tamano justo, metiendo las instrucciones en la direccion:
//
//   https://res.cloudinary.com/NUBE/image/upload/v123/import-salta/abc.webp
//   https://res.cloudinary.com/NUBE/image/upload/c_fill,w_96,h_96,q_auto/v123/import-salta/abc.webp
//
// Cloudinary la achica una vez y la guarda: las siguientes visitas la reciben
// al instante. La extension .webp hace que siempre llegue en webp.
// Funcion pura: no toca la red, se prueba con un script.

const MARCA = '/image/upload/'

// Asi guarda la base cada dato al ingresar stock: espacios de mas afuera y en
// mayusculas (ver public.limpiar en supabase/migrations).
const comoLoGuarda = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

// La clave del lote que se acaba de ingresar, para ponerle la foto.
// La clave la calcula la base; aca solo se busca una unidad recien leida que
// tenga los mismos datos que se cargaron (todas las de un lote comparten
// clave). unidades: las de panel_datos (celulares o accesorios).
// campos: { modelo, capacidad, ... } o { tipo, modelo, ... }. null si no aparece.
export function claveDeLoteIngresado(unidades, campos) {
  const nombres = Object.keys(campos)
  const unidad = unidades.find((otra) => nombres.every((nombre) => (otra[nombre] ?? '') === comoLoGuarda(campos[nombre])))
  return unidad?.clave ?? null
}

// medida: { ancho, alto } en pixeles de pantalla. Con alto, la foto se
// recorta al cuadro (miniatura); sin alto, se achica sin recortar.
// Se pide el doble de pixeles para que se vea nitida en pantallas de celular.
export function urlImagen(url, { ancho, alto } = {}) {
  if (!url) return ''
  const corte = url.indexOf(MARCA)
  if (corte < 0 || !url.startsWith('https://res.cloudinary.com/') || !ancho) return url

  const partes = alto
    ? ['c_fill', 'g_auto', `w_${ancho * 2}`, `h_${alto * 2}`, 'q_auto']
    : ['c_limit', `w_${ancho * 2}`, 'q_auto']
  const inicio = corte + MARCA.length
  return `${url.slice(0, inicio)}${partes.join(',')}/${url.slice(inicio)}`
}
