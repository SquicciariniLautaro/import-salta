// negocio.js
// Datos fijos del comercio. Si cambia el numero de WhatsApp o el Instagram,
// se toca solo este archivo.

export const NEGOCIO = {
  nombre: 'Import Salta',
  lema: 'iPhone nuevos y usados, testeados y con garantía',
  ubicacion: 'Salta',
  // Numero de WhatsApp en formato internacional, solo digitos (387 479-6029).
  whatsapp: '5493874796029',
  instagram: 'https://www.instagram.com/import_salta2025/',
  // Con que se cobra en el local. Sale en el catalogo junto a las cuotas.
  posnet: 'Payway',
}

// Direccion de un archivo de web/public/ (el logo, los iconos). El sitio real
// vive en la raiz del dominio, pero el boceto de GitHub Pages vive en
// /import-salta/: Vite pone esa carpeta en BASE_URL.
export const rutaPublica = (archivo) => `${import.meta.env.BASE_URL}${archivo}`

// Firma del desarrollador en el pie de pagina.
export const FIRMA = {
  nombre: 'Lambda Soluciones Digitales',
  // Direccion completa del Instagram de Lambda. Mientras este vacia, la firma
  // se muestra sin enlace.
  instagram: 'https://www.instagram.com/lambdasoluciones/',
}
