const express = require('express');
const { normalizePhone } = require('../utils/phone');
const { isValidPin } = require('../utils/pin');

// Suficiente para atajar tipeos; validar correos a fondo con una regex es un
// problema perdido y acá el correo no es la credencial.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function createAuthRouter({ store, sessions }) {
  const router = express.Router();

  // Lo que se le devuelve al navegador. Nunca incluye pinHash ni el correo:
  // el cliente no los necesita para nada.
  function publicUser(user) {
    return {
      phoneNumber: user.phoneNumber,
      name: user.name,
      balance: user.balance,
      isAdmin: Boolean(user.isAdmin),
    };
  }

  router.post('/signup', async (req, res) => {
    const phoneNumber = normalizePhone(req.body.phone);
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const { pin } = req.body;

    if (phoneNumber.length !== 10) {
      return res.status(400).json({ error: 'Teléfono inválido. Escribe los 10 dígitos.' });
    }
    if (!name) return res.status(400).json({ error: 'Falta tu nombre de usuario.' });
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'Correo inválido.' });
    if (!isValidPin(pin)) return res.status(400).json({ error: 'El PIN debe ser de 4 dígitos.' });

    const result = await store.createAccount({ phoneNumber, pin, email, name });
    if (!result.ok) {
      return res.status(409).json({ error: 'Ese teléfono ya tiene cuenta. Inicia sesión.' });
    }

    res.json({ token: sessions.issue(phoneNumber), user: publicUser(result.user) });
  });

  router.post('/login', async (req, res) => {
    const phoneNumber = normalizePhone(req.body.phone);

    // Sin esto, probar las 10 000 combinaciones de un PIN de 4 dígitos es
    // cuestión de minutos y la cuenta de cualquiera queda abierta.
    const bloqueado = await store.loginLockedUntil(phoneNumber);
    if (bloqueado) {
      const minutos = Math.max(1, Math.ceil((bloqueado - Date.now()) / 60000));
      return res.status(429).json({
        error: `Demasiados intentos fallidos. Vuelve a intentar en ${minutos} minuto${minutos === 1 ? '' : 's'}, o pídele al tesorero un PIN nuevo.`,
      });
    }

    // Un solo mensaje para "no existe" y "PIN incorrecto": si fueran
    // distintos, cualquiera podría averiguar qué números tienen cuenta.
    if (!(await store.verifyPin(phoneNumber, req.body.pin))) {
      await store.registerFailedLogin(phoneNumber);
      return res.status(401).json({ error: 'Teléfono o PIN incorrecto.' });
    }

    await store.clearLoginFailures(phoneNumber);

    const user = await store.getUser(phoneNumber);
    res.json({ token: sessions.issue(phoneNumber), user: publicUser(user) });
  });

  // Restaura la sesión cuando la persona recarga la página, y de paso trae el
  // saldo al día sin gastar un comando.
  router.get('/me', async (req, res) => {
    const session = sessions.verify(req.query.token);
    if (!session) return res.status(401).json({ error: 'Sesión expirada.' });

    const user = await store.getUser(session.phoneNumber);
    if (!user) return res.status(401).json({ error: 'Sesión expirada.' });

    res.json({ user: publicUser(user) });
  });

  // Movimientos míos que todavía no había visto, más el saldo al día. La
  // consola pregunta cada pocos segundos, y así quien recibe monedas se entera
  // en el momento sin que haga falta pagarle a un proveedor de SMS.
  router.get('/novedades', async (req, res) => {
    const session = sessions.verify(req.query.token);
    if (!session) return res.status(401).json({ error: 'Sesión expirada.' });

    const user = await store.getUser(session.phoneNumber);
    if (!user) return res.status(401).json({ error: 'Sesión expirada.' });

    const movimientos = await store.listMovementsSince(
      session.phoneNumber,
      req.query.desde
    );

    res.json({
      user: publicUser(user),
      movimientos: movimientos.map((m) => {
        const recibido = m.to === session.phoneNumber;
        return {
          index: m.index,
          action: m.action,
          amount: m.amount,
          recibido,
          otro: recibido ? m.fromLabel : m.toLabel,
          // El teléfono de la contraparte, para poder ofrecer "enviar de
          // nuevo" sin que haya que volver a escribirlo. Solo sale en el
          // historial de quien ya transó con esa persona, nunca en el libro
          // público.
          otroTelefono: recibido ? m.from : m.to,
        };
      }),
    });
  });

  return router;
}

module.exports = { createAuthRouter };
