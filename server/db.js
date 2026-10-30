// Base de datos: SQLite vía libSQL.
// - En desarrollo usa el archivo data/fasty.db (o DB_PATH).
// - Publicada usa Turso: define TURSO_URL (libsql://...) y TURSO_TOKEN.
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const remota = Boolean(process.env.TURSO_URL);
let url = process.env.TURSO_URL;
if (!remota) {
  const archivo = process.env.DB_PATH || resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fasty.db');
  mkdirSync(dirname(archivo), { recursive: true });
  url = pathToFileURL(archivo).href;
}

export const cliente = createClient({ url, authToken: process.env.TURSO_TOKEN });

const aObjeto = (resultado, fila) => Object.fromEntries(resultado.columns.map((columna, i) => [columna, fila[i]]));
const sentencia = (sql, parametros) => ({ sql, args: parametros.map(p => (p === undefined ? null : p)) });

export async function todos(sql, ...parametros) {
  const r = await cliente.execute(sentencia(sql, parametros));
  return r.rows.map(fila => aObjeto(r, fila));
}

export const uno = async (sql, ...parametros) => (await todos(sql, ...parametros))[0] ?? null;

export async function ejecutar(sql, ...parametros) {
  const r = await cliente.execute(sentencia(sql, parametros));
  return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid) };
}

// Varias sentencias en una sola transacción: [[sql, ...parámetros], ...]
export const lote = sentencias => cliente.batch(sentencias.map(([sql, ...parametros]) => sentencia(sql, parametros)), 'write');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  rol TEXT NOT NULL CHECK (rol IN ('pasajero', 'conductor', 'admin')),
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conductores (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('carro', 'moto')),
  vehiculo TEXT NOT NULL,
  color TEXT NOT NULL,
  placa TEXT NOT NULL,
  cedula TEXT NOT NULL,
  pm_banco TEXT,
  pm_telefono TEXT,
  pm_cedula TEXT,
  aprobado INTEGER NOT NULL DEFAULT 0,
  en_linea INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  ubicado_en TEXT
);

CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS viajes (
  id INTEGER PRIMARY KEY,
  pasajero_id INTEGER NOT NULL REFERENCES usuarios(id),
  conductor_id INTEGER REFERENCES usuarios(id),
  estado TEXT NOT NULL,
  tipo TEXT NOT NULL,
  origen_lat REAL NOT NULL,
  origen_lng REAL NOT NULL,
  origen_dir TEXT,
  destino_lat REAL NOT NULL,
  destino_lng REAL NOT NULL,
  destino_dir TEXT,
  distancia_km REAL NOT NULL,
  duracion_min REAL NOT NULL,
  tarifa_usd REAL NOT NULL,
  tasa_bs REAL NOT NULL,
  comision_pct REAL NOT NULL,
  metodo_pago TEXT NOT NULL,
  pago_estado TEXT NOT NULL DEFAULT 'pendiente',
  pago_ref TEXT,
  ruta TEXT,
  calif_conductor INTEGER,
  calif_pasajero INTEGER,
  cancelado_por TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  aceptado_en TEXT,
  iniciado_en TEXT,
  finalizado_en TEXT
);
CREATE INDEX IF NOT EXISTS viajes_estado ON viajes(estado);
CREATE INDEX IF NOT EXISTS viajes_pasajero ON viajes(pasajero_id);
CREATE INDEX IF NOT EXISTS viajes_conductor ON viajes(conductor_id);

CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lugares (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('casa', 'trabajo')),
  dir TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  PRIMARY KEY (usuario_id, tipo)
);

-- Un código pendiente por teléfono y propósito ('registro' o 'pin').
CREATE TABLE IF NOT EXISTS verificaciones (
  telefono TEXT NOT NULL,
  proposito TEXT NOT NULL,
  codigo_hash TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  enviado_en TEXT NOT NULL DEFAULT (datetime('now')),
  expira TEXT NOT NULL,
  PRIMARY KEY (telefono, proposito)
);

-- Registro de envíos, para limitar cuántos SMS se mandan por número y por IP.
CREATE TABLE IF NOT EXISTS sms_enviados (
  telefono TEXT NOT NULL,
  ip TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sms_enviados_creado ON sms_enviados(creado);
`;

// Columnas agregadas después de la primera versión.
const COLUMNAS_NUEVAS = [
  ['viajes', 'para_nombre', 'TEXT'],
  ['viajes', 'para_telefono', 'TEXT'],
  ['viajes', 'programado_para', 'TEXT'],
  ['viajes', 'cuadralo', 'INTEGER NOT NULL DEFAULT 0'],
];

// Valores iniciales; el administrador los cambia desde el panel.
export const AJUSTES_INICIALES = {
  ciudad_nombre: 'Caracas',
  ciudad_lat: 10.4806,
  ciudad_lng: -66.9036,
  tasa_bs: 0,
  tarifa_base: 1,
  precio_km: 0.5,
  precio_min: 0.05,
  tarifa_minima: 1.5,
  factor_moto: 0.6,
  comision_pct: 10,
  cuadralo_min_pct: 75,
  soporte_whatsapp: '',
  radio_km: 8,
  espera_min: 5,
  efectivo_habilitado: 1,
  pago_movil_habilitado: 1,
  tarjeta_habilitada: 0,
};

async function preparar() {
  if (!remota) await cliente.executeMultiple('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await cliente.executeMultiple(ESQUEMA);
  for (const [tabla, columna, tipo] of COLUMNAS_NUEVAS) {
    const existentes = await todos(`PRAGMA table_info(${tabla})`);
    if (!existentes.some(c => c.name === columna)) await ejecutar(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
  }
  await lote(Object.entries(AJUSTES_INICIALES).map(([clave, valor]) => ['INSERT OR IGNORE INTO ajustes (clave, valor) VALUES (?, ?)', clave, String(valor)]));
}

// Se espera antes de atender peticiones.
export const listo = preparar();

// Los ajustes se leen en casi cada petición: los guardamos en memoria y se refrescan al cambiarlos.
let enMemoria = null;

export async function ajustes() {
  if (enMemoria) return enMemoria;
  const resultado = {};
  for (const { clave, valor } of await todos('SELECT clave, valor FROM ajustes')) {
    resultado[clave] = typeof AJUSTES_INICIALES[clave] === 'number' ? Number(valor) : valor;
  }
  enMemoria = resultado;
  return resultado;
}

export async function guardarAjustes(cambios) {
  const sentencias = [];
  for (const [clave, inicial] of Object.entries(AJUSTES_INICIALES)) {
    if (!(clave in cambios)) continue;
    const valor = typeof inicial === 'number' ? Number(cambios[clave]) : String(cambios[clave]).trim();
    if (typeof inicial === 'number' && !Number.isFinite(valor)) throw new Error(`Valor inválido para ${clave}`);
    sentencias.push(['UPDATE ajustes SET valor = ? WHERE clave = ?', String(valor), clave]);
  }
  if (sentencias.length) await lote(sentencias);
  enMemoria = null;
}
