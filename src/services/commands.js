const { normalizePhone } = require('../utils/phone');
const { parseAmount, parseSendArgs } = require('../utils/parse');

// Comandos del bot. Reciben el store como dependencia (en vez de importar
// los modelos de Mongoose directamente) para poder probarlos con un store
// en memoria en test/commands.test.js.
function createCommands(store, config) {
  const commands = {};

  commands.register = async (phoneNumber, args) => {
    const name = args.join(' ') || `Usuario ${phoneNumber.slice(-4)}`;
    const user = await store.getOrCreateUser(phoneNumber, name);
    return `✅ Registrado como: ${user.name}\n💰 Saldo inicial: ${user.balance} monedas`;
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

  commands.transfer = async (phoneNumber, args) => {
    if (args.length < 2) return '❌ Formato: /transfer @usuario X';

    const toPhone = normalizePhone(args[0].replace('@', ''));
    const amount = parseAmount(args[1]);

    if (Number.isNaN(amount)) return '❌ Cantidad debe ser número > 0';
    if (!toPhone) return '❌ Número de destino inválido';

    const result = await store.transfer(phoneNumber, toPhone, amount);
    if (!result.ok) {
      if (result.reason === 'not_registered') return '❌ No estás registrado.';
      return `❌ Saldo insuficiente. Tienes: ${result.fromUser ? result.fromUser.balance : 0}`;
    }

    await store.recordTransaction({
      from: phoneNumber,
      to: toPhone,
      coinIds: [],
      action: 'transfer',
      description: `Transferencia de ${amount} monedas de ${result.fromUser.name} a ${result.toUser.name}`,
    });

    return `✅ Transferencia completada!\n📤 Enviaste: ${amount} monedas\n💰 Tu nuevo saldo: ${result.fromUser.balance}`;
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

    await store.recordTransaction({
      from: 'TESORERO',
      to: toPhone,
      coinIds,
      action: 'emission',
      description: `✅ Tesorero emitió ${amount} monedas a ${toUser.name}`,
      eventId,
    });

    return `✅ Emitidas ${amount} monedas a ${toUser.name}\n📊 Nuevo saldo: ${toUser.balance}`;
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

  commands.help = async (phoneNumber) => {
    const user = await store.getUser(phoneNumber);
    const isAdmin = user?.isAdmin;

    let msg = '📖 Comandos Sonámbulos:\n\n';
    msg += '/register [nombre] — Registrarte\n';
    msg += '/balance — Ver tu saldo\n';
    msg += '/transfer @usuario X — Enviar X monedas\n';
    msg += '/send X tokens to @numero — Enviar X (o 1 si omites X)\n';
    msg += '/history — Últimas transacciones\n';

    if (isAdmin) {
      msg += '\n👑 Admin:\n';
      msg += '/emit @usuario X — Emitir monedas\n';
      msg += '/users — Listar usuarios\n';
      msg += '/content [link] @talento1 @talento2 — Publicar contenido en sus Universos\n';
    }

    return msg;
  };

  return commands;
}

module.exports = { createCommands };
