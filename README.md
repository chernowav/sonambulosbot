# 🎭 SONÁMBULOS — Bot WhatsApp para Eventos

Sistema de monedas digitales para eventos Sonámbulos, construido con Node.js, MongoDB y Twilio.

**Evento MVP:** 3 Octubre 2026

## Stack

- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas
- **Messaging:** Twilio WhatsApp API
- **Hosting:** Railway

## Variables de entorno

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER      # formato: whatsapp:+57XXXXXXXXXX
MONGODB_URI
PORT=3000
NODE_ENV=production
ADMIN_PASSWORD
BOT_NAME=Sonámbulos
EVENT_ID=event_oct3_2026
```

## Endpoints

- `GET /` — health check
- `POST /webhook/whatsapp` — recibe mensajes de Twilio
- `POST /admin/setup` — habilita tesorero (body: `password`, `treasurerPhone`)

## Comandos del bot

`/register [nombre]` · `/balance` · `/history` · `/transfer @usuario X` ·
`/emit @usuario X` (solo admin) · `/users` · `/help`
