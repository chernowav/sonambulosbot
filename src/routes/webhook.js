const { normalizePhone } = require('../utils/phone');

const ADMIN_LOCKED_COMMANDS = new Set(['emit', 'users']);

// Handler compartido por /webhook/sms y /webhook/message. Antes cada ruta
// tenía su propia copia casi idéntica de este código (parseo de comando,
// chequeo de adminKey, despacho, envío de respuesta); ahora ambas rutas
// solo difieren en el path que las expone.
function createWebhookHandler({ commands, config, sendMessage }) {
  return async function handleIncoming(req, res) {
    const rawBody = req.body.Body ?? req.body.message;
    const rawPhone = req.body.From ?? req.body.phone;
    const incoming = (rawBody || '').trim().toLowerCase();
    const phoneNumber = normalizePhone(rawPhone);

    if (!incoming || !phoneNumber) {
      return res.status(400).json({ error: 'Mensaje o teléfono inválido' });
    }

    console.log(`📨 Mensaje de ${phoneNumber}: ${incoming}`);

    const parts = incoming.split(/\s+/);
    const command = parts[0].replace('/', '');
    const args = parts.slice(1);

    if (ADMIN_LOCKED_COMMANDS.has(command) && req.body.adminKey !== config.adminPassword) {
      return res.json({
        success: true,
        phoneNumber,
        command,
        locked: true,
        response: '🔒 Clave de tesorero requerida o incorrecta.',
      });
    }

    let response = '❌ Comando no reconocido. Usa /help';
    if (commands[command]) {
      try {
        response = await commands[command](phoneNumber, args);
      } catch (error) {
        console.error('Error:', error);
        response = '❌ Error procesando comando. Intenta de nuevo.';
      }
    }

    await sendMessage(phoneNumber, response);

    res.json({ success: true, phoneNumber, command, response, timestamp: new Date() });
  };
}

module.exports = { createWebhookHandler };
