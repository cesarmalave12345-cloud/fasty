// Envío de los códigos de verificación.
//
// SMS_PROVEEDOR=consola (por defecto): el mensaje se escribe en la consola del servidor. Solo para desarrollo.
// SMS_PROVEEDOR=twilio: envía con Twilio. Requiere TWILIO_SID, TWILIO_TOKEN y TWILIO_DESDE
//   (el número de Twilio, ej. +15551234567). Con TWILIO_DESDE=whatsapp:+1... se envía por WhatsApp.

export const PROVEEDOR = process.env.SMS_PROVEEDOR || 'consola';

// 04141234567 -> +584141234567
export function aInternacional(telefono) {
  if (telefono.startsWith('0') && telefono.length === 11) return '+58' + telefono.slice(1);
  return '+' + telefono;
}

export async function enviarSms(telefono, mensaje) {
  if (PROVEEDOR === 'consola') {
    console.log(`[SMS a ${telefono}] ${mensaje}`);
    return;
  }
  if (PROVEEDOR === 'twilio') {
    const { TWILIO_SID: sid, TWILIO_TOKEN: token, TWILIO_DESDE: desde } = process.env;
    if (!sid || !token || !desde) throw new Error('Faltan TWILIO_SID, TWILIO_TOKEN o TWILIO_DESDE');
    const destino = (desde.startsWith('whatsapp:') ? 'whatsapp:' : '') + aInternacional(telefono);
    const respuesta = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: destino, From: desde, Body: mensaje }),
      signal: AbortSignal.timeout(10000),
    });
    if (!respuesta.ok) throw new Error(`Twilio respondió ${respuesta.status}: ${await respuesta.text()}`);
    return;
  }
  throw new Error(`Proveedor de SMS desconocido: ${PROVEEDOR}`);
}
