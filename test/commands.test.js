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

test('the treasurer becomes admin even if they registered before being named', async () => {
  const store = createFakeStore({ treasurerPhone: undefined });
  await store.createAccount({ phoneNumber: '3000000009', pin: '1234', email: 'a@b.co', name: 'T' });
  assert.equal(store._debug.users.get('3000000009').isAdmin, false);

  // Ahora sí se configura TREASURER_PHONE y vuelve a entrar.
  const named = createFakeStore({ treasurerPhone: '3000000009' });
  named._debug.users.set('3000000009', store._debug.users.get('3000000009'));

  const commands = createCommands(named, { defaultEventId: 'event_test' });
  const reply = await commands.emit('3000000009', ['@3000000002', '3']);

  assert.match(reply, /Emitidas 3 monedas/);
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

test('emit reaches several people in one command', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  const reply = await commands.emit('3000000009', [
    '@3000000002',
    '@3000000003',
    '@3000000004',
    '10',
  ]);

  assert.match(reply, /a 3 personas \(30 en total\)/);
  ['3000000002', '3000000003', '3000000004'].forEach((phone) => {
    assert.equal(store._debug.users.get(phone).balance, 10);
  });

  // Un movimiento por persona: el libro no agrupa lo que ocurrió por separado.
  assert.equal(store._debug.transactions.length, 3);
});

test('a number repeated in the list is only paid once', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  await commands.emit('3000000009', ['@3000000002', '@3000000002', '7']);

  assert.equal(store._debug.users.get('3000000002').balance, 7);
  assert.equal(store._debug.transactions.length, 1);
});

test('emit still accepts the old single positional form', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  const reply = await commands.emit('3000000009', ['3000000002', '4']);

  assert.match(reply, /Emitidas 4 monedas/);
  assert.equal(store._debug.users.get('3000000002').balance, 4);
});

test('emit without an amount explains the format instead of guessing', async () => {
  const { commands, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  assert.match(await commands.emit('3000000009', ['@3000000002']), /Cantidad/);
});

test('a mistyped number is refused and nothing is emitted to anyone', async () => {
  const { commands, store, account } = setup('3000000009');
  await account('3000000009', 'Tesorero');

  // Un dedazo: al segundo número le faltan dígitos.
  const reply = await commands.emit('3000000009', ['@3000000002', '@30011', '10']);

  assert.match(reply, /no tienen 10 dígitos/);
  assert.match(reply, /No se emitió nada/);
  // Ni al bueno, para que el tesorero no quede sin saber qué alcanzó a pasar.
  assert.equal(store._debug.users.has('3000000002'), false);
  assert.equal(store._debug.users.has('30011'), false);
  assert.equal(store._debug.transactions.length, 0);
});

test('a transfer to a mistyped number is refused instead of creating a ghost account', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'Ana');
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['@123', '5']);

  assert.match(reply, /10 dígitos/);
  assert.equal(store._debug.users.get('3000000001').balance, 10);
  assert.equal(store._debug.users.has('123'), false);
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

  assert.match(adminHelp, /Tesorero/);
  assert.doesNotMatch(userHelp, /Tesorero/);
});

test('help works for someone who has not logged in yet', async () => {
  const { commands } = setup();
  const reply = await commands.help(null);
  assert.match(reply, /Comandos de/);
});

/* ---------- Saldos y libro no pueden separarse ---------- */

// Un store igual al normal salvo que el libro rechaza toda escritura.
function setupConLibroRoto(treasurerPhone) {
  const store = createFakeStore({ treasurerPhone });
  store.recordTransaction = async () => {
    throw new Error('libro caído');
  };

  const commands = createCommands(store, { defaultEventId: 'event_test', botName: 'Piso 26' });
  const account = (phoneNumber, name) =>
    store.createAccount({ phoneNumber, pin: '1234', email: 'a@b.co', name });

  return { store, commands, account };
}

test('a transfer that cannot be written to the ledger gives the coins back', async () => {
  const { store, commands, account } = setupConLibroRoto();
  await account('3000000001', 'Ana');
  await account('3000000002', 'Beto');
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['@3000000002', '4']);

  assert.match(reply, /No se pudo registrar/);
  // Lo que importa: nadie perdió ni ganó monedas sin que quedara escrito.
  assert.equal(store._debug.users.get('3000000001').balance, 10);
  assert.equal(store._debug.users.get('3000000002').balance, 0);
});

