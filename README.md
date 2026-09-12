# PISO 26 — Moneda del evento

Sistema de monedas digitales para el evento Piso 26, construido con Node.js y MongoDB. La interfaz es una consola servida por el mismo backend en `/chat`, y todos los movimientos quedan en un libro público en `/libro`.

**Evento:** sábado 3 de octubre de 2026

## El libro público

Cada movimiento de monedas se encadena con el anterior mediante un hash
(`src/services/ledger.js`): el hash de cada entrada cubre su contenido **y** el
hash de la anterior. Editar una transacción vieja rompe los hashes de todas las
siguientes, así que la manipulación se nota sin tener que confiar en el
servidor.

No es una cadena de bloques distribuida y no pretende serlo: no hay minería ni
consenso entre nodos, porque aquí hay un solo operador. Lo que sí da es lo que
importa para el evento — **un registro público, íntegro y auditable**.

- `/libro` lo muestra y trae un botón que **recalcula la cadena entera en el
  navegador de quien mira**, con los datos públicos. Verificar no requiere
  creerle a este servidor.
- El hash cubre las etiquetas públicas (`Cherno @1758`), no los teléfonos
  completos. Si los cubriera, verificar desde afuera exigiría publicarlos.
- `GET /api/libro/verificar` hace la misma comprobación del lado del servidor,
  como conveniencia.

## Avisos por SMS

Quien recibe monedas recibe un mensaje de texto con el monto, su nuevo saldo y
el número de movimiento en el libro. Se envía por la API REST de Twilio
(`src/services/sms.js`), sin el SDK.

El aviso va aparte de la transacción: si el proveedor está caído, el movimiento
igual queda registrado y quien transfirió no espera a que Twilio responda. Sin
credenciales configuradas, la app funciona normal y no manda nada.

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
SESSION_SECRET             Opcional. Firma los tokens de sesión. Si no se define,
                           el servidor genera uno la primera vez y lo guarda en la
                           base, así que sobrevive a los reinicios igual.
TWILIO_ACCOUNT_SID         Opcional. Sin las tres de Twilio no se mandan avisos,
TWILIO_AUTH_TOKEN          pero todo lo demás funciona igual.
TWILIO_FROM
SMS_COUNTRY_CODE=+57
TREASURER_PHONE            Número (solo dígitos) promovido a admin automáticamente.
BOT_NAME=Piso 26
EVENT_ID=event_oct3_2026
```

## Endpoints

- `GET /` — health check
- `GET /chat` — crear cuenta, iniciar sesión y consola
- `GET /libro` — libro público de movimientos, sin cuenta
- `GET /api/libro` — movimientos en JSON (`limit`, `before`)
- `GET /api/libro/verificar` — revisa la cadena entera
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
