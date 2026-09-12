const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { hashEntry, verifyChain, GENESIS } = require('../src/services/ledger');
const { createApp } = require('../src/app');
const { createCommands } = require('../src/services/commands');
const { createSessions } = require('../src/services/sessions');
const { createFakeStore } = require('../test-support/fakeStore');

function setup(treasurerPhone = '3000000009') {
  const store = createFakeStore({ treasurerPhone });
  const commands = createCommands(store, { defaultEventId: 'event_test', botName: 'Piso 26' });
  const account = (phoneNumber, name) =>
    store.createAccount({ phoneNumber, pin: '1234', email: 'a@b.co', name });

  return { store, commands, account };
}

// Los movimientos tal como los publica /api/libro.
async function publicEntries(store) {
  const rows = await store.listLedgerInOrder();
  return rows.map((e) => ({
    index: e.index,
    timestamp: e.timestamp,
    action: e.action,
    fromLabel: e.fromLabel,
    toLabel: e.toLabel,
    amount: e.amount,
    prevHash: e.prevHash,
    hash: e.hash,
  }));
}

test('the same movement always hashes to the same value', () => {
  const entry = {
    index: 1,
    timestamp: new Date('2026-10-03T22:00:00Z'),
    action: 'transfer',
    fromLabel: 'A @0001',
    toLabel: 'B @0002',
    amount: 5,
    prevHash: GENESIS,
  };

  assert.equal(hashEntry(entry), hashEntry({ ...entry }));
  assert.notEqual(hashEntry(entry), hashEntry({ ...entry, amount: 6 }));
});

test('real transfers build a chain that verifies', async () => {
  const { store, commands, account } = setup();
  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  await account('3000000009', 'Tesorero');
  store._debug.users.get('3000000001').balanceLuna = 20;

  await commands.transfer('3000000001', ['@3000000002', '4']);
  await commands.transfer('3000000001', ['@3000000002', '3']);
  await commands.emit('3000000009', ['@3000000001', '10']);

  const result = verifyChain(await publicEntries(store));

  assert.equal(result.ok, true);
  assert.equal(result.length, 3);
});

test('editing an old amount breaks the chain', async () => {
  const { store, commands, account } = setup();
  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  store._debug.users.get('3000000001').balanceLuna = 20;

  await commands.transfer('3000000001', ['@3000000002', '4']);
  await commands.transfer('3000000001', ['@3000000002', '3']);

  const entries = await publicEntries(store);
  entries[0].amount = 400; // alguien se aumenta lo que recibió

  const result = verifyChain(entries);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
});

test('rewriting a movement and its own hash still breaks the next one', async () => {
  const { store, commands, account } = setup();
  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  store._debug.users.get('3000000001').balanceLuna = 20;

  await commands.transfer('3000000001', ['@3000000002', '4']);
  await commands.transfer('3000000001', ['@3000000002', '3']);

  const entries = await publicEntries(store);
  // Un manipulador cuidadoso: cambia el monto y recalcula el hash de ESE
  // movimiento. El siguiente sigue apuntando al hash viejo.
  entries[0].amount = 400;
  entries[0].hash = hashEntry(entries[0]);

  const result = verifyChain(entries);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 2);
});

test('deleting a movement breaks the chain', async () => {
  const { store, commands, account } = setup();
  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  store._debug.users.get('3000000001').balanceLuna = 20;

  await commands.transfer('3000000001', ['@3000000002', '4']);
  await commands.transfer('3000000001', ['@3000000002', '3']);
  await commands.transfer('3000000001', ['@3000000002', '2']);

  const entries = await publicEntries(store);
  entries.splice(1, 1); // borrar el del medio

  assert.equal(verifyChain(entries).ok, false);
});

test('swapping who received the coins breaks the chain', async () => {
  const { store, commands, account } = setup();
  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  store._debug.users.get('3000000001').balanceLuna = 20;

  await commands.transfer('3000000001', ['@3000000002', '4']);

  const entries = await publicEntries(store);
  entries[0].toLabel = 'Otro @9999';

  assert.equal(verifyChain(entries).ok, false);
});

test('an empty ledger is valid', () => {
  assert.equal(verifyChain([]).ok, true);
});

/* ---------- El libro por HTTP ---------- */

