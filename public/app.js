/* global L */
import { icono, pinRelleno, estrellaRellena, sello, colorVehiculo, vehiculoLateral, vehiculoArriba, ilustracionMapa, logo } from './graficos.js';

const $ = s => document.querySelector(s);
const panel = $('#panel');

const METODOS = {
  efectivo: { nombre: 'Efectivo', detalle: 'Pagas al conductor al llegar', icono: 'billete' },
  pago_movil: { nombre: 'Pago Móvil', detalle: 'Transfieres y reportas la referencia', icono: 'movil' },
  tarjeta: { nombre: 'Tarjeta', detalle: 'Débito o crédito', icono: 'tarjeta' },
};
const VERDE = '#00c96b';
const VEHICULOS = {
  carro: { nombre: 'Carro', personas: 4, color: '#f4f6f5' },
  moto: { nombre: 'Moto', personas: 1, color: VERDE },
};
const ETIQUETA_ESTADO = {
  programado: 'Agendado', buscando: 'Buscando', aceptado: 'Aceptado', llego: 'Conductor llegó', en_curso: 'En curso',
  finalizado: 'Completado', cancelado: 'Cancelado', sin_conductor: 'Sin conductor',
};
const LUGARES = { casa: ['casa', 'Casa'], trabajo: ['trabajo', 'Trabajo'] };
const COLOR_CERCANOS = '#ffffff'; // carros libres en blanco, como en el diseño
const ESPERA_REENVIO_S = 60;

const S = {
  token: localStorage.getItem('token'),
  modo: localStorage.getItem('modo') || 'pasajero',
  usuario: null,
  config: null,
  vista: 'inicio', // inicio | actividad | agendados | cuenta | lugares | postular
  anterior: 'inicio',
  cajon: false,
  modoAuth: 'login', // login | registro | recuperar
  authModo: 'pasajero',
  verif: null, // { telefono, enviado } mientras se espera el código SMS
  viaje: null,
  terminado: null, // viaje recién cerrado: pantalla de viaje completado
  estrellas: 0,
  toque: null, // último botón tocado, para animar la selección
  direccion: null, // 'atras' cuando se vuelve, para deslizar la página en sentido contrario
  // pasajero: armado del viaje
  paso: null, // null | destino | mapa | opciones
  origen: null,
  destino: null,
  mapaObjetivo: null, // { cual: 'origen' | 'destino' } o { lugar: 'casa' | 'trabajo' }
  puntoMapa: null,
  volverA: null,
  busqueda: '',
  buscado: '',
  resultados: [],
  cotizacion: null,
  cotizando: null,
  tipo: 'carro',
  cuadralo: false,
  oferta: '',
  cuando: 'ahora',
  programado: '',
  metodo: 'efectivo',
  para: null,
  lugares: { casa: null, trabajo: null, recientes: [] },
  // listas
  historial: null,
  filtro: 'todo',
  detalle: null,
  agendados: null,
  // conductor
  enLinea: false,
  posicion: null,
  gpsManual: false,
  solicitudes: [],
  resumen: null,
};

const esConductor = () => S.modo === 'conductor' && Boolean(S.usuario?.conductor);

// ---------- Utilidades ----------

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = n => '$' + Number(n).toFixed(2);
const bs = (n, tasa = S.config?.tasa_bs) => tasa
  ? 'Bs ' + (n * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '';
const montos = (n, tasa = S.config?.tasa_bs) => `${usd(n)}${tasa ? ` · ${bs(n, tasa)}` : ''}`;
const whatsapp = tel => 'https://wa.me/' + String(tel).replace(/\D/g, '').replace(/^0/, '58');
const coordenadas = p => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
const inicial = nombre => esc(String(nombre || '?').trim()[0]?.toUpperCase());
const primerNombre = nombre => String(nombre ?? '').trim().split(' ')[0];
const corta = dir => String(dir ?? '').split(',')[0];
const deSql = s => new Date(s.replace(' ', 'T') + 'Z');
const fechaLocalInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function distanciaKm(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function fechaAmigable(s) {
  const d = deSql(s);
  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  const dia = mismoDia(d, new Date()) ? 'Hoy'
    : mismoDia(d, new Date(Date.now() - 864e5)) ? 'Ayer'
      : mismoDia(d, new Date(Date.now() + 864e5)) ? 'Mañana'
        : d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${dia} · ${d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
}

async function api(ruta, opciones = {}) {
  const respuesta = await fetch('/api' + ruta, {
    method: opciones.body ? 'POST' : 'GET',
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(S.token && { Authorization: 'Bearer ' + S.token }) },
    body: opciones.body && JSON.stringify(opciones.body),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401 && S.token) cerrarSesion();
  if (!respuesta.ok) throw new Error(datos.error || 'Sin conexión. Intenta de nuevo.');
  return datos;
}
const post = (ruta, body = {}) => api(ruta, { method: 'POST', body });

async function direccion(p) {
  try {
    return (await api(`/direccion?lat=${p.lat}&lng=${p.lng}`)).direccion || coordenadas(p);
  } catch {
    return coordenadas(p);
  }
}

let avisoTimer;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (el.hidden = true), 4500);
}

const vibrar = () => navigator.vibrate?.([200, 100, 200]);

// ---------- Mapa ----------

const mapa = L.map('mapa', { zoomControl: false, attributionControl: false });
L.control.attribution({ position: 'topleft', prefix: false }).addTo(mapa);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);

const capas = { origen: null, destino: null, conductor: null, yo: null, seleccion: null, ruta: null };
const capaCercanos = L.layerGroup().addTo(mapa);

const MARCAS = {
  origen: ['<div class="pin-origen"></div>', [18, 18]],
  destino: [`<div class="pin-destino"><span>${pinRelleno(16)}</span></div>`, [38, 38]],
  seleccion: [`<div class="pin-seleccion">${pinRelleno(40)}</div>`, [40, 40], [20, 38]],
};

function marcador(nombre, punto, html, tam = [34, 34], ancla) {
  const actual = capas[nombre];
  if (!punto) {
    actual?.remove();
    capas[nombre] = null;
    return;
  }
  if (actual && actual.html === html) return actual.setLatLng([punto.lat, punto.lng]);
  actual?.remove();
  const icon = L.divIcon({ className: 'pin', html, iconSize: tam, iconAnchor: ancla ?? [tam[0] / 2, tam[1] / 2] });
  capas[nombre] = L.marker([punto.lat, punto.lng], { icon, interactive: false }).addTo(mapa);
  capas[nombre].html = html;
}

const marca = (nombre, punto) => marcador(nombre, punto, ...MARCAS[nombre]);

function etiqueta(nombre, texto) {
  const m = capas[nombre];
  if (!m) return;
  if (!texto) return void m.unbindTooltip();
  if (m.getTooltip()) m.setTooltipContent(texto);
  else m.bindTooltip(texto, { permanent: true, direction: 'top', className: 'burbuja', offset: [0, -16] }).openTooltip();
}

let rutaDibujada = null;
function ruta(geometria, a, b) {
  const clave = geometria ? JSON.stringify(geometria.coordinates.slice(0, 2)) + geometria.coordinates.length : a && b ? coordenadas(a) + coordenadas(b) : null;
  if (clave === rutaDibujada) return;
  rutaDibujada = clave;
  capas.ruta?.remove();
  capas.ruta = null;
  if (geometria) capas.ruta = L.polyline(geometria.coordinates.map(([lng, lat]) => [lat, lng]), { color: VERDE, weight: 6, lineJoin: 'round', lineCap: 'round' }).addTo(mapa);
  else if (a && b) capas.ruta = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: VERDE, weight: 4, dashArray: '2 10', lineCap: 'round' }).addTo(mapa);
}

function minutosConductor(v) {
  if (v.conductor_lat == null) return null;
  const km = distanciaKm({ lat: v.conductor_lat, lng: v.conductor_lng }, { lat: v.origen_lat, lng: v.origen_lng }) * 1.4;
  return Math.max(1, Math.round((km / 25) * 60));
}

function dibujarMapa() {
  const v = S.viaje;
  const o = v ? { lat: v.origen_lat, lng: v.origen_lng } : null;
  const d = v ? { lat: v.destino_lat, lng: v.destino_lng } : null;
  marca('seleccion', S.paso === 'mapa' ? S.puntoMapa : null);
  if (!S.usuario) {
    for (const nombre of ['origen', 'destino', 'conductor', 'yo']) marcador(nombre, null);
    ruta(null);
  } else if (esConductor()) {
    marcador('yo', S.posicion, vehiculoArriba(S.usuario.conductor.tipo, VERDE, S.rumbo ?? 0), [17, 31]);
    marcador('conductor', null);
    marca('origen', o);
    marca('destino', d);
    ruta(v?.ruta, o, d);
  } else {
    const origen = o ?? S.origen;
    const destino = d ?? S.destino;
    marcador('yo', null);
    marca('origen', origen);
    marca('destino', destino);
    const conductor = v && v.estado !== 'buscando' && v.conductor_lat != null ? { lat: v.conductor_lat, lng: v.conductor_lng } : null;
    marcador('conductor', conductor, vehiculoArriba(v?.tipo, colorVehiculo(v?.color), v?.rumbo ?? 0), [17, 31]);
    ruta(v ? v.ruta : S.cotizacion?.ruta, S.cotizacion || v ? origen : null, destino);
    etiqueta('destino', !v && S.paso === 'opciones' && S.cotizacion ? `${Math.round(S.cotizacion.duracion_min)} min` : null);
    etiqueta('conductor', v?.estado === 'aceptado' ? `${minutosConductor(v) ?? '…'} min` : v?.estado === 'llego' ? 'Llegó' : null);
  }
  if (!mostrarCercanos()) capaCercanos.clearLayers();
}

function encuadrar() {
  // Si la hoja está animando su alto, esperamos a que termine para medirla bien.
  const animando = panel.getAnimations();
  if (animando.length) return void Promise.all(animando.map(a => a.finished.catch(() => {}))).then(encuadrar);
  const visibles = ['origen', 'destino', 'conductor', 'yo', 'seleccion'].map(n => capas[n]).filter(Boolean);
  if (!visibles.length || panel.classList.contains('pagina')) return;
  const escritorio = window.innerWidth >= 768;
  const abajo = escritorio ? 40 : panel.offsetHeight + 30;
  const izquierda = escritorio ? panel.offsetWidth + 60 : 30;
  if (visibles.length === 1) return mapa.setView(visibles[0].getLatLng(), 16);
  mapa.fitBounds(L.featureGroup(visibles).getBounds(), { paddingTopLeft: [izquierda, 100], paddingBottomRight: [70, abajo], maxZoom: 16 });
}

