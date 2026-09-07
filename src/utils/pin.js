const crypto = require('crypto');

// Solo se usa cuando el tesorero le reasigna un PIN a alguien que lo olvidó;
// en el registro normal el PIN lo elige la persona.
function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

// El hash incluye el teléfono como sal implícita: dos usuarios con el mismo
// PIN de 4 dígitos (inevitable, solo hay 10 000 combinaciones) no terminan
// con el mismo hash almacenado.
function hashPin(phoneNumber, pin) {
  return crypto.createHash('sha256').update(`${phoneNumber}:${pin}`).digest('hex');
}

module.exports = { generatePin, isValidPin, hashPin };
