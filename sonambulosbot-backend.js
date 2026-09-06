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
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', 'Content-Type'); if (req.method === 'OPTIONS') return res.sendStatus(200); next(); });
const TREASURER_PHONE = process.env.TREASURER_PHONE || '3153811758'; const CHAT_HTML = `<!doctype html><html lang=es><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Consola Sonambulos</title><style>:root{--ink:#131120;--panel:#1D1A2C;--p2:#252137;--line:#2F2B44;--tx:#E9E5F2;--mu:#8983A6;--gold:#CBA135;--err:#D97070;--ok:#6FAE8C}*{box-sizing:border-box}body{margin:0 auto;max-width:520px;height:100vh;display:flex;flex-direction:column;background:var(--ink);color:var(--tx);font:15px/1.5 system-ui,sans-serif;border-left:1px solid var(--line);border-right:1px solid var(--line)}header{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px}h1{margin:0;font:400 24px Georgia,serif}h1 i{color:var(--gold);font-style:normal}.rt{display:flex;align-items:center;gap:10px}.st{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu);display:flex;align-items:center;gap:6px}.d{width:7px;height:7px;border-radius:50%;background:var(--mu)}.on{background:var(--ok)}.off{background:var(--err)}#lk{background:none;border:1px solid var(--line);border-radius:8px;color:var(--mu);font-size:14px;padding:4px 8px;cursor:pointer;line-height:1}#lk.armed{border-color:var(--gold);color:var(--gold)}.who{display:flex;gap:10px;align-items:center;padding:9px 16px;border-bottom:1px solid var(--line);background:var(--panel)}.who label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu)}input{background:var(--ink);border:1px solid var(--line);border-radius:9px;color:var(--tx);font:13px ui-monospace,monospace;padding:9px 11px;flex:1;min-width:0}#log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}.m{max-width:88%;padding:10px 13px;border-radius:9px;white-space:pre-wrap;word-break:break-word}.me{align-self:flex-end;background:var(--gold);color:#191426;font:500 13px ui-monospace,monospace;border-bottom-right-radius:3px}.bot{align-self:flex-start;background:var(--p2);border:1px solid var(--line);border-bottom-left-radius:3px}.bad{border-color:rgba(217,112,112,.55);color:var(--err)}footer{border-top:1px solid var(--line);background:var(--panel);padding:9px 16px 14px;display:flex;flex-direction:column;gap:8px}.ch{display:flex;gap:6px;overflow-x:auto}.ch button{flex:none;background:none;border:1px solid var(--line);border-radius:99px;color:var(--mu);font:11px ui-monospace,monospace;padding:5px 10px;white-space:nowrap}.row{display:flex;gap:8px}#msg{font-size:14px}#go{background:var(--gold);color:#191426;border:0;border-radius:9px;font:600 14px system-ui;padding:0 17px}</style></head><body><header><h1>Son<i>a</i>mbulos</h1><div class=rt><div class=st><span class=d id=dot></span><span id=stx>conectando</span></div><button id=lk title="Clave de tesorero">L</button></div></header><div class=who><label for=me>Eres</label><input id=me value="+573001112233"></div><div id=log></div><footer><div class=ch id=ch></div><div class=row><input id=msg placeholder="/send 5 tokens to @3153811758"><button id=go>Enviar</button></div></footer><script>var L=document.getElementById('log'),M=document.getElementById('msg'),G=document.getElementById('go'),ME=document.getElementById('me'),D=document.getElementById('dot'),S=document.getElementById('stx'),K=document.getElementById('lk');function gk(){try{return localStorage.getItem('sb.k')||''}catch(e){return ''}}function sk(v){try{v?localStorage.setItem('sb.k',v):localStorage.removeItem('sb.k')}catch(e){}paint()}function paint(){var a=!!gk();K.textContent=a?'TESORERO':'CLAVE';K.className=a?'armed':''}K.onclick=function(){if(gk()){if(confirm('Olvidar la clave de tesorero?'))sk('')}else{var p=prompt('Clave de tesorero:');if(p)sk(p)}};try{var sp=localStorage.getItem('sb.p');if(sp)ME.value=sp}catch(e){}ME.onchange=function(){try{localStorage.setItem('sb.p',ME.value)}catch(e){}};['/balance','/send 5 tokens to @3153811758','/register Cherno','/history','/emit @3001112233 20','/help'].forEach(function(c){var b=document.createElement('button');b.textContent=c;b.onclick=function(){M.value=c;M.focus()};document.getElementById('ch').appendChild(b)});function add(k,t){var d=document.createElement('div');d.className='m '+k;d.textContent=t;L.appendChild(d);L.scrollTop=L.scrollHeight}function st(o){D.className='d '+(o?'on':'off');S.textContent=o?'en linea':'sin respuesta'}async function go(t,retry){if(!t)return;if(!retry)add('me',t);M.value='';G.disabled=true;try{var r=await fetch('/webhook/sms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:ME.value.trim(),Body:t,adminKey:gk()})});var j=await r.json();if(j.locked&&!retry){var p=prompt('Clave de tesorero:');if(p){sk(p);G.disabled=false;return go(t,true)}}add(j.response?'bot':'bot bad',j.response||'HTTP '+r.status);st(true)}catch(e){add('bot bad','No se pudo alcanzar el bot.');st(false)}G.disabled=false;M.focus()}G.onclick=function(){go(M.value.trim())};M.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();go(M.value.trim())}};paint();fetch('/').then(function(){st(true);go('/help')}).catch(function(){st(false)});</script></body></html>`; app.get('/chat', (req, res) => res.type('html').send(CHAT_HTML));

