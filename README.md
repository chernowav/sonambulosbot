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
server.js                  Arma las dependencias reales (Mongo, config) y escucha
src/
  app.js                   Construye la app de Express a partir de sus dependencias
  config.js                Lee y valida las variables de entorno
  db.js                    Conexión a MongoDB
  models/index.js          Esquemas de Mongoose (User, Coin, Event, Transaction, UniverseContent)
  store/mongoStore.js      Acceso a datos real (balances atómicos vía Mongo)
  services/sessions.js     Emite y valida los tokens de sesión firmados (HMAC)
  services/messaging.js    Notificador (hoy solo deja rastro en el log; /chat ya muestra la respuesta)
  services/commands.js     Lógica de los comandos (/balance, /transfer, /content, ...)
  routes/auth.js           POST /api/signup, POST /api/login, GET /api/me
  routes/webhook.js        Handler compartido por /webhook/sms y /webhook/message
  routes/admin.js          POST /admin/setup
public/chat.html           Crear cuenta, iniciar sesión y consola, servido en GET /chat
test/                      Pruebas (node --test), con un store en memoria
.github/workflows/test.yml CI: corre `npm test` en cada push/PR a main
```

## Cuentas y sesión

La consola abre en una pantalla de **crear cuenta / iniciar sesión**:

- **Crear cuenta** pide nombre de usuario, teléfono, correo y un PIN de 4 dígitos
  que elige la persona. El PIN se guarda hasheado con el teléfono como sal
  (`sha256(telefono:pin)`); nunca se guarda ni se devuelve en claro.
- **Iniciar sesión** pide teléfono y PIN, y el botón *Verificar* devuelve un
  token de sesión firmado que vale 12 horas.
- Ese token es el que autoriza los comandos: el servidor saca de él el teléfono
  de quien opera y **ignora el que venga en el cuerpo del request**, así nadie
  puede escribir el número de otra persona y gastarle el saldo.
- Sin sesión válida, todo comando salvo `/help` responde
  `{ locked: true, reason: "auth" }` y la consola vuelve a pedir el PIN.

Si alguien recibe monedas antes de registrarse, se le crea un registro sin PIN;
cuando después crea su cuenta la reclama y conserva el saldo.

Quien olvide su PIN necesita que el tesorero le genere uno nuevo con
`/resetpin @usuario` y se lo diga en persona.

## Variables de entorno

Copia `.env.example` a `.env` y complétalo. Resumen:

```
MONGODB_URI                Requerido
PORT=3000
NODE_ENV=production
ADMIN_PASSWORD             Clave de tesorero para /emit, /users, /content y /admin/setup.
                           Si no se define, se genera una temporal en cada arranque
                           (se imprime en el log) — defínela para producción.
SESSION_SECRET             Firma los tokens de sesión. Si no se define, se genera
                           uno nuevo por arranque y cada redeploy cierra la sesión
                           de todos — defínelo para producción.
TREASURER_PHONE            Número (solo dígitos) promovido a admin automáticamente.
BOT_NAME=Sonámbulos
EVENT_ID=event_oct3_2026
```

## Endpoints

- `GET /` — health check
- `GET /chat` — crear cuenta, iniciar sesión y consola
- `POST /api/signup` — crea la cuenta (`name`, `phone`, `email`, `pin`) → `{ token, user }`
- `POST /api/login` — verifica el PIN (`phone`, `pin`) → `{ token, user }`
- `GET /api/me?token=` — datos de la sesión actual
- `POST /webhook/sms` — ejecuta un comando (`Body` + `token`)
- `POST /webhook/message` — alias del anterior, misma lógica
- `POST /admin/setup` — habilita tesorero (body: `password`, `treasurerPhone`)

## Comandos

Todos requieren sesión iniciada, salvo `/help`.

`/balance` · `/history` · `/transfer @usuario X` · `/send X tokens to @usuario` ·
`/register [nombre]` (cambia tu nombre) · `/help`

Admin (además de la sesión, piden la clave de tesorero):
`/emit @usuario X` · `/users` · `/content [link] @talento1 @talento2` ·
`/resetpin @usuario`

## Desarrollo

```
npm install
npm run dev     # nodemon, requiere .env con MONGODB_URI
npm test        # pruebas unitarias, no requiere base de datos
```

Cada push o PR a `main` corre la suite de tests automáticamente vía GitHub Actions (`.github/workflows/test.yml`).
