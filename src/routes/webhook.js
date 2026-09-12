const { canonico } = require('../utils/comandos');

const ADMIN_LOCKED_COMMANDS = new Set(['emit', 'users', 'content', 'resetpin']);

// Lo único que se puede pedir sin haber iniciado sesión.
const PUBLIC_COMMANDS = new Set(['help']);

// Handler compartido por /webhook/sms y /webhook/message. Antes cada ruta
// tenía su propia copia casi idéntica de este código (parseo de comando,
// chequeo de adminKey, despacho, envío de respuesta); ahora ambas rutas
// solo difieren en el path que las expone.
function createWebhookHandler({ commands, config, sendMessage, sessions }) {
  return async function handleIncoming(req, res) {
    const incoming = (req.body.Body ?? req.body.message ?? '').trim();
    if (!incoming) {
      return res.status(400).json({ error: 'Mensaje inválido' });
    }

    // Solo el nombre del comando se compara en minúsculas; los argumentos
    // (nombres, y sobre todo links de /content) mantienen mayúsculas y
    // minúsculas tal como se escribieron.
    const parts = incoming.split(/\s+/);
    // Se traduce el alias de una: todo lo que sigue (candado de admin,
    // despacho) razona sobre el nombre interno, nunca sobre el escrito.
    const command = canonico(parts[0].replace('/', '').toLowerCase());
    const args = parts.slice(1);

    // La identidad sale del token firmado, nunca del teléfono que mande el
    // cliente. Si saliera del body, cualquiera podría escribir el número de
    // otra persona y gastarle el saldo.
    const session = sessions.verify(req.body.token);

    if (!session && !PUBLIC_COMMANDS.has(command)) {
      return res.json({
        success: true,
        command,
        locked: true,
        reason: 'auth',
        response: '🔒 Verifica tu PIN para continuar.',
      });
    }

    const phoneNumber = session ? session.phoneNumber : null;
    console.log(`📨 Mensaje de ${phoneNumber || 'anónimo'}: ${incoming}`);

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
