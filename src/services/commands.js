const { normalizePhone } = require('../utils/phone');
const { parseAmount, parseSendArgs } = require('../utils/parse');

// Comandos del bot. Reciben el store como dependencia (en vez de importar
// los modelos de Mongoose directamente) para poder probarlos con un store
// en memoria en test/commands.test.js.
function createCommands(store, config, canales = {}) {
  const { sms, telegram } = canales;
  const commands = {};

  // El SMS avisa; no forma parte de la transacción. Si el proveedor está
  // lento o caído, quien transfirió no se queda esperando diez segundos
  // frente a una pantalla congelada: el movimiento ya quedó registrado.
  // Lo que se ve de alguien en el libro público: su nombre y los últimos 4
  // dígitos, suficiente para distinguir a dos personas que se llamen igual sin
  // publicar el teléfono de nadie.
  function etiqueta(user) {
    return `${user.name} @${String(user.phoneNumber).slice(-4)}`;
  }

  // Telegram primero: es gratis y llega con el nombre del bot del evento. El
  // SMS queda de respaldo para quien no vinculó el bot, y solo sale si hay
  // credenciales configuradas.
  function avisar(user, text) {
    if (!user) return;

    const fallo = (canal) => (error) =>
      console.error(`No se pudo avisar por ${canal}: ${error.message}`);

    if (telegram && telegram.enabled && user.telegramChatId) {
      telegram.send(user.telegramChatId, text).catch(fallo('Telegram'));
      return;
    }

    if (sms && sms.enabled) {
      sms.send(user.phoneNumber, text).catch(fallo('SMS'));
    }
  }

  // La cuenta se crea desde la pantalla de registro (POST /api/signup), que es
  // donde la persona elige su PIN. Acá /register solo cambia el nombre con el
  // que la consola se dirige a quien ya inició sesión.
  commands.register = async (phoneNumber, args) => {
    const name = args.join(' ').trim();
    if (!name) return '❌ Formato: /register [nombre]';

    const user = await store.setName(phoneNumber, name);
    if (!user) return '❌ Usuario no registrado.';

    return `✅ Ahora te llamamos: ${user.name}\n💰 Tu saldo: ${user.balance} monedas`;
  };

  commands.balance = async (phoneNumber) => {
    const user = await store.getUser(phoneNumber);
    if (!user) return '❌ Usuario no registrado. Usa /register [nombre]';
    return `💰 Tu saldo: ${user.balance} monedas\n📱 Teléfono: ${phoneNumber}`;
  };

  commands.history = async (phoneNumber) => {
    const transactions = await store.listTransactionsFor(phoneNumber, 10);
    if (transactions.length === 0) return 'No hay transacciones aún.';

    let msg = '📜 Últimas 10 transacciones:\n';
    transactions.forEach((t, i) => {
      const date = new Date(t.timestamp).toLocaleString('es-CO');
      msg += `${i + 1}. ${t.description} (${date})\n`;
    });
    return msg;
  };

  // Quién transfiere ya está probado por la sesión (el webhook saca el
  // teléfono del token firmado, no del body), así que acá no se vuelve a
  // pedir el PIN.
  commands.transfer = async (phoneNumber, args) => {
    if (args.length < 2) return '❌ Formato: /transfer @usuario X';

    const toPhone = normalizePhone(args[0].replace('@', ''));
    const amount = parseAmount(args[1]);

    if (Number.isNaN(amount)) return '❌ Cantidad debe ser número > 0';
    if (!toPhone) return '❌ Número de destino inválido';
    if (toPhone === phoneNumber) return '❌ No puedes transferirte a ti mismo.';

    const result = await store.transfer(phoneNumber, toPhone, amount);
    if (!result.ok) {
      if (result.reason === 'not_registered') return '❌ No estás registrado.';
      return `❌ Saldo insuficiente. Tienes: ${result.fromUser ? result.fromUser.balance : 0}`;
    }

    const entry = await store.recordTransaction({
      from: phoneNumber,
      to: toPhone,
      fromLabel: etiqueta(result.fromUser),
      toLabel: etiqueta(result.toUser),
      amount,
      coinIds: [],
      action: 'transfer',
      description: `Transferencia de ${amount} monedas de ${result.fromUser.name} a ${result.toUser.name}`,
    });

    // Las dos partes reciben su aviso, cada una con su propio saldo: quien
    // envía tiene tanto derecho a un comprobante como quien recibe.
    avisar(
      result.toUser,
      `${config.botName}: recibiste ${amount} monedas de ${result.fromUser.name}. ` +
        `Tu saldo: ${result.toUser.balance}. Movimiento #${entry.index} en el libro público.`
    );

    avisar(
      result.fromUser,
      `${config.botName}: enviaste ${amount} monedas a ${result.toUser.name}. ` +
        `Tu saldo: ${result.fromUser.balance}. Movimiento #${entry.index} en el libro público.`
    );

    return `✅ Transferencia completada!\n📤 Enviaste: ${amount} monedas\n💰 Tu nuevo saldo: ${result.fromUser.balance}\n🔗 Movimiento #${entry.index} en el libro`;
  };

  commands.send = async (phoneNumber, args) => {
    const parsed = parseSendArgs(args);
    if (parsed.error === 'target') return '❌ Formato: /send 5 tokens to @numero';
    if (parsed.error === 'amount') return '❌ Cantidad debe ser número > 0';
    return commands.transfer(phoneNumber, [parsed.target, String(parsed.amount)]);
  };

  commands.emit = async (phoneNumber, args) => {
    const user = await store.getUser(phoneNumber);
    if (!user || !user.isAdmin) return '❌ No tienes permisos de admin.';
    if (args.length < 2) return '❌ Formato: /emit @usuario X [event_id]';

    const toPhone = normalizePhone(args[0].replace('@', ''));
    const amount = parseAmount(args[1]);
    const eventId = args[2] || config.defaultEventId;

    if (Number.isNaN(amount)) return '❌ Cantidad debe ser número > 0';
    if (!toPhone) return '❌ Número de destino inválido';

    const { toUser, coinIds } = await store.emitCoins(toPhone, amount, eventId);

    const entry = await store.recordTransaction({
      from: 'TESORERO',
      to: toPhone,
      fromLabel: 'TESORERO',
      toLabel: etiqueta(toUser),
      amount,
      coinIds,
      action: 'emission',
      description: `Tesorero emitió ${amount} monedas a ${toUser.name}`,
      eventId,
    });

    avisar(
      toUser,
      `${config.botName}: te emitieron ${amount} monedas. Tu saldo: ${toUser.balance}. ` +
        `Movimiento #${entry.index} en el libro público.`
    );

    return `✅ Emitidas ${amount} monedas a ${toUser.name}\n📊 Nuevo saldo: ${toUser.balance}\n🔗 Movimiento #${entry.index} en el libro`;
  };

  // /content [link] @artista1 @artista2 ... — el productor pega el link ya
  // editado y etiqueta a todos los talentos capturados en esa locación; cada
  // uno recibe su propia entrada en el feed de Universos. Gateado como admin
  // por ahora: aún no existe un rol de "productor" separado del tesorero.
  commands.content = async (phoneNumber, args) => {
    const user = await store.getUser(phoneNumber);
    if (!user || !user.isAdmin) return '❌ No tienes permisos de admin.';

    const link = args.find((a) => /^https?:\/\//.test(a));
    if (!link) return '❌ Formato: /content [link] @talento1 @talento2 ...';

    const targets = args
      .filter((a) => a.startsWith('@'))
      .map((a) => normalizePhone(a.replace('@', '')))
      .filter(Boolean);

    if (targets.length === 0) return '❌ Etiqueta al menos un talento con @numero';

    await store.recordContent(link, targets, phoneNumber);

    return `✅ Contenido publicado para ${targets.length} talento(s).`;
  };

  // /resetpin @usuario — el tesorero genera un PIN nuevo cuando alguien lo
  // olvida y se lo dice de viva voz en el evento; no hay forma de
  // recuperarlo por chat porque eso anularía el propósito del PIN.
  commands.resetpin = async (phoneNumber, args) => {
    const user = await store.getUser(phoneNumber);
    if (!user || !user.isAdmin) return '❌ No tienes permisos de admin.';
    if (args.length < 1) return '❌ Formato: /resetpin @usuario';

    const target = normalizePhone(args[0].replace('@', ''));
    if (!target) return '❌ Número inválido';

    const pin = await store.resetPin(target);
    if (!pin) return '❌ Ese número no tiene cuenta.';

    return `✅ Nuevo PIN para @${target.slice(-4)}: ${pin}`;
  };

  commands.users = async (phoneNumber) => {
    const user = await store.getUser(phoneNumber);
    if (!user || !user.isAdmin) return '❌ No tienes permisos.';

    const users = await store.listUsers();
    let msg = '👥 Usuarios registrados:\n';
    users.forEach((u, i) => {
      msg += `${i + 1}. ${u.name} (@${u.phoneNumber.slice(-4)}) — ${u.balance} monedas\n`;
    });
    return msg;
  };

  // /help es el único comando que se puede pedir sin sesión, así que
  // phoneNumber puede llegar nulo.
  commands.help = async (phoneNumber) => {
    const user = phoneNumber ? await store.getUser(phoneNumber) : null;
    const isAdmin = user?.isAdmin;

    let msg = '📖 Comandos Sonámbulos:\n\n';
    msg += '/balance — Ver tu saldo\n';
    msg += '/transfer @usuario X — Enviar X monedas\n';
    msg += '/send X tokens to @numero — Enviar X (o 1 si omites X)\n';
    msg += '/history — Últimas transacciones\n';
    msg += '/register [nombre] — Cambiar tu nombre\n';

    if (isAdmin) {
      msg += '\n👑 Admin:\n';
      msg += '/emit @usuario X — Emitir monedas\n';
      msg += '/users — Listar usuarios\n';
      msg += '/content [link] @talento1 @talento2 — Publicar contenido en sus Universos\n';
      msg += '/resetpin @usuario — Generar un PIN nuevo para alguien que lo olvidó\n';
    }

    return msg;
  };

  return commands;
}

module.exports = { createCommands };
