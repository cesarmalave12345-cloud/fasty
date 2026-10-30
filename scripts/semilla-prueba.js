// Crea cuentas de PRUEBA. No lo ejecutes en una base con usuarios reales.
// Uso: npm run semilla   (con TURSO_URL y TURSO_TOKEN definidos, las crea en la base publicada)
import { uno, lote, listo } from '../server/db.js';
import { hashPin } from '../server/auth.js';

export const CUENTAS_PRUEBA = [
  { rol: 'admin', nombre: 'Admin Prueba', telefono: '04120000001', pin: '111111' },
  { rol: 'pasajero', nombre: 'Ana Pasajera', telefono: '04120000002', pin: '222222' },
  {
    rol: 'conductor', nombre: 'Carlos Conductor', telefono: '04120000003', pin: '333333',
    vehiculo: { tipo: 'carro', vehiculo: 'Chevrolet Aveo', color: 'Gris', placa: 'AB123CD', cedula: 'V-11111111', pm_banco: 'Banco de Prueba', pm_telefono: '04120000003', pm_cedula: 'V-11111111' },
  },
];

await listo;
for (const c of CUENTAS_PRUEBA) {
  if (await uno('SELECT 1 AS si FROM usuarios WHERE telefono = ?', c.telefono)) continue;
  const v = c.vehiculo;
  await lote([
    ['INSERT INTO usuarios (rol, nombre, telefono, pin_hash) VALUES (?, ?, ?, ?)', c.rol, c.nombre, c.telefono, hashPin(c.pin)],
    ...(v ? [[`INSERT INTO conductores (usuario_id, tipo, vehiculo, color, placa, cedula, pm_banco, pm_telefono, pm_cedula, aprobado)
      VALUES ((SELECT id FROM usuarios WHERE telefono = ?), ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    c.telefono, v.tipo, v.vehiculo, v.color, v.placa, v.cedula, v.pm_banco, v.pm_telefono, v.pm_cedula]] : []),
  ]);
}
console.log('Cuentas de prueba creadas (ver scripts/semilla-prueba.js).');
