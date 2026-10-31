import express from 'express';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { uno, todos, ejecutar, lote, listo, ajustes, guardarAjustes } from './db.js';
import {
  hashPin, verificarPin, nuevoToken, normalizarTelefono, bloqueado, registrarFallo, limpiarFallos,
  limiteEnvio, crearCodigo, descartarCodigo, verificarCodigo, VIGENCIA_MIN, ESPERA_REENVIO_S,
} from './auth.js';
import { enviarSms, PROVEEDOR as PROVEEDOR_SMS } from './sms.js';
import { calcularRuta, calcularTarifa, buscarLugar, direccionDe, distanciaKm, redondear } from './geo.js';
import { cobrarTarjeta } from './pagos.js';

const APP = process.env.APP_NOMBRE || 'Fasty';
const PUERTO = Number(process.env.PORT) || 3000;
const DESFASE = process.env.DESFASE_HORARIO || '-4 hours'; // hora de Venezuela para los totales "de hoy"
const METODOS = { efectivo: 'efectivo_habilitado', pago_movil: 'pago_movil_habilitado', tarjeta: 'tarjeta_habilitada' };
const TIPOS = ['carro', 'moto'];
const MAX_AGENDADOS = 3;
// Un viaje "ocupa" al pasajero y al conductor hasta que el pago queda confirmado.
const OCUPADO = `(estado IN ('buscando', 'aceptado', 'llego', 'en_curso') OR (estado = 'finalizado' AND pago_estado != 'confirmado'))`;

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', 1); // detrás de Render, Caddy, etc., para leer la IP real
app.use(express.json({ limit: '100kb' }));
app.use(express.static(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')));

const falla = (res, codigo, error) => res.status(codigo).json({ error });
const usd = n => '$' + n.toFixed(2);
const fechaSql = fecha => fecha.toISOString().replace('T', ' ').slice(0, 19);

// ---------- Usuarios y sesiones ----------

async function usuarioPorToken(token) {
  if (!token) return null;
  return uno('SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND u.activo = 1', token);
}

const conductorDe = id => uno('SELECT * FROM conductores WHERE usuario_id = ?', id);

// 'usuario': cualquier cuenta que no sea de administración (todos pueden viajar).
// 'conductor': además tiene vehículo registrado. 'admin': administración.
function requiere(tipo) {
  return async (req, res, next) => {
    const usuario = await usuarioPorToken((req.get('authorization') ?? '').replace(/^Bearer /, ''));
    if (!usuario) return falla(res, 401, 'Inicia sesión de nuevo');
    const esAdmin = usuario.rol === 'admin';
    if ((tipo === 'admin' && !esAdmin) || ((tipo === 'usuario' || tipo === 'conductor') && esAdmin)) return falla(res, 403, 'No tienes permiso para esto');
    if (tipo === 'conductor') {
      req.conductor = await conductorDe(usuario.id);
      if (!req.conductor) return falla(res, 403, 'No tienes cuenta de conductor');
    }
    req.usuario = usuario;
    next();
  };
}

async function estadisticas(columna, calificacion, id) {
  const r = await uno(`SELECT SUM(estado = 'finalizado') AS viajes, AVG(${calificacion}) AS promedio FROM viajes WHERE ${columna} = ?`, id);
  return { viajes: r.viajes ?? 0, calificacion: r.promedio == null ? null : redondear(r.promedio, 1) };
}

async function perfil(u) {
  const c = await conductorDe(u.id);
  return {
    id: u.id, rol: u.rol, nombre: u.nombre, telefono: u.telefono, correo: u.correo, creado: u.creado,
    conductor: c && { tipo: c.tipo, vehiculo: c.vehiculo, color: c.color, placa: c.placa, aprobado: c.aprobado, en_linea: c.en_linea },
    como_pasajero: await estadisticas('pasajero_id', 'calif_pasajero', u.id),
    como_conductor: c ? await estadisticas('conductor_id', 'calif_conductor', u.id) : null,
  };
}

async function iniciarSesion(usuario) {
  const token = nuevoToken();
  await ejecutar('INSERT INTO sesiones (token, usuario_id) VALUES (?, ?)', token, usuario.id);
  return { token, usuario: await perfil(usuario) };
}

const texto = (valor, maximo = 80) => String(valor ?? '').trim().slice(0, maximo);

function punto(p) {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, dir: texto(p.dir, 200) || `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
}

function datosVehiculo(d) {
  const datos = {
    tipo: d?.tipo, vehiculo: texto(d?.vehiculo), color: texto(d?.color, 30),
    placa: texto(d?.placa, 12).toUpperCase(), cedula: texto(d?.cedula, 15),
    pm_banco: texto(d?.pm_banco, 40) || null, pm_telefono: normalizarTelefono(d?.pm_telefono) || null,
    pm_cedula: texto(d?.pm_cedula, 15) || null,
  };
  const valido = TIPOS.includes(datos.tipo) && datos.vehiculo && datos.color && datos.placa && datos.cedula;
  return valido ? datos : null;
}

// Sentencia para registrar el vehículo; el usuario se identifica por teléfono para poder ir en el mismo lote que su alta.
const sentenciaConductor = (telefono, d) => [
  `INSERT INTO conductores (usuario_id, tipo, vehiculo, color, placa, cedula, pm_banco, pm_telefono, pm_cedula)
   VALUES ((SELECT id FROM usuarios WHERE telefono = ?), ?, ?, ?, ?, ?, ?, ?, ?)`,
  telefono, d.tipo, d.vehiculo, d.color, d.placa, d.cedula, d.pm_banco, d.pm_telefono, d.pm_cedula,
];

// ---------- Viajes ----------

const SQL_VIAJE = `
  SELECT v.*, p.nombre AS pasajero_nombre, p.telefono AS pasajero_telefono,
    c.nombre AS conductor_nombre, c.telefono AS conductor_telefono,
    d.vehiculo, d.color, d.placa, d.lat AS conductor_lat, d.lng AS conductor_lng,
    d.pm_banco, d.pm_telefono, d.pm_cedula
  FROM viajes v
  JOIN usuarios p ON p.id = v.pasajero_id
  LEFT JOIN usuarios c ON c.id = v.conductor_id
  LEFT JOIN conductores d ON d.usuario_id = v.conductor_id`;

async function verViaje(id) {
  const v = await uno(`${SQL_VIAJE} WHERE v.id = ?`, id);
  if (!v) return null;
  v.ruta = v.ruta ? JSON.parse(v.ruta) : null;
  v.ganancia_usd = redondear(v.tarifa_usd * (1 - v.comision_pct / 100));
  const historial = v.conductor_id ? await estadisticas('conductor_id', 'calif_conductor', v.conductor_id) : null;
  v.conductor_calif = historial?.calificacion ?? null;
  v.conductor_viajes = historial?.viajes ?? 0;
  return v;
}

async function viajeActivo(usuario, modo) {
  const columna = modo === 'conductor' ? 'conductor_id' : 'pasajero_id';
  const fila = await uno(`SELECT id FROM viajes WHERE ${columna} = ? AND ${OCUPADO} ORDER BY id DESC LIMIT 1`, usuario.id);
  return fila ? verViaje(fila.id) : null;
}

// Devuelve el viaje y de qué lado está el usuario ('pasajero' o 'conductor').
async function viajeDe(req, res, ladoExigido) {
  const v = await verViaje(Number(req.params.id));
  const lado = v?.conductor_id === req.usuario.id ? 'conductor' : v?.pasajero_id === req.usuario.id ? 'pasajero' : null;
  if (!v || !lado || (ladoExigido && lado !== ladoExigido)) {
    falla(res, 404, 'Viaje no encontrado');
    return [null, null];
  }
  return [v, lado];
}

// Lo que ve un conductor antes de aceptar: sin teléfono del pasajero.
function solicitud(v, conductor) {
  return {
    id: v.id, tipo: v.tipo, creado: v.creado, cuadralo: v.cuadralo,
    origen_dir: v.origen_dir, origen_lat: v.origen_lat, origen_lng: v.origen_lng,
    destino_dir: v.destino_dir, destino_lat: v.destino_lat, destino_lng: v.destino_lng,
    distancia_km: v.distancia_km, duracion_min: v.duracion_min,
    tarifa_usd: v.tarifa_usd, tasa_bs: v.tasa_bs, ganancia_usd: v.ganancia_usd,
    metodo_pago: v.metodo_pago,
    pasajero_nombre: (v.para_nombre || v.pasajero_nombre).split(' ')[0],
    recogida_km: conductor?.lat != null ? redondear(distanciaKm(conductor.lat, conductor.lng, v.origen_lat, v.origen_lng), 1) : null,
  };
}

async function conductoresDisponibles(v) {
  const { radio_km } = await ajustes();
  const filas = await todos(`
    SELECT c.usuario_id, c.lat, c.lng FROM conductores c JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.aprobado = 1 AND c.en_linea = 1 AND u.activo = 1 AND c.tipo = ? AND c.usuario_id != ?
      AND NOT EXISTS (SELECT 1 FROM viajes WHERE conductor_id = c.usuario_id AND ${OCUPADO})`, v.tipo, v.pasajero_id);
  return filas.filter(c => c.lat == null || distanciaKm(c.lat, c.lng, v.origen_lat, v.origen_lng) <= radio_km);
}

// ---------- Tiempo real (WebSocket) ----------

const conexiones = new Map(); // usuario_id -> Set<WebSocket>

function enviar(usuarioId, tipo, datos = {}) {
  for (const ws of conexiones.get(usuarioId) ?? []) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ tipo, ...datos }));
  }
}

async function notificarViaje(id, ...otros) {
  const v = await verViaje(id);
  for (const usuarioId of new Set([v.pasajero_id, v.conductor_id, ...otros].filter(Boolean))) enviar(usuarioId, 'viaje', { viaje: v });
  return v;
}

async function despachar(id) {
  const v = await verViaje(id);
  for (const c of await conductoresDisponibles(v)) enviar(c.usuario_id, 'solicitud', { solicitud: solicitud(v, c) });
}

async function retirarSolicitud(id) {
  for (const { usuario_id } of await todos('SELECT usuario_id FROM conductores WHERE en_linea = 1')) enviar(usuario_id, 'solicitud_tomada', { id });
}

// ---------- API: cuenta ----------

app.get('/api/salud', (req, res) => res.json({ ok: true }));

app.get('/api/config', async (req, res) => {
  const aj = await ajustes();
  res.json({
    app: APP,
    ciudad: { nombre: aj.ciudad_nombre, lat: aj.ciudad_lat, lng: aj.ciudad_lng },
    tasa_bs: aj.tasa_bs,
    cuadralo_min_pct: aj.cuadralo_min_pct,
    soporte_whatsapp: aj.soporte_whatsapp,
    metodos: Object.fromEntries(Object.entries(METODOS).map(([m, clave]) => [m, Boolean(aj[clave])])),
  });
});

const telefonoValido = tel => tel.length >= 10 && tel.length <= 13;
const existeTelefono = async tel => Boolean(await uno('SELECT 1 AS si FROM usuarios WHERE telefono = ?', tel));
const normalizarCorreo = correo => String(correo ?? '').trim().toLowerCase();
const correoValido = correo => correo.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
const claveValida = clave => typeof clave === 'string' && clave.length >= 8 && clave.length <= 128;
const ERROR_CLAVE = 'La contraseña debe tener al menos 8 caracteres';

app.post('/api/verificacion/enviar', async (req, res) => {
  const tel = normalizarTelefono(req.body?.telefono);
  const proposito = req.body?.proposito;
  if (!telefonoValido(tel)) return falla(res, 400, 'Escribe un teléfono válido');
  if (!['registro', 'pin'].includes(proposito)) return falla(res, 400, 'Solicitud inválida');
  if (proposito === 'registro' && await existeTelefono(tel)) return falla(res, 409, 'Ese teléfono ya está registrado. Inicia sesión.');
  const limite = await limiteEnvio(tel, proposito, req.ip);
  if (limite) return falla(res, 429, limite);
  const respuesta = { ok: true, reenviar_en: ESPERA_REENVIO_S };
  // Para recuperar la contraseña no revelamos si el número tiene cuenta: respondemos igual, pero solo enviamos si existe.
  if (proposito === 'pin' && !await existeTelefono(tel)) return res.json(respuesta);

  const codigo = await crearCodigo(tel, proposito, req.ip);
  try {
    await enviarSms(tel, `${APP}: tu código es ${codigo}. Vence en ${VIGENCIA_MIN} minutos. No lo compartas con nadie.`);
  } catch (error) {
    console.error('Error enviando SMS:', error.message);
    await descartarCodigo(tel, proposito);
    return falla(res, 502, 'No pudimos enviar el SMS. Revisa el número e intenta de nuevo.');
  }
  res.json(respuesta);
});

app.post('/api/pin/restablecer', async (req, res) => {
  const tel = normalizarTelefono(req.body?.telefono);
  const { codigo, clave } = req.body ?? {};
  if (!claveValida(clave)) return falla(res, 400, ERROR_CLAVE);
  const error = await verificarCodigo(tel, 'pin', codigo);
  if (error) return falla(res, 400, error);
  const usuario = await uno('SELECT * FROM usuarios WHERE telefono = ? AND activo = 1', tel);
  if (!usuario) return falla(res, 404, 'No encontramos una cuenta con ese teléfono');
  await lote([
    ['UPDATE usuarios SET pin_hash = ? WHERE id = ?', hashPin(clave), usuario.id],
    ['DELETE FROM sesiones WHERE usuario_id = ?', usuario.id], // cierra las sesiones de otros teléfonos
  ]);
  limpiarFallos(tel);
  res.json(await iniciarSesion(usuario));
});

app.post('/api/registro', async (req, res) => {
  const { nombre, telefono, clave, codigo, rol = 'pasajero', conductor } = req.body ?? {};
  const tel = normalizarTelefono(telefono);
  const correo = normalizarCorreo(req.body?.correo);
  if (!texto(nombre) || !telefonoValido(tel)) return falla(res, 400, 'Escribe tu nombre y un teléfono válido');
  if (!correoValido(correo)) return falla(res, 400, 'Escribe un correo válido');
  if (!claveValida(clave)) return falla(res, 400, ERROR_CLAVE);
  const vehiculo = rol === 'conductor' ? datosVehiculo(conductor) : null;
  if (rol === 'conductor' && !vehiculo) return falla(res, 400, 'Completa los datos de tu vehículo y tu cédula');
  if (await existeTelefono(tel)) return falla(res, 409, 'Ese teléfono ya está registrado');
  if (await uno('SELECT 1 AS si FROM usuarios WHERE correo = ?', correo)) return falla(res, 409, 'Ese correo ya está registrado');
  const error = await verificarCodigo(tel, 'registro', codigo);
  if (error) return falla(res, 400, error);

  await lote([
    [`INSERT INTO usuarios (rol, nombre, telefono, correo, pin_hash) VALUES ('pasajero', ?, ?, ?, ?)`, texto(nombre), tel, correo, hashPin(clave)],
    ...(vehiculo ? [sentenciaConductor(tel, vehiculo)] : []),
  ]);
  res.json(await iniciarSesion(await uno('SELECT * FROM usuarios WHERE telefono = ?', tel)));
});

// Se entra con el teléfono o el correo y la contraseña (las cuentas viejas usan su PIN como contraseña).
app.post('/api/login', async (req, res) => {
  const dato = String(req.body?.usuario ?? '');
  const porCorreo = dato.includes('@');
  const cuenta = porCorreo ? normalizarCorreo(dato) : normalizarTelefono(dato);
  if (bloqueado(cuenta)) return falla(res, 429, 'Demasiados intentos. Espera 15 minutos.');
  const usuario = await uno(`SELECT * FROM usuarios WHERE ${porCorreo ? 'correo' : 'telefono'} = ? AND activo = 1`, cuenta);
  if (!usuario || !verificarPin(req.body?.clave ?? '', usuario.pin_hash)) {
    registrarFallo(cuenta);
    return falla(res, 401, 'Datos de acceso incorrectos');
  }
  limpiarFallos(cuenta);
  res.json(await iniciarSesion(usuario));
});

app.post('/api/salir', requiere(), async (req, res) => {
  await ejecutar('DELETE FROM sesiones WHERE token = ?', req.get('authorization').replace(/^Bearer /, ''));
  res.json({ ok: true });
});

app.get('/api/yo', requiere(), async (req, res) => res.json({ usuario: await perfil(req.usuario) }));

// ---------- API: lugares y mapas ----------

app.get('/api/lugares', requiere('usuario'), async (req, res) => {
  const guardados = Object.fromEntries((await todos('SELECT tipo, dir, lat, lng FROM lugares WHERE usuario_id = ?', req.usuario.id)).map(l => [l.tipo, l]));
  const recientes = await todos(`
    SELECT destino_dir AS dir, destino_lat AS lat, destino_lng AS lng FROM viajes
    WHERE pasajero_id = ? AND estado = 'finalizado' GROUP BY destino_dir ORDER BY MAX(id) DESC LIMIT 5`, req.usuario.id);
  res.json({ casa: guardados.casa ?? null, trabajo: guardados.trabajo ?? null, recientes });
});

app.post('/api/lugares', requiere('usuario'), async (req, res) => {
  const p = punto(req.body);
  if (!['casa', 'trabajo'].includes(req.body?.tipo) || !p) return falla(res, 400, 'Lugar inválido');
  await ejecutar(`INSERT INTO lugares (usuario_id, tipo, dir, lat, lng) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (usuario_id, tipo) DO UPDATE SET dir = excluded.dir, lat = excluded.lat, lng = excluded.lng`, req.usuario.id, req.body.tipo, p.dir, p.lat, p.lng);
  res.json({ ok: true });
});

// Carros libres cerca, para dibujarlos en el mapa. Posición redondeada (~100 m) para no exponer la ubicación exacta.
app.get('/api/conductores/cercanos', requiere('usuario'), async (req, res) => {
  const p = punto(req.query);
  if (!p) return res.json({ conductores: [] });
  const { radio_km } = await ajustes();
  const filas = await todos(`
    SELECT c.tipo, c.lat, c.lng FROM conductores c
    WHERE c.aprobado = 1 AND c.en_linea = 1 AND c.lat IS NOT NULL AND c.usuario_id != ?
      AND NOT EXISTS (SELECT 1 FROM viajes WHERE conductor_id = c.usuario_id AND ${OCUPADO})`, req.usuario.id);
  const conductores = filas
    .filter(c => distanciaKm(c.lat, c.lng, p.lat, p.lng) <= radio_km)
    .slice(0, 15)
    .map(c => ({ tipo: c.tipo, lat: redondear(c.lat, 3), lng: redondear(c.lng, 3) }));
  res.json({ conductores });
});

app.get('/api/buscar', requiere(), async (req, res) => {
  const q = texto(req.query.q, 120);
  if (q.length < 3) return res.json({ resultados: [] });
  try {
    res.json({ resultados: await buscarLugar(q, await ajustes()) });
  } catch {
    falla(res, 503, 'No pudimos buscar la dirección. Elígela en el mapa.');
  }
});

app.get('/api/direccion', requiere(), async (req, res) => {
  const p = punto(req.query);
  if (!p) return falla(res, 400, 'Coordenadas inválidas');
  try {
    res.json({ direccion: await direccionDe(p.lat, p.lng) });
  } catch {
    res.json({ direccion: null });
  }
});

app.post('/api/cotizar', requiere('usuario'), async (req, res) => {
  const origen = punto(req.body?.origen);
  const destino = punto(req.body?.destino);
  if (!origen || !destino) return falla(res, 400, 'Elige recogida y destino');
  const aj = await ajustes();
  const ruta = await calcularRuta(origen, destino);
  res.json({
    distancia_km: ruta.distancia_km,
    duracion_min: ruta.duracion_min,
    ruta: ruta.geometria,
    tasa_bs: aj.tasa_bs,
    precios: Object.fromEntries(TIPOS.map(t => [t, calcularTarifa(ruta.distancia_km, ruta.duracion_min, t, aj)])),
  });
});

// ---------- API: viajes ----------

app.post('/api/viajes', requiere('usuario'), async (req, res) => {
  const origen = punto(req.body?.origen);
  const destino = punto(req.body?.destino);
  const { tipo, metodo_pago, precio_ofertado, programado_para, para } = req.body ?? {};
  const aj = await ajustes();
  if (!origen || !destino) return falla(res, 400, 'Elige recogida y destino');
  if (!TIPOS.includes(tipo)) return falla(res, 400, 'Tipo de vehículo inválido');
  if (!METODOS[metodo_pago] || !aj[METODOS[metodo_pago]]) return falla(res, 400, 'Ese método de pago no está disponible');
  if (distanciaKm(origen.lat, origen.lng, destino.lat, destino.lng) < 0.1) return falla(res, 400, 'La recogida y el destino están demasiado cerca');

  let programado = null;
  if (programado_para) {
    const fecha = new Date(programado_para);
    if (Number.isNaN(fecha.getTime()) || fecha < Date.now() + 20 * 60e3 || fecha > Date.now() + 7 * 86400e3) {
      return falla(res, 400, 'Agenda con al menos 20 minutos de anticipación y hasta 7 días');
    }
    const { n: agendados } = await uno(`SELECT COUNT(*) AS n FROM viajes WHERE pasajero_id = ? AND estado = 'programado'`, req.usuario.id);
    if (agendados >= MAX_AGENDADOS) return falla(res, 409, `Puedes tener hasta ${MAX_AGENDADOS} viajes agendados`);
    programado = fechaSql(fecha);
  } else if (await viajeActivo(req.usuario, 'pasajero')) {
    return falla(res, 409, 'Ya tienes un viaje en curso');
  }

  let paraNombre = null;
  let paraTelefono = null;
  if (para) {
    paraNombre = texto(para.nombre);
    paraTelefono = normalizarTelefono(para.telefono);
    if (!paraNombre || paraTelefono.length < 10) return falla(res, 400, 'Escribe el nombre y el teléfono de quien viaja');
  }

  const ruta = await calcularRuta(origen, destino);
  let tarifa = calcularTarifa(ruta.distancia_km, ruta.duracion_min, tipo, aj);
  const cuadralo = precio_ofertado != null && precio_ofertado !== '';
  if (cuadralo) {
    const oferta = redondear(Number(precio_ofertado));
    const piso = redondear(tarifa * aj.cuadralo_min_pct / 100);
    if (!Number.isFinite(oferta) || oferta < piso || oferta > tarifa * 3) return falla(res, 400, `Ofrece al menos ${usd(piso)}`);
    tarifa = oferta;
  }

  const { lastInsertRowid: id } = await ejecutar(`
    INSERT INTO viajes (pasajero_id, estado, tipo, origen_lat, origen_lng, origen_dir, destino_lat, destino_lng, destino_dir,
      distancia_km, duracion_min, tarifa_usd, tasa_bs, comision_pct, metodo_pago, ruta,
      cuadralo, programado_para, para_nombre, para_telefono)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  req.usuario.id, programado ? 'programado' : 'buscando', tipo, origen.lat, origen.lng, origen.dir, destino.lat, destino.lng, destino.dir,
  ruta.distancia_km, ruta.duracion_min, tarifa, aj.tasa_bs, aj.comision_pct, metodo_pago,
  ruta.geometria ? JSON.stringify(ruta.geometria) : null,
  cuadralo ? 1 : 0, programado, paraNombre, paraTelefono);
  if (!programado) await despachar(id);
  res.json(await verViaje(id));
});

