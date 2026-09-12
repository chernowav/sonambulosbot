const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, unique: true, required: true },
  // Nombre con el que se le habla a la persona en la consola; no identifica
  // la cuenta (eso lo hace phoneNumber) y por eso no es único.
  name: String,
  email: String,
  // Dos monedas con reglas distintas:
  //
  // Sol es la entrada al evento e incluye una bebida. Se emite una sola vez
  // por persona y por noche, no se puede recomprar ni pasar a nadie, y vence
  // a las 24 horas. Contar Soles emitidas es contar entradas vendidas.
  //
  // Luna se compra aparte, no vence y es la que circula en el bar.
  balanceSol: { type: Number, default: 0 },
  balanceLuna: { type: Number, default: 0 },

  // Un solo vencimiento por persona en vez de uno por cada emisión: llevar
  // lotes separados obligaría a abandonar el decremento atómico que impide
  // que dos pagos simultáneos en la barra dejen el saldo en negativo. Recibir
  // Sol extra estira el reloj de toda la Sol, que en una sola noche es un mal
  // mucho menor.
  solExpiraEn: Date,
  isArtist: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  // Hash del PIN que la persona eligió al crear la cuenta. Es la credencial
  // de inicio de sesión: se verifica una vez al entrar y a partir de ahí vale
  // el token de sesión. Ver src/utils/pin.js y src/services/sessions.js.
  pinHash: String,

  // Telegram no deja escribirle a quien no habló primero con el bot, así que
  // hay que guardar el chat al que se puede mandar. El código de vinculación
  // es de un solo uso: viaja en el enlace y se consume al enganchar.
  telegramChatId: String,
  telegramLinkCode: { type: String, index: true, sparse: true },

  // Un PIN de 4 dígitos son 10 000 combinaciones: sin contar los intentos
  // fallidos se prueban todas en minutos. Ver src/routes/auth.js.
  loginFails: { type: Number, default: 0 },
  lockedUntil: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const coinSchema = new mongoose.Schema({
  coinId: { type: String, unique: true, required: true },
  owner: { type: String, required: true },
  value: { type: Number, default: 1 },
  type: { type: String, enum: ['consumible', 'coleccionable'], default: 'consumible' },
  history: [
    {
      from: String,
      to: String,
      action: String, // 'emitted', 'transferred', 'redeemed'
      timestamp: Date,
      eventId: String,
    },
  ],
  valid: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  eventId: String,
});

const eventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, required: true },
  name: String,
  date: Date,
  location: String,
  treasurerPhone: String,
  coinsEmitted: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// Cada transacción es un eslabón del libro público: lleva su número de orden,
// el hash del movimiento anterior y el suyo propio. Editar una transacción
// vieja rompe el hash de todas las que vinieron después, así que la
// manipulación se nota sin necesidad de confiar en nadie.
const transactionSchema = new mongoose.Schema({
  index: { type: Number, unique: true, sparse: true },
  prevHash: String,
  hash: String,
  // from/to guardan el teléfono, porque /history busca por él. Las etiquetas
  // son lo que se publica y lo que cubre el hash.
  from: String,
  to: String,
  fromLabel: String,
  toLabel: String,
  coinIds: [String],
  action: String,
  description: String,
  amount: Number,
  moneda: { type: String, enum: ['sol', 'luna'], default: 'luna' },
  timestamp: { type: Date, default: Date.now },
  eventId: String,
  visible: { type: Boolean, default: true },
});

// Una publicación del programa de contenido (30 talentos). Un mismo link de
// producción genera un UniverseContent por cada talento etiquetado, porque
// cada uno tiene su propio feed en Universos.
const universeContentSchema = new mongoose.Schema({
  link: { type: String, required: true },
  artistPhone: { type: String, required: true },
  addedBy: String,
  createdAt: { type: Date, default: Date.now },
});

// Ajustes que el propio servidor genera y necesita conservar entre reinicios.
// Hoy solo guarda el secreto de las sesiones: antes se generaba en memoria en
// cada arranque, así que cada redespliegue cerraba la sesión de todo el mundo.
const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Punta de la cadena del libro público: el número y el hash del último
// movimiento registrado. Se actualiza con compare-and-set para que dos
// transferencias simultáneas no se cuelguen del mismo eslabón.
const ledgerHeadSchema = new mongoose.Schema({
  _id: { type: String, default: 'libro' },
  index: { type: Number, default: 0 },
  hash: { type: String, default: 'GENESIS' },
});

// Las dos consultas que corren todo el tiempo durante el evento: los
// movimientos de una persona (para avisarle) y el libro por orden.
transactionSchema.index({ from: 1, index: 1 });
transactionSchema.index({ to: 1, index: 1 });
transactionSchema.index({ timestamp: -1 });

module.exports = {
  User: mongoose.model('User', userSchema),
  Setting: mongoose.model('Setting', settingSchema),
  LedgerHead: mongoose.model('LedgerHead', ledgerHeadSchema),
  Coin: mongoose.model('Coin', coinSchema),
  Event: mongoose.model('Event', eventSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  UniverseContent: mongoose.model('UniverseContent', universeContentSchema),
};
