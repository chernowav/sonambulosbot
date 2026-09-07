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
