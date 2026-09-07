const crypto = require('crypto');

function readAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const generated = crypto.randomBytes(9).toString('base64url');
  console.warn(`⚠️ ADMIN_PASSWORD no configurado. Se generó uno temporal para esta ejecución: ${generated}`);
  console.warn('   Configúralo como variable de entorno para que sea estable entre reinicios.');
  return generated;
}

// Sin esto configurado, cada redeploy cambia el secreto y cierra la sesión de
// todo el mundo: las firmas emitidas antes dejan de validar.
function readSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  console.warn('⚠️ SESSION_SECRET no configurado. Se generó uno temporal para esta ejecución.');
  console.warn('   Cada reinicio cerrará la sesión de todos. Configúralo como variable de entorno.');
  return crypto.randomBytes(32).toString('base64url');
}

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI,
  adminPassword: readAdminPassword(),
  sessionSecret: readSessionSecret(),
  treasurerPhone: process.env.TREASURER_PHONE || '',
  botName: process.env.BOT_NAME || 'Sonámbulos',
  defaultEventId: process.env.EVENT_ID || 'event_oct3_2026',
};

if (!config.mongodbUri) {
  throw new Error('MONGODB_URI es requerido. Define la variable de entorno antes de arrancar.');
}

if (!config.treasurerPhone) {
  console.warn('⚠️ TREASURER_PHONE no configurado. Ningún número se promueve a admin automáticamente; usa POST /admin/setup.');
}

module.exports = config;
