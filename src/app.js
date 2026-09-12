const express = require('express');
const path = require('path');

const { createWebhookHandler } = require('./routes/webhook');
const { createAdminRouter } = require('./routes/admin');
const { createAuthRouter } = require('./routes/auth');
const { createLedgerRouter } = require('./routes/ledger');

// Recibe todo lo que necesita como parámetro (store, sessions, ...) en vez de
// construirlo, para que test/ pueda levantar la misma app con un store en
// memoria y hablarle por HTTP sin Mongo de por medio. server.js es el que
// arma las dependencias reales.
function createApp({ config, store, sessions, commands, sendMessage, sms }) {
  const handleIncoming = createWebhookHandler({ commands, config, sendMessage, sessions });

  // Momento de arranque de esta instancia. Sirve para saber si el servidor se
  // reinició — sin este dato no hay forma de comprobar desde afuera que una
  // sesión sobrevivió a un redespliegue y no le pegamos a la instancia vieja.
  const startedAt = new Date().toISOString();

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.get('/chat', (req, res) =>
    res.sendFile(path.join(__dirname, '..', 'public', 'chat.html'))
  );

  // Libro público: se entra sin cuenta ni sesión, esa es la idea.
  app.get('/libro', (req, res) =>
    res.sendFile(path.join(__dirname, '..', 'public', 'libro.html'))
  );

  app.use('/api', createAuthRouter({ store, sessions }));
  app.use('/api', createLedgerRouter({ store }));

  // Soporta formato Twilio (Body/From) o JSON simple (message/phone) por
  // igual; ambas rutas comparten la misma lógica en src/routes/webhook.js.
  app.post('/webhook/sms', handleIncoming);
  app.post('/webhook/message', handleIncoming);

  app.use('/admin', createAdminRouter({ store, config }));

  app.get('/', (req, res) => {
    res.json({
      status: `✅ ${config.botName} Bot running`,
      email: 'sonambulosctg@gmail.com',
      version: '1.3.0-beta',
      startedAt,
      // Para poder comprobar desde afuera si las credenciales quedaron bien
      // puestas, sin tener que mandar un mensaje de verdad para averiguarlo.
      sms: sms && sms.enabled ? 'configurado' : 'sin configurar',
      claveTesorero: config.adminPasswordConfigurada
        ? 'configurada'
        : 'autogenerada (cambia en cada reinicio)',
      endpoints: {
        'GET /chat': 'Consola web (crear cuenta / iniciar sesión)',
        'GET /libro': 'Libro público de movimientos, sin cuenta',
        'GET /api/libro': 'Movimientos en JSON { limit, before }',
        'GET /api/libro/verificar': 'Revisa la cadena de hashes entera',
        'POST /api/signup': 'Crear cuenta { name, phone, email, pin }',
        'POST /api/login': 'Iniciar sesión { phone, pin } → token',
        'GET /api/me?token=': 'Datos de la sesión actual',
        'POST /webhook/sms': 'Ejecuta un comando { Body, token }',
      },
    });
  });

  return app;
}

module.exports = { createApp };
