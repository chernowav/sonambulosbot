const crypto = require('crypto');
const { User, Coin, Transaction, UniverseContent, Setting, LedgerHead } = require('../models');
const { generatePin, hashPin } = require('../utils/pin');
const { GENESIS, hashEntry } = require('../services/ledger');

// Si dos transferencias intentan colgarse del mismo eslabón, una reintenta.
const LEDGER_RETRIES = 6;

function isDuplicateKey(error) {
  return Boolean(error) && error.code === 11000;
}

// Capa de acceso a datos usada por los comandos del bot. Aislar Mongoose
// detrás de esta interfaz (getUser, transfer, emitCoins, ...) es lo que
// permite probar la lógica de negocio en test/ con un store en memoria,
// sin depender de una base de datos real.
function createMongoStore({ treasurerPhone }) {
  async function promoteIfTreasurer(user) {
    if (user && !user.isAdmin && treasurerPhone && user.phoneNumber === treasurerPhone) {
      user.isAdmin = true;
      await user.save();
    }
    return user;
  }

  // Promueve también al leer, no solo al crear la cuenta: si TREASURER_PHONE
  // se configura después de que el tesorero se registró, igual queda admin la
  // próxima vez que entra. Escribe una sola vez — después isAdmin ya es true.
  async function getUser(phoneNumber) {
    return promoteIfTreasurer(await User.findOne({ phoneNumber }));
  }

  async function getOrCreateUser(phoneNumber, name = null) {
    let user = await User.findOne({ phoneNumber });
    if (!user) {
      user = new User({ phoneNumber, name: name || `Usuario ${phoneNumber.slice(-4)}` });
      await user.save();
    }
    return promoteIfTreasurer(user);
  }

  // Decremento condicional atómico: si dos transferencias del mismo usuario
  // llegan casi al mismo tiempo, Mongo solo aplica la que aún cumple
  // balance >= amount. La versión anterior leía el balance, lo restaba en
  // memoria y guardaba, lo que permitía a dos requests concurrentes leer el
  // mismo saldo y dejarlo en negativo.
  async function transfer(fromPhone, toPhone, amount) {
    const fromUser = await User.findOneAndUpdate(
      { phoneNumber: fromPhone, balance: { $gte: amount } },
      { $inc: { balance: -amount }, $set: { updatedAt: new Date() } },
      { new: true }
    );

    if (!fromUser) {
      const existing = await User.findOne({ phoneNumber: fromPhone });
      return {
        ok: false,
        reason: existing ? 'insufficient_funds' : 'not_registered',
        fromUser: existing,
      };
    }

    let toUser = await User.findOneAndUpdate(
      { phoneNumber: toPhone },
      { $inc: { balance: amount }, $set: { updatedAt: new Date() } },
      { new: true }
    );
    if (!toUser) {
      toUser = await getOrCreateUser(toPhone);
      toUser.balance += amount;
      await toUser.save();
    }

    return { ok: true, fromUser, toUser };
  }

  async function emitCoins(toPhone, amount, eventId) {
    const coinIds = [];
    for (let i = 0; i < amount; i += 1) {
      const coinId = `coin_${crypto.randomUUID()}`;
      await Coin.create({
        coinId,
        owner: toPhone,
        eventId,
        history: [{ from: 'SYSTEM', to: toPhone, action: 'emitted', timestamp: new Date(), eventId }],
      });
      coinIds.push(coinId);
    }

    await getOrCreateUser(toPhone);
    const toUser = await User.findOneAndUpdate(
      { phoneNumber: toPhone },
      { $inc: { balance: amount } },
      { new: true }
    );

    return { toUser, coinIds };
  }

  async function listUsers() {
    return User.find();
  }

  // Alta desde la pantalla de crear cuenta, con el PIN que eligió la persona.
  // El índice único de phoneNumber es el árbitro final: si dos registros del
  // mismo número llegan a la vez, el segundo cae en el catch y no crea un
  // usuario duplicado.
  async function createAccount({ phoneNumber, pin, email, name }) {
    const existing = await User.findOne({ phoneNumber });

    // Un usuario sin pinHash no es una cuenta: es el registro fantasma que
    // dejan transfer() y emitCoins() cuando le mandan monedas a un número que
    // todavía no se registró. Registrarse lo reclama (y conserva el saldo);
    // si lo tratáramos como "ya tiene cuenta", esa persona quedaría encerrada
    // afuera, sin poder registrarse ni iniciar sesión.
    if (existing) {
      if (existing.pinHash) return { ok: false, reason: 'phone_taken' };

      existing.name = name || existing.name;
      existing.email = email;
      existing.pinHash = hashPin(phoneNumber, pin);
      existing.updatedAt = new Date();
      await existing.save();
      return { ok: true, user: await promoteIfTreasurer(existing) };
    }

    try {
      const user = await User.create({
        phoneNumber,
        name: name || `Usuario ${phoneNumber.slice(-4)}`,
        email,
        pinHash: hashPin(phoneNumber, pin),
      });
      return { ok: true, user: await promoteIfTreasurer(user) };
    } catch (error) {
      if (isDuplicateKey(error)) return { ok: false, reason: 'phone_taken' };
      throw error;
    }
  }

  async function createTelegramLinkCode(phoneNumber) {
    const code = crypto.randomBytes(6).toString('base64url');
    const user = await User.findOneAndUpdate(
      { phoneNumber },
      { $set: { telegramLinkCode: code } },
      { new: true }
    );

    return user ? code : null;
  }

  // Consume el código al mismo tiempo que engancha el chat: hacerlo en una
  // sola operación evita que dos Start con el mismo enlace queden pegados a
  // la misma cuenta.
  async function linkTelegram(code, chatId) {
    if (!code) return null;

    return User.findOneAndUpdate(
      { telegramLinkCode: code },
      { $set: { telegramChatId: String(chatId) }, $unset: { telegramLinkCode: '' } },
      { new: true }
    );
  }

  async function unlinkTelegram(phoneNumber) {
    return User.findOneAndUpdate(
      { phoneNumber },
      { $unset: { telegramChatId: '', telegramLinkCode: '' } },
      { new: true }
    );
  }

  async function setName(phoneNumber, name) {
    return User.findOneAndUpdate(
      { phoneNumber },
      { $set: { name, updatedAt: new Date() } },
      { new: true }
    );
  }

  // Genera y guarda un PIN nuevo, sobreescribiendo el anterior. Lo usa el
  // tesorero cuando alguien olvidó el suyo.
  async function resetPin(phoneNumber) {
    const pin = generatePin();
    const user = await User.findOneAndUpdate(
      { phoneNumber },
      { $set: { pinHash: hashPin(phoneNumber, pin) } },
      { new: true }
    );
    return user ? pin : null;
  }

  async function verifyPin(phoneNumber, pin) {
    if (!pin) return false;
    const user = await User.findOne({ phoneNumber });
    if (!user || !user.pinHash) return false;
    return user.pinHash === hashPin(phoneNumber, pin);
  }

  // Agrega un movimiento al final de la cadena del libro público.
  //
  // Leer la punta y escribir el eslabón nuevo no es una sola operación, así
  // que entre las dos otra transferencia podría colarse. El compare-and-set
  // (avanzar la punta solo si sigue teniendo el hash que leímos) hace que la
  // perdedora reintente en vez de colgarse del mismo eslabón y partir la
  // cadena en dos.
  async function recordTransaction(data) {
    for (let attempt = 0; attempt < LEDGER_RETRIES; attempt += 1) {
      const head = await LedgerHead.findOneAndUpdate(
        { _id: 'libro' },
        { $setOnInsert: { index: 0, hash: GENESIS } },
        { new: true, upsert: true }
      );

      const entry = {
        ...data,
        index: head.index + 1,
        prevHash: head.hash,
        timestamp: data.timestamp || new Date(),
      };
      entry.hash = hashEntry(entry);

      const moved = await LedgerHead.findOneAndUpdate(
        { _id: 'libro', hash: head.hash },
        { $set: { index: entry.index, hash: entry.hash } }
      );

      if (moved) return Transaction.create({ ...entry, visible: true });
    }

    throw new Error('No se pudo escribir en el libro: demasiados movimientos a la vez.');
  }

  // Movimientos míos posteriores al que ya vi. Es lo que permite avisarle a
  // alguien que le llegaron monedas mientras tenía la consola abierta, sin
  // depender de ningún proveedor de mensajería.
  async function listMovementsSince(phoneNumber, sinceIndex = 0, limit = 20) {
    return Transaction.find({
      index: { $gt: Number(sinceIndex) || 0 },
      $or: [{ from: phoneNumber }, { to: phoneNumber }],
    })
      .sort({ index: 1 })
      .limit(limit);
  }

  // El libro completo, del más nuevo al más viejo, para mostrarlo por páginas.
  async function listLedger({ limit = 50, before } = {}) {
    const query = { index: { $exists: true } };
    if (before) query.index = { $exists: true, $lt: Number(before) };

    return Transaction.find(query).sort({ index: -1 }).limit(Math.min(limit, 200));
  }

  // En orden, desde el primero: así es como se verifica la cadena.
  async function listLedgerInOrder(limit = 2000) {
    return Transaction.find({ index: { $exists: true } }).sort({ index: 1 }).limit(limit);
  }

  // Valores que el servidor genera una vez y necesita conservar entre
  // reinicios. El upsert con captura de clave duplicada resuelve el caso de
  // dos instancias arrancando a la vez: gana la que escribió primero y la otra
  // relee su valor, en vez de quedar cada una con un secreto distinto.
  async function getOrCreateSetting(key, makeValue) {
    const existing = await Setting.findOne({ key });
    if (existing) return existing.value;

    const value = makeValue();
    try {
      await Setting.create({ key, value });
      return value;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const winner = await Setting.findOne({ key });
      if (!winner) throw error;
      return winner.value;
    }
  }

  async function listTransactionsFor(phoneNumber, limit = 10) {
    return Transaction.find({
      $or: [{ from: phoneNumber }, { to: phoneNumber }],
      visible: true,
    })
      .sort({ timestamp: -1 })
      .limit(limit);
  }

  // Un link de contenido puede etiquetar a varios talentos a la vez (los 6
  // capturados juntos en una misma locación); crea una entrada por cada uno
  // para que cada Universo tenga su propio feed.
  async function recordContent(link, artistPhones, addedBy) {
    const docs = await UniverseContent.insertMany(
      artistPhones.map((artistPhone) => ({ link, artistPhone, addedBy }))
    );
    return docs;
  }

  async function listContentForArtist(artistPhone, limit = 20) {
    return UniverseContent.find({ artistPhone }).sort({ createdAt: -1 }).limit(limit);
  }

  return {
    getUser,
    getOrCreateUser,
    transfer,
    emitCoins,
    listUsers,
    recordTransaction,
    listTransactionsFor,
    listLedger,
    listLedgerInOrder,
    listMovementsSince,
    getOrCreateSetting,
    recordContent,
    listContentForArtist,
    createAccount,
    setName,
    createTelegramLinkCode,
    linkTelegram,
    unlinkTelegram,
    verifyPin,
    resetPin,
  };
}

module.exports = { createMongoStore };
