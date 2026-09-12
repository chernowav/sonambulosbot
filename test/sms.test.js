const test = require('node:test');
const assert = require('node:assert/strict');

const { createSms, createWhatsapp } = require('../src/services/sms');
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
  const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' }, { sms });
  const account = (phoneNumber, name) =>
    store.createAccount({ phoneNumber, pin: '1234', email: 'a@b.co', name });

  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  await account('3000000009', 'Tesorero');
  store._debug.users.get('3000000001').balanceLuna = 20;

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

test('both sides of a transfer get a text, each with their own balance', async () => {
  const sms = fakeSms();
  const { commands } = await setup(sms);

  await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.equal(sms.sent.length, 2);

  const recibe = sms.sent.find((m) => m.phoneNumber === '3000000002');
  assert.match(recibe.text, /recibiste 4 Luna de Ana/);
  assert.match(recibe.text, /Tu Luna: 4/);
  assert.match(recibe.text, /Movimiento #1/);

  const envia = sms.sent.find((m) => m.phoneNumber === '3000000001');
  assert.match(envia.text, /enviaste 4 Luna a Beto/);
  assert.match(envia.text, /Tu Luna: 16/);
  assert.match(envia.text, /Movimiento #1/);
});

test('/send notifies both sides too', async () => {
  const sms = fakeSms();
  const { commands } = await setup(sms);

  await commands.send('3000000001', ['2', 'tokens', 'to', '@3000000002']);

  assert.deepEqual(
    sms.sent.map((m) => m.phoneNumber).sort(),
    ['3000000001', '3000000002']
  );
});

test('an emission also texts the person who got the coins', async () => {
  const sms = fakeSms();
  const { commands } = await setup(sms);

  await commands.emit('3000000009', ['@3000000002', '7']);

  assert.equal(sms.sent.length, 1);
  assert.match(sms.sent[0].text, /te recargaron 7/);
});

test('the transfer still goes through when the provider is down', async () => {
  const sms = fakeSms({ fail: true });
  const { commands, store } = await setup(sms);

  const reply = await commands.transfer('3000000001', ['@3000000002', '4']);

  // El aviso es un extra: que falle no puede deshacer el movimiento.
  assert.match(reply, /Enviaste \d+ Luna/);
  assert.equal(store._debug.users.get('3000000002').balanceLuna, 4);
  assert.equal(store._debug.transactions.length, 1);
});

test('nothing is sent when SMS is switched off', async () => {
  const sms = fakeSms({ enabled: false });
  const { commands } = await setup(sms);

  await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.equal(sms.sent.length, 0);
});

/* ---------- WhatsApp y la cascada de canales ---------- */

test('WhatsApp addresses are tagged with the channel Twilio expects', () => {
  const wa = createWhatsapp({
    accountSid: 'AC_test',
    authToken: 'token',
    whatsappFrom: '+14155238886',
    countryCode: '+57',
  });

  assert.equal(wa.enabled, true);
  assert.equal(wa.canal, 'whatsapp');
  assert.equal(wa.toE164('3153811758'), '+573153811758');
});

test('WhatsApp stays off when only the SMS number is configured', () => {
  const wa = createWhatsapp({ accountSid: 'AC_test', authToken: 'token', from: '+15550001111' });
  assert.equal(wa.enabled, false);
});

// Canal falso que puede fallar a voluntad, para probar la cascada.
function canal(nombre, { enabled = true, falla = false } = {}) {
  const sent = [];
  return {
    nombre,
    enabled,
    sent,
    async send(destino, text) {
      if (falla) return { ok: false, reason: 'rejected' };
      sent.push({ destino, text });
      return { ok: true };
    },
  };
}

async function setupCanales(canales) {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' }, canales);
  const alta = (p, n) => store.createAccount({ phoneNumber: p, pin: '1234', email: 'a@b.co', name: n });

  await alta('3000000001', 'Ana');
  await alta('3000000002', 'Beto');
  store._debug.users.get('3000000001').balanceLuna = 20;
  return { store, commands };
}

test('WhatsApp is used before the paid SMS', async () => {
  const whatsapp = canal('whatsapp');
  const sms = canal('sms');
  const { commands } = await setupCanales({ whatsapp, sms });

  await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.equal(whatsapp.sent.length, 2);
  assert.equal(sms.sent.length, 0, 'no se debió gastar ningún SMS');
});

test('a channel that fails hands over to the next instead of losing the notice', async () => {
  const telegram = canal('telegram', { falla: true });
  const whatsapp = canal('whatsapp', { falla: true });
  const sms = canal('sms');

  const { store, commands } = await setupCanales({ telegram, whatsapp, sms });
  store._debug.users.get('3000000002').telegramChatId = '555';

  await commands.transfer('3000000001', ['@3000000002', '4']);
  // La cascada corre sin bloquear la transferencia; se le da un instante.
  await new Promise((r) => setTimeout(r, 40));

  assert.equal(sms.sent.length, 2, 'el SMS debió recoger lo que los otros no pudieron');
});
