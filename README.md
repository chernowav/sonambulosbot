# 🎭 SONÁMBULOS — Consola web para Eventos

Sistema de monedas digitales para eventos Sonámbulos, construido con Node.js y MongoDB. La interfaz es una consola de chat servida por el mismo backend en `/chat` — ya no depende de WhatsApp/Twilio.

**Evento MVP:** 3 Octubre 2026

## Stack

- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas
- **Interfaz:** consola de chat propia (`/chat`), sin proveedor de mensajería externo
- **Hosting:** Railway

## Estructura del proyecto

```
server.js                  Punto de entrada: arma Express, rutas y servicios
src/
  config.js                Lee y valida las variables de entorno
  db.js                    Conexión a MongoDB
  models/index.js          Esquemas de Mongoose (User, Coin, Event, Transaction, UniverseContent)
  store/mongoStore.js      Acceso a datos real (balances atómicos vía Mongo)
  services/messaging.js    Notificador (hoy solo deja rastro en el log; /chat ya muestra la respuesta)
  services/commands.js     Lógica de los comandos del bot (/register, /transfer, /content, ...)
  routes/webhook.js        Handler compartido por /webhook/sms y /webhook/message
  routes/admin.js          POST /admin/setup
public/chat.html           Consola de chat servida en GET /chat
test/                      Pruebas unitarias (node --test), con un store en memoria
.github/workflows/test.yml CI: corre `npm test` en cada push/PR a main
```

## Variables de entorno

Copia `.env.example` a `.env` y complétalo. Resumen:

```
MONGODB_URI                Requerido
PORT=3000
NODE_ENV=production
ADMIN_PASSWORD             Clave de tesorero para /emit, /users, /content y /admin/setup.
                           Si no se define, se genera una temporal en cada arranque
                           (se imprime en el log) — defínela para producción.
TREASURER_PHONE            Número (solo dígitos) promovido a admin automáticamente.
BOT_NAME=Sonámbulos
EVENT_ID=event_oct3_2026
```

## Endpoints

- `GET /` — health check
- `POST /webhook/sms` — recibe mensajes en formato Twilio-compatible (`From`/`Body`) o JSON simple (`phone`/`message`)
- `POST /webhook/message` — alias JSON del anterior, misma lógica
- `POST /admin/setup` — habilita tesorero (body: `password`, `treasurerPhone`)
- `GET /chat` — consola de chat en el navegador

## Comandos del bot

`/register [nombre]` · `/balance` · `/history` · `/transfer @usuario X` ·
`/send X tokens to @usuario` · `/emit @usuario X` (admin) · `/users` (admin) ·
`/content [link] @talento1 @talento2` (admin) · `/help`

## Desarrollo

```
npm install
npm run dev     # nodemon, requiere .env con MONGODB_URI
npm test        # pruebas unitarias, no requiere base de datos
```

Cada push o PR a `main` corre la suite de tests automáticamente vía GitHub Actions (`.github/workflows/test.yml`).
