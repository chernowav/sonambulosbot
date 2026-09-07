const test = require('node:test');
const assert = require('node:assert/strict');

const { createCommands } = require('../src/services/commands');
const { createFakeStore } = require('../test-support/fakeStore');

function setup(treasurerPhone) {
  const store = createFakeStore({ treasurerPhone });
  const commands = createCommands(store, { defaultEventId: 'event_test' });
  return { store, commands };
}

test('register creates a user with zero balance and a PIN', async () => {
  const { commands, store } = setup();
  const reply = await commands.register('3000000001', ['Cherno']);
  assert.match(reply, /Registrado como: Cherno/);
  assert.match(reply, /Saldo inicial: 0/);
  assert.match(reply, /Tu PIN: \d{4}/);
  assert.equal(store._debug.users.get('3000000001').pin.length, 4);
});

test('register does not reissue a PIN for an already-registered user', async () => {
  const { commands, store } = setup();
  await commands.register('3000000001', ['Cherno']);
  const originalPin = store._debug.users.get('3000000001').pin;

  const reply = await commands.register('3000000001', ['Cherno']);

  assert.doesNotMatch(reply, /Tu PIN/);
  assert.equal(store._debug.users.get('3000000001').pin, originalPin);
});

test('balance rejects unregistered users', async () => {
  const { commands } = setup();
  const reply = await commands.balance('3000000002');
  assert.match(reply, /no registrado/);
});

test('transfer is locked without the sender PIN', async () => {
  const { commands, store } = setup();
  await commands.register('3000000001', ['A']);
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.deepEqual(reply, { locked: true, reason: 'pin', response: '🔒 PIN requerido o incorrecto.' });
  assert.equal(store._debug.users.get('3000000001').balance, 10);
});

test('transfer is locked when the PIN is wrong', async () => {
  const { commands, store } = setup();
  await commands.register('3000000001', ['A']);
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['@3000000002', '4'], { pin: '0000' });

  assert.equal(reply.locked, true);
});

test('transfer moves balance between two registered users with the right PIN', async () => {
  const { commands, store } = setup();
  await commands.register('3000000001', ['A']);
  await commands.register('3000000002', ['B']);
  store._debug.users.get('3000000001').balance = 10;
  const pin = store._debug.users.get('3000000001').pin;

  const reply = await commands.transfer('3000000001', ['@3000000002', '4'], { pin });

  assert.match(reply, /Transferencia completada/);
  assert.equal(store._debug.users.get('3000000001').balance, 6);
  assert.equal(store._debug.users.get('3000000002').balance, 4);
});

test('transfer blocks amounts above the sender balance', async () => {
  const { commands, store } = setup();
  await commands.register('3000000001', ['A']);
  store._debug.users.get('3000000001').balance = 2;
  const pin = store._debug.users.get('3000000001').pin;

  const reply = await commands.transfer('3000000001', ['@3000000002', '4'], { pin });

  assert.match(reply, /Saldo insuficiente/);
  assert.equal(store._debug.users.get('3000000001').balance, 2);
});

test('transfer requires the sender to be registered first', async () => {
  const { commands } = setup();
  const reply = await commands.transfer('3000000009', ['@3000000002', '4']);
  assert.equal(reply.locked, true);
});

test('send defaults the amount to 1, accepts a plain digit target, and needs the PIN', async () => {
  const { commands, store } = setup();
  await commands.register('3000000001', ['A']);
  store._debug.users.get('3000000001').balance = 5;
  const pin = store._debug.users.get('3000000001').pin;

  const locked = await commands.send('3000000001', ['tokens', 'to', '3000000002']);
  assert.equal(locked.locked, true);

  const reply = await commands.send('3000000001', ['tokens', 'to', '3000000002'], { pin });
  assert.match(reply, /Enviaste: 1 monedas/);
  assert.equal(store._debug.users.get('3000000002').balance, 1);
});

test('send rejects a message with no identifiable target', async () => {
  const { commands } = setup();
  const reply = await commands.send('3000000001', ['tokens', 'to', 'nobody']);
  assert.match(reply, /Formato: \/send/);
});

test('emit is rejected for non-admin users', async () => {
  const { commands } = setup();
  await commands.register('3000000001', ['A']);
  const reply = await commands.emit('3000000001', ['@3000000002', '5']);
  assert.match(reply, /No tienes permisos/);
});

test('emit succeeds for the treasurer and credits the recipient', async () => {
  const { commands, store } = setup('3000000009');
  await commands.register('3000000009', ['Tesorero']);

  const reply = await commands.emit('3000000009', ['@3000000002', '3']);

  assert.match(reply, /Emitidas 3 monedas/);
  assert.equal(store._debug.users.get('3000000002').balance, 3);
});

test('content is rejected for non-admin users', async () => {
  const { commands } = setup();
  await commands.register('3000000001', ['A']);
  const reply = await commands.content('3000000001', ['https://drive.example/x', '@3000000002']);
  assert.match(reply, /No tienes permisos/);
});

test('content requires a link and at least one tagged talent', async () => {
  const { commands } = setup('3000000009');
  await commands.register('3000000009', ['Tesorero']);

  const noLink = await commands.content('3000000009', ['@3000000002']);
  assert.match(noLink, /Formato: \/content/);

  const noTargets = await commands.content('3000000009', ['https://drive.example/x']);
  assert.match(noTargets, /al menos un talento/);
});

test('content creates one entry per tagged talent', async () => {
  const { commands, store } = setup('3000000009');
  await commands.register('3000000009', ['Tesorero']);

  const reply = await commands.content('3000000009', [
    'https://drive.example/clip.mp4',
    '@3000000002',
    '@3000000003',
  ]);

  assert.match(reply, /publicado para 2 talento/);
  assert.equal(store._debug.content.length, 2);
  assert.deepEqual(
    store._debug.content.map((c) => c.artistPhone).sort(),
    ['3000000002', '3000000003']
  );
});

test('resetpin is rejected for non-admin users', async () => {
  const { commands } = setup();
  await commands.register('3000000001', ['A']);
  const reply = await commands.resetpin('3000000001', ['@3000000002']);
  assert.match(reply, /No tienes permisos/);
});

test('resetpin issues a new PIN that replaces the old one', async () => {
  const { commands, store } = setup('3000000009');
  await commands.register('3000000009', ['Tesorero']);
  await commands.register('3000000002', ['B']);
  const oldPin = store._debug.users.get('3000000002').pin;

  const reply = await commands.resetpin('3000000009', ['@3000000002']);

  assert.match(reply, /Nuevo PIN para/);
  const newPin = store._debug.users.get('3000000002').pin;
  assert.notEqual(newPin, oldPin);
  assert.equal(newPin.length, 4);
});

test('help only lists admin commands to admins', async () => {
  const { commands } = setup('3000000009');
  await commands.register('3000000009', ['Tesorero']);
  await commands.register('3000000001', ['A']);

  const adminHelp = await commands.help('3000000009');
  const userHelp = await commands.help('3000000001');

  assert.match(adminHelp, /Admin:/);
  assert.doesNotMatch(userHelp, /Admin:/);
});
