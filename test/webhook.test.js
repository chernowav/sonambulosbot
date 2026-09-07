const test = require('node:test');
const assert = require('node:assert/strict');

const { createWebhookHandler } = require('../src/routes/webhook');
const { createCommands } = require('../src/services/commands');
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
  const sent = [];
  const sendMessage = async (phone, message) => {
    sent.push({ phone, message });
    return 'msg_test';
  };
  const handleIncoming = createWebhookHandler({ commands, config, sendMessage });
  return { handleIncoming, sent, store };
}

test('locks /emit when the adminKey is missing or wrong', async () => {
  const { handleIncoming } = setup();
  const req = { body: { From: '3000000009', Body: '/emit @3000000002 5' } };
  const res = fakeRes();

  await handleIncoming(req, res);

  assert.equal(res.body.locked, true);
});

test('allows /emit through with the correct adminKey', async () => {
  const { handleIncoming, store } = setup();
  await store.getOrCreateUser('3000000009', 'Tesorero');
  const req = {
    body: { From: '3000000009', Body: '/emit @3000000002 5', adminKey: 'secret123' },
  };
  const res = fakeRes();

  await handleIncoming(req, res);

  assert.match(res.body.response, /Emitidas 5 monedas/);
});

test('rejects requests missing phone or message', async () => {
  const { handleIncoming } = setup();
  const req = { body: {} };
  const res = fakeRes();

  await handleIncoming(req, res);

  assert.equal(res.statusCode, 400);
});

test('sends the reply back through the messenger', async () => {
  const { handleIncoming, sent } = setup();
  const req = { body: { From: '3000000001', Body: '/register Cherno' } };
  const res = fakeRes();

  await handleIncoming(req, res);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].phone, '3000000001');
});

test('preserves the case of command arguments (names, content links)', async () => {
  const { handleIncoming, store } = setup();
  const req = { body: { From: '3000000001', Body: '/register Cherno' } };
  const res = fakeRes();

  await handleIncoming(req, res);

  assert.equal(store._debug.users.get('3000000001').name, 'Cherno');
});

test('locks /transfer without the PIN, then lets it through once provided', async () => {
  const { handleIncoming, store } = setup();

  const registerReq = { body: { From: '3000000001', Body: '/register A' } };
  await handleIncoming(registerReq, fakeRes());
  store._debug.users.get('3000000001').balance = 10;
  const pin = store._debug.users.get('3000000001').pin;

  const lockedRes = fakeRes();
  await handleIncoming({ body: { From: '3000000001', Body: '/transfer @3000000002 4' } }, lockedRes);
  assert.equal(lockedRes.body.locked, true);
  assert.equal(lockedRes.body.reason, 'pin');

  const okRes = fakeRes();
  await handleIncoming({ body: { From: '3000000001', Body: '/transfer @3000000002 4', pin } }, okRes);
  assert.match(okRes.body.response, /Transferencia completada/);
});
