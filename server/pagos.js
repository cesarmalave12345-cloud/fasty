// Punto de integración con la pasarela de tarjetas.
//
// Aún no hay pasarela conectada. Con PASARELA_MODO=prueba el cobro se aprueba
// sin mover dinero, para poder probar el flujo completo. Para producción hay
// que reemplazar esta función por la llamada real al proveedor elegido
// (botón de pago de un banco venezolano o un procesador internacional).
export async function cobrarTarjeta(viaje) {
  if (process.env.PASARELA_MODO === 'prueba') {
    return { ok: true, referencia: `PRUEBA-${viaje.id}` };
  }
  return { ok: false, error: 'La pasarela de tarjetas no está configurada' };
}