app.get('/api/viajes/activo', requiere('usuario'), async (req, res) => {
  res.json({ viaje: await viajeActivo(req.usuario, req.query.modo === 'conductor' ? 'conductor' : 'pasajero') });
});

app.get('/api/viajes/agendados', requiere('usuario'), async (req, res) => {
  const viajes = await todos(`SELECT id, tipo, origen_dir, destino_dir, tarifa_usd, tasa_bs, metodo_pago, programado_para, para_nombre, cuadralo
    FROM viajes WHERE pasajero_id = ? AND estado = 'programado' ORDER BY programado_para`, req.usuario.id);
  res.json({ viajes });
});

app.get('/api/viajes', requiere('usuario'), async (req, res) => {
  const columna = req.query.modo === 'conductor' ? 'conductor_id' : 'pasajero_id';
  const viajes = await todos(`
    SELECT v.id, v.estado, v.tipo, v.origen_dir, v.destino_dir, v.tarifa_usd, v.tasa_bs, v.metodo_pago, v.creado, v.distancia_km,
      v.para_nombre, v.cuadralo, v.calif_conductor, v.calif_pasajero,
      ROUND(v.tarifa_usd * (1 - v.comision_pct / 100.0), 2) AS ganancia_usd,
      c.nombre AS conductor_nombre, d.vehiculo, d.color, d.placa, p.nombre AS pasajero_nombre
    FROM viajes v JOIN usuarios p ON p.id = v.pasajero_id
    LEFT JOIN usuarios c ON c.id = v.conductor_id LEFT JOIN conductores d ON d.usuario_id = v.conductor_id
    WHERE v.${columna} = ? AND v.estado != 'programado' ORDER BY v.id DESC LIMIT 50`, req.usuario.id);
  res.json({ viajes });
});

