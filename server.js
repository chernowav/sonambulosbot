const crypto = require('crypto');

const config = require('./src/config');
const db = require('./src/db');
const { createApp } = require('./src/app');
const { createMongoStore } = require('./src/store/mongoStore');
const { createMessenger } = require('./src/services/messaging');
const { createCommands } = require('./src/services/commands');
const { createSessions } = require('./src/services/sessions');
const { createSms, createWhatsapp } = require('./src/services/sms');
const { createTelegram } = require('./src/services/telegram');

// El secreto de sesión tiene que sobrevivir a los reinicios: si cambia, las
// firmas emitidas antes dejan de validar y se cierra la sesión de todo el
// mundo a la vez. Si no viene por variable de entorno, se genera una sola vez
// y queda guardado en la base.
async function resolveSessionSecret(store) {
  if (config.sessionSecret) return config.sessionSecret;

  try {
    const secret = await store.getOrCreateSetting('sessionSecret', () =>
      crypto.randomBytes(32).toString('base64url')
    );
    console.log('🔐 Secreto de sesión tomado de la base (sobrevive a los reinicios).');
    return secret;
  } catch (error) {
    console.warn(`⚠️ No se pudo leer el secreto de sesión de la base: ${error.message}`);
    console.warn('   Se usa uno temporal: este reinicio cerró la sesión de todos.');
    return crypto.randomBytes(32).toString('base64url');
  }
}

async function main() {
  await db.connect(config.mongodbUri);

  const store = createMongoStore({ treasurerPhone: config.treasurerPhone });
  const sessionSecret = await resolveSessionSecret(store);
  const sessions = createSessions({ secret: sessionSecret });

  const sms = createSms(config.sms);
  const whatsapp = createWhatsapp(config.sms);
  const telegram = createTelegram({
    ...config.telegram,
    // Derivado del secreto de sesión, que ya es estable entre reinicios: así
    // el secreto del webhook no es una variable más que configurar, y sigue
    // siendo el mismo que se registró en Telegram.
    secretToken: crypto.createHash('sha256').update(`${sessionSecret}:telegram`).digest('hex'),
  });

  const sendMessage = createMessenger();
  const commands = createCommands(store, config, { sms, whatsapp, telegram });

  if (telegram.enabled) {
    const hook = await telegram.registerWebhook();
    console.log(
      hook.ok
        ? '🤖 Telegram conectado y webhook registrado.'
        : `⚠️ Telegram configurado pero el webhook no quedó: ${hook.reason || ''}`
    );
  } else {
    console.warn('⚠️ Telegram desactivado: falta TELEGRAM_BOT_TOKEN.');
  }

  if (whatsapp.enabled) console.log('💬 WhatsApp disponible por Twilio.');

  if (!telegram.enabled && !sms.enabled && !whatsapp.enabled) {
    console.warn('⚠️ Nadie recibe avisos: no hay ni Telegram ni SMS configurados.');
    console.warn('   Las transferencias funcionan igual y se ven en la consola y en /libro.');
  }

  const app = createApp({ config, store, sessions, commands, sendMessage, sms, whatsapp, telegram });

  app.listen(config.port, () => {
    console.log(`🚀 ${config.botName} corriendo en el puerto ${config.port}`);
  });

  return app;
}

module.exports = main().catch((error) => {
  console.error(`❌ No se pudo arrancar: ${error.message}`);
  process.exit(1);
});
