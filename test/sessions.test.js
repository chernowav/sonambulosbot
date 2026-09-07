const test = require('node:test');
const assert = require('node:assert/strict');

const { createSessions } = require('../src/services/sessions');

function setup(ttlMs) {
  return createSessions({ secret: 'secreto-de-prueba', ttlMs });
}

test('issues a token that verifies back to the same phone', () => {
  const sessions = setup();
  const session = sessions.verify(sessions.issue('3000000001'));
  assert.equal(session.phoneNumber, '3000000001');
});

test('rejects a token whose payload was edited', () => {
  const sessions = setup();
  const token = sessions.issue('3000000001');
  const [, signature] = token.split('.');

  // Mismo teléfono cambiado por otro, conservando la firma original.
  const forgedPayload = Buffer.from(
    JSON.stringify({ p: '3000000002', e: Date.now() + 60000 })
  ).toString('base64url');

  assert.equal(sessions.verify(`${forgedPayload}.${signature}`), null);
});

test('rejects a token signed with another secret', () => {
  const mine = setup();
  const other = createSessions({ secret: 'otro-secreto' });
  assert.equal(mine.verify(other.issue('3000000001')), null);
});

test('rejects an expired token', () => {
  const sessions = setup(1000);
  const token = sessions.issue('3000000001', 0);

  assert.ok(sessions.verify(token, 500));
  assert.equal(sessions.verify(token, 1001), null);
});

test('rejects missing or malformed tokens instead of throwing', () => {
  const sessions = setup();
  [undefined, null, '', 'basura', 'sin-punto', '.', 'a.b'].forEach((value) => {
    assert.equal(sessions.verify(value), null, `debió rechazar: ${String(value)}`);
  });
});