app.post('/api/viajes/:id/cancelar', requiere('usuario'), async (req, res) => {
  const [v, lado] = await viajeDe(req, res);
  if (!v) return;
  if (lado === 'pasajero') {
    const r = await ejecutar(`UPDATE viajes SET estado = 'cancelado', cancelado_por = 'pasajero' WHERE id = ? AND estado IN ('programado', 'buscando', 'aceptado', 'llego')`, v.id);
    if (!r.changes) return falla(res, 409, 'Este viaje ya no se puede cancelar');
    if (v.estado === 'buscando') await retirarSolicitud(v.id);
    return res.json(await notificarViaje(v.id));
  }
  // Si el conductor cancela, el viaje vuelve a buscar otro conductor.
  const r = await ejecutar(`UPDATE viajes SET estado = 'buscando', conductor_id = NULL, aceptado_en = NULL, creado = datetime('now')
    WHERE id = ? AND conductor_id = ? AND estado IN ('aceptado', 'llego')`, v.id, req.usuario.id);
  if (!r.changes) return falla(res, 409, 'Este viaje ya no se puede cancelar');
  const actualizado = await notificarViaje(v.id);
  await despachar(v.id);
  res.json(actualizado);
});

app.post('/api/viajes/:id/aceptar', requiere('conductor'), async (req, res) => {
  const c = req.conductor;
  if (!c.aprobado) return falla(res, 403, 'Tu cuenta de conductor aún no está aprobada');
  if (await viajeActivo(req.usuario, 'conductor')) return falla(res, 409, 'Termina tu viaje actual primero');
  const id = Number(req.params.id);
  const r = await ejecutar(`UPDATE viajes SET conductor_id = ?, estado = 'aceptado', aceptado_en = datetime('now')
    WHERE id = ? AND estado = 'buscando' AND tipo = ? AND pasajero_id != ?`, req.usuario.id, id, c.tipo, req.usuario.id);
  if (!r.changes) return falla(res, 409, 'Otro conductor ya tomó este viaje');
  await retirarSolicitud(id);
  res.json(await notificarViaje(id));
});

