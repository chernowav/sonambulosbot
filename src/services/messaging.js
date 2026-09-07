// El bot pivoteó de WhatsApp/Twilio a la consola web /chat: la respuesta ya
// viaja de vuelta en el JSON del webhook, así que este "notifier" es solo
// para dejar rastro en el log. Si en el futuro se agrega un canal real
// (WhatsApp, email, push), esta es la función a reemplazar.
function createMessenger() {
  return async function sendMessage(phoneNumber, message) {
    console.log(`📱 Respuesta para ${phoneNumber}: ${message}`);
  };
}

module.exports = { createMessenger };
