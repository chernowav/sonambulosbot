// Envío de SMS por la API REST de Twilio con fetch directo, sin volver a
// instalar el SDK: es una sola petición HTTP y el paquete entero pesaba más
// que el código que lo usa.
//
// Si no hay credenciales configuradas, `enabled` queda en false y la app
// sigue funcionando sin verificación por SMS, en vez de romperse. Así se puede
// desplegar antes de contratar el proveedor.
const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts';
const TIMEOUT_MS = 10000;

function createSms({ accountSid, authToken, from, countryCode = '+57' } = {}) {
  const enabled = Boolean(accountSid && authToken && from);

  // Los teléfonos se guardan como 10 dígitos; Twilio los exige en E.164.
  function toE164(phoneNumber) {
    const digits = String(phoneNumber).replace(/\D/g, '');
    return digits.length > 10 ? `+${digits}` : `${countryCode}${digits}`;
  }

  async function send(phoneNumber, text) {
    if (!enabled) return { ok: false, reason: 'disabled' };

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    try {
      const res = await fetch(`${TWILIO_API}/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: toE164(phoneNumber), From: from, Body: text }),
        // Sin límite de tiempo, un proveedor caído dejaría el registro colgado
        // esperando para siempre.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error(`❌ SMS rechazado (${res.status}): ${detail.slice(0, 300)}`);
        return { ok: false, reason: 'rejected', status: res.status };
      }

      return { ok: true };
    } catch (error) {
      console.error(`❌ SMS falló: ${error.message}`);
      return { ok: false, reason: 'unreachable' };
    }
  }

  return { enabled, send, toE164 };
}

module.exports = { createSms };