const PASOS = {
  llegue: { desde: ['aceptado'], hacia: 'llego', fecha: null },
  iniciar: { desde: ['aceptado', 'llego'], hacia: 'en_curso', fecha: 'iniciado_en' },
  finalizar: { desde: ['en_curso'], hacia: 'finalizado', fecha: 'finalizado_en' },
};

for (const [nombre, paso] of Object.entries(PASOS)) app.post(`/api/viajes/:id/${nombre}`, requiere('conductor'), async (req, res) => {
  const [v] = await viajeDe(req, res, 'conductor');
  if (!v) return;
  const r = await ejecutar(`UPDATE viajes SET estado = ?${paso.fecha ? `, ${paso.fecha} = datetime('now')` : ''}
    WHERE id = ? AND estado IN (${paso.desde.map(() => '?').join(', ')})`, paso.hacia, v.id, ...paso.desde);
  if (!r.changes) return falla(res, 409, 'El viaje cambió de estado. Actualiza la pantalla.');

  if (paso.hacia === 'finalizado' && v.metodo_pago === 'tarjeta') {
    const cobro = await cobrarTarjeta(v);
    if (cobro.ok) await ejecutar(`UPDATE viajes SET pago_estado = 'confirmado', pago_ref = ? WHERE id = ?`, cobro.referencia, v.id);
    else await ejecutar(`UPDATE viajes SET metodo_pago = 'efectivo' WHERE id = ?`, v.id); // se cobra en efectivo
  }
  res.json(await notificarViaje(v.id));
});

