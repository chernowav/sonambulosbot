const test = require('node:test');
const assert = require('node:assert/strict');

const { createSms } = require('../src/services/sms');
const { createCommands } = require('../src/services/commands');
const { createFakeStore } = require('../test-support/fakeStore');

const CREDS = { accountSid: 'AC_test', authToken: 'token', from: '+15550001111' };

// Un SMS falso que anota lo que le pidieron mandar.
function fakeSms({ enabled = true, fail = false } = {}) {
  const sent = [];
  return {
    enabled,
    sent,
    async send(phoneNumber, text) {
      if (fail) throw new Error('proveedor caído');
      sent.push({ phoneNumber, text });
      return { ok: true };
    },
  };
}

async function setup(sms) {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' }, sms);
  const account = (phoneNumber, name) =>
    store.createAccount({ phoneNumber, pin: '1234', email: 'a@b.co', name });

  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  await account('3000000009', 'Tesorero');
  store._debug.users.get('3000000001').balance = 20;

  return { store, commands };
}

test('without credentials the sender stays off and never throws', async () => {
  const sms = createSms({});
  assert.equal(sms.enabled, false);

  const result = await sms.send('3000000001', 'hola');
  assert.deepEqual(result, { ok: false, reason: 'disabled' });
});

test('phone numbers are put into the format the provider expects', () => {
  const sms = createSms({ ...CREDS, countryCode: '+57' });

  assert.equal(sms.toE164('3153811758'), '+573153811758');
  assert.equal(sms.toE164('315 381 1758'), '+573153811758');
  assert.equal(sms.toE164('573153811758'), '+573153811758');
});

test('whoever receives coins gets a text about it', async () => {
  const sms = fakeSms();
  const { commands } = await setup(sms);

  await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.equal(sms.sent.length, 1);
  assert.equal(sms.sent[0].phoneNumber, '3000000002');
  assert.match(sms.sent[0].text, /recibiste 4 monedas de Ana/);
  assert.match(sms.sent[0].text, /Movimiento #1/);
});

test('an emission also texts the person who got the coins', async () => {
  const sms = fakeSms();
  const { commands } = await setup(sms);

  await commands.emit('3000000009', ['@3000000002', '7']);

  assert.equal(sms.sent.length, 1);
  assert.match(sms.sent[0].text, /te emitieron 7 monedas/);
});

test('the transfer still goes through when the provider is down', async () => {
  const sms = fakeSms({ fail: true });
  const { commands, store } = await setup(sms);

  const reply = await commands.transfer('3000000001', ['@3000000002', '4']);

  // El aviso es un extra: que falle no puede deshacer el movimiento.
  assert.match(reply, /Transferencia completada/);
  assert.equal(store._debug.users.get('3000000002').balance, 4);
  assert.equal(store._debug.transactions.length, 1);
});

test('nothing is sent when SMS is switched off', async () => {
  const sms = fakeSms({ enabled: false });
  const { commands } = await setup(sms);

  await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.equal(sms.sent.length, 0);
});
