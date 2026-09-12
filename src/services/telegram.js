// Avisos por Telegram. La API de bots es gratis y sin cuotas para esta
// escala, no pide cuenta de empresa ni aprobación de plantillas, y el mensaje
// llega con el nombre del bot del evento.
//
// A cambio pide una cosa: Telegram no deja escribirle a alguien que no habló
// primero con el bot. Por eso existe el enlace de vinculación — la persona le
// da Start una vez y ahí queda enganchada.
const API = 'https://api.telegram.org/bot';
const TIMEOUT_MS = 10000;

function createTelegram({ botToken, botUsername, publicUrl, secretToken } = {}) {
  const enabled = Boolean(botToken);

  async function call(method, payload) {
    if (!enabled) return { ok: false, reason: 'disabled' };

    try {
      const res = await fetch(`${API}${botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        console.error(`❌ Telegram ${method} falló: ${body.description || res.status}`);
        return { ok: false, reason: 'rejected', description: body.description };
      }

      return { ok: true, result: body.result };
    } catch (error) {
      console.error(`❌ Telegram ${method} no respondió: ${error.message}`);
      return { ok: false, reason: 'unreachable' };
    }
  }

  async function send(chatId, text) {
    if (!chatId) return { ok: false, reason: 'sin-vincular' };
    return call('sendMessage', { chat_id: chatId, text });
  }

  // Enlace que abre Telegram con el código ya puesto: la persona solo toca
  // Start. El código viaja en el payload de /start.
  function linkFor(code) {
    if (!botUsername) return null;
    return `https://t.me/${botUsername}?start=${code}`;
  }

  // Telegram entrega los mensajes a una URL nuestra. Registrarla en cada
  // arranque es idempotente y evita tener que hacerlo a mano.
  //
  // El secreto viaja en una cabecera que Telegram repite en cada entrega: la
  // URL del webhook es pública y sin esto cualquiera podría inventarse
  // actualizaciones y hacerlas pasar por Telegram.
  async function registerWebhook() {
    if (!enabled || !publicUrl) return { ok: false, reason: 'sin-url' };

    return call('setWebhook', {
      url: `${publicUrl.replace(/\/$/, '')}/telegram/webhook`,
      allowed_updates: ['message'],
      secret_token: secretToken,
    });
  }

  function isFromTelegram(headerValue) {
    if (!secretToken) return true; // sin secreto configurado no hay nada que comparar
    return headerValue === secretToken;
  }

  return { enabled, send, linkFor, registerWebhook, isFromTelegram, botUsername };
}

module.exports = { createTelegram };
