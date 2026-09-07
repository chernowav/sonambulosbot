const mongoose = require('mongoose');

function connect(uri) {
  return mongoose
    .connect(uri)
    .then(() => console.log('✅ MongoDB conectado'))
    .catch((err) => console.error('❌ MongoDB error:', err.message));
}

module.exports = { connect };
