const { generatePin } = require('../src/utils/pin');

// Implementación en memoria de la misma interfaz que src/store/mongoStore.js,
// para poder probar src/services/commands.js sin una base de datos real.
function createFakeStore({ treasurerPhone } = {}) {
  const users = new Map();
  const transactions = [];
  const content = [];

  function makeUser(phoneNumber, name) {
    return {
      phoneNumber,
      name: name || `Usuario ${phoneNumber.slice(-4)}`,
      balance: 0,
      isArtist: false,
      isAdmin: Boolean(treasurerPhone) && phoneNumber === treasurerPhone,
      pin: null,
    };
  }

  return {
    async getUser(phoneNumber) {
      return users.get(phoneNumber) || null;
    },

    async getOrCreateUser(phoneNumber, name) {
      let user = users.get(phoneNumber);
      if (!user) {
        user = makeUser(phoneNumber, name);
        users.set(phoneNumber, user);
      }
      return user;
    },

    async transfer(fromPhone, toPhone, amount) {
      const fromUser = users.get(fromPhone);
      if (!fromUser) return { ok: false, reason: 'not_registered' };
      if (fromUser.balance < amount) return { ok: false, reason: 'insufficient_funds', fromUser };

      let toUser = users.get(toPhone);
      if (!toUser) {
        toUser = makeUser(toPhone);
        users.set(toPhone, toUser);
      }

      fromUser.balance -= amount;
      toUser.balance += amount;
      return { ok: true, fromUser, toUser };
    },

    async emitCoins(toPhone, amount, eventId) {
      let toUser = users.get(toPhone);
      if (!toUser) {
        toUser = makeUser(toPhone);
        users.set(toPhone, toUser);
      }
      toUser.balance += amount;
      const coinIds = Array.from({ length: amount }, (_, i) => `coin_test_${toPhone}_${i}_${eventId}`);
      return { toUser, coinIds };
    },

    async listUsers() {
      return Array.from(users.values());
    },

    async recordTransaction(data) {
      transactions.push(data);
      return data;
    },

    async listTransactionsFor(phoneNumber, limit = 10) {
      return transactions
        .filter((t) => t.from === phoneNumber || t.to === phoneNumber)
        .slice(-limit)
        .reverse();
    },

    async recordContent(link, artistPhones, addedBy) {
      const docs = artistPhones.map((artistPhone) => ({ link, artistPhone, addedBy }));
      content.push(...docs);
      return docs;
    },

    async listContentForArtist(artistPhone) {
      return content.filter((c) => c.artistPhone === artistPhone);
    },

    async ensurePin(phoneNumber) {
      const user = users.get(phoneNumber);
      if (!user || user.pin) return null;
      user.pin = generatePin();
      return user.pin;
    },

    async verifyPin(phoneNumber, pin) {
      const user = users.get(phoneNumber);
      return Boolean(user && user.pin && pin && user.pin === pin);
    },

    async resetPin(phoneNumber) {
      let user = users.get(phoneNumber);
      if (!user) {
        user = makeUser(phoneNumber);
        users.set(phoneNumber, user);
      }
      user.pin = generatePin();
      return user.pin;
    },

    _debug: { users, transactions, content },
  };
}

module.exports = { createFakeStore };