async function withServer(run) {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const sessions = createSessions({ secret: 'secreto-de-prueba' });
  const config = { adminPassword: 'secret123', botName: 'Piso 26', defaultEventId: 'event_test' };
  const app = createApp({
    config,
    store,
    sessions,
    commands: createCommands(store, config),
    sendMessage: async () => 'ok',
  });

  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path) => {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.json() };
  };

  try {
    await run({ get, store, sessions });
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('the ledger is readable without an account', async () => {
  await withServer(async ({ get, store, sessions }) => {
    await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });
    await store.createAccount({ phoneNumber: '3000000002', pin: '1234', email: 'b@b.co', name: 'Beto' });
    store._debug.users.get('3000000001').balanceLuna = 10;

    const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' });
    await commands.transfer('3000000001', ['@3000000002', '4']);

    // Sin token, sin sesión, sin nada.
    const { status, body } = await get('/api/libro');

    assert.equal(status, 200);
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].amount, 4);
    assert.ok(sessions); // la sesión no interviene en esta ruta
  });
});

test('the public ledger never exposes a full phone number', async () => {
  await withServer(async ({ get, store }) => {
    await store.createAccount({ phoneNumber: '3153811758', pin: '1234', email: 'a@b.co', name: 'Ana' });
    await store.createAccount({ phoneNumber: '3009876543', pin: '1234', email: 'b@b.co', name: 'Beto' });
    store._debug.users.get('3153811758').balanceLuna = 10;

    const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' });
    await commands.transfer('3153811758', ['@3009876543', '4']);

    const { body } = await get('/api/libro');
    const serialized = JSON.stringify(body);

    assert.doesNotMatch(serialized, /3153811758/);
    assert.doesNotMatch(serialized, /3009876543/);
    // Pero sí se sabe quién fue, con los últimos cuatro.
    assert.match(serialized, /Ana @1758/);
    assert.match(serialized, /Beto @6543/);
  });
});

test('what the API publishes is enough to verify the chain from outside', async () => {
  await withServer(async ({ get, store }) => {
    await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });
    await store.createAccount({ phoneNumber: '3000000002', pin: '1234', email: 'b@b.co', name: 'Beto' });
    store._debug.users.get('3000000001').balanceLuna = 30;

    const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' });
    await commands.transfer('3000000001', ['@3000000002', '4']);
    await commands.transfer('3000000001', ['@3000000002', '6']);

    const { body } = await get('/api/libro');
    // El cliente recibe del más nuevo al más viejo; verificar exige orden.
    const inOrder = body.entries.slice().reverse();

    assert.equal(verifyChain(inOrder).ok, true);
  });
});

test('the summary counts emissions and transfers apart', async () => {
  await withServer(async ({ get, store }) => {
    await store.createAccount({ phoneNumber: '3000000009', pin: '1234', email: 'a@b.co', name: 'Tesorero' });
    await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });

    const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' });
    await commands.emit('3000000009', ['@3000000001', '20']);
    await commands.transfer('3000000001', ['@3000000002', '5']);
    await commands.transfer('3000000001', ['@3000000002', '3']);

    const { body } = await get('/api/libro/resumen');

    assert.equal(body.lunaVendida, 20);
    assert.equal(body.transferido, 8);
    assert.equal(body.movimientos, 3);
  });
});

test('the summary is readable without an account and leaks no balances', async () => {
  await withServer(async ({ get, store }) => {
    await store.createAccount({ phoneNumber: '3153811758', pin: '1234', email: 'a@b.co', name: 'Ana' });
    store._debug.users.get('3153811758').balanceLuna = 999;

    const { status, body } = await get('/api/libro/resumen');

    assert.equal(status, 200);
    assert.doesNotMatch(JSON.stringify(body), /999|3153811758/);
  });
});

test('the server verification endpoint agrees', async () => {
  await withServer(async ({ get, store }) => {
    await store.createAccount({ phoneNumber: '3000000001', pin: '1234', email: 'a@b.co', name: 'Ana' });
    store._debug.users.get('3000000001').balanceLuna = 10;

    const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' });
    await commands.transfer('3000000001', ['@3000000002', '4']);

    const { body } = await get('/api/libro/verificar');
    assert.equal(body.ok, true);
    assert.equal(body.length, 1);
  });
});
