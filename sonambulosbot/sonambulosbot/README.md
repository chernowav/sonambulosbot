# 🎭 SONÁMBULOS — Bot WhatsApp para Eventos

Sistema de monedas digitales para eventos Sonámbulos, construido con Node.js, MongoDB y Twilio.

**Email:** sonambulosctg@gmail.com  
**Teléfono:** +57 315 381 1758  
**Evento MVP:** 3 Octubre 2026

---

## ¿Qué es?

Un bot de WhatsApp que:
- 💰 Emite monedas para entradas de eventos
- 📱 Permite transferencias entre usuarios
- 📊 Registra todas las transacciones en un canal público
- 🔐 Sistema anti-fraude con historial de monedas
- 👑 Control admin para tesorero

---

## Arquitectura

```
WhatsApp User
      ↓
  Twilio API
      ↓
  Node.js/Express
      ↓
  MongoDB (datos)
      ↓
  Canal público (log de transacciones)
```

---

## Stack

- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas (free tier)
- **Messaging:** Twilio WhatsApp API
- **Hosting:** DigitalOcean ($5/mes)

---

## Flujo de Usuario

### Asistente en evento:

1. Se agrega al grupo de WhatsApp
2. Escribe `/register Juan` → Bot lo registra
3. Tesorero emite: `/emit @juan 1` → Recibe 1 moneda
4. Puede ver su saldo: `/balance`
5. Puede transferir: `/transfer @maria 0.5`
6. Canjea en bar: bartender registra consumo

---

## Instalación Local (5 min)

```bash
# 1. Clonar repo
git clone <repo_url>
cd sonambulosbot

# 2. Instalar dependencias
npm install

# 3. Setup .env
cp .env.example .env
# Editar .env con tus valores

# 4. Correr
npm start

# Deberías ver: 🚀 Sonámbulos Bot running on port 3000
```

---

## Deployment a DigitalOcean

Ver **DEPLOYMENT_GUIDE.md** para instrucciones paso a paso.

TL;DR:
1. Crea app en DigitalOcean
2. Conecta este repo
3. Agrega variables .env
4. Deploy (automático)

---

## Comandos Disponibles

### Para todos:
```
/register [nombre]      → Registrarte
/balance                → Ver tu saldo
/transfer @usuario X    → Enviar X monedas
/history                → Ver últimas transacciones
/help                   → Ver todos los comandos
```

### Admin (Tesorero):
```
/emit @usuario X        → Emitir X monedas
/users                  → Listar todos los usuarios
/redeem @usuario X      → Canjar X monedas [próximamente]
```

---

## Configuración Twilio

1. Crea cuenta en https://www.twilio.com
2. Obtén `ACCOUNT_SID` y `AUTH_TOKEN`
3. Agrega webhook: `POST /webhook/whatsapp`
4. Agrega variables .env

---

## Configuración MongoDB

1. Crea cuenta free en https://www.mongodb.com/cloud/atlas
2. Crea un cluster
3. Obtén connection string (URI)
4. Agrega a .env como `MONGODB_URI`

---

## Presupuesto

| Servicio | Precio | Notas |
|----------|--------|-------|
| DigitalOcean | $5/mes | Hosting |
| Twilio WhatsApp | $0.01-0.05/msg | ~20-50k COP por evento |
| MongoDB Atlas | Free | Suficiente para MVP |
| **Total** | **~1-2M COP** | Por 3 meses |

---

## Timeline

- **Semana 1:** Setup local + Twilio
- **Semana 2:** Testing + Deploy DigitalOcean
- **Semana 3:** Training tesorero + Últimas pruebas
- **3 Oct:** 🚀 Evento en vivo

---

## Próximas fases

Fase 1 (MVP): ✅ Sistema de monedas básico
Fase 2: Redención de bebidas
Fase 3: Tatuajes y ropa como coleccionables
Fase 4: Dashboard web para tesorero
Fase 5: Anti-fraude mejorado

---

## Soporte

Email: sonambulosctg@gmail.com  
Teléfono: +57 315 381 1758

---

**Made with ❤️ by Claude Code**
