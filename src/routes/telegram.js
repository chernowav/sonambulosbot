const express = require('express');

function createTelegramRouter({ store, sessions, telegram, config }) {
  const router = express.Router();

  // Telegram entrega aquí los mensajes que le escriben al bot. Lo único que
  // interesa es /start con el código de vinculación; a cualquier otra cosa se
  // responde con una indicación de qué hacer.
  router.post('/webhook', async (req, res) => {
    // Telegram reintenta la entrega si no recibe 200, así que se responde de
    // una y el trabajo se hace después: un error nuestro no debe convertirse
    // en un mensaje repetido.
    if (!telegram.isFromTelegram(req.get('X-Telegram-Bot-Api-Secret-Token'))) {
      return res.sendStatus(403);
    }
    res.sendStatus(200);

    const message = req.body && req.body.message;
    if (!message || !message.chat || typeof message.text !== 'string') return;

    const chatId = message.chat.id;
    const code = (message.text.trim().match(/^\/start(?:\s+(\S+))?/) || [])[1];

    if (!code) {
      await telegram.send(
        chatId,
        `Soy el bot de ${config.botName}. Abre la consola del evento y toca ` +
          '«Conectar Telegram» para empezar a recibir avisos de tus monedas.'
      );
      return;
    }

    const user = await store.linkTelegram(code, chatId);

    if (!user) {
      await telegram.send(
        chatId,
        'Ese enlace ya se usó o no es válido. Pide uno nuevo desde la consola.'
      );
      return;
    }

    await telegram.send(
      chatId,
      `Listo, ${user.name}. Desde ahora te aviso por acá cada vez que envíes o ` +
        `recibas monedas, con el número de movimiento en el libro público.`
    );
  });

  return router;
}

// Endpoints que usa la consola. Van bajo /api y piden sesión, a diferencia
// del webhook, que lo llama Telegram.
function createTelegramApiRouter({ store, sessions, telegram }) {
  const router = express.Router();

  router.get('/telegram/enlace', async (req, res) => {
    const session = sessions.verify(req.query.token);
    if (!session) return res.status(401).json({ error: 'Sesión expirada.' });

    if (!telegram.enabled || !telegram.botUsername) {
      return res.status(503).json({ error: 'Telegram no está configurado todavía.' });
    }

    const user = await store.getUser(session.phoneNumber);
    if (!user) return res.status(401).json({ error: 'Sesión expirada.' });

    if (user.telegramChatId) {
      return res.json({ vinculado: true });
    }

    const code = await store.createTelegramLinkCode(session.phoneNumber);
    res.json({ vinculado: false, url: telegram.linkFor(code) });
  });

  router.post('/telegram/desvincular', async (req, res) => {
    const session = sessions.verify(req.body.token);
    if (!session) return res.status(401).json({ error: 'Sesión expirada.' });

    await store.unlinkTelegram(session.phoneNumber);
    res.json({ vinculado: false });
  });

  return router;
}

module.exports = { createTelegramRouter, createTelegramApiRouter };
