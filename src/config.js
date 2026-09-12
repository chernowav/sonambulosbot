const crypto = require('crypto');

function readAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const generated = crypto.randomBytes(9).toString('base64url');
  console.warn(`⚠️ ADMIN_PASSWORD no configurado. Se generó uno temporal para esta ejecución: ${generated}`);
  console.warn('   Configúralo como variable de entorno para que sea estable entre reinicios.');
  return generated;
}

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI,
  adminPassword: readAdminPassword(),

  // Nulo a propósito: si no viene por variable de entorno, el servidor saca
  // uno guardado en la base (src/store getOrCreateSetting). Antes se generaba
  // en memoria en cada arranque, y por eso cada redespliegue cerraba la
  // sesión de todo el mundo.
  sessionSecret: process.env.SESSION_SECRET || null,

  treasurerPhone: process.env.TREASURER_PHONE || '',
  botName: process.env.BOT_NAME || 'Piso 26',
  defaultEventId: process.env.EVENT_ID || 'event_oct3_2026',

  // Avisos por SMS de cada movimiento. Sin credenciales, la app funciona
  // igual pero sin mandar nada.
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
    countryCode: process.env.SMS_COUNTRY_CODE || '+57',
  },
};

if (!config.mongodbUri) {
  throw new Error('MONGODB_URI es requerido. Define la variable de entorno antes de arrancar.');
}

if (!config.treasurerPhone) {
  console.warn('⚠️ TREASURER_PHONE no configurado. Ningún número se promueve a admin automáticamente; usa POST /admin/setup.');
}

module.exports = config;
