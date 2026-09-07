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
  treasurerPhone: process.env.TREASURER_PHONE || '',
  botName: process.env.BOT_NAME || 'Sonámbulos',
  defaultEventId: process.env.EVENT_ID || 'event_oct3_2026',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    // Acepta ambos nombres de variable: TWILIO_PHONE_NUMBER (el que usa el
    // código) y TWILIO_WHATSAPP_NUMBER (el que documentaba el README), para
    // que configurar cualquiera de los dos active el envío real.
    from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_NUMBER,
    defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '+57',
  },
};

if (!config.mongodbUri) {
  throw new Error('MONGODB_URI es requerido. Define la variable de entorno antes de arrancar.');
}

if (!config.treasurerPhone) {
  console.warn('⚠️ TREASURER_PHONE no configurado. Ningún número se promueve a admin automáticamente; usa POST /admin/setup.');
}

module.exports = config;