test('an emission that cannot be written to the ledger gives the coins back', async () => {
  const { store, commands, account } = setupConLibroRoto('3000000009');
  await account('3000000009', 'Tesorero');

  const reply = await commands.emit('3000000009', ['@3000000002', '15']);

  assert.match(reply, /no aceptó la emisión/);
  assert.equal(store._debug.users.get('3000000002').balance, 0);
});

test('a failed bulk emission says who already received', async () => {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const real = store.recordTransaction;
  let escrituras = 0;

  // Falla en la segunda persona: la primera ya quedó registrada.
  store.recordTransaction = async (data) => {
    escrituras += 1;
    if (escrituras > 1) throw new Error('libro caído');
    return real(data);
  };

  const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26' });
  await store.createAccount({ phoneNumber: '3000000009', pin: '1234', email: 'a@b.co', name: 'Tesorero' });

  const reply = await commands.emit('3000000009', ['@3000000002', '@3000000003', '10']);

  assert.match(reply, /Alcanzaron a recibir/);
  assert.equal(store._debug.users.get('3000000002').balance, 10);
  assert.equal(store._debug.users.get('3000000003').balance, 0);
});

/* ---------- Pagar en el bar ---------- */

function setupBar(barPhone) {
  const store = createFakeStore({});
  const commands = createCommands(store, { defaultEventId: 'e', botName: 'Piso 26', barPhone });
  const alta = (p, n) => store.createAccount({ phoneNumber: p, pin: '1234', email: 'a@b.co', name: n });
  return { store, commands, alta };
}

test('/bar pays the bar without anyone having to know its number', async () => {
  const { store, commands, alta } = setupBar('3007778899');
  await alta('3000000001', 'Ana');
  await alta('3007778899', 'Bar Piso 26');
  store._debug.users.get('3000000001').balance = 20;

  const reply = await commands.bar('3000000001', ['6']);

  assert.match(reply, /Transferencia completada/);
  assert.equal(store._debug.users.get('3000000001').balance, 14);
  assert.equal(store._debug.users.get('3007778899').balance, 6);
});

test('/bar says so when the bar has no account configured', async () => {
  const { commands, alta } = setupBar('');
  await alta('3000000001', 'Ana');

  const reply = await commands.bar('3000000001', ['6']);

  assert.match(reply, /no está configurado/);
});

test('/bar without an amount explains the format', async () => {
  const { commands, alta } = setupBar('3007778899');
  await alta('3000000001', 'Ana');

  assert.match(await commands.bar('3000000001', []), /Formato: \/bar/);
});

test('a bar payment lands in the public ledger like any other movement', async () => {
  const { store, commands, alta } = setupBar('3007778899');
  await alta('3000000001', 'Ana');
  await alta('3007778899', 'Bar Piso 26');
  store._debug.users.get('3000000001').balance = 20;

  await commands.bar('3000000001', ['6']);

  const libro = await store.listLedgerInOrder();
  assert.equal(libro.length, 1);
  assert.match(libro[0].toLabel, /Bar Piso 26/);
  assert.equal(libro[0].amount, 6);
});

/* ---------- El orden de los argumentos no importa ---------- */

test('the amount can come before or after the number', async () => {
  for (const args of [['@3000000002', '4'], ['4', '@3000000002']]) {
    const { commands, store, account } = setup();
    await account('3000000001', 'Ana');
    await account('3000000002', 'Beto');
    store._debug.users.get('3000000001').balance = 10;

    const reply = await commands.transfer('3000000001', args);

    assert.match(reply, /Transferencia completada/, `falló con ${JSON.stringify(args)}`);
    assert.equal(store._debug.users.get('3000000002').balance, 4);
  }
});

test('the order does not matter without the @ either', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'Ana');
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['7', '3000000002']);

  assert.match(reply, /Transferencia completada/);
  assert.equal(store._debug.users.get('3000000002').balance, 7);
});

test('two numbers that are neither a phone are still refused', async () => {
  const { commands, store, account } = setup();
  await account('3000000001', 'Ana');
  store._debug.users.get('3000000001').balance = 10;

  const reply = await commands.transfer('3000000001', ['5', '10']);

  assert.match(reply, /destino inválido/);
  assert.equal(store._debug.users.get('3000000001').balance, 10);
});
