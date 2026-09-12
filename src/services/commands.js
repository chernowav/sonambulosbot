const { normalizePhone, isValidPhone } = require('../utils/phone');
const { parseAmount, parseSendArgs } = require('../utils/parse');
const { ALIAS } = require('../utils/comandos');

// Comandos del bot. Reciben el store como dependencia (en vez de importar
// los modelos de Mongoose directamente) para poder probarlos con un store
// en memoria en test/commands.test.js.
function createCommands(store, config, canales = {}) {
  const { sms, whatsapp, telegram } = canales;
  const commands = {};

  // Lo que se ve de alguien en el libro público: su nombre y los últimos 4
  // dígitos, suficiente para distinguir a dos personas que se llamen igual sin
  // publicar el teléfono de nadie.
  function etiqueta(user) {
    return `${user.name} @${String(user.phoneNumber).slice(-4)}`;
  }

  // Cascada de canales. Telegram y WhatsApp van antes que el SMS porque no
  // cobran por mensaje; el SMS lo cobran los operadores y queda de último
  // recurso para quien no tiene ninguno de los dos.
  //
  // Si un canal falla se intenta el siguiente de verdad, en vez de dar el
  // aviso por perdido: alguien puede tener Telegram vinculado y el bot
  // bloqueado, o WhatsApp sin haber entrado al sandbox.
  //
  // Todo esto va sin esperar respuesta: el aviso no es parte de la
  // transacción, y un proveedor lento no puede dejar a nadie mirando una
  // pantalla congelada por un movimiento que ya quedó hecho.
  function avisar(user, text) {
    if (!user) return;

    const cascada = async () => {
      if (telegram && telegram.enabled && user.telegramChatId) {
        if ((await telegram.send(user.telegramChatId, text)).ok) return 'telegram';
      }

      if (whatsapp && whatsapp.enabled) {
        if ((await whatsapp.send(user.phoneNumber, text)).ok) return 'whatsapp';
      }

      if (sms && sms.enabled) {
        if ((await sms.send(user.phoneNumber, text)).ok) return 'sms';
      }

      return null;
    };

    cascada().catch((error) => console.error(`No se pudo avisar: ${error.message}`));
  }

  // La cuenta se crea desde la pantalla de registro (POST /api/signup), que es
  // donde la persona elige su PIN. Acá /register solo cambia el nombre con el
  // que la consola se dirige a quien ya inició sesión.
  commands.register = async (phoneNumber, args) => {
    const name = args.join(' ').trim();
    if (!name) return '❌ Formato: /register [nombre]';

    const user = await store.setName(phoneNumber, name);
    if (!user) return '❌ Usuario no registrado.';

    return `✅ Ahora te llamamos: ${user.name}`;
  };

  // La Sol vencida se barre antes de mostrar o mover nada, y el vencimiento
  // queda anotado en el libro. Si se evaporara en silencio, las cuentas
  // públicas dejarían de cuadrar y el libro perdería su razón de ser.
  async function barrerSol(phoneNumber) {
    const barrido = await store.barrerSolVencida(phoneNumber);
    if (!barrido) return null;

    await store.recordTransaction({
      from: phoneNumber,
      to: 'VENCIMIENTO',
      fromLabel: etiqueta(barrido.user),
      toLabel: 'VENCIMIENTO',
      amount: barrido.vencio,
      moneda: 'sol',
      action: 'expiry',
      description: `Venció la Sol de ${barrido.user.name}`,
    });

    return barrido;
  }

  function comoQuedaste(user) {
    const sol = user.balanceSol
      ? `☀️ Sol: ${user.balanceSol} (tu entrada, incluye una bebida)\n`
      : '';
    return `${sol}🌙 Luna: ${user.balanceLuna}`;
  }

  commands.balance = async (phoneNumber) => {
    await barrerSol(phoneNumber);

    const user = await store.getUser(phoneNumber);
    if (!user) return '❌ Usuario no registrado.';

    let msg = `💰 Tu saldo:\n${comoQuedaste(user)}`;
    if (user.balanceSol && user.solExpiraEn) {
      const vence = new Date(user.solExpiraEn).toLocaleString('es-CO', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
      msg += `\n\n⏳ Tu Sol vence el ${vence}. Después de esa hora se pierde.`;
    }

    return msg;
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
  // El orden da igual: /enviar 5 @3001112233 y /enviar @3001112233 5 hacen lo
  // mismo. Un teléfono tiene diez dígitos y una cantidad no, así que no hay
  // forma de confundirlos — y nadie tiene que acordarse de cuál va primero
  // con la fila del bar esperando.
  commands.transfer = async (phoneNumber, args) => {
    if (args.length < 2) return '❌ Formato: /enviar @numero X  (o /enviar X @numero)';

    const destino = args.find((a) => a.startsWith('@') || isValidPhone(a));
    const cantidad = args.find((a) => a !== destino);

    if (!destino) return '❌ Número de destino inválido. Deben ser los 10 dígitos.';

    const toPhone = normalizePhone(destino.replace('@', ''));
    const amount = parseAmount(cantidad);

    if (Number.isNaN(amount)) return '❌ Cantidad debe ser número > 0';
    if (!isValidPhone(destino)) return '❌ Número de destino inválido. Deben ser los 10 dígitos.';
    if (toPhone === phoneNumber) return '❌ No puedes transferirte a ti mismo.';

    const result = await store.transfer(phoneNumber, toPhone, amount);
    if (!result.ok) {
      if (result.reason === 'not_registered') return '❌ No estás registrado.';
      // Se nombra la Luna a propósito: alguien con Sol suficiente pero sin
      // Luna se quedaría mirando "saldo insuficiente" sin entender por qué,
      // teniendo monedas en pantalla.
      return (
        `❌ No tienes suficiente Luna. Tienes: ${result.fromUser ? result.fromUser.balanceLuna : 0}\n` +
        '☀️ La Sol es tu entrada: se gasta en el bar, no se le pasa a nadie.'
      );
    }

    // El saldo ya se movió. Si el libro no alcanza a registrarlo, las monedas
    // habrían cambiado de manos sin dejar rastro — justo lo que el libro
    // existe para impedir. Antes de rendirse se devuelven a su dueño, para que
    // saldos y libro nunca cuenten historias distintas.
    let entry;
    try {
      entry = await store.recordTransaction({
        from: phoneNumber,
        to: toPhone,
        fromLabel: etiqueta(result.fromUser),
        toLabel: etiqueta(result.toUser),
        amount,
        moneda: 'luna',
        coinIds: [],
        action: 'transfer',
        description: `${result.fromUser.name} le envió ${amount} Luna a ${result.toUser.name}`,
      });
    } catch (error) {
      await store.transfer(toPhone, phoneNumber, amount);
      console.error(`Transferencia revertida, el libro no aceptó el movimiento: ${error.message}`);
      return '❌ No se pudo registrar el movimiento en el libro. Tus monedas siguen contigo, intenta de nuevo.';
    }

    // Las dos partes reciben su aviso, cada una con su propio saldo: quien
    // envía tiene tanto derecho a un comprobante como quien recibe.
    avisar(
      result.toUser,
      `${config.botName}: recibiste ${amount} Luna de ${result.fromUser.name}. ` +
        `Tu Luna: ${result.toUser.balanceLuna}. Movimiento #${entry.index} en el libro público.`
    );

    avisar(
      result.fromUser,
      `${config.botName}: enviaste ${amount} Luna a ${result.toUser.name}. ` +
        `Tu Luna: ${result.fromUser.balanceLuna}. Movimiento #${entry.index} en el libro público.`
    );

    return `✅ Enviaste ${amount} Luna a ${result.toUser.name}\n🌙 Te quedan: ${result.fromUser.balanceLuna}\n🔗 Movimiento #${entry.index} en el libro`;
  };

  commands.send = async (phoneNumber, args) => {
    const parsed = parseSendArgs(args);
    if (parsed.error === 'target') return '❌ Formato: /send 5 tokens to @numero';
    if (parsed.error === 'amount') return '❌ Cantidad debe ser número > 0';
    return commands.transfer(phoneNumber, [parsed.target, String(parsed.amount)]);
  };

  // Lee la lista de destinos de un comando de tesorero. Acepta varios a la
  // vez porque en la puerta hay una fila enfrente y uno por comando vuelve al
  // tesorero el cuello de botella de la noche.
  function leerDestinos(args) {
    const etiquetados = args.filter((a) => a.startsWith('@'));
    const crudos = etiquetados.length
      ? etiquetados.map((a) => a.replace('@', ''))
      : [args[0] || ''];

    return {
      invalidos: crudos.filter((a) => !isValidPhone(a)),
      // Sin el Set, repetir un número en la lista le cobraría dos veces.
      destinos: Array.from(new Set(crudos.filter(isValidPhone).map(normalizePhone))),
      resto: args.filter((a) => !a.startsWith('@')),
    };
  }

  // Vende entradas: una Sol por persona. Contar Soles emitidas es contar
  // entradas vendidas, así que nadie puede recibir dos.
  //
  //   /entrada @3001112233
  //   /entrada @3001112233 @3004445566 @3007778899
  commands.entrada = async (phoneNumber, args) => {
    const admin = await store.getUser(phoneNumber);
    if (!admin || !admin.isAdmin) return '❌ No tienes permisos de admin.';

    const { destinos, invalidos } = leerDestinos(args);

    if (!destinos.length) return '❌ Formato: /entrada @numero [@numero2 ...]';
    if (invalidos.length) {
      return `❌ Estos números no tienen 10 dígitos: ${invalidos.join(', ')}. No se vendió nada.`;
    }

    const vendidas = [];
    const repetidas = [];

    for (const toPhone of destinos) {
      const venta = await store.venderEntrada(toPhone, config.horasVigenciaSol);

      // Una entrada por persona por noche: si ya tiene su Sol, se avisa en vez
      // de venderle otra.
      if (!venta.ok) {
        repetidas.push(toPhone);
        continue;
      }

      const entry = await store.recordTransaction({
        from: 'TESORERIA',
        to: toPhone,
        fromLabel: 'TESORERIA',
        toLabel: etiqueta(venta.user),
        amount: 1,
        moneda: 'sol',
        action: 'entrada',
        description: `Entrada vendida a ${venta.user.name}`,
        eventId: config.defaultEventId,
      });

      avisar(
        venta.user,
        `${config.botName}: tu entrada quedó registrada. Incluye una bebida — ` +
          `pídela en el bar con tu ☀️ Sol. Vence en 24 horas. ` +
          `Movimiento #${entry.index} en el libro público.`
      );

      vendidas.push({ user: venta.user, entry });
    }

    let msg = vendidas.length
      ? `✅ ${vendidas.length} entrada(s) vendida(s):\n` +
        vendidas.map((v) => `• ${v.user.name} (#${v.entry.index})`).join('\n')
      : '⚠️ No se vendió ninguna entrada.';

    if (repetidas.length) {
      msg += `\n\n⚠️ Ya tenían entrada: ${repetidas.map((p) => `@${p.slice(-4)}`).join(', ')}`;
    }

    return msg;
  };

  // Recarga Luna, que es la que se compra y no vence.
  //
  //   /recarga @3001112233 50
  //   /recarga @3001112233 @3004445566 50
  commands.recarga = async (phoneNumber, args) => {
    const admin = await store.getUser(phoneNumber);
    if (!admin || !admin.isAdmin) return '❌ No tienes permisos de admin.';

    const { destinos, invalidos, resto } = leerDestinos(args);
    const amount = parseAmount(destinos.length && args.some((a) => a.startsWith('@')) ? resto[0] : args[1]);

    if (!destinos.length) return '❌ Formato: /recarga @numero [@numero2 ...] X';
    if (invalidos.length) {
      return `❌ Estos números no tienen 10 dígitos: ${invalidos.join(', ')}. No se recargó nada.`;
    }
    if (Number.isNaN(amount)) return '❌ Cantidad debe ser número > 0';

    const hechas = [];

    for (const toPhone of destinos) {
      const { user: toUser } = await store.recargarLuna(toPhone, amount);

      let entry;
      try {
        entry = await store.recordTransaction({
          from: 'TESORERIA',
          to: toPhone,
          fromLabel: 'TESORERIA',
          toLabel: etiqueta(toUser),
          amount,
          moneda: 'luna',
          action: 'recarga',
          description: `Recarga de ${amount} Luna a ${toUser.name}`,
          eventId: config.defaultEventId,
        });
      } catch (error) {
        // Monedas que no quedan en el libro no pueden quedar en el saldo. Se
        // devuelven las de esta persona y se corta, diciendo a quiénes sí
        // alcanzó: en medio del evento el tesorero necesita saber exactamente
        // por dónde retomar.
        await store.recargarLuna(toPhone, -amount).catch(() => {});
        console.error(`Recarga revertida para ${toPhone}: ${error.message}`);

        const yaHechas = hechas.map((h) => h.toUser.name).join(', ') || 'nadie';
        return `❌ El libro no aceptó la recarga a ${toUser.name}; se revirtió.\n✅ Alcanzaron a recibir: ${yaHechas}.\nVuelve a recargar solo a los que faltan.`;
      }

      avisar(
        toUser,
        `${config.botName}: te recargaron ${amount} 🌙 Luna. Tu Luna: ${toUser.balanceLuna}. ` +
          `Movimiento #${entry.index} en el libro público.`
      );

      hechas.push({ toUser, entry });
    }

    if (hechas.length === 1) {
      const { toUser, entry } = hechas[0];
      return `✅ Recargadas ${amount} Luna a ${toUser.name}\n🌙 Su Luna: ${toUser.balanceLuna}\n🔗 Movimiento #${entry.index} en el libro`;
    }

    let msg = `✅ Recargadas ${amount} Luna a ${hechas.length} personas (${amount * hechas.length} en total):\n`;
    hechas.forEach(({ toUser, entry }) => {
      msg += `• ${toUser.name} → ${toUser.balanceLuna} Luna (#${entry.index})\n`;
    });

    return msg.trimEnd();
  };

  // /emitir sigue existiendo y significa recargar Luna, que es lo que hacía.
  commands.emit = (...args) => commands.recarga(...args);

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
      msg += `${i + 1}. ${u.name} (@${u.phoneNumber.slice(-4)}) — ☀️ ${u.balanceSol || 0} Sol · 🌙 ${u.balanceLuna || 0} Luna\n`;
    });
    return msg;
  };

  // /help es el único comando que se puede pedir sin sesión, así que
  // phoneNumber puede llegar nulo.
  commands.help = async (phoneNumber) => {
    const user = phoneNumber ? await store.getUser(phoneNumber) : null;
    const isAdmin = user?.isAdmin;

    let msg = `📖 Comandos de ${config.botName}:\n\n`;
    msg += '☀️ Sol = tu entrada, incluye una bebida. Vence en 24h.\n';
    msg += '🌙 Luna = la que recargas. No vence.\n\n';
    msg += '/saldo — Ver tus Soles y Lunas\n';
    msg += '/bar X — Pagar en el bar (gasta la Sol primero)\n';
    msg += '/enviar 5 @numero — Pasarle Luna a alguien (la Sol no se pasa)\n';
    msg += '/historial — Tus últimos movimientos\n';
    msg += '/nombre [como te llamas] — Cambiar tu nombre\n';
    msg += '/ayuda — Esta lista\n';

    if (isAdmin) {
      msg += '\n👑 Tesorero (piden la clave):\n';
      msg += '/entrada @numero [@numero2 ...] — Vender entradas (1 Sol c/u)\n';
      msg += '/recarga @numero [@numero2 ...] X — Vender Luna\n';
      msg += '/usuarios — Ver la lista de gente\n';
      msg += '/contenido [link] @talento1 @talento2 — Publicar en sus Universos\n';
      msg += '/nuevopin @numero — Darle un PIN nuevo a quien lo olvidó\n';
    }

    return msg;
  };

  // Pagar en el bar es lo que más se va a hacer en la noche, así que tiene su
  // propio comando en vez de obligar a nadie a recordar el número del bar.
  commands.bar = async (phoneNumber, args) => {
    if (!config.barPhone) {
      return '❌ El bar todavía no está configurado. Avísale al tesorero.';
    }

    const amount = parseAmount(args[0]);
    if (Number.isNaN(amount)) return '❌ Formato: /bar X — cuánto pagas.';

    await barrerSol(phoneNumber);

    // Gasta Sol primero y Luna después, en una sola operación atómica.
    const pago = await store.pagar(phoneNumber, amount);
    if (!pago.ok) {
      if (pago.reason === 'not_registered') return '❌ No estás registrado.';
      const u = pago.user;
      return `❌ No te alcanza. Tienes ☀️ ${u ? u.balanceSol : 0} Sol y 🌙 ${u ? u.balanceLuna : 0} Luna.`;
    }

    const bar = await store.getUser(config.barPhone);
    const nombreBar = bar ? bar.name : 'el bar';
    const movimientos = [];

    // La Sol se canjea, no se transfiere: es un vale de bebida y al usarlo se
    // consume. La Luna sí cambia de manos y entra a la caja del bar.
    if (pago.usadoSol) {
      const entry = await store.recordTransaction({
        from: phoneNumber,
        to: 'BAR',
        fromLabel: etiqueta(pago.user),
        toLabel: nombreBar,
        amount: pago.usadoSol,
        moneda: 'sol',
        action: 'canje',
        description: `${pago.user.name} canjeó su bebida incluida`,
      });
      movimientos.push(entry.index);
    }

    if (pago.usadoLuna) {
      const { user: barUser } = await store.recargarLuna(config.barPhone, pago.usadoLuna);
      const entry = await store.recordTransaction({
        from: phoneNumber,
        to: config.barPhone,
        fromLabel: etiqueta(pago.user),
        toLabel: etiqueta(barUser),
        amount: pago.usadoLuna,
        moneda: 'luna',
        action: 'consumo',
        description: `${pago.user.name} pagó ${pago.usadoLuna} Luna en el bar`,
      });
      movimientos.push(entry.index);
    }

    avisar(
      pago.user,
      `${config.botName}: pagaste ${amount} en el bar` +
        (pago.usadoSol ? ` (☀️ ${pago.usadoSol} Sol` + (pago.usadoLuna ? ` + 🌙 ${pago.usadoLuna} Luna)` : ')') : '') +
        `. Te queda: ☀️ ${pago.user.balanceSol} Sol, 🌙 ${pago.user.balanceLuna} Luna.`
    );

    let msg = '✅ Pagado en el bar\n';
    if (pago.usadoSol) msg += `☀️ ${pago.usadoSol} Sol (tu bebida incluida)\n`;
    if (pago.usadoLuna) msg += `🌙 ${pago.usadoLuna} Luna\n`;
    msg += `\nTe queda: ☀️ ${pago.user.balanceSol} Sol · 🌙 ${pago.user.balanceLuna} Luna`;
    msg += `\n🔗 Movimiento${movimientos.length > 1 ? 's' : ''} #${movimientos.join(', #')} en el libro`;

    return msg;
  };

  // Los nombres en español apuntan a las mismas funciones, no son copias: si
  // mañana cambia /transfer, /enviar cambia con él.
  Object.entries(ALIAS).forEach(([es, en]) => {
    commands[es] = (...args) => commands[en](...args);
  });

  return commands;
}

module.exports = { createCommands };
