const crypto = require('crypto');
const twilio = require('twilio');

function createMessenger({ accountSid, authToken, from, defaultCountryCode }) {
  const client = accountSid && authToken && from ? twilio(accountSid, authToken) : null;

  if (client) {
    console.log('✅ Twilio SMS habilitado');
  } else {
    console.log(
      '⚠️ Twilio no configurado (falta TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER) — los mensajes solo se registran en el log'
    );
  }

  return async function sendMessage(phoneNumber, message) {
    console.log(`📱 Enviando a ${phoneNumber}: ${message}`);

    if (!client) return `msg_${crypto.randomUUID()}`;

    const digits = String(phoneNumber).replace(/\D/g, '').slice(-10);
    const to = digits.length === 10 ? `${defaultCountryCode}${digits}` : `+${digits}`;

    try {
      const msg = await client.messages.create({ body: message, from, to });
      return msg.sid;
    } catch (error) {
      console.error('❌ Error enviando SMS por Twilio:', error.message);
      return null;
    }
  };
}

module.exports = { createMessenger };
