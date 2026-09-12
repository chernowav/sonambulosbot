const crypto = require('crypto');

// Solo se usa cuando el tesorero le reasigna un PIN a alguien que lo olvidó;
// en el registro normal el PIN lo elige la persona.
function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

// Código de un solo uso que se manda por SMS para probar que el teléfono es de
// quien se está registrando. Seis dígitos, no cuatro: este sí viaja por un
// canal que podría interceptarse, y no se reusa.
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// El hash incluye el teléfono como sal implícita: dos usuarios con el mismo
// PIN de 4 dígitos (inevitable, solo hay 10 000 combinaciones) no terminan
// con el mismo hash almacenado.
function hashPin(phoneNumber, pin) {
  return crypto.createHash('sha256').update(`${phoneNumber}:${pin}`).digest('hex');
}

module.exports = { generatePin, generateCode, isValidPin, hashPin };
