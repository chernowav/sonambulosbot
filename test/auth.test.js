const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('../src/app');
const { createCommands } = require('../src/services/commands');
const { createSessions } = require('../src/services/sessions');
const { createFakeStore } = require('../test-support/fakeStore');

const VALID = { name: 'Cherno', phone: '3001234567', email: 'cherno@correo.com', pin: '4821' };

// Levanta la app real en un puerto libre con un store en memoria, para probar
// los endpoints tal como los llama el navegador (JSON, códigos de estado)
// y no solo las funciones por dentro.
async function withServer(run) {
  const store = createFakeStore({ treasurerPhone: '3000000009' });
  const sessions = createSessions({ secret: 'secreto-de-prueba' });
  const config = { adminPassword: 'secret123', botName: 'Test', defaultEventId: 'event_test' };
  const app = createApp({
    config,
    store,
    sessions,
    commands: createCommands(store, config),
    sendMessage: async () => 'msg_test',
  });

  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (path, options) => {
    const res = await fetch(base + path, options);
    return { status: res.status, body: await res.json() };
  };
  const post = (path, payload) =>
    call(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  try {
    await run({ call, post, store });
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('signup creates the account and returns a usable session', async () => {
  await withServer(async ({ post, call, store }) => {
    const { status, body } = await post('/api/signup', VALID);

    assert.equal(status, 200);
    assert.equal(body.user.name, 'Cherno');
    assert.equal(body.user.balance, 0);
    assert.equal(store._debug.users.get('3001234567').email, 'cherno@correo.com');

    const me = await call(`/api/me?token=${encodeURIComponent(body.token)}`);
    assert.equal(me.body.user.phoneNumber, '3001234567');
  });
});

test('signup never returns the PIN or its hash to the browser', async () => {
  await withServer(async ({ post }) => {
    const { body } = await post('/api/signup', VALID);
    const serialized = JSON.stringify(body.user);

    assert.doesNotMatch(serialized, /4821/);
    assert.doesNotMatch(serialized, /pin/i);
  });
});

test('signup validates the phone, name, email and PIN', async () => {
  await withServer(async ({ post }) => {
    const cases = [
      [{ ...VALID, phone: '300123' }, /Teléfono/],
      [{ ...VALID, name: '   ' }, /nombre/],
      [{ ...VALID, email: 'no-es-un-correo' }, /Correo/],
      [{ ...VALID, pin: '12' }, /PIN/],
      [{ ...VALID, pin: 'abcd' }, /PIN/],
    ];

    for (const [payload, expected] of cases) {
      const { status, body } = await post('/api/signup', payload);
      assert.equal(status, 400, `debió rechazar: ${JSON.stringify(payload)}`);
      assert.match(body.error, expected);
    }
  });
});

test('signup refuses a phone that already has an account', async () => {
  await withServer(async ({ post }) => {
    await post('/api/signup', VALID);
    const { status, body } = await post('/api/signup', { ...VALID, pin: '9999' });

    assert.equal(status, 409);
    assert.match(body.error, /ya tiene cuenta/);
  });
});

test('someone who received coins before registering can still create their account', async () => {
  await withServer(async ({ post, store }) => {
    // El tesorero le emite monedas a un número que todavía no se registró.
    const cherno = await post('/api/signup', VALID);
    store._debug.users.get('3001234567').balance = 10;
    await post('/webhook/sms', { Body: '/transfer @3007654321 6', token: cherno.body.token });

    // Esa persona llega al evento y crea su cuenta: debe poder, y con su saldo.
    const ana = await post('/api/signup', {
      name: 'Ana',
      phone: '3007654321',
      email: 'ana@correo.com',
      pin: '1111',
    });

    assert.equal(ana.status, 200);
    assert.equal(ana.body.user.name, 'Ana');
    assert.equal(ana.body.user.balance, 6);

    const login = await post('/api/login', { phone: '3007654321', pin: '1111' });
    assert.equal(login.status, 200);
  });
});

test('login works with the chosen PIN and rejects a wrong one', async () => {
  await withServer(async ({ post }) => {
    await post('/api/signup', VALID);

    const ok = await post('/api/login', { phone: VALID.phone, pin: VALID.pin });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);

    const bad = await post('/api/login', { phone: VALID.phone, pin: '0000' });
    assert.equal(bad.status, 401);
  });
});

test('login does not reveal which phones have an account', async () => {
  await withServer(async ({ post }) => {
    await post('/api/signup', VALID);

    const wrongPin = await post('/api/login', { phone: VALID.phone, pin: '0000' });
    const unknown = await post('/api/login', { phone: '3009999999', pin: '0000' });

    assert.equal(wrongPin.body.error, unknown.body.error);
  });
});

test('login accepts the phone written with a country code or spaces', async () => {
  await withServer(async ({ post }) => {
    await post('/api/signup', VALID);

    const { status } = await post('/api/login', { phone: '+57 300 123 4567', pin: VALID.pin });
    assert.equal(status, 200);
  });
});

test('guessing PINs gets locked out before the whole range can be tried', async () => {
  await withServer(async ({ post, store }) => {
    await post('/api/signup', VALID);

    // Cinco intentos errados seguidos.
    for (let i = 0; i < 5; i += 1) {
      const r = await post('/api/login', { phone: VALID.phone, pin: '0000' });
      assert.equal(r.status, 401, `intento ${i + 1}`);
    }

    // El sexto ya no se evalúa: la cuenta queda cerrada un rato.
    const bloqueado = await post('/api/login', { phone: VALID.phone, pin: '0001' });
    assert.equal(bloqueado.status, 429);
    assert.match(bloqueado.body.error, /Demasiados intentos/);

    // Y ni siquiera el PIN correcto pasa mientras dure el bloqueo, que es
    // justamente lo que hace inviable recorrer las combinaciones.
    const correcto = await post('/api/login', { phone: VALID.phone, pin: VALID.pin });
    assert.equal(correcto.status, 429);

    assert.ok(store._debug.users.get('3001234567').lockedUntil > Date.now());
  });
});

test('a wrong PIN followed by the right one does not lock anybody out', async () => {
  await withServer(async ({ post }) => {
    await post('/api/signup', VALID);

    await post('/api/login', { phone: VALID.phone, pin: '0000' });
    await post('/api/login', { phone: VALID.phone, pin: '0000' });

    const bien = await post('/api/login', { phone: VALID.phone, pin: VALID.pin });
    assert.equal(bien.status, 200);

    // El contador volvió a cero: dos errores de ayer no suman a los de hoy.
    for (let i = 0; i < 4; i += 1) {
      const r = await post('/api/login', { phone: VALID.phone, pin: '0000' });
      assert.equal(r.status, 401, `intento ${i + 1} debería seguir evaluándose`);
    }
  });
});

test('the treasurer new PIN also frees someone who got locked out', async () => {
  await withServer(async ({ post, store }) => {
    await post('/api/signup', VALID);
    for (let i = 0; i < 5; i += 1) await post('/api/login', { phone: VALID.phone, pin: '0000' });

    assert.equal((await post('/api/login', { phone: VALID.phone, pin: VALID.pin })).status, 429);

    const nuevoPin = await store.resetPin('3001234567');

    const r = await post('/api/login', { phone: VALID.phone, pin: nuevoPin });
    assert.equal(r.status, 200);
  });
});

test('failed attempts on a phone with no account reveal nothing', async () => {
  await withServer(async ({ post }) => {
    // Seis intentos sobre un número inexistente: la respuesta no cambia, así
    // que nadie puede deducir qué números tienen cuenta por el bloqueo.
    for (let i = 0; i < 6; i += 1) {
      const r = await post('/api/login', { phone: '3001119999', pin: '0000' });
      assert.equal(r.status, 401);
    }
  });
});

test('/api/me rejects a missing or forged token', async () => {
  await withServer(async ({ call }) => {
    assert.equal((await call('/api/me')).status, 401);
    assert.equal((await call('/api/me?token=basura')).status, 401);
  });
});

test('end to end: signup, then transfer using the session token', async () => {
  await withServer(async ({ post, store }) => {
    const cherno = await post('/api/signup', VALID);
    await post('/api/signup', { ...VALID, name: 'Ana', phone: '3007654321', email: 'ana@correo.com' });
    store._debug.users.get('3001234567').balance = 10;

    const { body } = await post('/webhook/sms', {
      Body: '/transfer @3007654321 4',
      token: cherno.body.token,
    });

    assert.match(body.response, /Transferencia completada/);
    assert.equal(store._debug.users.get('3007654321').balance, 4);
  });
});

test('the console is locked until the PIN is verified', async () => {
  await withServer(async ({ post, store }) => {
    await post('/api/signup', VALID);
    store._debug.users.get('3001234567').balance = 10;

    const { body } = await post('/webhook/sms', { Body: '/transfer @3007654321 4' });

    assert.equal(body.reason, 'auth');
    assert.equal(store._debug.users.get('3001234567').balance, 10);
  });
});
