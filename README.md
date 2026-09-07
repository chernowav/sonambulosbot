# 🎭 SONÁMBULOS — Bot WhatsApp/SMS para Eventos

Sistema de monedas digitales para eventos Sonámbulos, construido con Node.js, MongoDB y Twilio.

**Evento MVP:** 3 Octubre 2026

## Stack

- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas
- **Messaging:** Twilio (SMS; también acepta el número como remitente WhatsApp)
- **Hosting:** Railway

## Estructura del proyecto

```
server.js                  Punto de entrada: arma Express, rutas y servicios
src/
  config.js                Lee y valida las variables de entorno
  db.js                    Conexión a MongoDB
  models/index.js          Esquemas de Mongoose (User, Coin, Event, Transaction)
  store/mongoStore.js      Acceso a datos real (balances atómicos vía Mongo)
  services/messaging.js    Envío de SMS por Twilio (o solo log si no hay credenciales)
  services/commands.js     Lógica de los comandos del bot (/register, /transfer, ...)
  routes/webhook.js        Handler compartido por /webhook/sms y /webhook/message
  routes/admin.js          POST /admin/setup
public/chat.html           Consola de chat de prueba servida en GET /chat
test/                      Pruebas unitarias (node --test), con un store en memoria
```

## Variables de entorno

Copia `.env.example` a `.env` y complétalo. Resumen:

```
MONGODB_URI                Requerido
PORT=3000
NODE_ENV=production
ADMIN_PASSWORD             Clave de tesorero para /emit, /users y /admin/setup.
                           Si no se define, se genera una temporal en cada arranque
                           (se imprime en el log) — defínela para producción.
TREASURER_PHONE            Número (solo dígitos) promovido a admin automáticamente.
BOT_NAME=Sonámbulos
EVENT_ID=event_oct3_2026
DEFAULT_COUNTRY_CODE=+57
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER         # o TWILIO_WHATSAPP_NUMBER — cualquiera de los dos sirve
```

## Endpoints

- `GET /` — health check
- `POST /webhook/sms` — recibe mensajes en formato Twilio (`From`/`Body`) o JSON simple (`phone`/`message`)
- `POST /webhook/message` — alias JSON del anterior, misma lógica
- `POST /admin/setup` — habilita tesorero (body: `password`, `treasurerPhone`)
- `GET /chat` — consola de prueba en el navegador

## Comandos del bot

`/register [nombre]` · `/balance` · `/history` · `/transfer @usuario X` ·
`/send X tokens to @usuario` · `/emit @usuario X` (solo admin) · `/users` (solo admin) · `/help`

## Desarrollo

```
npm install
npm run dev     # nodemon, requiere .env con MONGODB_URI
npm test        # pruebas unitarias, no requiere base de datos
```
