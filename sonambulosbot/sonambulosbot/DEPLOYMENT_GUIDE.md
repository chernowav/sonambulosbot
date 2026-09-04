# 🚀 GUÍA DE DEPLOYMENT — SONÁMBULOS BOT

## Resumen

Este es un bot de WhatsApp para manejar monedas en eventos Sonámbulos.

**Stack:**
- Node.js + Express (backend)
- MongoDB (base de datos)
- Twilio WhatsApp API
- DigitalOcean (hosting)

**Timeline:** 3-4 semanas para evento 3 Oct 2026

---

## FASE 1: Setup Inicial (Esta semana)

### Paso 1: Crear cuenta DigitalOcean
1. Ve a **https://www.digitalocean.com**
2. Sign up con tu email `sonambulosctg@gmail.com`
3. Agrega método de pago ($5/mes)

### Paso 2: Crear app en Twilio
1. Ve a **https://www.twilio.com**
2. Sign up
3. Crea un proyecto
4. En Console → Get Your API Keys
5. Copia `ACCOUNT_SID` y `AUTH_TOKEN`
6. Nota el número de WhatsApp Sandbox (ej: `+14155552368`)

### Paso 3: Crear base de datos MongoDB
1. Ve a **https://www.mongodb.com/cloud/atlas**
2. Sign up gratis
3. Crea un cluster
4. En Connect → Get connection string
5. Copia la URI (ej: `mongodb+srv://user:pass@cluster.mongodb.net/sonambulosbot`)

---

## FASE 2: Configuración Local (Semana 1-2)

### Paso 1: Instalar Node.js
```bash
# macOS
brew install node

# Linux
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
Descargar de https://nodejs.org
```

### Paso 2: Clonar/Descargar archivos
```bash
mkdir sonambulosbot
cd sonambulosbot

# Copiar estos 3 archivos aquí:
# - sonambulosbot-backend.js
# - package.json
# - .env.example
```

### Paso 3: Setup local
```bash
# Instalar dependencias
npm install

# Copiar archivo .env
cp .env.example .env

# Editar .env con tus valores
# nano .env (o usa tu editor)
```

### Paso 4: Archivo .env (completa con tus datos)
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155552368
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sonambulosbot
PORT=3000
ADMIN_PASSWORD=change_this_password_in_production
```

### Paso 5: Correr localmente
```bash
npm start

# Deberías ver:
# 🚀 Sonámbulos Bot running on port 3000
```

### Paso 6: Probar el bot
```bash
# En otra terminal, prueba:
curl http://localhost:3000

# Deberías ver:
# {"status":"Sonámbulos Bot running","email":"sonambulosctg@gmail.com","version":"1.0.0-beta"}
```

---

## FASE 3: Configurar Twilio Webhook (Semana 2)

### Para testing local (ngrok)

1. Instala ngrok
```bash
# macOS
brew install ngrok

# Linux
wget https://bin.equinox.io/c/4VmDzA7iaHb/ngrok-stable-linux-amd64.zip
unzip ngrok-stable-linux-amd64.zip
```

2. Expone tu localhost a internet
```bash
./ngrok http 3000

# Nota tu URL (ej: https://abc123.ngrok.io)
```

3. En Twilio Console:
   - Messaging → Try it out → Send a WhatsApp message
   - Webhook URL: `https://abc123.ngrok.io/webhook/whatsapp`
   - Method: POST

4. Prueba desde tu teléfono:
```
Envía a +14155552368 (Twilio Sandbox)
Mensaje: /help

El bot debería responder con la lista de comandos
```

---

## FASE 4: Desplegar en DigitalOcean (Semana 2-3)

### Paso 1: Crear App Platform en DigitalOcean

1. En DigitalOcean Dashboard → Apps
2. Click "Create App"
3. Conecta tu GitHub (o sube los archivos)
4. Elige Node.js como runtime
5. Configura el comando: `npm start`
6. Agrega variables de entorno (.env)

### Paso 2: Setup de variables en DigitalOcean
```
TWILIO_ACCOUNT_SID = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN = your_auth_token_here
TWILIO_WHATSAPP_NUMBER = whatsapp:+14155552368
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/sonambulosbot
PORT = 3000
ADMIN_PASSWORD = change_this_password_in_production
NODE_ENV = production
```

