const AGENTE = `${process.env.APP_NOMBRE || 'Fasty'}/0.1 (app de transporte local)`;
const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

export const redondear = (n, decimales = 2) => Math.round(n * 10 ** decimales) / 10 ** decimales;

export function distanciaKm(aLat, aLng, bLat, bLng) {
  const rad = x => (x * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Ruta por calles con OSRM; si no responde, estimamos con línea recta.
export async function calcularRuta(origen, destino) {
  const url = `${OSRM}/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;
  try {
    const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(5000) });
    const ruta = (await respuesta.json()).routes?.[0];
    if (ruta) return { distancia_km: redondear(ruta.distance / 1000), duracion_min: redondear(ruta.duration / 60, 1), geometria: ruta.geometry };
  } catch {
    // seguimos con la estimación
  }
  const km = distanciaKm(origen.lat, origen.lng, destino.lat, destino.lng) * 1.35;
  return { distancia_km: redondear(km), duracion_min: redondear((km / 22) * 60, 1), geometria: null };
}

export function calcularTarifa(km, minutos, tipo, aj) {
  const factor = tipo === 'moto' ? aj.factor_moto : 1;
  const tarifa = (aj.tarifa_base + km * aj.precio_km + minutos * aj.precio_min) * factor;
  return redondear(Math.max(tarifa, aj.tarifa_minima * factor));
}

// Nominatim permite 1 petición por segundo: las encolamos.
let cola = Promise.resolve();
const esperar = ms => new Promise(r => setTimeout(r, ms));
const cache = new Map();

function nominatim(ruta, parametros) {
  const url = `${NOMINATIM}${ruta}?${new URLSearchParams({ format: 'jsonv2', 'accept-language': 'es', ...parametros })}`;
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  const tarea = cola.then(async () => {
    const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(6000) });
    if (!respuesta.ok) throw new Error('Servicio de mapas no disponible');
    const datos = await respuesta.json();
    if (cache.size > 2000) cache.clear();
    cache.set(url, datos);
    return datos;
  });
  cola = tarea.then(() => esperar(1000), () => esperar(1000));
  return tarea;
}

const corto = nombre => String(nombre ?? '').split(',').slice(0, 3).join(',').trim();

export async function buscarLugar(texto, aj) {
  const d = 0.35;
  const resultados = await nominatim('/search', {
    q: texto,
    limit: '6',
    countrycodes: process.env.PAIS || 've',
    viewbox: `${aj.ciudad_lng - d},${aj.ciudad_lat + d},${aj.ciudad_lng + d},${aj.ciudad_lat - d}`,
    bounded: '1',
  });
  return resultados.map(r => ({ nombre: corto(r.display_name), lat: Number(r.lat), lng: Number(r.lon) }));
}

export async function direccionDe(lat, lng) {
  const r = await nominatim('/reverse', { lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: '17' });
  return r?.display_name ? corto(r.display_name) : null;
}