app.post('/api/viajes/:id/pago', requiere('usuario'), async (req, res) => {
  const [v] = await viajeDe(req, res, 'pasajero');
  if (!v) return;
  const referencia = texto(req.body?.referencia, 20);
  if (!/^[\w-]{4,20}$/.test(referencia)) return falla(res, 400, 'Escribe el número de referencia');
  const r = await ejecutar(`UPDATE viajes SET pago_estado = 'reportado', pago_ref = ?
    WHERE id = ? AND estado = 'finalizado' AND metodo_pago = 'pago_movil' AND pago_estado = 'pendiente'`, referencia, v.id);
  if (!r.changes) return falla(res, 409, 'Este pago ya fue reportado');
  res.json(await notificarViaje(v.id));
});

app.post('/api/viajes/:id/confirmar-pago', requiere('conductor'), async (req, res) => {
  const [v] = await viajeDe(req, res, 'conductor');
  if (!v) return;
  const r = await ejecutar(`UPDATE viajes SET pago_estado = 'confirmado' WHERE id = ? AND estado = 'finalizado' AND pago_estado != 'confirmado'`, v.id);
  if (!r.changes) return falla(res, 409, 'Este pago ya fue confirmado');
  res.json(await notificarViaje(v.id));
});

app.post('/api/viajes/:id/calificar', requiere('usuario'), async (req, res) => {
  const [v, lado] = await viajeDe(req, res);
  if (!v) return;
  const estrellas = Number(req.body?.estrellas);
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return falla(res, 400, 'Calificación inválida');
  const columna = lado === 'pasajero' ? 'calif_conductor' : 'calif_pasajero';
  await ejecutar(`UPDATE viajes SET ${columna} = ? WHERE id = ? AND estado = 'finalizado' AND ${columna} IS NULL`, estrellas, v.id);
  res.json({ ok: true });
});

