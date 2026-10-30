// Genera los íconos PNG de la app (mismo dibujo que public/icono.svg),
// y los de Android si existe el proyecto android/ (npx cap add android).
import { deflateSync } from 'node:zlib';
import { existsSync, writeFileSync } from 'node:fs';

const FONDO = [0x00, 0xc9, 0x6b];
const BLANCO = [0xff, 0xff, 0xff];
const CENTRO = [0x14, 0x20, 0x2b];

function crc32(datos) {
  let crc = 0xffffffff;
  for (const byte of datos) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

// Color del pin en (x, y) normalizados a 0..512, igual que el SVG; null fuera del pin.
function color(x, y) {
  const cx = 256, cy = 216, r = 126;
  const d = Math.hypot(x - cx, y - cy);
  if (Math.hypot(x - 256, y - 214) <= 50) return CENTRO;
  if (d <= r) return BLANCO;
  // punta del pin: triángulo desde las tangentes hasta (256, 420)
  if (y > cy && y <= 420) {
    const ancho = r * 0.87 * (1 - (y - cy) / (420 - cy));
    if (Math.abs(x - cx) <= ancho) return BLANCO;
  }
  return null;
}

// conFondo: fondo verde opaco. Sin fondo: transparente (capa frontal de los íconos adaptables de Android).
// escala < 1 achica el pin hacia el centro, para respetar la zona segura del recorte de Android.
function png(lado, { conFondo = true, escala = 1 } = {}) {
  const canales = conFondo ? 3 : 4;
  const filas = [];
  for (let y = 0; y < lado; y++) {
    const fila = Buffer.alloc(1 + lado * canales);
    for (let x = 0; x < lado; x++) {
      const px = 256 + (((x + 0.5) * 512) / lado - 256) / escala;
      const py = 256 + (((y + 0.5) * 512) / lado - 256) / escala;
      const c = color(px, py);
      if (conFondo) fila.set(c ?? FONDO, 1 + x * 3);
      else if (c) fila.set([...c, 255], 1 + x * 4);
    }
    filas.push(fila);
  }
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera.set([8, conFondo ? 2 : 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', deflateSync(Buffer.concat(filas))),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

for (const lado of [192, 512]) writeFileSync(new URL(`../public/icono-${lado}.png`, import.meta.url), png(lado));
console.log('Íconos generados en public/');

const res = new URL('../android/app/src/main/res/', import.meta.url);
if (existsSync(res)) {
  const densidades = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [nombre, factor] of Object.entries(densidades)) {
    const carpeta = new URL(`mipmap-${nombre}/`, res);
    const icono = png(Math.round(48 * factor), { escala: 0.8 });
    writeFileSync(new URL('ic_launcher.png', carpeta), icono);
    writeFileSync(new URL('ic_launcher_round.png', carpeta), icono);
    writeFileSync(new URL('ic_launcher_foreground.png', carpeta), png(Math.round(108 * factor), { conFondo: false, escala: 0.5 }));
  }
  writeFileSync(new URL('values/ic_launcher_background.xml', res),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#00C96B</color>\n</resources>\n');
  console.log('Íconos de Android generados');
}
