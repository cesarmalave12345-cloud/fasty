// Íconos de línea e ilustraciones de vehículos, todo en SVG para que pese poco y se vea nítido.

const TRAZOS = {
  menu: '<path d="M4 7h16M4 12h10M4 17h16"/>',
  atras: '<path d="M15 18l-6-6 6-6"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  derecha: '<path d="M9 6l6 6-6 6"/>',
  mira: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  billetera: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 15h2"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  estrella: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  auto: '<path d="M5 15l1.6-4.6A2 2 0 0 1 8.5 9h7a2 2 0 0 1 1.9 1.4L19 15"/><rect x="3" y="15" width="18" height="4" rx="1.5"/><path d="M6 19v2M18 19v2"/>',
  cambio: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  soporte: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  salir: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/>',
  descargar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  casa: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  trabajo: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  etiqueta: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  mapa: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  navegar: '<path d="M3 11l18-8-8 18-2-8z"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  candado: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  billete: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  movil: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
};

const VERDE = '#00c96b';
const MARINO = '#14202b';

// Logo de Fasty: el frente de un carro dentro de un círculo.
export const logo = (tam = 40) => `<svg viewBox="0 0 48 48" width="${tam}" height="${tam}" aria-hidden="true">
  <circle cx="24" cy="24" r="24" fill="${MARINO}"/>
  <path d="M15.5 22l2.5-6.5q.6-1.5 2.2-1.5h7.6q1.6 0 2.2 1.5l2.5 6.5z" fill="${VERDE}"/>
  <path d="M18.6 21.2l1.6-4.6h7.6l1.6 4.6z" fill="${MARINO}" opacity=".9"/>
  <rect x="11" y="21" width="26" height="10" rx="3" fill="${VERDE}"/>
  <rect x="13" y="30" width="5" height="4.5" rx="1.5" fill="${VERDE}"/><rect x="30" y="30" width="5" height="4.5" rx="1.5" fill="${VERDE}"/>
  <circle cx="16.2" cy="26" r="2" fill="${MARINO}"/><circle cx="31.8" cy="26" r="2" fill="${MARINO}"/>
  <rect x="21" y="25" width="6" height="2" rx="1" fill="${MARINO}"/></svg>`;

// Escena de la pantalla de entrada: fondo verde, un camino punteado y carros blancos vistos desde arriba.
export function ilustracionMapa() {
  const auto = (x, y, giro) => `<g transform="translate(${x} ${y}) rotate(${giro})">
    <rect x="-8" y="-15" width="16" height="30" rx="6" fill="#fff"/>
    <path d="M-5.5 -7q5.5-3 11 0l-1 4.5h-9z" fill="${MARINO}" opacity=".85"/>
    <path d="M-5 7h10l1 3q-6 2-12 0z" fill="${MARINO}" opacity=".7"/>
    <rect x="-8" y="-15" width="16" height="30" rx="6" fill="none" stroke="rgba(0,0,0,.12)"/></g>`;
  return `<svg viewBox="0 0 320 180" role="img" aria-label="Carros blancos recorriendo un camino sobre fondo verde">
    <defs><radialGradient id="brillo" cx="70%" cy="20%" r="80%"><stop offset="0" stop-color="#2ee08a"/><stop offset="1" stop-color="${VERDE}"/></radialGradient></defs>
    <rect width="320" height="180" rx="26" fill="url(#brillo)"/>
    <path d="M-10 150q60-10 90-50t80-30q50 10 70-30t60-40" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-dasharray="0 13" stroke-linecap="round" fill="none"/>
    <path d="M200 190q10-40 60-60t80-10" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-dasharray="0 11" stroke-linecap="round" fill="none"/>
    <g transform="translate(256 22)"><path d="M11 0a11 11 0 0 0-11 11c0 8 11 20 11 20s11-12 11-20A11 11 0 0 0 11 0z" fill="${MARINO}"/><circle cx="11" cy="11" r="4" fill="#fff"/></g>
    <circle cx="44" cy="140" r="8" fill="#fff" stroke="${MARINO}" stroke-width="4"/>
    <g transform="translate(120 52)"><rect width="56" height="24" rx="12" fill="${MARINO}"/><text x="28" y="16.5" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff" font-family="Urbanist, sans-serif">4 min</text></g>
    ${auto(170, 74, 62)}${auto(92, 112, 120)}${auto(268, 128, -25)}${auto(56, 40, 20)}
  </svg>`;
}

export const icono = (nombre, tam = 22) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre]}</svg>`;

export const pinRelleno = (tam = 22) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>`;

export const estrellaRellena = (tam = 22) =>
  `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/></svg>`;

