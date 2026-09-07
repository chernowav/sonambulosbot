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

    // Un solo mensaje para "no existe" y "PIN incorrecto": si fueran
    // distintos, cualquiera podría averiguar qué números tienen cuenta.
    if (!(await store.verifyPin(phoneNumber, req.body.pin))) {
      return res.status(401).json({ error: 'Teléfono o PIN incorrecto.' });
    }

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

  return router;
}

module.exports = { createAuthRouter };
