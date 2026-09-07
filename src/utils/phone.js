function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

// Distintas fuentes (Twilio, formularios, /transfer @numero) mandan el mismo
// número con prefijos de país o símbolos distintos. Normalizamos siempre a
// los últimos 10 dígitos para que sea la clave estable de un usuario.
function normalizePhone(value) {
  return digitsOnly(value).slice(-10);
}

module.exports = { digitsOnly, normalizePhone };
