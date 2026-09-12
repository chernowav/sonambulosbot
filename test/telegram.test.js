const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createTelegram } = require('../src/services/telegram');
const { createApp } = require('../src/app');
const { createCommands } = require('../src/services/commands');
const { createSessions } = require('../src/services/sessions');
const { createFakeStore } = require('../test-support/fakeStore');

const SECRETO = 'secreto-del-webhook';

// Un Telegram falso que anota lo que se le pidió mandar.
function fakeTelegram({ enabled = true } = {}) {
  const sent = [];
  return {
    enabled,
    sent,
    botUsername: 'Piso26Bot',
    async send(chatId, text) {
      sent.push({ chatId, text });
      return { ok: true };
    },
    linkFor(code) { return `https://t.me/Piso26Bot?start=${code}`; },
    isFromTelegram(header) { return header === SECRETO; },
  };
}

function fakeSms({ enabled = true } = {}) {
  const sent = [];
  return {
    enabled,
    sent,
    async send(phoneNumber, text) { sent.push({ phoneNumber, text }); return { ok: true }; },
  };
}

async function setup(canales) {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' }, canales);
  const account = (phoneNumber, name) =>
    store.createAccount({ phoneNumber, pin: '1234', email: 'a@b.co', name });

  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  store._debug.users.get('3000000001').balanceLuna = 20;

  return { store, commands };
}

test('a linked person is reached on Telegram and not by paid SMS', async () => {
  const telegram = fakeTelegram();
  const sms = fakeSms();
  const { store, commands } = await setup({ telegram, sms });

  store._debug.users.get('3000000002').telegramChatId = '555';

  await commands.transfer('3000000001', ['@3000000002', '4']);

  const porTelegram = telegram.sent.find((m) => m.chatId === '555');
  assert.ok(porTelegram, 'Beto debió recibir el aviso por Telegram');
  assert.match(porTelegram.text, /recibiste 4 Luna de Ana/);

  // Y no se gastó un SMS con quien ya está en Telegram.
  assert.equal(sms.sent.some((m) => m.phoneNumber === '3000000002'), false);
});

test('someone who never linked still gets the paid SMS', async () => {
  const telegram = fakeTelegram();
  const sms = fakeSms();
  const { store, commands } = await setup({ telegram, sms });

  store._debug.users.get('3000000002').telegramChatId = '555';
  // Ana no vinculó nada.

  await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.equal(sms.sent.length, 1);
  assert.equal(sms.sent[0].phoneNumber, '3000000001');
  assert.match(sms.sent[0].text, /enviaste 4 Luna a Beto/);
});

test('with no channel configured the transfer still happens', async () => {
  const { store, commands } = await setup({});

  const reply = await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.match(reply, /Enviaste \d+ Luna/);
  assert.equal(store._debug.users.get('3000000002').balanceLuna, 4);
});

test('the link code works once and only once', async () => {
  const store = createFakeStore({});
  await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });

  const code = await store.createTelegramLinkCode('3000000001');

  const primero = await store.linkTelegram(code, 777);
  assert.equal(primero.telegramChatId, '777');

  // Alguien que reusa el mismo enlace no debe engancharse a esa cuenta.
  const segundo = await store.linkTelegram(code, 888);
  assert.equal(segundo, null);
  assert.equal(store._debug.users.get('3000000001').telegramChatId, '777');
});

test('the deep link carries the code', () => {
  const telegram = createTelegram({ botToken: 'x', botUsername: 'Piso26Bot' });
  assert.equal(telegram.linkFor('abc123'), 'https://t.me/Piso26Bot?start=abc123');
});

test('without a bot token the sender stays off and never throws', async () => {
  const telegram = createTelegram({});
  assert.equal(telegram.enabled, false);
  assert.deepEqual(await telegram.send('1', 'hola'), { ok: false, reason: 'disabled' });
});

test('sending to someone with no chat id is refused, not attempted', async () => {
  const telegram = createTelegram({ botToken: 'x' });
  assert.deepEqual(await telegram.send(null, 'hola'), { ok: false, reason: 'sin-vincular' });
});

/* ---------- El webhook ---------- */

async function withServer(telegram, run) {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const sessions = createSessions({ secret: 'secreto-de-prueba' });
  const config = { adminPassword: 'k', botName: 'Piso 26', defaultEventId: 'e' };
  const app = createApp({
    config,
    store,
    sessions,
    telegram,
    commands: createCommands(store, config, { telegram }),
    sendMessage: async () => 'ok',
  });

  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const hook = (update, secreto) =>
    fetch(`${base}/telegram/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secreto === undefined ? { 'X-Telegram-Bot-Api-Secret-Token': SECRETO } : { 'X-Telegram-Bot-Api-Secret-Token': secreto }),
      },
      body: JSON.stringify(update),
    });

  try {
    await run({ hook, store, base, sessions });
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('/start with a valid code links the account', async () => {
  const telegram = fakeTelegram();

  await withServer(telegram, async ({ hook, store }) => {
    await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });
    const code = await store.createTelegramLinkCode('3000000001');

    const res = await hook({ message: { chat: { id: 999 }, text: `/start ${code}` } });
    assert.equal(res.status, 200);

    // El webhook responde antes de trabajar; se le da un momento.
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(store._debug.users.get('3000000001').telegramChatId, '999');
    assert.match(telegram.sent.at(-1).text, /Listo, Ana/);
  });
});

test('an update without the shared secret is rejected', async () => {
  const telegram = fakeTelegram();

  await withServer(telegram, async ({ hook, store }) => {
    await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });
    const code = await store.createTelegramLinkCode('3000000001');

    const res = await hook({ message: { chat: { id: 999 }, text: `/start ${code}` } }, 'secreto-falso');

    assert.equal(res.status, 403);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(store._debug.users.get('3000000001').telegramChatId, undefined);
  });
});

test('a bad code gets told what to do instead of failing silently', async () => {
  const telegram = fakeTelegram();

  await withServer(telegram, async ({ hook }) => {
    await hook({ message: { chat: { id: 999 }, text: '/start noexiste' } });
    await new Promise((r) => setTimeout(r, 60));

    assert.match(telegram.sent.at(-1).text, /ya se usó o no es válido/);
  });
});

test('a bare /start explains how to link', async () => {
  const telegram = fakeTelegram();

  await withServer(telegram, async ({ hook }) => {
    await hook({ message: { chat: { id: 999 }, text: '/start' } });
    await new Promise((r) => setTimeout(r, 60));

    assert.match(telegram.sent.at(-1).text, /Conectar Telegram/);
  });
});

test('the console gets a link for someone not yet connected', async () => {
  const telegram = fakeTelegram();

  await withServer(telegram, async ({ base, store, sessions }) => {
    await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });
    const token = sessions.issue('3000000001');

    const res = await fetch(`${base}/api/telegram/enlace?token=${encodeURIComponent(token)}`);
    const body = await res.json();

    assert.equal(body.vinculado, false);
    assert.match(body.url, /^https:\/\/t\.me\/Piso26Bot\?start=/);
  });
});

test('the link endpoint needs a session', async () => {
  const telegram = fakeTelegram();

  await withServer(telegram, async ({ base }) => {
    const res = await fetch(`${base}/api/telegram/enlace?token=basura`);
    assert.equal(res.status, 401);
  });
});
