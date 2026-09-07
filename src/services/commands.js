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
    let msg = `✅ Registrado como: ${user.name}\n💰 Saldo inicial: ${user.balance} monedas`;

    // Solo se genera una vez: si el usuario ya existía con PIN, ensurePin
    // devuelve null y no lo repite en el mensaje.
    const pin = await store.ensurePin(phoneNumber);
    if (pin) msg += `\n🔑 Tu PIN: ${pin} — lo vas a necesitar para transferir. Apúntalo.`;

    return msg;
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

  commands.transfer = async (phoneNumber, args, context = {}) => {
    if (args.length < 2) return '❌ Formato: /transfer @usuario X';

    const toPhone = normalizePhone(args[0].replace('@', ''));
    const amount = parseAmount(args[1]);

    if (Number.isNaN(amount)) return '❌ Cantidad debe ser número > 0';
    if (!toPhone) return '❌ Número de destino inválido';

    // El teléfono en /chat no viene verificado por nadie (no hay Twilio de
    // por medio); el PIN es lo único que confirma que quien transfiere es
    // realmente el dueño de ese número. Se marca "locked" (no un simple
    // string de error) para que el cliente sepa que debe pedir el PIN y
    // reintentar, igual que ya hace con la clave de tesorero.
    const pinOk = await store.verifyPin(phoneNumber, context.pin);
    if (!pinOk) {
      return { locked: true, reason: 'pin', response: '🔒 PIN requerido o incorrecto.' };
    }

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

  commands.send = async (phoneNumber, args, context) => {
    const parsed = parseSendArgs(args);
    if (parsed.error === 'target') return '❌ Formato: /send 5 tokens to @numero';
    if (parsed.error === 'amount') return '❌ Cantidad debe ser número > 0';
    return commands.transfer(phoneNumber, [parsed.target, String(parsed.amount)], context);
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

  commands.help = async (phoneNumber) => {
    const user = await store.getUser(phoneNumber);
    const isAdmin = user?.isAdmin;

    let msg = '📖 Comandos Sonámbulos:\n\n';
    msg += '/register [nombre] — Registrarte\n';
    msg += '/balance — Ver tu saldo\n';
    msg += '/transfer @usuario X — Enviar X monedas (pide tu PIN)\n';
    msg += '/send X tokens to @numero — Enviar X (o 1 si omites X, pide tu PIN)\n';
    msg += '/history — Últimas transacciones\n';

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
