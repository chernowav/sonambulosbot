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

  // readAdminPassword() siempre devuelve algo (si falta, inventa una), así que
  // preguntar por adminPassword no distingue "configurada" de "autogenerada y
  // distinta en cada reinicio". Esto sí.
  adminPasswordConfigurada: Boolean(process.env.ADMIN_PASSWORD),

  // Nulo a propósito: si no viene por variable de entorno, el servidor saca
  // uno guardado en la base (src/store getOrCreateSetting). Antes se generaba
  // en memoria en cada arranque, y por eso cada redespliegue cerraba la
  // sesión de todo el mundo.
  sessionSecret: process.env.SESSION_SECRET || null,

  treasurerPhone: process.env.TREASURER_PHONE || '',
  botName: process.env.BOT_NAME || 'Piso 26',
  defaultEventId: process.env.EVENT_ID || 'event_oct3_2026',

  // Canal principal de avisos: gratis, sin cuenta de empresa y sin aprobación
  // de plantillas. Se crea con @BotFather en Telegram.
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    botUsername: (process.env.TELEGRAM_BOT_USERNAME || '').replace('@', ''),
    // Railway expone el dominio solo; el webhook necesita la URL completa.
    publicUrl:
      process.env.PUBLIC_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ''),
  },

  // Respaldo de pago para quien no vincule Telegram. Sin credenciales, la app
  // funciona igual pero sin mandar nada.
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
    // El proyecto ya traía este número de la integración de WhatsApp anterior
    // al pivote; se reusa en vez de pedir credenciales nuevas.
    whatsappFrom: process.env.TWILIO_WHATSAPP_NUMBER || '',
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