### Paso 3: Deploy
1. Click "Create App"
2. DigitalOcean construye y despliega
3. Te da una URL pública (ej: `https://sonambulosbot-abc123.ondigitalocean.app`)

### Paso 4: Actualizar Twilio Webhook
En Twilio Console:
- Webhook URL: `https://sonambulosbot-abc123.ondigitalocean.app/webhook/whatsapp`

---

## FASE 5: Configurar Tesorero (Semana 3)

### Setup Admin (correr UNA sola vez)

```bash
curl -X POST http://localhost:3000/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "password": "change_this_password_in_production",
    "treasurerPhone": "+573153811758"  # Tu número
  }'

# Respuesta esperada:
# {"message":"✅ Admin habilitado para +573153811758","balance":100}
```

### El tesorero ahora puede:
- `/emit @usuario 5` → Emitir 5 monedas
- `/users` → Ver todos los usuarios
- `/balance` → Ver su saldo

---

## FASE 6: Testing Completo (Semana 3)

### Flujo de prueba:

1. **Registrar usuarios**
```
Usuario A: /register Artista 1
Usuario B: /register Público 1
```

2. **Tesorero emite monedas**
```
/emit @usuarioA 2  → Artista A recibe 2 monedas
/emit @usuarioB 1  → Público B recibe 1 moneda
```

3. **Ver saldos**
```
Usuario A: /balance → "💰 Tu saldo: 2 monedas"
Usuario B: /balance → "💰 Tu saldo: 1 moneda"
```

4. **Transferencias**
```
Usuario A: /transfer @usuarioB 1
Usuario B: /balance → "💰 Tu saldo: 2 monedas"
```

5. **Ver historial**
```
/history → Muestra las últimas 10 transacciones
```

---

## FASE 7: Lanzamiento 3 Oct 2026

### Day before (2 Oct):

1. Verificar que todo funciona
2. Entrenar al tesorero (5 min)
3. Agregar a todos al grupo de WhatsApp
4. Probar commands básicos

### Día del evento (3 Oct):

1. **Setup físico:**
   - Tesorero con su número listo
   - Lista de asistentes

2. **Flujo:**
   - Asistente entra → se agrega al grupo
   - Bot da bienvenida automática
   - Asistente escribe `/register [nombre]`
   - Tesorero: `/emit @usuario 1` (entrada)
   - Asistente puede `/transfer` o ver `/balance`

3. **Canje de bebidas:**
   - Bartender ve que usuario tiene monedas
   - Usuario dice "canjeo 1 moneda"
   - Bartender notifica al tesorero
   - Tesorero: `/redeem @usuario 1` (comando a agregar)

---

## Comandos Disponibles

### Usuarios normales:
- `/register [nombre]` — Registrarte
- `/balance` — Ver tu saldo
- `/transfer @usuario X` — Enviar X monedas
- `/history` — Últimas transacciones
- `/help` — Ver todos los comandos

### Admin (Tesorero):
- `/emit @usuario X` — Emitir X monedas (SOLO ADMIN)
- `/users` — Listar todos los usuarios
- `/redeem @usuario X` — Canjar X monedas (a implementar)

---

## Troubleshooting

### El bot no responde
1. Verifica que el webhook esté configurado en Twilio
2. Verifica la URL en DigitalOcean es correcta
3. Mira los logs: `doctl app logs sonambulosbot`

### Errores de MongoDB
1. Verifica la URI en .env
2. Asegúrate que tu IP esté whitelisted en MongoDB Atlas
3. Intenta recrear el cluster

### Errores de Twilio
1. Verifica ACCOUNT_SID y AUTH_TOKEN
2. Asegúrate de usar el número de Sandbox correcto
3. Mira los Logs en Twilio Console

---

## Costos estimados

- **DigitalOcean:** $5/mes = ~20k COP/mes
- **Twilio WhatsApp:** $0.01-0.05 por mensaje = ~20-50k COP para evento
- **MongoDB Atlas:** Free tier (suficiente)
- **Total:** ~1-2M COP para 3 meses

---

## Siguiente: Fase de Extras

Una vez funcione el MVP, podemos agregar:
- Redención de bebidas
- Sistema de tatuajes/ropa
- Dashboard web para tesorero
- Confirmación de transacciones
- Sistema anti-fraude mejorado

---

**Preguntas? Email: sonambulosctg@gmail.com**
