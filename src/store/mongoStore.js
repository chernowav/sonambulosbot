const crypto = require('crypto');
const { User, Coin, Transaction, UniverseContent } = require('../models');

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

  async function getUser(phoneNumber) {
    return User.findOne({ phoneNumber });
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

  async function recordTransaction(data) {
    return Transaction.create({ ...data, visible: true });
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
    recordContent,
    listContentForArtist,
  };
}

module.exports = { createMongoStore };