// Carros libres alrededor, como en las apps grandes: dan confianza de que hay servicio.
const mostrarCercanos = () => S.usuario && !esConductor() && !S.viaje && S.vista === 'inicio' && !S.terminado;

async function cargarCercanos() {
  if (!mostrarCercanos()) return;
  const centro = S.origen ?? mapa.getCenter();
  try {
    const { conductores } = await api(`/conductores/cercanos?lat=${centro.lat}&lng=${centro.lng}`);
    capaCercanos.clearLayers();
    if (!mostrarCercanos()) return;
    conductores.forEach(c => {
      const rumbo = Math.abs(Math.round((c.lat * 1000 + c.lng * 1000) * 37)) % 360;
      const html = vehiculoArriba(c.tipo, COLOR_CERCANOS, rumbo);
      L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'pin', html, iconSize: [17, 31] }), interactive: false }).addTo(capaCercanos);
    });
  } catch {
    // no es importante si falla
  }
}
setInterval(cargarCercanos, 15000);

mapa.on('click', e => {
  const p = { lat: e.latlng.lat, lng: e.latlng.lng };
  if (!S.usuario || S.vista !== 'inicio' || S.terminado) return;
  if (esConductor()) {
    if (S.enLinea && S.gpsManual) actualizarPosicion(p);
  } else if (S.paso === 'mapa') {
    elegirEnMapa(p);
  } else if (!S.viaje && !S.paso) {
    S.mapaObjetivo = { cual: 'destino' };
    S.paso = 'mapa';
    elegirEnMapa(p);
  }
});

const botonUbicacion = $('#boton-ubicacion');
botonUbicacion.innerHTML = icono('mira');
function posicionarBotonUbicacion() {
  if (window.innerWidth < 768) botonUbicacion.style.bottom = `${panel.offsetHeight + 14}px`;
}
new ResizeObserver(posicionarBotonUbicacion).observe(panel);

// ---------- Tiempo real ----------

