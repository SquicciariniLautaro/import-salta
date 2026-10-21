// El MP4 que genera MediaRecorder viene "fragmentado" y con duración 0 en la
// cabecera: algunos reproductores no muestran la barra de tiempo. Esto calcula
// la duración real sumando los fragmentos y la escribe en mvhd, tkhd, mdhd
// (y mehd si existe), sin volver a codificar.
//   node video/fijar-duracion.mjs tutorial-import-salta.mp4

import fs from "node:fs";

const archivo = process.argv[2];
const b = fs.readFileSync(archivo);
const CONTENEDORES = new Set(["moov", "trak", "mdia", "minf", "stbl", "mvex", "moof", "traf", "edts"]);

// Recorre las cajas y devuelve [{ tipo, inicio, fin, padre }]
function cajas(desde, hasta, padre = null, lista = []) {
  let p = desde;
  while (p + 8 <= hasta) {
    let tam = b.readUInt32BE(p);
    const tipo = b.toString("latin1", p + 4, p + 8);
    let cab = 8;
    if (tam === 1) {
      tam = Number(b.readBigUInt64BE(p + 8));
      cab = 16;
    } else if (tam === 0) tam = hasta - p;
    const caja = { tipo, inicio: p, cuerpo: p + cab, fin: p + tam, padre };
    lista.push(caja);
    if (CONTENEDORES.has(tipo)) cajas(p + cab, p + tam, caja, lista);
    p += tam;
  }
  return lista;
}

const todas = cajas(0, b.length);
const leer = (pos, v1) => (v1 ? Number(b.readBigUInt64BE(pos)) : b.readUInt32BE(pos));
const escribir = (pos, v1, valor) => (v1 ? b.writeBigUInt64BE(BigInt(valor), pos) : b.writeUInt32BE(valor, pos));

// Escala de tiempo de la pista (mdhd) y del video (mvhd)
const mdhd = todas.find((c) => c.tipo === "mdhd");
const mdhdV1 = b[mdhd.cuerpo] === 1;
const escalaPista = b.readUInt32BE(mdhd.cuerpo + (mdhdV1 ? 20 : 12));
const mvhd = todas.find((c) => c.tipo === "mvhd");
const mvhdV1 = b[mvhd.cuerpo] === 1;
const escalaVideo = b.readUInt32BE(mvhd.cuerpo + (mvhdV1 ? 20 : 12));

// Valor por defecto de duración de muestra (trex) y fin del último fragmento
const trex = todas.find((c) => c.tipo === "trex");
const porDefectoTrex = trex ? b.readUInt32BE(trex.cuerpo + 12) : 0;
let finPista = 0;
for (const traf of todas.filter((c) => c.tipo === "traf")) {
  const hijos = todas.filter((c) => c.padre === traf);
  const tfhd = hijos.find((c) => c.tipo === "tfhd");
  const banderasTfhd = b.readUInt32BE(tfhd.cuerpo) & 0xffffff;
  let q = tfhd.cuerpo + 8;
  if (banderasTfhd & 0x1) q += 8;
  if (banderasTfhd & 0x2) q += 4;
  const porDefecto = banderasTfhd & 0x8 ? b.readUInt32BE(q) : porDefectoTrex;
  const tfdt = hijos.find((c) => c.tipo === "tfdt");
  let t = tfdt ? leer(tfdt.cuerpo + 4, b[tfdt.cuerpo] === 1) : finPista;
  for (const trun of hijos.filter((c) => c.tipo === "trun")) {
    const banderas = b.readUInt32BE(trun.cuerpo) & 0xffffff;
    const n = b.readUInt32BE(trun.cuerpo + 4);
    let r = trun.cuerpo + 8;
    if (banderas & 0x1) r += 4;
    if (banderas & 0x4) r += 4;
    for (let i = 0; i < n; i++) {
      t += banderas & 0x100 ? b.readUInt32BE(r) : porDefecto;
      r += [0x100, 0x200, 0x400, 0x800].filter((f) => banderas & f).length * 4;
    }
  }
  finPista = Math.max(finPista, t);
}
if (!finPista) throw new Error("No pude calcular la duración.");

const segundos = finPista / escalaPista;
const enVideo = Math.round(segundos * escalaVideo);
escribir(mvhd.cuerpo + (mvhdV1 ? 24 : 16), mvhdV1, enVideo);
escribir(mdhd.cuerpo + (mdhdV1 ? 24 : 16), mdhdV1, finPista);
for (const tkhd of todas.filter((c) => c.tipo === "tkhd")) {
  const v1 = b[tkhd.cuerpo] === 1;
  escribir(tkhd.cuerpo + (v1 ? 28 : 20), v1, enVideo);
}
const mehd = todas.find((c) => c.tipo === "mehd");
if (mehd) escribir(mehd.cuerpo + 4, b[mehd.cuerpo] === 1, enVideo);

fs.writeFileSync(archivo, b);
console.log(`Duración: ${Math.floor(segundos / 60)}:${String(Math.round(segundos % 60)).padStart(2, "0")} (${segundos.toFixed(1)} s)`);
