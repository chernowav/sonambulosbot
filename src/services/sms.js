// Mensajería por Twilio, usando su API REST con fetch directo en vez del SDK:
// es una sola petición HTTP y el paquete entero pesaba más que el código que
// lo usa.
//
// Sirve para dos canales sobre la misma cuenta. WhatsApp va primero cuando
// está disponible porque el sandbox de Twilio no cobra por mensaje; el SMS sí
// lo cobran los operadores.
//
// Si faltan credenciales, `enabled` queda en false y la app sigue funcionando
// sin mandar nada, en vez de romperse.
const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts';
const TIMEOUT_MS = 10000;

function crearEnvio({ accountSid, authToken, from, canal, countryCode = '+57' }) {
  const enabled = Boolean(accountSid && authToken && from);

  // Los teléfonos se guardan como 10 dígitos; Twilio los exige en E.164, y
  // para WhatsApp además con el prefijo del canal.
  function toE164(phoneNumber) {
    const digits = String(phoneNumber).replace(/\D/g, '');
    return digits.length > 10 ? `+${digits}` : `${countryCode}${digits}`;
  }

  function destino(phoneNumber) {
    const e164 = toE164(phoneNumber);
    return canal === 'whatsapp' ? `whatsapp:${e164}` : e164;
  }

  function remitente() {
    if (canal !== 'whatsapp') return from;
    return from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
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
        body: new URLSearchParams({ To: destino(phoneNumber), From: remitente(), Body: text }),
        // Sin límite de tiempo, un proveedor caído dejaría el aviso colgado
        // esperando para siempre.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error(`❌ ${canal} rechazado (${res.status}): ${detail.slice(0, 300)}`);
        return { ok: false, reason: 'rejected', status: res.status };
      }

      return { ok: true };
    } catch (error) {
      console.error(`❌ ${canal} falló: ${error.message}`);
      return { ok: false, reason: 'unreachable' };
    }
  }

  return { enabled, send, toE164, canal };
}

function createSms(config = {}) {
  return crearEnvio({ ...config, canal: 'sms' });
}

function createWhatsapp(config = {}) {
  return crearEnvio({ ...config, from: config.whatsappFrom, canal: 'whatsapp' });
}

module.exports = { createSms, createWhatsapp };
