const crypto = require('crypto');

// Una noche de evento. Pasado ese tiempo hay que volver a poner el PIN.
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

// Sesiones firmadas (HMAC) en vez de guardadas en Mongo: el token lleva dentro
// el teléfono del dueño, así que el servidor nunca vuelve a confiar en el
// número que escriba el navegador. Sin esto, cualquiera podía mandar el
// teléfono de otra persona en el body y gastar su saldo.
function createSessions({ secret, ttlMs = DEFAULT_TTL_MS }) {
  function sign(payload) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  }

  function issue(phoneNumber, now = Date.now()) {
    const payload = Buffer.from(JSON.stringify({ p: phoneNumber, e: now + ttlMs })).toString(
      'base64url'
    );
    return `${payload}.${sign(payload)}`;
  }

  // Devuelve { phoneNumber, expiresAt } si el token es válido y no expiró;
  // null en cualquier otro caso (firma mala, formato raro, vencido).
  function verify(token, now = Date.now()) {
    if (typeof token !== 'string') return null;

    const separator = token.lastIndexOf('.');
    if (separator <= 0) return null;

    const payload = token.slice(0, separator);
    const provided = Buffer.from(token.slice(separator + 1));
    const expected = Buffer.from(sign(payload));

    // timingSafeEqual exige buffers del mismo largo, y comparar largos antes
    // no filtra nada útil: el largo de la firma es fijo y conocido.
    if (provided.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(provided, expected)) return null;

    let claims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch (error) {
      return null;
    }

    if (!claims || typeof claims.p !== 'string' || typeof claims.e !== 'number') return null;
    if (claims.e <= now) return null;

    return { phoneNumber: claims.p, expiresAt: claims.e };
  }

  return { issue, verify, ttlMs };
}

module.exports = { createSessions, DEFAULT_TTL_MS };