// ---------- API: conductor ----------

app.post('/api/conductor/postular', requiere('usuario'), async (req, res) => {
  if (await conductorDe(req.usuario.id)) return falla(res, 409, 'Ya tienes una cuenta de conductor');
  const vehiculo = datosVehiculo(req.body);
  if (!vehiculo) return falla(res, 400, 'Completa los datos de tu vehículo y tu cédula');
  await ejecutar(...sentenciaConductor(req.usuario.telefono, vehiculo));
  res.json({ usuario: await perfil(req.usuario) });
});

app.post('/api/conductor/en-linea', requiere('conductor'), async (req, res) => {
  if (!req.conductor.aprobado) return falla(res, 403, 'Tu cuenta de conductor aún no está aprobada');
  const enLinea = req.body?.en_linea ? 1 : 0;
  const p = punto(req.body);
  await ejecutar(`UPDATE conductores SET en_linea = ?, ubicado_en = datetime('now'), lat = COALESCE(?, lat), lng = COALESCE(?, lng) WHERE usuario_id = ?`,
    enLinea, p?.lat ?? null, p?.lng ?? null, req.usuario.id);
  res.json({ en_linea: Boolean(enLinea) });
});

app.get('/api/conductor/solicitudes', requiere('conductor'), async (req, res) => {
  const c = req.conductor;
  if (!c.aprobado || !c.en_linea) return res.json({ solicitudes: [] });
  const { radio_km } = await ajustes();
  const ids = await todos(`SELECT id FROM viajes WHERE estado = 'buscando' AND tipo = ? AND pasajero_id != ? ORDER BY id`, c.tipo, req.usuario.id);
  const solicitudes = (await Promise.all(ids.map(async ({ id }) => solicitud(await verViaje(id), c))))
    .filter(s => s.recogida_km == null || s.recogida_km <= radio_km);
  res.json({ solicitudes });
});

