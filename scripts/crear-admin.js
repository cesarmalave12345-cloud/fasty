// Uso: npm run crear-admin -- <telefono> <pin de 6 dígitos> <nombre>
// Con TURSO_URL y TURSO_TOKEN definidos, crea el administrador en la base publicada.
import { ejecutar, listo } from '../server/db.js';
import { hashPin, normalizarTelefono } from '../server/auth.js';

const [telefono, pin, ...nombre] = process.argv.slice(2);
const tel = normalizarTelefono(telefono);

if (tel.length < 10 || !/^\d{6}$/.test(pin ?? '') || !nombre.length) {
  console.error('Uso: npm run crear-admin -- 04141234567 123456 "Tu Nombre"');
  process.exit(1);
}

await listo;
await ejecutar(`INSERT INTO usuarios (rol, nombre, telefono, pin_hash) VALUES ('admin', ?, ?, ?)
  ON CONFLICT (telefono) DO UPDATE SET rol = 'admin', pin_hash = excluded.pin_hash, nombre = excluded.nombre, activo = 1`,
nombre.join(' '), tel, hashPin(pin));
console.log(`Administrador listo: ${tel}. Entra en /admin.html`);
