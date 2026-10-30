import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { uno, ejecutar, lote } from './db.js';

// ---------- Códigos de verificación por SMS ----------

export const VIGENCIA_MIN = 10;
export const ESPERA_REENVIO_S = 60;
const MAX_INTENTOS = 5;
const MAX_POR_TELEFONO_HORA = 5;
const MAX_POR_IP_HORA = 20;

const hashCodigo = (telefono, codigo) => createHash('sha256').update(`${telefono}:${codigo}`).digest();

// Devuelve un mensaje de error si no se puede enviar otro código ahora mismo.
export async function limiteEnvio(telefono, proposito, ip) {
  const pendiente = await uno(`SELECT enviado_en > datetime('now', ?) AS reciente FROM verificaciones WHERE telefono = ? AND proposito = ?`,
    `-${ESPERA_REENVIO_S} seconds`, telefono, proposito);
  if (pendiente?.reciente) return 'Espera un minuto para pedir otro código.';
  const contar = async (columna, valor) => (await uno(`SELECT COUNT(*) AS n FROM sms_enviados WHERE ${columna} = ? AND creado > datetime('now', '-1 hour')`, valor)).n;
  if (await contar('telefono', telefono) >= MAX_POR_TELEFONO_HORA || await contar('ip', ip) >= MAX_POR_IP_HORA) {
    return 'Pediste demasiados códigos. Intenta de nuevo en una hora.';
  }
  return null;
}

export async function crearCodigo(telefono, proposito, ip) {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await lote([
    [`INSERT INTO verificaciones (telefono, proposito, codigo_hash, expira) VALUES (?, ?, ?, datetime('now', ?))
      ON CONFLICT (telefono, proposito) DO UPDATE SET codigo_hash = excluded.codigo_hash, intentos = 0,
        enviado_en = datetime('now'), expira = excluded.expira`,
    telefono, proposito, hashCodigo(telefono, codigo).toString('hex'), `+${VIGENCIA_MIN} minutes`],
    ['INSERT INTO sms_enviados (telefono, ip) VALUES (?, ?)', telefono, ip],
    [`DELETE FROM sms_enviados WHERE creado < datetime('now', '-1 day')`],
  ]);
  return codigo;
}

export const descartarCodigo = (telefono, proposito) =>
  ejecutar('DELETE FROM verificaciones WHERE telefono = ? AND proposito = ?', telefono, proposito);

// Devuelve un mensaje de error, o null si el código es correcto (y lo consume).
export async function verificarCodigo(telefono, proposito, codigo) {
  const v = await uno(`SELECT codigo_hash, intentos, expira < datetime('now') AS vencido FROM verificaciones WHERE telefono = ? AND proposito = ?`,
    telefono, proposito);
  if (!v || v.vencido) return 'El código venció o no existe. Pide uno nuevo.';
  if (v.intentos >= MAX_INTENTOS) return 'Demasiados intentos. Pide un código nuevo.';
  if (!/^\d{6}$/.test(String(codigo ?? '')) || !timingSafeEqual(hashCodigo(telefono, codigo), Buffer.from(v.codigo_hash, 'hex'))) {
    await ejecutar('UPDATE verificaciones SET intentos = intentos + 1 WHERE telefono = ? AND proposito = ?', telefono, proposito);
    return 'Código incorrecto.';
  }
  await descartarCodigo(telefono, proposito);
  return null;
}

// ---------- PIN y sesiones ----------

export function hashPin(pin) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(String(pin), sal, 32).toString('hex')}`;
}

export function verificarPin(pin, guardado) {
  const [sal, hash] = guardado.split(':');
  return timingSafeEqual(scryptSync(String(pin), sal, 32), Buffer.from(hash, 'hex'));
}

export const nuevoToken = () => randomBytes(32).toString('hex');

export const normalizarTelefono = telefono => String(telefono ?? '').replace(/\D/g, '');

// Límite simple de intentos de inicio de sesión por teléfono (en memoria).
const intentos = new Map();
const VENTANA_MS = 15 * 60 * 1000;

export function bloqueado(telefono) {
  const i = intentos.get(telefono);
  return Boolean(i && i.fallos >= 5 && i.hasta > Date.now());
}

export function registrarFallo(telefono) {
  const i = intentos.get(telefono);
  if (!i || i.hasta < Date.now()) intentos.set(telefono, { fallos: 1, hasta: Date.now() + VENTANA_MS });
  else i.fallos++;
}

export const limpiarFallos = telefono => intentos.delete(telefono);