// ========== CONFIG ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://user:pass@cluster.mongodb.net/sonambulosbot';
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // Cambiar en producción
const BASE_URL = process.env.BASE_URL || 'https://sonambulosbot-production.up.railway.app';

// ========== TWILIO (envío real de SMS) ==========
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; // número Twilio con capacidad SMS, formato E.164 (+57...)
const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || '+57';

let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('✅ Twilio SMS habilitado');
} else {
  console.log('⚠️ Twilio no configurado (falta TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER) — los mensajes solo se registran en el log');
}

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
  if (user && user.phoneNumber !== phoneNumber) { user.phoneNumber = phoneNumber; await user.save(); }
  if (!user) {
    user = new User({ phoneNumber, name: name || `Usuario ${phoneNumber.slice(-4)}` });
    await user.save();
  }
    if (user && !user.isAdmin && String(phoneNumber).replace(/\D/g,'').slice(-10) === TREASURER_PHONE.replace(/\D/g,'').slice(-10)) { user.isAdmin = true; await user.save(); }
  return user;
}

async function sendMessage(phoneNumber, message) {
  console.log(`📱 Enviando a ${phoneNumber}: ${message}`);

  if (!twilioClient) {
    // Twilio no configurado — se queda solo en el log (comportamiento anterior)
    return `msg_${crypto.randomUUID()}`;
  }

  const digits = String(phoneNumber).replace(/\D/g, '').slice(-10);
  const to = digits.length === 10 ? `${DEFAULT_COUNTRY_CODE}${digits}` : `+${digits}`;

  try {
    const msg = await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to
    });
    return msg.sid;
  } catch (error) {
    console.error('❌ Error enviando SMS por Twilio:', error.message);
    return null;
  }
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
  const phoneNumber = String(phone || '').replace(/\D/g,'').slice(-10);

  console.log(`📨 Mensaje de ${phoneNumber}: ${incoming}`);

  // Parse comando
  const parts = incoming.split(/\s+/);
  const command = parts[0].replace('/', '');
  const args = parts.slice(1);
  if (['emit','users'].includes(command) && req.body.adminKey !== ADMIN_PASSWORD) return res.json({ success: true, phoneNumber, command, locked: true, response: '\u{1F512} Clave de tesorero requerida o incorrecta.' });

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
  const phoneNumber = String(req.body.From || req.body.phone || '').replace(/\D/g,'').slice(-10);

  if (!incoming || !phoneNumber) {
    return res.status(400).json({ error: 'Mensaje o teléfono inválido' });
  }

  console.log(`📨 SMS de ${phoneNumber}: ${incoming}`);

  // Parse comando
  const parts = incoming.split(/\s+/);
  const command = parts[0].replace('/', '');
  const args = parts.slice(1);
  if (['emit','users'].includes(command) && req.body.adminKey !== ADMIN_PASSWORD) return res.json({ success: true, phoneNumber, command, locked: true, response: '\u{1F512} Clave de tesorero requerida o incorrecta.' });

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
