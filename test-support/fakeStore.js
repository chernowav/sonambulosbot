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
      const user = users.get(phoneNumber) || null;
      // Igual que mongoStore: el tesorero queda admin aunque se haya
      // registrado antes de que se configurara su número.
      if (user && treasurerPhone && phoneNumber === treasurerPhone) user.isAdmin = true;
      return user;
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

    // Un usuario sin pin es el registro fantasma que deja una transferencia
    // hacia alguien que todavía no se registró; registrarse lo reclama.
    async createAccount({ phoneNumber, pin, email, name }) {
      const existing = users.get(phoneNumber);
      if (existing && existing.pin) return { ok: false, reason: 'phone_taken' };

      const user = existing || makeUser(phoneNumber, name);
      if (name) user.name = name;
      user.email = email;
      user.pin = pin;
      users.set(phoneNumber, user);
      return { ok: true, user };
    },

    async setName(phoneNumber, name) {
      const user = users.get(phoneNumber);
      if (!user) return null;
      user.name = name;
      return user;
    },

    async verifyPin(phoneNumber, pin) {
      const user = users.get(phoneNumber);
      return Boolean(user && user.pin && pin && user.pin === pin);
    },

    async resetPin(phoneNumber) {
      const user = users.get(phoneNumber);
      if (!user) return null;
      user.pin = generatePin();
      return user.pin;
    },

    _debug: { users, transactions, content },
  };
}

module.exports = { createFakeStore };
