// rebuild 2026-09-05 - forzar deploy limpio
/**
 * SONÁMBULOS — SMS Bot Backend
 * Sistema de monedas para eventos
 *
 * Stack: Node.js + Express + MongoDB
 * API: HTTP + Webhook para SMS (Twilio/Bandwidth)
 *
 * Configuración: Ver .env.example
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', 'Content-Type'); if (req.method === 'OPTIONS') return res.sendStatus(200); next(); });

// ========== CONFIG ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://user:pass@cluster.mongodb.net/sonambulosbot';
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // Cambiar en producción
const BASE_URL = process.env.BASE_URL || 'https://sonambulosbot-production.up.railway.app';

// ========== DATABASE SCHEMAS ==========
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// Usuario/Artista
const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, unique: true, required: true },
  name: String,
  balance: { type: Number, default: 0 },
  isArtist: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Moneda (instancia individual)
const coinSchema = new mongoose.Schema({
  coinId: { type: String, unique: true, required: true }, // UUID
  owner: { type: String, required: true }, // phoneNumber
  value: { type: Number, default: 1 },
  type: { type: String, enum: ['consumible', 'coleccionable'], default: 'consumible' },
  history: [{
    from: String,
    to: String,
    action: String, // 'emitted', 'transferred', 'redeemed'
    timestamp: Date,
    eventId: String
  }],
  valid: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  eventId: String // Referencia al evento donde se emitió
});

// Evento
const eventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, required: true },
  name: String,
  date: Date,
  location: String,
  treasurerPhone: String,
  coinsEmitted: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Transacción (log público)
const transactionSchema = new mongoose.Schema({
  from: String,
  to: String,
  coinIds: [String],
  action: String,
  description: String,
  timestamp: { type: Date, default: Date.now },
  eventId: String,
  visible: { type: Boolean, default: true } // Para mostrar en canal público
});

const User = mongoose.model('User', userSchema);
const Coin = mongoose.model('Coin', coinSchema);
const Event = mongoose.model('Event', eventSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// ========== HELPER FUNCTIONS ==========

async function getOrCreateUser(phoneNumber, name = null) {
  let user = await User.findOne({ phoneNumber });
  if (!user) user = await User.findOne({ phoneNumber: new RegExp(String(phoneNumber).replace(/\D/g, '').slice(-10) + '$') });
  if (!user) {
    user = new User({ phoneNumber, name: name || `Usuario ${phoneNumber.slice(-4)}` });
    await user.save();
  }
  return user;
}

async function sendMessage(phoneNumber, message) {
  // Log message para testing sin SMS real
  console.log(`📱 Enviando a ${phoneNumber}: ${message}`);
  // En producción, esto se reemplazará con Twilio/Bandwidth/etc
  return `msg_${crypto.randomUUID()}`;
}

async function logTransaction(from, to, coinIds, action, description, eventId) {
  const transaction = new Transaction({
    from,
    to,
    coinIds,
    action,
    description,
    eventId,
    visible: true
  });
  await transaction.save();

  // Enviar a canal público (será el webhook que configures en Twilio para el grupo)
  const msg = `✅ ${description}\n📊 Por: ${from?.slice(-4) || 'Sistema'}\nPara: ${to?.slice(-4) || 'Sistema'}`;
  // await sendWhatsAppMessage(PUBLIC_CHANNEL_NUMBER, msg); // Configurable después

  return transaction;
}

function generateCoinId() {
  return `coin_${crypto.randomUUID()}`;
}

// ========== BOT COMMANDS ==========

const commands = {
  send: async (phoneNumber, args) => { const target = args.find(a => a.startsWith('@')) || args.find(a => /^\d{7,}$/.test(a)); if (!target) return '❌ Formato: /send 5 tokens to @numero'; const amt = args.find(a => a !== target && /^\d{1,6}$/.test(a)); return commands.transfer(phoneNumber, [target, amt || '1']); },
  // Usuario normal: ver saldo
  balance: async (phoneNumber) => {
    const user = await User.findOne({ phoneNumber });
    if (!user) return '❌ Usuario no registrado. Usa /register [nombre]';

    return `💰 Tu saldo: ${user.balance} monedas\n📱 Teléfono: ${phoneNumber}`;
  },

  // Usuario normal: registrarse
  register: async (phoneNumber, args) => {
    const name = args.join(' ') || `Usuario ${phoneNumber.slice(-4)}`;
    const user = await getOrCreateUser(phoneNumber, name);
    return `✅ Registrado como: ${user.name}\n💰 Saldo inicial: ${user.balance} monedas`;
  },

  // Usuario normal: historial
  history: async (phoneNumber) => {
    const transactions = await Transaction.find({
      $or: [{ from: phoneNumber }, { to: phoneNumber }],
      visible: true
    }).sort({ timestamp: -1 }).limit(10);

    if (transactions.length === 0) return 'No hay transacciones aún.';

    let msg = '📜 Últimas 10 transacciones:\n';
    transactions.forEach((t, i) => {
      const date = new Date(t.timestamp).toLocaleString('es-CO');
      msg += `${i+1}. ${t.description} (${date})\n`;
    });
    return msg;
  },

  // Usuario normal: transferir
  transfer: async (phoneNumber, args) => {
    // Formato: /transfer @usuario 5
    if (args.length < 2) return '❌ Formato: /transfer @usuario X';

    const toPhoneRaw = args[0]; // @numero o numero
    const amount = parseInt(args[1]);

    if (isNaN(amount) || amount <= 0) return '❌ Cantidad debe ser número > 0';

    // Resolver número (aquí simplificado)
    const toPhone = toPhoneRaw.replace('@', '');

    const fromUser = await User.findOne({ phoneNumber });
    const toUser = await getOrCreateUser(toPhone);

    if (!fromUser) return '❌ No estás registrado.';
    if (fromUser.balance < amount) return `❌ Saldo insuficiente. Tienes: ${fromUser.balance}`;

    // Transferir
    fromUser.balance -= amount;
    toUser.balance += amount;
    await fromUser.save();
    await toUser.save();

    // Log
    const coinIds = [`coin_${crypto.randomUUID()}`]; // Simplificado
    await logTransaction(
      phoneNumber,
      toPhone,
      coinIds,
      'transfer',
      `Transferencia de ${amount} monedas de ${fromUser.name} a ${toUser.name}`
    );

    return `✅ Transferencia completada!\n📤 Enviaste: ${amount} monedas\n💰 Tu nuevo saldo: ${fromUser.balance}`;
  },

  // ADMIN: emitir monedas
  emit: async (phoneNumber, args) => {
    const user = await User.findOne({ phoneNumber });
    if (!user || !user.isAdmin) return '❌ No tienes permisos de admin.';

    // Formato: /emit @usuario 5 [event_id]
    if (args.length < 2) return '❌ Formato: /emit @usuario X [event_id]';

    const toPhoneRaw = args[0];
    const amount = parseInt(args[1]);
    const eventId = args[2] || 'event_oct3_2026';

    if (isNaN(amount) || amount <= 0) return '❌ Cantidad debe ser número > 0';

    const toPhone = toPhoneRaw.replace('@', '');
    const toUser = await getOrCreateUser(toPhone);

    // Crear monedas
    const coinIds = [];
    for (let i = 0; i < amount; i++) {
      const coin = new Coin({
        coinId: generateCoinId(),
        owner: toPhone,
        value: 1,
        type: 'consumible',
        eventId,
        history: [{
          from: 'SYSTEM',
          to: toPhone,
          action: 'emitted',
          timestamp: new Date(),
          eventId
        }]
      });
      await coin.save();
      coinIds.push(coin.coinId);
    }

    toUser.balance += amount;
    await toUser.save();

    // Log público
    await logTransaction(
      'TESORERO',
      toPhone,
      coinIds,
      'emission',
      `✅ Tesorero emitió ${amount} monedas a ${toUser.name}`,
      eventId
    );

    return `✅ Emitidas ${amount} monedas a ${toUser.name}\n📊 Nuevo saldo: ${toUser.balance}`;
  },

  // ADMIN: listar usuarios
  users: async (phoneNumber) => {
    const user = await User.findOne({ phoneNumber });
    if (!user || !user.isAdmin) return '❌ No tienes permisos.';

    const users = await User.find();
    let msg = '👥 Usuarios registrados:\n';
    users.forEach((u, i) => {
      msg += `${i+1}. ${u.name} (@${u.phoneNumber.slice(-4)}) — ${u.balance} monedas\n`;
    });
    return msg;
  },

  // Admin: help
  help: async (phoneNumber) => {
    const user = await User.findOne({ phoneNumber });
    const isAdmin = user?.isAdmin;

    let msg = '📖 Comandos Sonámbulos:\n\n';
    msg += '/register [nombre] — Registrarte\n';
    msg += '/balance — Ver tu saldo\n';
    msg += '/transfer @usuario X — Enviar X monedas\n';
    msg += '/send X tokens to @numero — Enviar X (1 si omites X)\n';
    msg += '/history — Últimas transacciones\n';

    if (isAdmin) {
      msg += '\n👑 Admin:\n';
      msg += '/emit @usuario X — Emitir monedas\n';
      msg += '/users — Listar usuarios\n';
    }

    return msg;

    msg += '/send X tokens to @numero — Enviar X (o 1 si omites X)\n';

  }
};

// ========== MAIN WEBHOOK ==========

app.post('/webhook/message', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'phone y message son requeridos' });
  }

  const incoming = message.trim().toLowerCase();
  const phoneNumber = phone;

  console.log(`📨 Mensaje de ${phoneNumber}: ${incoming}`);

  // Parse comando
  const parts = incoming.split(/\s+/);
  const command = parts[0].replace('/', '');
  const args = parts.slice(1);

  let response = '❌ Comando no reconocido. Usa /help';

  if (commands[command]) {
    try {
      response = await commands[command](phoneNumber, args);
    } catch (error) {
      console.error('Error:', error);
      response = '❌ Error procesando comando. Intenta de nuevo.';
    }
  }

  // Enviar respuesta (log en testing)
  await sendMessage(phoneNumber, response);

  res.json({
    success: true,
    phoneNumber,
    command,
    response
  });
});

// ========== WEBHOOK SMS (Twilio/Bandwidth compatible) ==========

app.post('/webhook/sms', async (req, res) => {
  // Soporta formato Twilio o JSON simple
  const incoming = (req.body.Body || req.body.message || '')?.trim().toLowerCase();
  const phoneNumber = req.body.From || req.body.phone;

  if (!incoming || !phoneNumber) {
    return res.status(400).json({ error: 'Mensaje o teléfono inválido' });
  }

  console.log(`📨 SMS de ${phoneNumber}: ${incoming}`);

  // Parse comando
  const parts = incoming.split(/\s+/);
  const command = parts[0].replace('/', '');
  const args = parts.slice(1);

  let response = '❌ Comando no reconocido. Usa /help';

  if (commands[command]) {
    try {
      response = await commands[command](phoneNumber, args);
    } catch (error) {
      console.error('Error:', error);
      response = '❌ Error procesando comando. Intenta de nuevo.';
    }
  }

  // Enviar respuesta
  await sendMessage(phoneNumber, response);

  // Responder en JSON (más simple que TwiML)
  res.json({
    success: true,
    phoneNumber,
    command,
    response,
    timestamp: new Date()
  });
});

// ========== STATUS & TESTING ==========

app.get('/', (req, res) => {
  res.json({
    status: '✅ Sonámbulos Bot running',
    email: 'sonambulosctg@gmail.com',
    version: '1.0.0-beta',
    endpoints: {
      'POST /webhook/sms': 'Recibe SMS (Twilio/Bandwidth compatible)',
      'POST /webhook/message': 'Recibe mensaje JSON simple',
      'GET /test': 'Test rápido'
    }
  });
});

app.get('/test', (req, res) => {
  res.json({
    message: 'Bot funcionando correctamente',
    instructions: 'Envía POST a /webhook/sms con: { "phone": "+5713xxx", "message": "/help" }',
    example_curl: 'curl -X POST https://sonambulosbot-production.up.railway.app/webhook/sms -H "Content-Type: application/json" -d \'{"phone": "+5713xxx", "message": "/register test"}\''
  });
});

// ========== ADMIN INIT (correr una sola vez) ==========

app.post('/admin/setup', async (req, res) => {
  const { password, treasurerPhone } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Contraseña incorrecta' });
  }

  const user = await User.findOne({ phoneNumber: treasurerPhone });
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  user.isAdmin = true;
  user.balance = 100; // Mínimo recomendado
  await user.save();

  res.json({
    message: `✅ Admin habilitado para ${treasurerPhone}`,
    balance: user.balance
  });
});

// ========== START SERVER ==========

app.listen(PORT, () => {
  console.log(`🚀 Sonámbulos Bot running on port ${PORT}`);
  console.log(`📧 Email: sonambulosctg@gmail.com`);
});
// Forced redeploy - 2026-09-05 Deploy verification loop trigger (Build #2 - Forcing rebuild)

module.exports = app;
