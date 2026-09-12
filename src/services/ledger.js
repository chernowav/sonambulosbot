const crypto = require('crypto');

// Primer eslabón: no hay movimiento anterior del cual colgarse.
const GENESIS = 'GENESIS';

// El hash cubre todo lo que define el movimiento, incluido el hash del
// anterior. Por eso editar una transacción vieja no basta con reescribir su
// propio hash: habría que recalcular también los de todas las siguientes, y
// cualquiera que tenga copia del último hash lo nota.
//
// Cubre las etiquetas públicas ("Cherno @1758", "TESORERO") y no los teléfonos
// completos, a propósito: así el libro se puede verificar entero desde afuera
// sin que haya que publicar el número de nadie. Si el hash tapara los números,
// verificar exigiría exponerlos, y "transparente" no puede costar eso.
function hashEntry(entry) {
  const payload = [
    entry.index,
    new Date(entry.timestamp).toISOString(),
    entry.action,
    entry.fromLabel,
    entry.toLabel,
    entry.amount,
    entry.prevHash,
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Recorre la cadena en orden y devuelve dónde se rompe, si se rompe.
// Cualquiera puede correr esto sobre los datos públicos: verificar el libro no
// requiere confiar en el servidor, solo recalcular.
function verifyChain(entries) {
  let expectedPrev = GENESIS;
  let expectedIndex = 1;

  for (const entry of entries) {
    if (entry.index !== expectedIndex) {
      return { ok: false, brokenAt: entry.index, reason: 'falta un movimiento' };
    }
    if (entry.prevHash !== expectedPrev) {
      return { ok: false, brokenAt: entry.index, reason: 'no engancha con el anterior' };
    }
    if (hashEntry(entry) !== entry.hash) {
      return { ok: false, brokenAt: entry.index, reason: 'el contenido no coincide con su hash' };
    }

    expectedPrev = entry.hash;
    expectedIndex += 1;
  }

  return { ok: true, length: entries.length, head: expectedPrev };
}

module.exports = { GENESIS, hashEntry, verifyChain };
