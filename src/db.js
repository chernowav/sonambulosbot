const mongoose = require('mongoose');

// Antes esto atrapaba el error y seguía: el servidor arrancaba "bien" sin base
// de datos y cada petición fallaba después, con mensajes que no decían la
// causa. Ahora falla de una y Railway lo reintenta, que es lo correcto: sin
// base no hay saldos, ni libro, ni sesiones.
function connect(uri) {
  return mongoose.connect(uri).then(() => console.log('✅ MongoDB conectado'));
}

module.exports = { connect };
