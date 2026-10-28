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
}

// Direccion de un archivo de web/public/ (el logo, los iconos). Si algun dia
// el sitio vive en una carpeta y no en la raiz del dominio, Vite la pone en
// BASE_URL y esto la respeta.
export const rutaPublica = (archivo) => `${import.meta.env.BASE_URL}${archivo}`

// Firma del desarrollador en el pie de pagina.
export const FIRMA = {
  nombre: 'Lambda Soluciones Digitales',
  // Direccion completa del Instagram de Lambda. Mientras este vacia, la firma
  // se muestra sin enlace.
  instagram: 'https://www.instagram.com/lambdasoluciones/',
}
