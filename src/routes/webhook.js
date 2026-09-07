const { normalizePhone } = require('../utils/phone');

const ADMIN_LOCKED_COMMANDS = new Set(['emit', 'users', 'content', 'resetpin']);

// Handler compartido por /webhook/sms y /webhook/message. Antes cada ruta
// tenía su propia copia casi idéntica de este código (parseo de comando,
// chequeo de adminKey, despacho, envío de respuesta); ahora ambas rutas
// solo difieren en el path que las expone.
function createWebhookHandler({ commands, config, sendMessage }) {
  return async function handleIncoming(req, res) {
    const rawBody = req.body.Body ?? req.body.message;
    const rawPhone = req.body.From ?? req.body.phone;
    const incoming = (rawBody || '').trim();
    const phoneNumber = normalizePhone(rawPhone);

    if (!incoming || !phoneNumber) {
      return res.status(400).json({ error: 'Mensaje o teléfono inválido' });
    }

    console.log(`📨 Mensaje de ${phoneNumber}: ${incoming}`);

    // Solo el nombre del comando se compara en minúsculas; los argumentos
    // (nombres, y sobre todo links de /content) mantienen mayúsculas y
    // minúsculas tal como se escribieron.
    const parts = incoming.split(/\s+/);
    const command = parts[0].replace('/', '').toLowerCase();
    const args = parts.slice(1);

    if (ADMIN_LOCKED_COMMANDS.has(command) && req.body.adminKey !== config.adminPassword) {
      return res.json({
        success: true,
        phoneNumber,
        command,
        locked: true,
        reason: 'admin',
        response: '🔒 Clave de tesorero requerida o incorrecta.',
      });
    }

    let response = '❌ Comando no reconocido. Usa /help';
    let locked = false;
    let reason = null;

    if (commands[command]) {
      try {
        const result = await commands[command](phoneNumber, args, { pin: req.body.pin });
        if (result && typeof result === 'object' && result.locked) {
          locked = true;
          reason = result.reason;
          response = result.response;
        } else {
          response = result;
        }
      } catch (error) {
        console.error('Error:', error);
        response = '❌ Error procesando comando. Intenta de nuevo.';
      }
    }

    if (locked) {
      return res.json({ success: true, phoneNumber, command, locked: true, reason, response });
    }

    await sendMessage(phoneNumber, response);

    res.json({ success: true, phoneNumber, command, response, timestamp: new Date() });
  };
}

module.exports = { createWebhookHandler };
