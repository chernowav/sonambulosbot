function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

// Distintas fuentes (Twilio, formularios, /transfer @numero) mandan el mismo
// número con prefijos de país o símbolos distintos. Normalizamos siempre a
// los últimos 10 dígitos para que sea la clave estable de un usuario.
function normalizePhone(value) {
  return digitsOnly(value).slice(-10);
}

// normalizePhone recorta a los últimos 10 dígitos, pero no rellena: con "123"
// devuelve "123", que parece un teléfono válido y no lo es. Sin esta
// comprobación, un dedazo al escribir un número crea una cuenta fantasma y le
// manda monedas reales que nadie puede recuperar.
function isValidPhone(value) {
  return normalizePhone(value).length === 10;
}

module.exports = { digitsOnly, normalizePhone, isValidPhone };
