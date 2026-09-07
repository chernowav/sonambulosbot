const test = require('node:test');
const assert = require('node:assert/strict');

const { createWebhookHandler } = require('../src/routes/webhook');
const { createCommands } = require('../src/services/commands');
const { createSessions } = require('../src/services/sessions');
const { createFakeStore } = require('../test-support/fakeStore');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

function setup() {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const config = { adminPassword: 'secret123', defaultEventId: 'event_test' };
  const commands = createCommands(store, config);
  const sessions = createSessions({ secret: 'secreto-de-prueba' });
  const sent = [];
  const sendMessage = async (phone, message) => {
    sent.push({ phone, message });
    return 'msg_test';
  };
  const handleIncoming = createWebhookHandler({ commands, config, sendMessage, sessions });

  const account = (phoneNumber, name) =>
    store.createAccount({ phoneNumber, pin: '1234', email: 'a@b.co', name });

  return { handleIncoming, sent, store, sessions, account };
}

async function run(handleIncoming, body) {
  const res = fakeRes();
  await handleIncoming({ body }, res);
  return res;
}

test('/help works without a session', async () => {
  const { handleIncoming } = setup();
  const res = await run(handleIncoming, { Body: '/help' });

  assert.equal(res.body.locked, undefined);
  assert.match(res.body.response, /Comandos Sonámbulos/);
});

test('every other command is locked without a session', async () => {
  const { handleIncoming } = setup();
  const res = await run(handleIncoming, { Body: '/balance' });

  assert.equal(res.body.locked, true);
  assert.equal(res.body.reason, 'auth');
});

test('takes the identity from the token and ignores the phone in the body', async () => {
  const { handleIncoming, store, sessions, account } = setup();
  await account('3000000001', 'Dueño');
  await account('3000000002', 'Otro');
  store._debug.users.get('3000000001').balance = 10;

  // El body dice ser el usuario 1, pero el token es del usuario 2: quien
  // paga tiene que ser el del token, si no cualquiera vaciaría cuentas ajenas.
  const res = await run(handleIncoming, {
    From: '3000000001',
    Body: '/transfer @3000000003 5',
    token: sessions.issue('3000000002'),
  });

  assert.equal(res.body.phoneNumber, '3000000002');
  assert.match(res.body.response, /Saldo insuficiente/);
  assert.equal(store._debug.users.get('3000000001').balance, 10);
});

test('locks commands when the token expired', async () => {
  const { handleIncoming, account } = setup();
  await account('3000000001', 'A');

  const shortLived = createSessions({ secret: 'secreto-de-prueba', ttlMs: 1 });
  const expired = shortLived.issue('3000000001', 0);

  const res = await run(handleIncoming, { Body: '/balance', token: expired });
  assert.equal(res.body.reason, 'auth');
});

test('locks /emit when the adminKey is missing or wrong', async () => {
  const { handleIncoming, sessions, account } = setup();
  await account('3000000009', 'Tesorero');

  const res = await run(handleIncoming, {
    Body: '/emit @3000000002 5',
    token: sessions.issue('3000000009'),
  });

  assert.equal(res.body.locked, true);
  assert.equal(res.body.reason, 'admin');
});

test('allows /emit through with a session and the correct adminKey', async () => {
  const { handleIncoming, sessions, account } = setup();
  await account('3000000009', 'Tesorero');

  const res = await run(handleIncoming, {
    Body: '/emit @3000000002 5',
    token: sessions.issue('3000000009'),
    adminKey: 'secret123',
  });

  assert.match(res.body.response, /Emitidas 5 monedas/);
});

test('rejects an empty message', async () => {
  const { handleIncoming } = setup();
  const res = await run(handleIncoming, {});
  assert.equal(res.statusCode, 400);
});

test('sends the reply back through the messenger', async () => {
  const { handleIncoming, sent, sessions, account } = setup();
  await account('3000000001', 'A');

  await run(handleIncoming, { Body: '/balance', token: sessions.issue('3000000001') });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].phone, '3000000001');
});

test('preserves the case of command arguments (names, content links)', async () => {
  const { handleIncoming, store, sessions, account } = setup();
  await account('3000000001', 'A');

  await run(handleIncoming, {
    Body: '/register Cherno',
    token: sessions.issue('3000000001'),
  });

  assert.equal(store._debug.users.get('3000000001').name, 'Cherno');
});
