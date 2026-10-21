// servicios/codigo128.js
// Arma un codigo de barras "Code 128", el mismo tipo que trae la caja de un
// celular para el IMEI. Se usa en las etiquetas: lo que se imprime aca lo lee
// despues el lector de mano o la camara. Funcion pura.
//
// Un Code 128 es una fila de barras y espacios de 1 a 4 "modulos" de ancho
// (el modulo es la barra mas fina). Cada simbolo ocupa 11 modulos.

// El dibujo de cada simbolo: los anchos de barra, espacio, barra, espacio...
// La posicion en la lista es el valor del simbolo (0 a 106).
const PATRONES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const INICIO_B = 104 // juego B: letras, numeros y simbolos, de a un caracter
const INICIO_C = 105 // juego C: solo numeros, de a dos digitos por simbolo
const PASAR_A_B = 100 // estando en C, lo que sigue va en B
const FIN = 106

// Devuelve los valores de los simbolos de un texto, sin inicio ni control.
// Un texto de solo numeros va en el juego C, que ocupa la mitad; si la
// cantidad de digitos es impar (un IMEI tiene 15), el ultimo va en el juego B.
function valoresDe(texto) {
  if (/^\d{2,}$/.test(texto)) {
    const pares = texto.length - (texto.length % 2)
    const valores = [INICIO_C]
    for (let i = 0; i < pares; i += 2) valores.push(Number(texto.slice(i, i + 2)))
    if (pares < texto.length) valores.push(PASAR_A_B, texto.charCodeAt(pares) - 32)
    return valores
  }
  return [INICIO_B, ...[...texto].map((letra) => letra.charCodeAt(0) - 32)]
}

// Devuelve el codigo como un texto de unos (barra) y ceros (espacio), un
// caracter por modulo, o '' si el texto no se puede codificar.
export function codificar128(texto) {
  const limpio = String(texto ?? '')
  // Solo caracteres comunes de teclado (del espacio a la tilde ~).
  if (limpio === '' || !/^[ -~]+$/.test(limpio)) return ''

  const valores = valoresDe(limpio)
  // Digito de control: el inicio mas cada valor por su posicion, modulo 103.
  let control = valores[0]
  for (let i = 1; i < valores.length; i += 1) control += valores[i] * i

  let modulos = ''
  for (const valor of [...valores, control % 103, FIN]) {
    const anchos = PATRONES[valor]
    for (let i = 0; i < anchos.length; i += 1) {
      // Posiciones pares son barras; impares, espacios.
      modulos += (i % 2 === 0 ? '1' : '0').repeat(Number(anchos[i]))
    }
  }
  return modulos
}

export { PATRONES }
