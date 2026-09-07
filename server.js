const express = require('express');
const path = require('path');

const config = require('./src/config');
const db = require('./src/db');
const { createMongoStore } = require('./src/store/mongoStore');
const { createMessenger } = require('./src/services/messaging');
const { createCommands } = require('./src/services/commands');
const { createWebhookHandler } = require('./src/routes/webhook');
const { createAdminRouter } = require('./src/routes/admin');

db.connect(config.mongodbUri);

const store = createMongoStore({ treasurerPhone: config.treasurerPhone });
const sendMessage = createMessenger();
const commands = createCommands(store, config);
const handleIncoming = createWebhookHandler({ commands, config, sendMessage });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

// Soporta formato Twilio (Body/From) o JSON simple (message/phone) por
// igual; ambas rutas comparten la misma lógica en src/routes/webhook.js.
app.post('/webhook/sms', handleIncoming);
app.post('/webhook/message', handleIncoming);

app.use('/admin', createAdminRouter({ store, config }));

app.get('/', (req, res) => {
  res.json({
    status: `✅ ${config.botName} Bot running`,
    email: 'sonambulosctg@gmail.com',
    version: '1.0.0-beta',
    endpoints: {
      'POST /webhook/sms': 'Recibe SMS (Twilio/Bandwidth compatible)',
      'POST /webhook/message': 'Recibe mensaje JSON simple',
      'GET /test': 'Test rápido',
    },
  });
});

app.get('/test', (req, res) => {
  res.json({
    message: 'Bot funcionando correctamente',
    instructions: 'Envía POST a /webhook/sms con: { "phone": "+5713xxx", "message": "/help" }',
    example_curl:
      'curl -X POST https://sonambulosbot-production.up.railway.app/webhook/sms -H "Content-Type: application/json" -d \'{"phone": "+5713xxx", "message": "/register test"}\'',
  });
});

app.listen(config.port, () => {
  console.log(`🚀 ${config.botName} Bot running on port ${config.port}`);
  console.log('📧 Email: sonambulosctg@gmail.com');
});

module.exports = app;