let ws = null;
function conectar() {
  if (!S.token || ws) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${S.token}`);
  ws.onopen = () => enviarUbicacion(true);
  ws.onmessage = e => manejar(JSON.parse(e.data));
  ws.onclose = () => {
    ws = null;
    if (S.token) setTimeout(() => S.token && (conectar(), sincronizar().catch(() => {})), 3000);
  };
}

const rumboEntre = (a, b) => (Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;

function manejar(m) {
  if (m.tipo === 'viaje') actualizarViaje(m.viaje);
  else if (m.tipo === 'solicitud' && esConductor() && !S.viaje) {
    if (!S.solicitudes.some(s => s.id === m.solicitud.id)) S.solicitudes.push(m.solicitud);
    vibrar();
    render();
  } else if (m.tipo === 'solicitud_tomada') {
    S.solicitudes = S.solicitudes.filter(s => s.id !== m.id);
    render();
  } else if (m.tipo === 'ubicacion_conductor' && S.viaje) {
    const v = S.viaje;
    if (v.conductor_lat != null && (v.conductor_lat !== m.lat || v.conductor_lng !== m.lng)) {
      v.rumbo = rumboEntre({ lat: v.conductor_lat, lng: v.conductor_lng }, m);
    }
    v.conductor_lat = m.lat;
    v.conductor_lng = m.lng;
    dibujarMapa();
  } else if (m.tipo === 'desconectado') {
    S.enLinea = false;
    detenerGps();
    aviso('Te desconectamos por inactividad.');
    render();
  } else if (m.tipo === 'cuenta') {
    sincronizar().catch(() => {});
  }
}

const cerrados = new Set(); // la respuesta HTTP y el WebSocket pueden traer el mismo cierre

function actualizarViaje(v) {
  const yo = S.usuario.id;
  const mio = S.modo === 'conductor' ? v.conductor_id === yo : v.pasajero_id === yo;
  if ((!mio && S.viaje?.id !== v.id) || v.estado === 'programado') return;
  const cerrado = !mio || ['cancelado', 'sin_conductor'].includes(v.estado) || (v.estado === 'finalizado' && v.pago_estado === 'confirmado');
  const cambio = S.viaje?.id !== v.id || S.viaje?.estado !== v.estado || S.viaje?.pago_estado !== v.pago_estado;
  const clave = `${v.id}:${v.estado}:${v.conductor_id}`;
  if (!cerrado) {
    if (!S.viaje) {
      S.vista = 'inicio';
      S.paso = null;
    }
    v.rumbo = S.viaje?.id === v.id ? S.viaje.rumbo : 0;
    S.viaje = v;
  } else if (!cerrados.has(clave) && (S.viaje?.id === v.id || v.estado === 'finalizado')) {
    cerrados.add(clave);
    S.viaje = null;
    if (mio && v.estado === 'finalizado') {
      S.terminado = v;
      S.estrellas = 0;
      S.vista = 'inicio';
    } else if (v.estado === 'sin_conductor') aviso('No encontramos un conductor disponible. Intenta de nuevo en unos minutos.');
    else if (v.cancelado_por && v.cancelado_por !== S.modo) aviso('El viaje fue cancelado.');
    if (S.modo === 'pasajero') {
      reiniciarPedido();
      cargarLugares().then(render).catch(() => {});
    } else {
      cargarConductor().then(render).catch(() => {});
    }
  }
  if (cambio && mio) vibrar();
  render();
  if (cambio) setTimeout(encuadrar, 50);
}

// ---------- GPS ----------

let vigia = null;
let ultimoEnvio = 0;

function iniciarGps() {
  if (vigia !== null) return;
  if (!navigator.geolocation) {
    S.gpsManual = true;
    return;
  }
  vigia = navigator.geolocation.watchPosition(
    p => {
      S.gpsManual = false;
      actualizarPosicion({ lat: p.coords.latitude, lng: p.coords.longitude });
    },
    () => {
      if (!S.posicion) S.gpsManual = true;
      render();
    },
    { enableHighAccuracy: true, maximumAge: 5000 },
  );
}

function detenerGps() {
  if (vigia !== null) navigator.geolocation.clearWatch(vigia);
  vigia = null;
}

function actualizarPosicion(p) {
  const primera = !S.posicion;
  if (S.posicion && distanciaKm(S.posicion, p) > 0.005) S.rumbo = rumboEntre(S.posicion, p);
  S.posicion = p;
  dibujarMapa();
  enviarUbicacion(primera);
  if (primera) encuadrar();
}

function enviarUbicacion(forzar) {
  if (!S.enLinea || !S.posicion || ws?.readyState !== 1) return;
  if (!forzar && Date.now() - ultimoEnvio < 4000) return;
  ultimoEnvio = Date.now();
  ws.send(JSON.stringify({ tipo: 'ubicacion', ...S.posicion }));
}
setInterval(() => enviarUbicacion(true), 20000);

// ---------- Sesión ----------

async function iniciar() {
  S.config = await api('/config');
  document.title = S.config.app;
  mapa.setView([S.config.ciudad.lat, S.config.ciudad.lng], 14);
  if (S.token) {
    try {
      S.usuario = (await api('/yo')).usuario;
    } catch {
      S.token = null;
      localStorage.removeItem('token');
    }
  }
  if (S.usuario?.rol === 'admin') return location.replace('/admin.html');
  if (S.usuario) await entrar();
  else render();
}

async function entrar() {
  conectar();
  await sincronizar();
  if (S.modo === 'pasajero' && !S.viaje) ubicarPasajero();
  cargarCercanos();
}

async function sincronizar() {
  const [{ usuario }, { viaje }] = await Promise.all([api('/yo'), api('/viajes/activo?modo=' + S.modo)]);
  S.usuario = usuario;
  if (S.modo === 'conductor' && !usuario.conductor) return cambiarModo('pasajero');
  S.viaje = viaje;
  if (S.modo === 'conductor') {
    S.enLinea = Boolean(usuario.conductor.en_linea);
    if (S.enLinea) iniciarGps();
    await cargarConductor();
  } else {
    await cargarLugares().catch(() => {});
  }
  render();
  encuadrar();
}

async function cambiarModo(modo) {
  if (S.enLinea) {
    await post('/conductor/en-linea', { en_linea: false }).catch(() => {});
    S.enLinea = false;
  }
  detenerGps();
  Object.assign(S, { modo, vista: 'inicio', cajon: false, viaje: null, terminado: null, solicitudes: [], posicion: null });
  reiniciarPedido();
  localStorage.setItem('modo', modo);
  await sincronizar();
  if (modo === 'pasajero' && !S.viaje && !S.origen) ubicarPasajero();
  cargarCercanos();
}

async function cargarConductor() {
  const [{ solicitudes }, resumen] = await Promise.all([
    S.enLinea && !S.viaje ? api('/conductor/solicitudes') : { solicitudes: [] },
    api('/conductor/resumen'),
  ]);
  S.solicitudes = solicitudes;
  S.resumen = resumen;
}

async function cargarLugares() {
  S.lugares = await api('/lugares');
}

async function cargarLista(clave, ruta) {
  S[clave] = null;
  render();
  try {
    S[clave] = (await api(ruta)).viajes;
  } catch (e) {
    S[clave] = [];
    aviso(e.message);
  }
  render();
}
const cargarHistorial = () => cargarLista('historial', '/viajes?modo=' + S.modo);
const cargarAgendados = () => cargarLista('agendados', '/viajes/agendados');

function cerrarSesion() {
  S.token = null;
  localStorage.removeItem('token');
  Object.assign(S, {
    usuario: null, viaje: null, terminado: null, enLinea: false, posicion: null, origen: null,
    vista: 'inicio', cajon: false, modoAuth: 'login', verif: null,
  });
  reiniciarPedido();
  capaCercanos.clearLayers();
  detenerGps();
  ws?.close();
  render();
}

// Entrar con celular y contraseña, crear cuenta o recuperar la contraseña (estos dos con código por SMS).
async function enviarAuth(form, ruta, armarCuerpo) {
  const d = Object.fromEntries(new FormData(form));
  const conductor = S.authModo === 'conductor';
  const boton = form.querySelector('button[type=submit]');
  boton.disabled = true;
  boton.classList.add('cargando');
  try {
    const r = await post(ruta, armarCuerpo(d, conductor));
    S.token = r.token;
    localStorage.setItem('token', r.token);
    S.usuario = r.usuario;
    S.verif = null;
    S.modoAuth = 'login';
    if (r.usuario.rol === 'admin') return location.replace('/admin.html');
    if (conductor && !r.usuario.conductor) aviso('Tu cuenta aún no tiene vehículo. Puedes postularte como conductor desde tu cuenta.');
    else if (ruta === '/pin/restablecer') aviso('Listo, guardamos tu nueva contraseña.');
    S.modo = conductor && r.usuario.conductor ? 'conductor' : 'pasajero';
    localStorage.setItem('modo', S.modo);
    await entrar();
  } catch (e) {
    aviso(e.message);
    boton.classList.remove('cargando');
    if (boton.isConnected) boton.disabled = false;
  }
}

async function pedirCodigo(telefono) {
  await post('/verificacion/enviar', { telefono, proposito: S.modoAuth === 'registro' ? 'registro' : 'pin' });
  S.verif = { telefono, enviado: Date.now() };
  aviso(`Te enviamos un código por SMS al ${telefono}.`);
}

const segundosParaReenviar = () => Math.max(0, Math.ceil(ESPERA_REENVIO_S - (Date.now() - S.verif.enviado) / 1000));
const textoReenviar = () => (segundosParaReenviar() ? `Reenviar en ${segundosParaReenviar()} s` : 'Reenviar código');

setInterval(() => {
  const boton = $('#reenviar');
  if (!boton || !S.verif) return;
  boton.textContent = textoReenviar();
  boton.disabled = segundosParaReenviar() > 0;
}, 1000);

// ---------- Pasajero: armar el viaje ----------

function reiniciarPedido() {
  Object.assign(S, {
    paso: null, destino: null, cotizacion: null, cotizando: null, mapaObjetivo: null, puntoMapa: null, busqueda: '', resultados: [],
    cuadralo: false, oferta: '', cuando: 'ahora', programado: '', para: null,
  });
}

function ubicarPasajero() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async p => {
      const punto = { lat: p.coords.latitude, lng: p.coords.longitude };
      S.origen = { ...punto, dir: 'Tu ubicación actual' };
      mapa.setView([punto.lat, punto.lng], 16);
      render();
      cargarCercanos();
      const dir = await direccion(punto);
      if (S.origen?.lat === punto.lat) {
        S.origen.dir = dir;
        render();
      }
      if (S.destino && S.paso === 'opciones') cotizar();
    },
    () => {
      if (!S.origen) aviso('No pudimos obtener tu ubicación. Elige el punto de recogida en el mapa.');
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

async function elegirEnMapa(p) {
  S.puntoMapa = { ...p, dir: 'Buscando dirección…', cargando: true };
  render();
  const dir = await direccion(p);
  if (S.puntoMapa?.lat === p.lat && S.puntoMapa?.lng === p.lng) {
    S.puntoMapa = { ...p, dir };
    render();
  }
}

function siguientePaso() {
  if (!S.origen || !S.destino) {
    S.paso = 'destino';
    render();
    if (!S.origen) aviso('Elige primero dónde te recogemos.');
    return;
  }
  S.paso = 'opciones';
  S.cotizacion = null;
  cotizar();
}

function irADestino(lugar) {
  S.destino = { lat: lugar.lat, lng: lugar.lng, dir: lugar.dir ?? lugar.nombre };
  S.busqueda = '';
  S.resultados = [];
  siguientePaso();
}

async function cotizar() {
  const clave = coordenadas(S.origen) + coordenadas(S.destino);
  S.cotizando = clave;
  render();
  try {
    const c = await post('/cotizar', { origen: S.origen, destino: S.destino });
    if (S.cotizando !== clave) return;
    S.cotizacion = c;
    S.config.tasa_bs = c.tasa_bs;
    if (S.cuadralo) S.oferta = c.precios[S.tipo].toFixed(2);
  } catch (e) {
    aviso(e.message);
  }
  if (S.cotizando === clave) S.cotizando = null;
  render();
  encuadrar();
}

const pisoCuadralo = () => Math.round(S.cotizacion.precios[S.tipo] * S.config.cuadralo_min_pct) / 100;
const precioElegido = () => (S.cuadralo ? Number(S.oferta) || 0 : S.cotizacion.precios[S.tipo]);

// ---------- Piezas de interfaz ----------

const cabecera = (titulo, accion = 'atras') => `
  <div class="cabecera-pagina">
    <button class="circulo" data-accion="${accion}" aria-label="Volver">${icono('atras')}</button>
    <h2>${titulo}</h2><span></span>
  </div>`;

const itemMenu = (accion, datos, ic, texto, detalle = '', rojo = false) => `
  <button data-accion="${accion}" ${datos}>
    <span class="icono-redondo ${rojo ? 'rojo' : ''}">${icono(ic)}</span>
    <span class="crece">${texto}${detalle ? `<small class="texto-punto">${esc(detalle)}</small>` : ''}</span>
  </button>`;

function filaLugar(accion, datos, ic, titulo, dir, editable) {
  return `
    <div class="fila-lugar">
      <button class="crece" data-accion="${accion}" ${datos}>
        <span class="icono-redondo">${icono(ic, 20)}</span>
        <span class="crece">${titulo ? `${titulo}<small class="texto-punto">${esc(dir)}</small>` : `<span class="texto-punto">${esc(dir)}</span>`}</span>
      </button>
      ${editable ? `<button class="mini" data-accion="editar-lugar" data-tipo="${editable}" aria-label="Editar ${titulo}">${icono('editar', 18)}</button>` : ''}
    </div>`;
}

function listaLugares(maxRecientes) {
  const guardados = Object.entries(LUGARES).map(([tipo, [ic, titulo]]) => {
    const l = S.lugares[tipo];
    return filaLugar(l ? 'ir-lugar' : 'editar-lugar', `data-tipo="${tipo}"`, ic, titulo, l ? l.dir : 'Agregar dirección', tipo);
  });
  const recientes = S.lugares.recientes.slice(0, maxRecientes).map((l, i) => filaLugar('ir-reciente', `data-i="${i}"`, 'reloj', '', l.dir));
  return `<div class="lista-lugares">${guardados.join('')}${recientes.join('')}</div>`;
}

function contactoRedondo(tel) {
  return `
    <a class="circulo peq" href="${whatsapp(tel)}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp">${icono('chat', 19)}</a>
    <a class="circulo peq" href="tel:${esc(tel)}" aria-label="Llamar">${icono('telefono', 19)}</a>`;
}

function rutaTexto(v) {
  return `
    <div class="ruta-txt"><span class="punto negro"></span><span class="texto-punto">${esc(v.origen_dir)}</span></div>
    <div class="ruta-txt"><span class="punto naranja"></span><span class="texto-punto">${esc(v.destino_dir)}</span></div>`;
}

// ---------- Vistas: pasajero ----------

function vistaInicioPasajero() {
  const atajos = [
    ...Object.entries(LUGARES).filter(([tipo]) => S.lugares[tipo]).map(([tipo, [ic, titulo]]) =>
      `<button class="atajo" data-accion="ir-lugar" data-tipo="${tipo}">${icono(ic, 16)}<span>${titulo}</span></button>`),
    ...S.lugares.recientes.slice(0, 3).map((l, i) =>
      `<button class="atajo" data-accion="ir-reciente" data-i="${i}">${icono('reloj', 16)}<span>${esc(corta(l.dir))}</span></button>`),
  ];
  return `
    <div class="campos">
      <button class="campo" data-accion="elegir-mapa" data-cual="origen">
        <span class="gris">${pinRelleno(20)}</span>
        <span class="texto-punto ${S.origen ? '' : 'placeholder'}">${esc(S.origen?.dir || 'Punto de recogida')}</span>
      </button>
      <button class="campo" data-accion="abrir-destino">
        <span class="naranja">${pinRelleno(20)}</span>
        <span class="texto-punto ${S.destino ? '' : 'placeholder'}">${esc(S.destino?.dir || '¿A dónde vas?')}</span>
      </button>
    </div>
    ${atajos.length ? `<div class="atajos">${atajos.join('')}</div>` : ''}
    <button class="btn primario" data-accion="buscar">Buscar</button>`;
}

function htmlResultados() {
  if (S.resultados.length) {
    return S.resultados.map((r, i) => `<li data-accion="resultado" data-i="${i}"><span class="icono-redondo">${icono('mapa', 18)}</span><span>${esc(r.nombre)}</span></li>`).join('');
  }
  return S.busqueda.trim().length >= 3 && S.buscado === S.busqueda.trim() ? '<li class="vacio">Sin resultados. Prueba otro nombre o escoge en el mapa.</li>' : '';
}

function vistaDestino() {
  return `
    ${cabecera('Tu viaje')}
    <button class="chip ${S.para ? 'sel' : ''}" data-accion="alternar-para">${icono('usuario', 16)} ${S.para ? 'Para otra persona' : 'Para mí'} ${icono('abajo', 16)}</button>
    ${S.para ? `
      <div class="form fila">
        <label>Quién viaja<input name="para_nombre" value="${esc(S.para.nombre)}" autocomplete="off"></label>
        <label>Su teléfono<input name="para_telefono" type="tel" inputmode="tel" value="${esc(S.para.telefono)}" autocomplete="off"></label>
      </div>` : ''}
    <div class="campos" style="margin-top:14px">
      <button class="campo" data-accion="elegir-mapa" data-cual="origen"><span class="gris">${pinRelleno(20)}</span><span class="texto-punto ${S.origen ? '' : 'placeholder'}">${esc(S.origen?.dir || 'Punto de recogida')}</span></button>
      <label class="campo activo"><span class="naranja">${pinRelleno(20)}</span><input id="buscar" placeholder="¿A dónde vas?" value="${esc(S.busqueda)}" autocomplete="off" enterkeyhint="search"></label>
    </div>
    <button class="enlace derecha" data-accion="elegir-mapa" data-cual="destino">Escoger dirección en el mapa ›</button>
    <ul id="resultados" class="resultados">${htmlResultados()}</ul>
    ${listaLugares(5)}`;
}

function vistaMapa() {
  const o = S.mapaObjetivo;
  const titulo = o.lugar ? `Dirección de ${LUGARES[o.lugar][1].toLowerCase()}` : o.cual === 'origen' ? 'Punto de recogida' : 'Destino';
  return `
    <h3 class="titulo-hoja">${titulo}</h3>
    <div class="campo"><span class="${o.cual === 'origen' ? 'gris' : 'naranja'}">${pinRelleno(20)}</span><span class="texto-punto ${S.puntoMapa ? '' : 'placeholder'}">${S.puntoMapa ? esc(S.puntoMapa.dir) : 'Toca el mapa en el punto exacto'}</span></div>
    <button class="btn primario" data-accion="confirmar-mapa" ${!S.puntoMapa || S.puntoMapa.cargando ? 'disabled' : ''}>Confirmar ubicación</button>
    <button class="enlace" data-accion="atras">Volver</button>`;
}

function vistaOpciones() {
  const c = S.cotizacion;
  const resumen = `
    <button class="resumen-ruta" data-accion="abrir-destino">
      <span class="punto negro"></span><span class="texto-punto crece">${esc(corta(S.origen.dir))}</span>
      <span class="flecha">→</span>
      <span class="punto naranja"></span><span class="texto-punto crece">${esc(corta(S.destino.dir))}</span>
    </button>`;
  if (!c) return `<h3 class="titulo-hoja">Elige tu viaje</h3>${resumen}<p class="ayuda centro">${S.cotizando ? 'Calculando tarifa…' : 'No pudimos calcular la tarifa.'}</p>`;
  const metodos = Object.keys(METODOS).filter(m => S.config.metodos[m]);
  if (!metodos.includes(S.metodo)) S.metodo = metodos[0];
  const programar = S.cuando === 'programar';
  return `
    <h3 class="titulo-hoja">Elige tu viaje</h3>
    ${resumen}
    ${S.para ? `<p class="meta">Viaja: ${esc(S.para.nombre || 'otra persona')}</p>` : ''}
    <div class="vehiculos">
      ${Object.entries(VEHICULOS).map(([t, info]) => `
        <button class="vehiculo ${S.tipo === t ? 'sel' : ''}" data-accion="tipo" data-tipo="${t}">
          <span class="capacidad">${plural(info.personas, 'persona', 'personas')}</span>
          <span class="ilustracion">${vehiculoLateral(t, info.color)}</span>
          <span class="pie"><strong>${info.nombre}</strong><b>${usd(c.precios[t])}</b></span>
          ${S.config.tasa_bs ? `<span class="bs">${bs(c.precios[t])}</span>` : ''}
        </button>`).join('')}
    </div>
    <div class="extras">
      <button class="chip ${S.cuadralo ? 'sel' : ''}" data-accion="alternar-cuadralo">${icono('etiqueta', 16)} Pon tu precio</button>
      <button class="chip ${programar ? 'sel' : ''}" data-accion="alternar-programar">${icono('calendario', 16)} Programar</button>
    </div>
    ${S.cuadralo ? `
      <label class="extra-detalle"><small class="meta">Ofrece desde ${usd(pisoCuadralo())}. El conductor decide si acepta.</small>
        <input name="oferta" type="number" inputmode="decimal" step="0.1" min="${pisoCuadralo()}" value="${esc(S.oferta)}" aria-label="Tu oferta en dólares"></label>` : ''}
    ${programar ? `
      <label class="extra-detalle"><small class="meta">Fecha y hora de recogida</small>
        <input type="datetime-local" name="programado" min="${fechaLocalInput(new Date(Date.now() + 25 * 60e3))}" value="${esc(S.programado)}"></label>` : ''}
    <p class="subtitulo-seccion">Selecciona el pago</p>
    <div class="metodos-grid">
      ${metodos.map(m => `
        <button class="metodo-tile ${S.metodo === m ? 'sel' : ''}" data-accion="metodo" data-metodo="${m}" title="${METODOS[m].detalle}">
          <span class="icono-metodo">${icono(METODOS[m].icono, 20)}</span>${METODOS[m].nombre}
        </button>`).join('')}
    </div>
    <button class="btn primario" data-accion="pedir">${programar ? 'Agendar viaje' : 'Confirmar viaje'} · ${usd(precioElegido())}</button>`;
}

function tarjetaVehiculoAsignado(v) {
  const personas = VEHICULOS[v.tipo].personas;
  return `
    <div class="tarjeta vehiculo-asignado">
      <span class="ilustracion">${vehiculoLateral(v.tipo, colorVehiculo(v.color))}</span>
      <div class="crece"><small>${esc(v.color)}</small><strong class="texto-punto">${esc(v.vehiculo)}</strong><span class="placa">${esc(v.placa)}</span></div>
      <div class="derecha"><small>${plural(personas, 'persona', 'personas')}</small><strong>${usd(v.tarifa_usd)}</strong></div>
    </div>`;
}

function vistaPagoPasajero(v) {
  if (v.metodo_pago === 'pago_movil') {
    if (v.pago_estado === 'reportado') {
      return `<div class="estado"><div class="radar"></div><h3>Pago reportado</h3><p class="ayuda">Referencia ${esc(v.pago_ref)}. Esperando que ${esc(primerNombre(v.conductor_nombre))} confirme el pago.</p></div>`;
    }
    return `
      <h3 class="titulo-hoja">Paga con Pago Móvil</h3>
      <p class="precio centro">${v.tasa_bs ? bs(v.tarifa_usd, v.tasa_bs) : usd(v.tarifa_usd)}</p>
      ${v.tasa_bs ? `<p class="meta centro">${usd(v.tarifa_usd)} a tasa ${v.tasa_bs}</p>` : ''}
      <dl class="datos tarjeta">
        <dt>Banco</dt><dd>${esc(v.pm_banco || '—')}</dd>
        <dt>Teléfono</dt><dd>${esc(v.pm_telefono || v.conductor_telefono)}</dd>
        <dt>Cédula</dt><dd>${esc(v.pm_cedula || '—')}</dd>
      </dl>
      <form id="form-pago" class="form">
        <label>Número de referencia<input name="referencia" inputmode="numeric" required minlength="4" maxlength="20"></label>
        <button class="btn primario" type="submit">Reportar pago</button>
      </form>
      <p class="ayuda centro">¿Prefieres pagar en efectivo? Avísale a tu conductor; él confirma el pago.</p>`;
  }
  return `
    <div class="estado">
      <h3>Paga en efectivo</h3>
      <p class="precio">${usd(v.tarifa_usd)}</p>
      ${v.tasa_bs ? `<p class="meta">${bs(v.tarifa_usd, v.tasa_bs)}</p>` : ''}
      <p class="ayuda">Entrega el pago a ${esc(primerNombre(v.conductor_nombre))}. El viaje se cierra cuando lo confirme.</p>
    </div>`;
}

function vistaPasajero() {
  const v = S.viaje;
  if (!v) {
    return { destino: vistaDestino, mapa: vistaMapa, opciones: vistaOpciones }[S.paso]?.() ?? vistaInicioPasajero();
  }
  if (v.estado === 'buscando') {
    return `
      <div class="estado"><div class="radar"></div><h3>Buscando tu conductor…</h3><p class="ayuda">${VEHICULOS[v.tipo].nombre} · ${montos(v.tarifa_usd, v.tasa_bs)} · ${METODOS[v.metodo_pago].nombre}</p></div>
      <div class="tarjeta">${rutaTexto(v)}</div>
      <button class="btn peligro" data-accion="cancelar">Cancelar viaje</button>`;
  }
  if (v.estado === 'finalizado') return vistaPagoPasajero(v);
  const nombre = primerNombre(v.conductor_nombre);
  const titulo = { aceptado: `${esc(nombre)} va en camino`, llego: `${esc(nombre)} llegó por ti`, en_curso: 'En viaje a tu destino' }[v.estado];
  return `
    <h3 class="titulo-hoja">${titulo}</h3>
    <div class="tarjeta persona">
      <div class="avatar">${inicial(v.conductor_nombre)}</div>
      <div class="crece"><strong>${esc(v.conductor_nombre)}</strong><small>${v.conductor_calif ? `★ ${v.conductor_calif} · ` : ''}${plural(v.conductor_viajes, 'viaje', 'viajes')}</small></div>
      ${contactoRedondo(v.conductor_telefono)}
    </div>
    ${tarjetaVehiculoAsignado(v)}
    ${v.para_nombre ? `<p class="meta centro">Viaja: ${esc(v.para_nombre)}</p>` : ''}
    ${v.estado === 'en_curso'
      ? `<div class="tarjeta">${rutaTexto(v)}</div>`
      : `<div class="fila">
          <button class="btn primario" data-accion="cambiar-vehiculo">Cambiar vehículo</button>
          <button class="btn peligro" data-accion="cancelar">Cancelar viaje</button>
        </div>`}`;
}

// ---------- Vistas: conductor ----------

function tarjetaSolicitud(s) {
  return `
    <div class="tarjeta blanca">
      <div class="fila-titulo"><strong>Ganas ${montos(s.ganancia_usd, s.tasa_bs)}</strong>
        <span>${s.cuadralo ? '<span class="etiqueta acento">Precio ofrecido</span> ' : ''}<span class="etiqueta">${METODOS[s.metodo_pago].nombre}</span></span></div>
      <div class="ruta-txt"><span class="punto negro"></span><span class="texto-punto">${esc(s.origen_dir)}</span></div>
      <div class="ruta-txt"><span class="punto naranja"></span><span class="texto-punto">${esc(s.destino_dir)}</span></div>
      <p class="meta">${esc(s.pasajero_nombre)} · ${s.recogida_km != null ? `a ${s.recogida_km} km · ` : ''}${s.distancia_km.toFixed(1)} km de viaje · ${Math.round(s.duracion_min)} min</p>
      <button class="btn primario" data-accion="aceptar" data-id="${s.id}">Aceptar viaje</button>
    </div>`;
}

function vistaViajeConductor(v) {
  const hacia = v.estado === 'en_curso' ? `${v.destino_lat},${v.destino_lng}` : `${v.origen_lat},${v.origen_lng}`;
  const [paso, textoPaso] = { aceptado: ['llegue', 'Llegué al punto de recogida'], llego: ['iniciar', 'Iniciar viaje'], en_curso: ['finalizar', 'Finalizar viaje'] }[v.estado];
  const titulo = { aceptado: 'Ve a recoger al pasajero', llego: 'Esperando al pasajero', en_curso: 'Lleva al pasajero a su destino' }[v.estado];
  const nombre = v.para_nombre || v.pasajero_nombre;
  return `
    <h3 class="titulo-hoja">${titulo}</h3>
    <div class="tarjeta persona">
      <div class="avatar">${inicial(nombre)}</div>
      <div class="crece"><strong>${esc(nombre)}</strong><small>${v.para_nombre ? `Pedido por ${esc(primerNombre(v.pasajero_nombre))} · ` : ''}${METODOS[v.metodo_pago].nombre} · ${usd(v.tarifa_usd)}</small></div>
      ${contactoRedondo(v.para_telefono || v.pasajero_telefono)}
    </div>
    <div class="tarjeta">${rutaTexto(v)}</div>
    <div class="fila">
      <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${hacia}" target="_blank" rel="noopener">${icono('navegar', 18)} Google Maps</a>
      <a class="btn" href="https://waze.com/ul?ll=${hacia}&navigate=yes" target="_blank" rel="noopener">${icono('navegar', 18)} Waze</a>
    </div>
    <button class="btn primario" data-accion="avanzar" data-paso="${paso}">${textoPaso}</button>
    ${v.estado !== 'en_curso' ? '<button class="btn peligro" data-accion="cancelar">Cancelar viaje</button>' : ''}`;
}

function vistaCobro(v) {
  const detalle = v.pago_estado === 'reportado'
    ? `<p>El pasajero reportó un Pago Móvil con referencia <strong>${esc(v.pago_ref)}</strong>. Verifícalo en tu banco.</p>`
    : v.metodo_pago === 'pago_movil'
      ? '<p class="ayuda">Esperando que el pasajero reporte su Pago Móvil. Si te pagó de otra forma, confírmalo igual.</p>'
      : '<p class="ayuda">Cobra en efectivo al pasajero.</p>';
  return `
    <div class="estado">
      <h3>Cobra el viaje</h3>
      <p class="precio">${usd(v.tarifa_usd)}</p>
      ${v.tasa_bs ? `<p class="meta">${bs(v.tarifa_usd, v.tasa_bs)}</p>` : ''}
      ${detalle}
    </div>
    <button class="btn primario" data-accion="confirmar-pago">Recibí el pago</button>`;
}

function vistaConductor() {
  const c = S.usuario.conductor;
  if (!c.aprobado) {
    return `
      <div class="estado">
        <h3>Cuenta en revisión</h3>
        <p class="ayuda">Estamos verificando tus datos y tu vehículo (${esc(c.vehiculo)} · ${esc(c.placa)}). Podrás recibir viajes cuando te aprobemos.</p>
        <button class="btn" data-accion="actualizar">Actualizar</button>
      </div>`;
  }
  const v = S.viaje;
  if (v) return v.estado === 'finalizado' ? vistaCobro(v) : vistaViajeConductor(v);
  const r = S.resumen;
  return `
    <div class="fila-titulo">
      <div><h3 style="margin:0">${S.enLinea ? 'Estás en línea' : 'Estás desconectado'}</h3>
      <p class="meta">Hoy: ${plural(r?.viajes ?? 0, 'viaje', 'viajes')} · ${usd(r?.ganancia_usd ?? 0)}${r?.calificacion ? ` · ★ ${r.calificacion}` : ''}</p></div>
      <span class="etiqueta ${S.enLinea ? 'acento' : ''}">${S.enLinea ? '● En línea' : '○ Fuera'}</span>
    </div>
    <button class="btn ${S.enLinea ? '' : 'primario'}" data-accion="en-linea">${S.enLinea ? 'Desconectarme' : 'Conectarme'}</button>
    ${S.enLinea && S.gpsManual ? '<p class="ayuda">No tenemos tu GPS. Toca el mapa para marcar dónde estás.</p>' : ''}
    ${S.enLinea ? (S.solicitudes.length ? S.solicitudes.map(tarjetaSolicitud).join('') : '<p class="ayuda centro">Esperando solicitudes de viaje cerca de ti…</p>') : ''}`;
}

// ---------- Viaje completado ----------

function vistaExito(v) {
  const conductor = esConductor();
  const otro = conductor ? v.para_nombre || v.pasajero_nombre : v.conductor_nombre;
  const confeti = [[12, 16, 8], [86, 12, 6], [6, 46, 9], [92, 50, 7], [72, 28, 4], [24, 36, 4]]
    .map(([x, y, t], i) => `<span class="confeti" style="left:${x}%;top:${y}%;width:${t}px;height:${t}px;${i % 2 ? 'background:#cfcfcf' : ''}"></span>`).join('');
  return `
    <div class="exito">
      <div class="cabecera-pagina"><button class="circulo" data-accion="cerrar-exito" aria-label="Cerrar">${icono('atras')}</button><span></span><span></span></div>
      <div class="ticket">
        <div class="ticket-arriba">
          ${confeti}
          ${sello()}
          <h2>¡Viaje completado!</h2>
          <p class="ayuda">${conductor ? 'Buen trabajo. Ya puedes recibir otro viaje.' : 'Esperamos que hayas disfrutado tu viaje'}</p>
          <button class="recibo" data-accion="descargar-recibo">Recibo del viaje ${icono('descargar')}</button>
        </div>
        <div class="corte"></div>
        <div class="ticket-abajo">
          <div class="crece"><small>Pasajero</small><strong class="texto-punto">${esc(v.para_nombre || v.pasajero_nombre)}</strong></div>
          <div class="derecha"><small>Total</small><strong>${usd(v.tarifa_usd)}</strong></div>
          <div class="crece"><small>Conductor</small><strong class="texto-punto">${esc(v.conductor_nombre)}</strong></div>
          <div class="derecha"><small>${conductor ? 'Ganancia' : 'Pago'}</small><strong>${conductor ? usd(v.ganancia_usd) : METODOS[v.metodo_pago].nombre}</strong></div>
        </div>
      </div>
      <p class="centro meta" style="margin-top:22px">¿Cómo calificas a ${esc(primerNombre(otro))}?</p>
      <div class="estrellas">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= S.estrellas ? 'on' : ''}" data-accion="estrella" data-n="${n}" aria-label="${plural(n, 'estrella', 'estrellas')}">${estrellaRellena(36)}</button>`).join('')}</div>
      <div class="empuja"></div>
      <button class="btn primario" data-accion="cerrar-exito">Volver al inicio</button>
    </div>`;
}

function descargarRecibo(v) {
  const filas = [
    ['Fecha', fechaAmigable(v.finalizado_en || v.creado)], ['Desde', v.origen_dir], ['Hasta', v.destino_dir],
    ['Pasajero', v.para_nombre || v.pasajero_nombre], ['Conductor', v.conductor_nombre], ['Vehículo', `${v.vehiculo} ${v.color} · ${v.placa}`],
    ['Distancia', `${v.distancia_km.toFixed(1)} km`], ['Método de pago', METODOS[v.metodo_pago].nombre],
    ['Total', montos(v.tarifa_usd, v.tasa_bs)],
  ];
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Recibo ${esc(S.config.app)} #${v.id}</title>
    <body style="font-family:system-ui;max-width:420px;margin:40px auto;color:#111">
    <h1 style="margin:0">${esc(S.config.app)}</h1><p style="color:#777">Recibo del viaje #${v.id}</p>
    <table style="width:100%;border-collapse:collapse">${filas.map(([k, val]) => `<tr><td style="padding:8px 0;color:#777;border-bottom:1px solid #eee">${k}</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">${esc(val)}</td></tr>`).join('')}</table>
    </body></html>`;
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  enlace.download = `recibo-${S.config.app.toLowerCase()}-${v.id}.html`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

// ---------- Páginas ----------

const campo = (etiqueta, ic, entrada) =>
  `<label class="campo-form"><span>${etiqueta}</span><div class="entrada">${ic ? icono(ic, 20) : ''}${entrada}</div></label>`;

function camposVehiculo() {
  return `
    <div class="seccion">
      <h4>Tu vehículo</h4><p class="meta">Lo revisamos antes de aprobar tu cuenta.</p>
      ${campo('Tipo', 'auto', '<select name="tipo"><option value="carro">Carro</option><option value="moto">Moto</option></select>')}
      ${campo('Marca y modelo', '', '<input name="vehiculo" placeholder="Chevrolet Aveo">')}
      <div class="fila-campos">${campo('Color', '', '<input name="color" placeholder="Gris">')}${campo('Placa', '', '<input name="placa" placeholder="AB123CD">')}</div>
      ${campo('Cédula', 'usuario', '<input name="cedula" placeholder="V-12345678">')}
    </div>
    <div class="seccion">
      <h4>Pago Móvil</h4><p class="meta">Donde te pagan los pasajeros.</p>
      ${campo('Banco', 'billetera', '<input name="pm_banco" placeholder="Banesco">')}
      <div class="fila-campos">${campo('Teléfono', '', '<input name="pm_telefono" inputmode="tel">')}${campo('Cédula', '', '<input name="pm_cedula">')}</div>
    </div>`;
}

const campoTelefono = () =>
  campo('Número de teléfono', 'telefono', '<input name="telefono" type="tel" inputmode="tel" required placeholder="0414 123 4567" autocomplete="tel">');
const campoCorreo = () =>
  campo('Correo electrónico', 'correo', '<input name="correo" type="email" inputmode="email" required placeholder="ana@correo.com" autocomplete="email">');
const campoClave = (etiqueta, nueva) =>
  campo(etiqueta, 'candado', `<input name="clave" type="password" required ${nueva ? 'minlength="8" maxlength="128"' : ''} placeholder="${nueva ? 'Mínimo 8 caracteres' : '••••••••'}" autocomplete="${nueva ? 'new-password' : 'current-password'}">`);

function selectorModoAuth() {
  const conductor = S.authModo === 'conductor';
  return `
    <div class="selector-modo" style="--i:${conductor ? 1 : 0}">
      <span class="pastilla" data-flip="modo-auth"></span>
      <button class="${conductor ? '' : 'sel'}" data-accion="auth-modo" data-modo="pasajero">${icono('usuario', 16)} Pasajero</button>
      <button class="${conductor ? 'sel' : ''}" data-accion="auth-modo" data-modo="conductor">${icono('auto', 16)} Conductor</button>
    </div>`;
}

function vistaAuth() {
  const conductor = S.authModo === 'conductor';
  if (S.modoAuth === 'login') {
    return `
      <div class="auth">
        <div class="auth-arte">${ilustracionMapa()}<span class="auth-logo">${logo(30)}${esc(S.config?.app ?? '')}</span></div>
        <h1 class="auth-titulo">${conductor ? 'Hola, conductor' : 'Bienvenido'}</h1>
        <p class="auth-sub">${conductor ? 'Entra para empezar a recibir viajes.' : 'Entra y pide tu viaje en minutos.'}</p>
        ${selectorModoAuth()}
        <form id="form-auth">
          ${campoTelefono()}
          ${campoClave('Contraseña', false)}
          <button class="btn primario" type="submit">Entrar</button>
        </form>
        <button class="enlace" data-accion="auth-ir" data-a="recuperar">¿Olvidaste tu contraseña?</button>
        <div class="empuja"></div>
        <p class="auth-pie">¿No tienes cuenta? <button data-accion="auth-ir" data-a="registro">Regístrate</button></p>
      </div>`;
  }

  const registro = S.modoAuth === 'registro';
  const encabezado = `
    ${cabecera(registro ? 'Crear cuenta' : 'Recuperar contraseña', S.verif ? 'cambiar-numero' : 'auth-volver')}
    <div class="pasos"><span class="on"></span><span class="${S.verif ? 'on' : ''}"></span></div>`;

  if (!S.verif) {
    return `
      <div class="auth">
        ${encabezado}
        <div class="icono-grande">${icono(registro ? 'telefono' : 'candado', 34)}</div>
        <h1 class="auth-titulo centro">${registro ? 'Tu número de teléfono' : '¿Olvidaste tu contraseña?'}</h1>
        <p class="auth-sub centro">Te enviaremos un código por SMS para confirmar que el número es tuyo.</p>
        ${registro ? selectorModoAuth() : ''}
        <form id="form-enviar-codigo">
          ${campoTelefono()}
          <button class="btn primario" type="submit">Enviarme el código</button>
        </form>
        <div class="empuja"></div>
        <p class="auth-pie">¿Ya tienes cuenta? <button data-accion="auth-ir" data-a="login">Entrar</button></p>
      </div>`;
  }

  return `
    <div class="auth">
      ${encabezado}
      <div class="icono-grande">${icono('escudo', 34)}</div>
      <h1 class="auth-titulo centro">Verifica tu número</h1>
      <p class="auth-sub centro">Escribe el código de 6 dígitos que enviamos al <strong>${esc(S.verif.telefono)}</strong>.</p>
      <form id="${registro ? 'form-registro' : 'form-recuperar'}">
        <label class="campo-form"><span>Código</span><div class="entrada codigo">
          <input name="codigo" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required placeholder="······"></div></label>
        <div class="reenviar">
          <button class="enlace" type="button" id="reenviar" data-accion="reenviar-codigo" ${segundosParaReenviar() ? 'disabled' : ''}>${textoReenviar()}</button>
          <button class="enlace" type="button" data-accion="cambiar-numero">Cambiar número</button>
        </div>
        ${registro ? campo('Nombre y apellido', 'usuario', '<input name="nombre" required autocomplete="name" placeholder="Ana Pérez">') : ''}
        ${registro ? campoCorreo() : ''}
        ${campoClave(registro ? 'Crea una contraseña' : 'Nueva contraseña', true)}
        ${registro && conductor ? camposVehiculo() : ''}
        <button class="btn primario" type="submit">${registro ? 'Crear cuenta' : 'Guardar contraseña y entrar'}</button>
      </form>
    </div>`;
}

function detalleViaje(v) {
  const conductor = esConductor();
  return `
    <div class="detalle">
      ${rutaTexto(v)}
      ${conductor
        ? `<p class="meta">Pasajero: ${esc(v.para_nombre || v.pasajero_nombre)} · Ganaste ${usd(v.ganancia_usd)}</p>`
        : v.conductor_nombre ? `<p class="meta">${esc(v.conductor_nombre)} · ${esc(v.vehiculo)} ${esc(v.color)} · ${esc(v.placa)}</p>` : ''}
      <p class="meta">${METODOS[v.metodo_pago].nombre} · ${v.distancia_km.toFixed(1)} km · ${ETIQUETA_ESTADO[v.estado]}${v.cuadralo ? ' · Precio ofrecido' : ''}</p>
      ${v.para_nombre && !conductor ? `<p class="meta">Viajó: ${esc(v.para_nombre)}</p>` : ''}
    </div>`;
}

function vistaActividad() {
  const conductor = esConductor();
  const lista = (S.historial ?? []).filter(v => conductor || S.filtro === 'todo' || (S.filtro === 'terceros') === Boolean(v.para_nombre));
  const filtros = { todo: 'Todo', mios: 'Mis viajes', terceros: 'Para terceros' };
  return `
    ${cabecera('Mis viajes')}
    ${conductor ? '' : `<div class="chips">${Object.entries(filtros).map(([k, t]) => `<button class="chip ${S.filtro === k ? 'sel' : ''}" data-accion="filtro" data-filtro="${k}">${t}</button>`).join('')}</div>`}
    ${!S.historial ? '<p class="ayuda">Cargando…</p>' : !lista.length ? '<p class="vacio">Aún no hay viajes aquí.</p>' : `
      <div class="lista-viajes">
        ${lista.map(v => `
          <button class="item-viaje" data-accion="detalle" data-id="${v.id}">
            <span class="avatar peq">${inicial(conductor ? v.para_nombre || v.pasajero_nombre : v.conductor_nombre || '·')}</span>
            <span class="crece"><strong class="texto-punto">${esc(corta(v.destino_dir))}</strong>
              <small>${fechaAmigable(v.creado)} · ${usd(conductor ? v.ganancia_usd : v.tarifa_usd)}${v.estado !== 'finalizado' ? ` · ${ETIQUETA_ESTADO[v.estado]}` : ''}</small></span>
            <span class="flecha">${icono(S.detalle === v.id ? 'abajo' : 'derecha', 18)}</span>
          </button>
          ${S.detalle === v.id ? detalleViaje(v) : ''}`).join('')}
      </div>`}`;
}

function vistaAgendados() {
  const lista = S.agendados;
  return `
    ${cabecera('Viajes agendados')}
    ${!lista ? '<p class="ayuda">Cargando…</p>' : !lista.length ? `
      <div class="vacio">
        <p>No tienes viajes agendados por ahora.<br>Puedes crear uno desde aquí:</p>
        <button class="btn primario" data-accion="agendar">Agendar un viaje</button>
      </div>` : `
      ${lista.map(v => `
        <div class="tarjeta">
          <div class="fila-titulo"><strong>${fechaAmigable(v.programado_para)}</strong><strong>${usd(v.tarifa_usd)}</strong></div>
          ${rutaTexto(v)}
          <p class="meta">${VEHICULOS[v.tipo].nombre} · ${METODOS[v.metodo_pago].nombre}${v.para_nombre ? ` · Viaja ${esc(v.para_nombre)}` : ''}${v.cuadralo ? ' · Precio ofrecido' : ''}</p>
          <button class="btn peligro" data-accion="cancelar-agendado" data-id="${v.id}">Cancelar</button>
        </div>`).join('')}
      <button class="btn primario" data-accion="agendar">Agendar otro viaje</button>`}`;
}

function itemsMenu() {
  const u = S.usuario;
  const items = [itemMenu('ir', 'data-vista="actividad"', 'reloj', 'Mis viajes')];
  if (!esConductor()) {
    items.push(itemMenu('ir', 'data-vista="agendados"', 'calendario', 'Viajes agendados'));
    items.push(itemMenu('ir', 'data-vista="lugares"', 'estrella', 'Lugares guardados'));
  }
  if (u.conductor) {
    const otro = S.modo === 'conductor' ? 'pasajero' : 'conductor';
    items.push(itemMenu('cambiar-modo', `data-modo="${otro}"`, 'cambio', `Cambiar a modo ${otro}`));
  } else {
    items.push(itemMenu('ir', 'data-vista="postular"', 'auto', 'Postúlate como conductor', 'Gana dinero con tu carro o tu moto'));
  }
  if (S.config.soporte_whatsapp) {
    items.push(`<a href="${whatsapp(S.config.soporte_whatsapp)}" target="_blank" rel="noopener"><span class="icono-redondo">${icono('soporte')}</span><span class="crece">Soporte</span></a>`);
  }
  items.push(itemMenu('salir', '', 'salir', 'Cerrar sesión', '', true));
  return `<div class="menu-lista">${items.join('')}</div>`;
}

function vistaCuenta() {
  const u = S.usuario;
  const est = esConductor() ? u.como_conductor : u.como_pasajero;
  return `
    ${cabecera('Cuenta')}
    <div class="cuenta-cabeza">
      <div class="avatar grande">${inicial(u.nombre)}</div>
      <h2>${esc(u.nombre)}</h2>
      <small class="meta">${esc(u.telefono)}${u.correo ? ` · ${esc(u.correo)}` : ''}${u.conductor ? ` · Modo ${S.modo}` : ''}</small>
    </div>
    <div class="estadisticas">
      <div><small>Calificación</small><strong><span class="icono-estrella">${estrellaRellena(17)}</span>${est.calificacion ?? '—'}</strong></div>
      <div><small>Viajes</small><strong>${icono('auto', 18)}${est.viajes}</strong></div>
    </div>
    ${u.conductor && !u.conductor.aprobado ? '<div class="banner suave"><span class="crece"><strong>Solicitud de conductor en revisión</strong><small>Te avisaremos cuando te aprobemos</small></span></div>' : ''}
    ${itemsMenu()}`;
}

function vistaLugares() {
  return `
    ${cabecera('Lugares guardados')}
    ${Object.entries(LUGARES).map(([tipo, [ic, titulo]]) =>
      filaLugar('editar-lugar', `data-tipo="${tipo}" data-volver="lugares"`, ic, titulo, S.lugares[tipo]?.dir || 'Agregar dirección')).join('')}
    ${S.lugares.recientes.length ? `<h3 style="margin-top:24px">Recientes</h3>${S.lugares.recientes.map(l => filaLugar('', '', 'reloj', '', l.dir)).join('')}` : ''}`;
}

function vistaPostular() {
  return `
    ${cabecera('Postúlate como conductor')}
    <p class="ayuda">Registra tu vehículo. Revisaremos tus datos y te avisaremos cuando puedas empezar a recibir viajes.</p>
    <form id="form-postular" class="form">
      ${camposVehiculo()}
      <button class="btn primario" type="submit">Enviar solicitud</button>
    </form>`;
}

function vistaCajon() {
  const u = S.usuario;
  const est = esConductor() ? u.como_conductor : u.como_pasajero;
  return `
    <div class="cajon-fondo" data-accion="cerrar-cajon"></div>
    <aside class="cajon" aria-label="Menú">
      <button class="persona" data-accion="ir" data-vista="cuenta" style="background:none;border:0;padding:0;width:100%;text-align:left;cursor:pointer;color:inherit">
        <div class="avatar">${inicial(u.nombre)}</div>
        <div class="crece"><strong>${esc(u.nombre)}</strong><small>★ ${est.calificacion ?? '—'} · ${plural(est.viajes, 'viaje', 'viajes')}</small></div>
      </button>
      ${itemsMenu()}
    </aside>`;
}

function contenido() {
  if (!S.usuario) return vistaAuth();
  if (S.terminado) return vistaExito(S.terminado);
  const paginas = { actividad: vistaActividad, agendados: vistaAgendados, cuenta: vistaCuenta, lugares: vistaLugares, postular: vistaPostular };
  if (paginas[S.vista]) return paginas[S.vista]();
  return esConductor() ? vistaConductor() : vistaPasajero();
}

let ultimaPantalla = null;

function render() {
  const pagina = !S.usuario || S.vista !== 'inicio' || Boolean(S.terminado) || (!S.viaje && S.paso === 'destino');
  panel.classList.toggle('pagina', pagina);
  $('#barra').innerHTML = S.usuario && !pagina
    ? `<button class="circulo" data-accion="abrir-cajon" aria-label="Menú">${icono('menu')}</button>
       <button class="circulo oscuro" data-accion="ir" data-vista="cuenta" aria-label="Tu cuenta">${inicial(S.usuario.nombre)}</button>`
    : '';
  $('#cajon').innerHTML = S.cajon && S.usuario ? vistaCajon() : '';
  botonUbicacion.hidden = !S.usuario || pagina;
  const activo = document.activeElement;
  const clave = panel.contains(activo) ? activo.id || activo.name : null;
  const pantalla = S.usuario
    ? `${S.vista}:${S.paso}:${S.viaje?.estado}:${Boolean(S.terminado)}`
    : `auth:${S.modoAuth}:${Boolean(S.verif)}`;
  const cambioPantalla = pantalla !== ultimaPantalla && ultimaPantalla !== null;
  const desplazamiento = pantalla === ultimaPantalla ? panel.scrollTop : 0;
  ultimaPantalla = pantalla;
  const antes = capturar();
  panel.innerHTML = contenido();
  if (clave) (document.getElementById(clave) || panel.querySelector(`[name="${clave}"]`))?.focus();
  panel.scrollTop = desplazamiento;
  animar(antes, cambioPantalla);
  dibujarMapa();
  posicionarBotonUbicacion();
}

// ---------- Acciones ----------

// Deshabilita el botón mientras trabaja; si tarda, muestra un indicador de carga en él.
async function conBoton(boton, fn) {
  boton.disabled = true;
  const espera = setTimeout(() => boton.classList.add('cargando'), 120);
  try {
    await fn();
  } catch (e) {
    aviso(e.message);
  } finally {
    clearTimeout(espera);
    boton.classList.remove('cargando');
    if (boton.isConnected) boton.disabled = false;
  }
}

// ---------- Animaciones ----------

const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SUAVE = 'cubic-bezier(.2, .8, .2, 1)';
const REBOTE = 'cubic-bezier(.3, 1.5, .6, 1)';
// Acciones que cambian una selección: el elemento elegido hace un pequeño "pop".
const SELECCIONES = new Set(['tipo', 'metodo', 'auth-modo', 'filtro', 'alternar-cuadralo', 'alternar-programar', 'alternar-para', 'detalle']);
const valorDe = el => el.dataset.tipo ?? el.dataset.metodo ?? el.dataset.modo ?? el.dataset.filtro ?? el.dataset.id ?? '';

// Antes de redibujar guardamos posiciones y tamaño, para animar desde ahí hacia lo nuevo.
function capturar() {
  const flip = new Map();
  panel.querySelectorAll('[data-flip]').forEach(el => flip.set(el.dataset.flip, el.getBoundingClientRect()));
  return { flip, alto: panel.offsetHeight, pagina: panel.classList.contains('pagina') };
}

function animar(antes, cambioPantalla) {
  const toque = S.toque;
  const direccion = S.direccion;
  S.toque = null;
  S.direccion = null;
  if (sinMovimiento) return;
  const pagina = panel.classList.contains('pagina');

  // Elementos que se mueven de lugar (la pastilla del selector) se deslizan.
  panel.querySelectorAll('[data-flip]').forEach(el => {
    const r = antes.flip.get(el.dataset.flip);
    if (!r) return;
    const n = el.getBoundingClientRect();
    const dx = r.left - n.left;
    if (Math.abs(dx) > 1) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 320, easing: SUAVE });
  });

  if (pagina !== antes.pagina) {
    // De hoja a página completa (o al revés): sube desde abajo.
    panel.animate([{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: SUAVE });
  } else {
    // La hoja inferior cambia de alto con suavidad en vez de saltar.
    const alto = panel.offsetHeight;
    if (!pagina && Math.abs(antes.alto - alto) > 4) {
      panel.animate([{ height: `${antes.alto}px` }, { height: `${alto}px` }], { duration: 300, easing: SUAVE });
    }
    if (cambioPantalla) {
      const desde = pagina ? `translateX(${direccion === 'atras' ? -28 : 28}px)` : 'translateY(14px)';
      [...panel.children].forEach((hijo, i) => hijo.animate(
        [{ opacity: 0, transform: desde }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: Math.min(i, 6) * 35, easing: SUAVE, fill: 'backwards' },
      ));
    }
  }

  if (!toque) return;
  if (toque.accion === 'estrella') {
    panel.querySelectorAll('.estrellas button.on').forEach((b, i) => b.animate(
      [{ transform: 'scale(.3) rotate(-25deg)' }, { transform: 'scale(1.2)' }, { transform: 'none' }],
      { duration: 420, delay: i * 60, easing: SUAVE, fill: 'backwards' },
    ));
  } else if (SELECCIONES.has(toque.accion)) {
    const el = [...document.querySelectorAll(`[data-accion="${toque.accion}"]`)].find(e => valorDe(e) === toque.valor);
    el?.animate([{ transform: 'scale(.94)' }, { transform: 'scale(1.03)' }, { transform: 'none' }], { duration: 340, easing: REBOTE });
    if (toque.accion === 'tipo') {
      el?.querySelector('.ilustracion svg')?.animate([{ transform: 'translateX(-14px)' }, { transform: 'none' }], { duration: 450, easing: SUAVE });
    }
  }
}

function cerrarCajon() {
  const cajon = $('.cajon');
  if (!cajon || sinMovimiento) {
    S.cajon = false;
    return render();
  }
  cajon.classList.add('cerrando');
  $('.cajon-fondo').classList.add('cerrando');
  setTimeout(() => {
    S.cajon = false;
    render();
  }, 190);
}

function abrirMapa(objetivo, volverA = null) {
  S.mapaObjetivo = objetivo;
  S.volverA = volverA;
  S.vista = 'inicio';
  S.paso = 'mapa';
  const actual = objetivo.lugar ? S.lugares[objetivo.lugar] : S[objetivo.cual];
  S.puntoMapa = actual ? { lat: actual.lat, lng: actual.lng, dir: actual.dir } : null;
  render();
  if (actual) mapa.setView([actual.lat, actual.lng], 16);
}

const acciones = {
  'auth-ir': b => {
    S.modoAuth = b.dataset.a;
    S.verif = null;
    render();
  },
  'auth-modo': b => {
    S.authModo = b.dataset.modo;
    render();
  },
  'reenviar-codigo': b => conBoton(b, async () => {
    if (segundosParaReenviar()) return;
    await pedirCodigo(S.verif.telefono);
  }),
  'cambiar-numero': () => {
    S.verif = null;
    render();
  },
  'auth-volver': () => {
    S.modoAuth = 'login';
    S.verif = null;
    render();
  },
  salir: async () => {
    if (S.enLinea) await post('/conductor/en-linea', { en_linea: false }).catch(() => {});
    await post('/salir').catch(() => {});
    cerrarSesion();
  },
  'abrir-cajon': () => {
    S.cajon = true;
    render();
    api('/yo').then(r => {
      S.usuario = r.usuario;
      render();
    }).catch(() => {});
  },
  'cerrar-cajon': cerrarCajon,
  ir: b => {
    const vista = b.dataset.vista;
    S.cajon = false;
    S.detalle = null;
    S.anterior = S.vista;
    S.vista = vista;
    if (vista === 'actividad') return cargarHistorial();
    if (vista === 'agendados') return cargarAgendados();
    render();
    if (vista === 'cuenta') {
      api('/yo').then(r => {
        S.usuario = r.usuario;
        render();
      }).catch(() => {});
    }
  },
  atras: () => {
    if (S.vista !== 'inicio') {
      S.vista = S.anterior !== S.vista ? S.anterior : 'inicio';
      S.anterior = 'inicio';
    } else if (S.paso === 'mapa') {
      S.puntoMapa = null;
      if (S.volverA) {
        S.vista = S.volverA;
        S.paso = null;
      } else S.paso = S.destino && S.origen ? 'opciones' : 'destino';
      S.volverA = null;
    } else {
      S.paso = S.paso === 'destino' && S.destino && S.origen && S.cotizacion ? 'opciones' : null;
    }
    render();
    setTimeout(encuadrar, 50);
  },
  actualizar: b => conBoton(b, sincronizar),
  'mi-ubicacion': () => {
    if (esConductor()) {
      if (S.posicion) mapa.setView([S.posicion.lat, S.posicion.lng], 16);
      else aviso('Aún no tenemos tu ubicación.');
    } else if (S.viaje) {
      encuadrar();
    } else {
      ubicarPasajero();
    }
  },
  buscar: () => (S.destino ? siguientePaso() : acciones['abrir-destino']()),
  'abrir-destino': () => {
    S.paso = 'destino';
    render();
    $('#buscar')?.focus();
  },
  'alternar-para': () => {
    S.para = S.para ? null : { nombre: '', telefono: '' };
    render();
  },
  'elegir-mapa': b => abrirMapa({ cual: b.dataset.cual }),
  'editar-lugar': b => abrirMapa({ lugar: b.dataset.tipo }, b.dataset.volver ?? null),
  'confirmar-mapa': b => conBoton(b, async () => {
    const { mapaObjetivo: objetivo, puntoMapa: p } = S;
    if (!p) return;
    S.puntoMapa = null;
    if (objetivo.lugar) {
      await post('/lugares', { tipo: objetivo.lugar, ...p });
      await cargarLugares();
      aviso(`${LUGARES[objetivo.lugar][1]} guardada`);
      if (S.volverA) {
        S.vista = S.volverA;
        S.paso = null;
      } else S.paso = 'destino';
      S.volverA = null;
      render();
      return;
    }
    S[objetivo.cual] = { lat: p.lat, lng: p.lng, dir: p.dir };
    siguientePaso();
  }),
  'ir-lugar': b => irADestino(S.lugares[b.dataset.tipo]),
  'ir-reciente': b => irADestino(S.lugares.recientes[b.dataset.i]),
  resultado: b => irADestino(S.resultados[b.dataset.i]),
  tipo: b => {
    S.tipo = b.dataset.tipo;
    if (S.cuadralo) S.oferta = S.cotizacion.precios[S.tipo].toFixed(2);
    render();
  },
  'alternar-cuadralo': () => {
    S.cuadralo = !S.cuadralo;
    if (S.cuadralo) S.oferta = S.cotizacion.precios[S.tipo].toFixed(2);
    render();
  },
  'alternar-programar': () => {
    S.cuando = S.cuando === 'programar' ? 'ahora' : 'programar';
    render();
  },
  metodo: b => {
    S.metodo = b.dataset.metodo;
    render();
  },
  pedir: b => {
    if (S.para && (!S.para.nombre.trim() || S.para.telefono.replace(/\D/g, '').length < 10)) {
      S.paso = 'destino';
      render();
      return aviso('Escribe el nombre y el teléfono de quien viaja.');
    }
    if (S.cuadralo && !(Number(S.oferta) >= pisoCuadralo())) return aviso(`Ofrece al menos ${usd(pisoCuadralo())}.`);
    if (S.cuando === 'programar' && (!S.programado || new Date(S.programado) < Date.now() + 20 * 60e3)) {
      return aviso('Elige una fecha y hora con al menos 20 minutos de anticipación.');
    }
    return conBoton(b, async () => {
      const v = await post('/viajes', {
        origen: S.origen,
        destino: S.destino,
        tipo: S.tipo,
        metodo_pago: S.metodo,
        precio_ofertado: S.cuadralo ? Number(S.oferta) : undefined,
        programado_para: S.cuando === 'programar' ? new Date(S.programado).toISOString() : undefined,
        para: S.para ?? undefined,
      });
      reiniciarPedido();
      if (v.estado === 'programado') {
        aviso('¡Viaje agendado! Buscaremos conductor unos minutos antes.');
        S.anterior = 'inicio';
        S.vista = 'agendados';
        cargarAgendados();
      } else {
        actualizarViaje(v);
      }
    });
  },
  cancelar: b => conBoton(b, async () => {
    if (!confirm('¿Seguro que quieres cancelar el viaje?')) return;
    actualizarViaje(await post(`/viajes/${S.viaje.id}/cancelar`));
  }),
  'cambiar-vehiculo': b => conBoton(b, async () => {
    if (!confirm('Cancelaremos este viaje para que elijas otro vehículo. ¿Continuar?')) return;
    const v = S.viaje;
    actualizarViaje(await post(`/viajes/${v.id}/cancelar`));
    S.origen = { lat: v.origen_lat, lng: v.origen_lng, dir: v.origen_dir };
    S.destino = { lat: v.destino_lat, lng: v.destino_lng, dir: v.destino_dir };
    S.tipo = v.tipo;
    siguientePaso();
  }),
  'cancelar-agendado': b => conBoton(b, async () => {
    if (!confirm('¿Cancelar este viaje agendado?')) return;
    await post(`/viajes/${b.dataset.id}/cancelar`);
    await cargarAgendados();
  }),
  agendar: () => {
    S.vista = 'inicio';
    S.cuando = 'programar';
    S.paso = 'destino';
    render();
  },
  filtro: b => {
    S.filtro = b.dataset.filtro;
    render();
  },
  detalle: b => {
    const id = Number(b.dataset.id);
    S.detalle = S.detalle === id ? null : id;
    render();
  },
  'cambiar-modo': b => conBoton(b, () => cambiarModo(b.dataset.modo)),
  'en-linea': b => conBoton(b, async () => {
    const enLinea = !S.enLinea;
    if (enLinea) iniciarGps();
    await post('/conductor/en-linea', { en_linea: enLinea, ...(S.posicion ?? {}) });
    S.enLinea = enLinea;
    if (!enLinea) detenerGps();
    await cargarConductor();
    render();
    enviarUbicacion(true);
  }),
  aceptar: b => conBoton(b, async () => {
    const id = Number(b.dataset.id);
    try {
      const v = await post(`/viajes/${id}/aceptar`);
      S.solicitudes = [];
      actualizarViaje(v);
    } catch (e) {
      S.solicitudes = S.solicitudes.filter(s => s.id !== id);
      render();
      throw e;
    }
  }),
  avanzar: b => conBoton(b, async () => actualizarViaje(await post(`/viajes/${S.viaje.id}/${b.dataset.paso}`))),
  'confirmar-pago': b => conBoton(b, async () => actualizarViaje(await post(`/viajes/${S.viaje.id}/confirmar-pago`))),
  estrella: b => {
    S.estrellas = Number(b.dataset.n);
    render();
  },
  'descargar-recibo': () => descargarRecibo(S.terminado),
  'cerrar-exito': async () => {
    const { terminado: v, estrellas } = S;
    S.terminado = null;
    S.estrellas = 0;
    render();
    setTimeout(encuadrar, 50);
    cargarCercanos();
    if (!estrellas) return;
    try {
      await post(`/viajes/${v.id}/calificar`, { estrellas });
      aviso('¡Gracias por calificar!');
    } catch (e) {
      aviso(e.message);
    }
  },
};

const formularios = {
  'form-auth': form => enviarAuth(form, '/login', d => ({ telefono: d.telefono, clave: d.clave })),
  'form-enviar-codigo': form => conBoton(form.querySelector('button[type=submit]'), async () => {
    await pedirCodigo(new FormData(form).get('telefono').trim());
    render();
  }),
  'form-registro': form => enviarAuth(form, '/registro', (d, conductor) => ({
    nombre: d.nombre, telefono: S.verif.telefono, correo: d.correo, clave: d.clave, codigo: d.codigo,
    rol: conductor ? 'conductor' : 'pasajero', conductor: conductor ? d : undefined,
  })),
  'form-recuperar': form => enviarAuth(form, '/pin/restablecer', d => ({ telefono: S.verif.telefono, codigo: d.codigo, clave: d.clave })),
  'form-pago': form => conBoton(form.querySelector('button'), async () => {
    const referencia = new FormData(form).get('referencia');
    actualizarViaje(await post(`/viajes/${S.viaje.id}/pago`, { referencia }));
  }),
  'form-postular': form => conBoton(form.querySelector('button[type=submit]'), async () => {
    const r = await post('/conductor/postular', Object.fromEntries(new FormData(form)));
    S.usuario = r.usuario;
    S.vista = 'cuenta';
    S.anterior = 'inicio';
    aviso('¡Recibimos tu solicitud! Te avisaremos cuando te aprobemos.');
    render();
  }),
};

document.addEventListener('click', e => {
  const boton = e.target.closest('[data-accion]');
  if (boton && acciones[boton.dataset.accion]) {
    if (boton.tagName === 'BUTTON') e.preventDefault();
    S.toque = { accion: boton.dataset.accion, valor: valorDe(boton) };
    if (['atras', 'cerrar-exito', 'auth-volver', 'cambiar-numero'].includes(boton.dataset.accion)
      || (boton.dataset.accion === 'auth-ir' && boton.dataset.a === 'login')) S.direccion = 'atras';
    acciones[boton.dataset.accion](boton);
  }
});

document.addEventListener('submit', e => {
  const enviar = formularios[e.target.id];
  if (!enviar) return;
  e.preventDefault();
  enviar(e.target);
});

document.addEventListener('change', e => {
  if (e.target.name === 'programado') S.programado = e.target.value;
});

let buscarTimer;
document.addEventListener('input', e => {
  const { name, id, value } = e.target;
  if (name === 'oferta') {
    S.oferta = value;
    const boton = panel.querySelector('[data-accion=pedir]');
    if (boton) boton.textContent = `${S.cuando === 'programar' ? 'Agendar viaje' : 'Confirmar viaje'} · ${usd(precioElegido())}`;
  } else if (name === 'programado') S.programado = value;
  else if (name === 'para_nombre') S.para.nombre = value;
  else if (name === 'para_telefono') S.para.telefono = value;
  if (id !== 'buscar') return;
  S.busqueda = value;
  clearTimeout(buscarTimer);
  const q = value.trim();
  if (q.length < 3) {
    S.resultados = [];
    $('#resultados').innerHTML = '';
    return;
  }
  buscarTimer = setTimeout(async () => {
    try {
      const { resultados } = await api('/buscar?q=' + encodeURIComponent(q));
      if (S.busqueda.trim() !== q) return;
      S.resultados = resultados;
      S.buscado = q;
      const ul = $('#resultados');
      if (ul) ul.innerHTML = htmlResultados();
    } catch (err) {
      aviso(err.message);
    }
  }, 600);
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// La bienvenida se queda al menos un momento para que no parpadee.
const bienvenidaDesde = Date.now();
iniciar().catch(e => aviso(e.message)).finally(() => {
  setTimeout(() => $('#bienvenida')?.classList.add('fuera'), Math.max(0, 1100 - (Date.now() - bienvenidaDesde)));
});