app.get('/api/conductor/resumen', requiere('conductor'), async (req, res) => {
  const r = await uno(`
    SELECT COUNT(*) AS viajes, COALESCE(SUM(tarifa_usd * (1 - comision_pct / 100.0)), 0) AS ganancia
    FROM viajes WHERE conductor_id = ? AND estado = 'finalizado' AND date(finalizado_en, ?) = date('now', ?)`, req.usuario.id, DESFASE, DESFASE);
  const { calificacion } = await estadisticas('conductor_id', 'calif_conductor', req.usuario.id);
  res.json({ viajes: r.viajes, ganancia_usd: redondear(r.ganancia), calificacion });
});

// ---------- API: administración ----------

app.get('/api/admin/resumen', requiere('admin'), async (req, res) => {
  const hoy = await uno(`
    SELECT COUNT(*) AS viajes, COALESCE(SUM(tarifa_usd), 0) AS bruto, COALESCE(SUM(tarifa_usd * comision_pct / 100.0), 0) AS comision
    FROM viajes WHERE estado = 'finalizado' AND date(finalizado_en, ?) = date('now', ?)`, DESFASE, DESFASE);
  const contar = async (sql, ...parametros) => (await uno(sql, ...parametros)).n;
  res.json({
    viajes_hoy: hoy.viajes,
    bruto_hoy: redondear(hoy.bruto),
    comision_hoy: redondear(hoy.comision),
    sin_conductor_hoy: await contar(`SELECT COUNT(*) AS n FROM viajes WHERE estado = 'sin_conductor' AND date(creado, ?) = date('now', ?)`, DESFASE, DESFASE),
    cancelados_hoy: await contar(`SELECT COUNT(*) AS n FROM viajes WHERE estado = 'cancelado' AND date(creado, ?) = date('now', ?)`, DESFASE, DESFASE),
    viajes_activos: await contar(`SELECT COUNT(*) AS n FROM viajes WHERE estado IN ('buscando', 'aceptado', 'llego', 'en_curso')`),
    agendados: await contar(`SELECT COUNT(*) AS n FROM viajes WHERE estado = 'programado'`),
    conductores_en_linea: await contar('SELECT COUNT(*) AS n FROM conductores WHERE en_linea = 1'),
    conductores_pendientes: await contar('SELECT COUNT(*) AS n FROM conductores WHERE aprobado = 0'),
    pasajeros: await contar(`SELECT COUNT(*) AS n FROM usuarios WHERE rol != 'admin'`),
  });
});

app.get('/api/admin/conductores', requiere('admin'), async (req, res) => {
  const conductores = await todos(`
    SELECT u.id, u.nombre, u.telefono, u.creado, c.tipo, c.vehiculo, c.color, c.placa, c.cedula,
      c.pm_banco, c.pm_telefono, c.pm_cedula, c.aprobado, c.en_linea,
      (SELECT COUNT(*) FROM viajes WHERE conductor_id = u.id AND estado = 'finalizado') AS viajes,
      (SELECT ROUND(AVG(calif_conductor), 1) FROM viajes WHERE conductor_id = u.id) AS calificacion
    FROM usuarios u JOIN conductores c ON c.usuario_id = u.id ORDER BY c.aprobado, u.id DESC`);
  res.json({ conductores });
});

app.post('/api/admin/conductores/:id', requiere('admin'), async (req, res) => {
  const aprobado = req.body?.aprobado ? 1 : 0;
  const r = await ejecutar('UPDATE conductores SET aprobado = ?, en_linea = CASE WHEN ? = 1 THEN en_linea ELSE 0 END WHERE usuario_id = ?',
    aprobado, aprobado, Number(req.params.id));
  if (!r.changes) return falla(res, 404, 'Conductor no encontrado');
  enviar(Number(req.params.id), 'cuenta', {});
  res.json({ ok: true });
});

app.get('/api/admin/viajes', requiere('admin'), async (req, res) => {
  const viajes = await todos(`
    SELECT v.id, v.creado, v.estado, v.tipo, v.origen_dir, v.destino_dir, v.distancia_km, v.tarifa_usd, v.metodo_pago,
      v.pago_estado, v.pago_ref, v.calif_conductor, v.cuadralo, v.programado_para, v.para_nombre,
      p.nombre AS pasajero, c.nombre AS conductor
    FROM viajes v JOIN usuarios p ON p.id = v.pasajero_id LEFT JOIN usuarios c ON c.id = v.conductor_id
    ORDER BY v.id DESC LIMIT 200`);
  res.json({ viajes });
});

app.get('/api/admin/ajustes', requiere('admin'), async (req, res) => res.json(await ajustes()));

