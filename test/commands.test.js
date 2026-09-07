const test = require('node:test');
const assert = require('node:assert/strict');

const { createCommands } = require('../src/services/commands');
const { createFakeStore } = require('../test-support/fakeStore');

function setup(treasurerPhone) {
  const store = createFakeStore({ treasurerPhone });
  const commands = createCommands(store, { defaultEventId: 'event_test' });

  // Las cuentas se crean desde la pantalla de registro, no desde un comando.
  const account = (phoneNumber, name) =>
    store.createAccount({ phoneNumber, pin: '1234', email: 'a@b.co', name });

  return { store, commands, account };
}

test('register renames the person who is already logged in', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'Sin nombre');

  const reply = await commands.register('3000000001', ['Cherno']);

  assert.match(reply, /Ahora te llamamos: Cherno/);
  assert.equal(store._debug.users.get('3000000001').name, 'Cherno');
});

test('register rejects an empty name and an unknown user', async () => {
  const { commands, account } = setup();
  await account('3000000001', 'A');

  assert.match(await commands.register('3000000001', []), /Formato: \/register/);
  assert.match(await commands.register('3000000099', ['X']), /no registrado/);
});

test('balance rejects unregistered users', async () => {
  const { commands } = setup();
  const reply = await commands.balance('3000000002');
  assert.match(reply, /no registrado/);
});

test('transfer moves balance between two registered users', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'A');
  await account('3000000002', 'B');
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.match(reply, /Transferencia completada/);
  assert.equal(store._debug.users.get('3000000001').balance, 6);
  assert.equal(store._debug.users.get('3000000002').balance, 4);
});

test('transfer blocks amounts above the sender balance', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'A');
  store._debug.users.get('3000000001').balance = 2;

  const reply = await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.match(reply, /Saldo insuficiente/);
  assert.equal(store._debug.users.get('3000000001').balance, 2);
});

test('transfer rejects sending to yourself', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'A');
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['@3000000001', '4']);

  assert.match(reply, /a ti mismo/);
  assert.equal(store._debug.users.get('3000000001').balance, 10);
});

test('transfer requires the sender to be registered', async () => {
  const { commands } = setup();
  const reply = await commands.transfer('3000000009', ['@3000000002', '4']);
  assert.match(reply, /No estás registrado/);
});

test('send defaults the amount to 1 and accepts a plain digit target', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'A');
  store._debug.users.get('3000000001').balance = 5;

  const reply = await commands.send('3000000001', ['tokens', 'to', '3000000002']);

  assert.match(reply, /Enviaste: 1 monedas/);
  assert.equal(store._debug.users.get('3000000002').balance, 1);
});

test('send rejects a message with no identifiable target', async () => {
  const { commands } = setup();
  const reply = await commands.send('3000000001', ['tokens', 'to', 'nobody']);
  assert.match(reply, /Formato: \/send/);
});

test('emit is rejected for non-admin users', async () => {
  const { commands, account } = setup();
  await account('3000000001', 'A');
  const reply = await commands.emit('3000000001', ['@3000000002', '5']);
  assert.match(reply, /No tienes permisos/);
});

test('emit succeeds for the treasurer and credits the recipient', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  const reply = await commands.emit('3000000009', ['@3000000002', '3']);

  assert.match(reply, /Emitidas 3 monedas/);
  assert.equal(store._debug.users.get('3000000002').balance, 3);
});

test('content is rejected for non-admin users', async () => {
  const { commands, account } = setup();
  await account('3000000001', 'A');
  const reply = await commands.content('3000000001', ['https://drive.example/x', '@3000000002']);
  assert.match(reply, /No tienes permisos/);
});

test('content requires a link and at least one tagged talent', async () => {
  const { commands, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  const noLink = await commands.content('3000000009', ['@3000000002']);
  assert.match(noLink, /Formato: \/content/);

  const noTargets = await commands.content('3000000009', ['https://drive.example/x']);
  assert.match(noTargets, /al menos un talento/);
});

test('content creates one entry per tagged talent', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

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
  const { commands, account } = setup();
  await account('3000000001', 'A');
  const reply = await commands.resetpin('3000000001', ['@3000000002']);
  assert.match(reply, /No tienes permisos/);
});

test('resetpin issues a new PIN that replaces the old one', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');
  await account('3000000002', 'B');

  const reply = await commands.resetpin('3000000009', ['@3000000002']);

  assert.match(reply, /Nuevo PIN para/);
  const newPin = store._debug.users.get('3000000002').pin;
  assert.notEqual(newPin, '1234');
  assert.equal(newPin.length, 4);
});

test('resetpin reports a number with no account instead of creating one', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  const reply = await commands.resetpin('3000000009', ['@3000000077']);

  assert.match(reply, /no tiene cuenta/);
  assert.equal(store._debug.users.has('3000000077'), false);
});

test('help only lists admin commands to admins', async () => {
  const { commands, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');
  await account('3000000001', 'A');

  const adminHelp = await commands.help('3000000009');
  const userHelp = await commands.help('3000000001');

  assert.match(adminHelp, /Admin:/);
  assert.doesNotMatch(userHelp, /Admin:/);
});

test('help works for someone who has not logged in yet', async () => {
  const { commands } = setup();
  const reply = await commands.help(null);
  assert.match(reply, /Comandos Sonámbulos/);
});
