const crypto = require('crypto');

const config = require('./src/config');
const db = require('./src/db');
const { createApp } = require('./src/app');
const { createMongoStore } = require('./src/store/mongoStore');
const { createMessenger } = require('./src/services/messaging');
const { createCommands } = require('./src/services/commands');
const { createSessions } = require('./src/services/sessions');
const { createSms } = require('./src/services/sms');

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
  const sessions = createSessions({ secret: await resolveSessionSecret(store) });
  const sms = createSms(config.sms);
  const sendMessage = createMessenger();
  const commands = createCommands(store, config, sms);

  if (!sms.enabled) {
    console.warn('⚠️ SMS desactivado: falta TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_FROM.');
    console.warn('   Las transferencias funcionan, pero nadie recibe el aviso por mensaje.');
  }

  const app = createApp({ config, store, sessions, commands, sendMessage, sms });

  app.listen(config.port, () => {
    console.log(`🚀 ${config.botName} corriendo en el puerto ${config.port}`);
  });

  return app;
}

module.exports = main().catch((error) => {
  console.error(`❌ No se pudo arrancar: ${error.message}`);
  process.exit(1);
});