app.post('/api/admin/ajustes', requiere('admin'), async (req, res) => {
  try {
    await guardarAjustes(req.body ?? {});
  } catch (error) {
    return falla(res, 400, error.message);
  }
  res.json(await ajustes());
});

app.use('/api', (req, res) => falla(res, 404, 'Ruta no encontrada'));

app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') return falla(res, 400, 'Datos inválidos');
  console.error(error);
  falla(res, 500, 'Ocurrió un error. Intenta de nuevo.');
});

// ---------- Servidor ----------

const servidor = createServer(app);
const wss = new WebSocketServer({ server: servidor, path: '/ws' });

async function guardarUbicacion(usuario, mensaje) {
  if (mensaje.tipo !== 'ubicacion' || !await conductorDe(usuario.id)) return;
  const p = punto(mensaje);
  if (!p) return;
  await ejecutar(`UPDATE conductores SET lat = ?, lng = ?, ubicado_en = datetime('now') WHERE usuario_id = ?`, p.lat, p.lng, usuario.id);
  const v = await uno(`SELECT pasajero_id FROM viajes WHERE conductor_id = ? AND estado IN ('aceptado', 'llego', 'en_curso')`, usuario.id);
  if (v) enviar(v.pasajero_id, 'ubicacion_conductor', { lat: p.lat, lng: p.lng });
}

wss.on('connection', (ws, req) => {
  const sesion = usuarioPorToken(new URL(req.url, 'http://local').searchParams.get('token'));
  ws.vivo = true;
  ws.on('pong', () => (ws.vivo = true));
  // Los mensajes que lleguen mientras se verifica la sesión esperan a esa verificación.
  ws.on('message', async crudo => {
    const usuario = await sesion;
    if (!usuario) return;
    try {
      await guardarUbicacion(usuario, JSON.parse(crudo));
    } catch (error) {
      if (!(error instanceof SyntaxError)) console.error('Error con un mensaje en tiempo real:', error.message);
    }
  });
  sesion.then(usuario => {
    if (!usuario) return ws.close(4001, 'Sesión inválida');
    if (!conexiones.has(usuario.id)) conexiones.set(usuario.id, new Set());
    conexiones.get(usuario.id).add(ws);
    ws.on('close', () => conexiones.get(usuario.id)?.delete(ws));
  }).catch(() => ws.close(1011, 'Error del servidor'));
});

// Mantiene vivas las conexiones, activa los viajes agendados y limpia lo que quedó colgado.
async function mantenimiento() {
  for (const ws of wss.clients) {
    if (!ws.vivo) ws.terminate();
    else {
      ws.vivo = false;
      ws.ping();
    }
  }
  for (const { id } of await todos(`SELECT id FROM viajes WHERE estado = 'programado' AND programado_para <= datetime('now', '+10 minutes')`)) {
    await ejecutar(`UPDATE viajes SET estado = 'buscando', creado = datetime('now') WHERE id = ? AND estado = 'programado'`, id);
    await notificarViaje(id);
    await despachar(id);
  }
  const { espera_min } = await ajustes();
  for (const { id } of await todos(`SELECT id FROM viajes WHERE estado = 'buscando' AND creado < datetime('now', ?)`, `-${espera_min} minutes`)) {
    await ejecutar(`UPDATE viajes SET estado = 'sin_conductor' WHERE id = ? AND estado = 'buscando'`, id);
    await notificarViaje(id);
    await retirarSolicitud(id);
  }
  for (const { usuario_id } of await todos(`SELECT usuario_id FROM conductores WHERE en_linea = 1 AND (ubicado_en IS NULL OR ubicado_en < datetime('now', '-30 minutes'))`)) {
    await ejecutar('UPDATE conductores SET en_linea = 0 WHERE usuario_id = ?', usuario_id);
    enviar(usuario_id, 'desconectado');
  }
}

let trabajando = false;
setInterval(async () => {
  if (trabajando) return;
  trabajando = true;
  try {
    await mantenimiento();
  } catch (error) {
    console.error('Error en el mantenimiento:', error.message);
  } finally {
    trabajando = false;
  }
}, Number(process.env.INTERVALO_MS) || 30_000);

// Si se definen ADMIN_TELEFONO y ADMIN_PIN, se crea (o actualiza) ese administrador al arrancar.
// Útil en el hosting, donde no hay una consola a mano para correr scripts/crear-admin.js.
async function adminDesdeEntorno() {
  const tel = normalizarTelefono(process.env.ADMIN_TELEFONO);
  const pin = process.env.ADMIN_PIN;
  if (!tel || !/^\d{6}$/.test(pin ?? '')) return;
  await ejecutar(`INSERT INTO usuarios (rol, nombre, telefono, pin_hash) VALUES ('admin', ?, ?, ?)
    ON CONFLICT (telefono) DO UPDATE SET rol = 'admin', pin_hash = excluded.pin_hash, activo = 1`,
  process.env.ADMIN_NOMBRE || 'Administrador', tel, hashPin(pin));
  console.log(`Administrador listo: ${tel}`);
}

await listo;
await adminDesdeEntorno();
if (process.env.CUENTAS_PRUEBA === '1') await import('../scripts/semilla-prueba.js');
servidor.listen(PUERTO, () => {
  console.log(`${APP} escuchando en http://localhost:${PUERTO}`);
  if (PROVEEDOR_SMS === 'consola') console.warn('Aviso: los códigos SMS se muestran en esta consola (SMS_PROVEEDOR=consola). No uses esto en producción.');
});