// Sello dentado con un check, para el viaje completado.
export function sello(tam = 88) {
  const puntas = Array.from({ length: 24 }, (_, i) => {
    const r = i % 2 ? 41 : 47;
    const a = (i * 15 * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 100 100" width="${tam}" height="${tam}" aria-hidden="true">
    <polygon points="${puntas}" fill="${VERDE}" stroke="${VERDE}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M33 51l11 11 23-24" fill="none" stroke="${MARINO}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Color aproximado a partir del nombre que escribió el conductor ("Gris plomo", "Azul", ...).
const COLORES = [
  ['vinotinto', '#7b2335'], ['blanc', '#f4f4f4'], ['negr', '#2a2a2a'], ['gris', '#b9bcc0'], ['plat', '#cfd3d6'],
  ['roj', '#d64545'], ['azul', '#3d6fd8'], ['verde', '#3f9b6b'], ['amarill', '#f2c230'], ['naranja', '#f08a3c'],
  ['marron', '#7a5338'], ['beige', '#d9c7a3'], ['dorad', '#d4b062'], ['champan', '#d8c7a0'], ['morad', '#6b4fa3'],
];
export function colorVehiculo(nombre) {
  const limpio = String(nombre ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return COLORES.find(([clave]) => limpio.includes(clave))?.[1] ?? '#cfd3d6';
}

function autoLateral(color) {
  const rueda = cx => `<circle cx="${cx}" cy="46" r="10" fill="#1c1c1c"/><circle cx="${cx}" cy="46" r="5" fill="#d4d4d4"/><circle cx="${cx}" cy="46" r="2" fill="#8a8a8a"/>`;
  return `<svg viewBox="0 0 140 60" aria-hidden="true">
    <ellipse cx="70" cy="55" rx="60" ry="3.5" fill="#000" opacity=".1"/>
    <path d="M10 40c0-7 4-9 12-10l18-2 14-12c3-2.5 7-4 12-4h26c7 0 12 2 17 7l9 9c8 1 13 4 14 9v6c0 2-2 4-4 4H14c-3 0-4-2-4-4z" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
    <path d="M58 18c2-1.5 4-2 7-2h13v12H46z" fill="#20262c" opacity=".88"/>
    <path d="M82 16h9c5 0 9 1.5 12 5l5 7H82z" fill="#20262c" opacity=".88"/>
    <path d="M80 28v17" stroke="rgba(0,0,0,.15)" stroke-width="1.2"/>
    <path d="M20 36h106" stroke="#fff" stroke-opacity=".45" stroke-width="1.5"/>
    <rect x="125" y="32" width="6" height="3" rx="1.5" fill="#fff3c4"/>
    <rect x="10" y="33" width="4" height="3" rx="1" fill="#d33"/>
    ${rueda(36)}${rueda(108)}</svg>`;
}

function motoLateral(color) {
  const rueda = cx => `<circle cx="${cx}" cy="42" r="12" fill="none" stroke="#1c1c1c" stroke-width="5"/><circle cx="${cx}" cy="42" r="3" fill="#9a9a9a"/>`;
  return `<svg viewBox="0 0 140 60" aria-hidden="true">
    <ellipse cx="70" cy="56" rx="54" ry="3" fill="#000" opacity=".1"/>
    ${rueda(32)}${rueda(106)}
    <path d="M32 42l24-12h28l22 12" stroke="#2b2b2b" stroke-width="4" fill="none" stroke-linejoin="round"/>
    <rect x="56" y="31" width="22" height="11" rx="3" fill="#3a3a3a"/>
    <path d="M22 34c4-6 12-8 20-6" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M38 27c6-4 16-4 22-2l-2 4H40z" fill="#1f1f1f"/>
    <path d="M56 29c4-9 15-12 28-9l10 4-4 7H58z" fill="${color}" stroke="rgba(0,0,0,.15)"/>
    <path d="M106 42L94 16" stroke="#6b6b6b" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M89 15l11-4" stroke="#1f1f1f" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="98" cy="22" r="3" fill="#fff3c4" stroke="#bbb"/></svg>`;
}

export const vehiculoLateral = (tipo, color) => (tipo === 'moto' ? motoLateral(color) : autoLateral(color));

// Vista desde arriba, para los marcadores del mapa. Apunta hacia el norte; se rota con CSS.
export function vehiculoArriba(tipo, color, rumbo = 0) {
  const cuerpo = tipo === 'moto'
    ? `<rect x="10" y="5" width="4" height="34" rx="2" fill="#222"/><ellipse cx="12" cy="21" rx="4.5" ry="8" fill="${color}"/><path d="M4 11h16" stroke="#222" stroke-width="2.4" stroke-linecap="round"/>`
    : `<rect x="2" y="2" width="20" height="40" rx="8" fill="${color}" stroke="rgba(0,0,0,.2)"/>
       <path d="M5 13q7-4 14 0l-1 6H6z" fill="#1f262c" opacity=".85"/>
       <path d="M6 32h12l1 4q-7 2.5-14 0z" fill="#1f262c" opacity=".7"/>
       <rect x="6" y="20" width="12" height="11" rx="2" fill="#fff" opacity=".2"/>`;
  return `<svg class="auto-arriba" viewBox="0 0 24 44" width="17" height="31" style="transform: rotate(${Math.round(rumbo)}deg)" aria-hidden="true">${cuerpo}</svg>`;
}
