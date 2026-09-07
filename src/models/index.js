const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, unique: true, required: true },
  name: String,
  balance: { type: Number, default: 0 },
  isArtist: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const coinSchema = new mongoose.Schema({
  coinId: { type: String, unique: true, required: true },
  owner: { type: String, required: true },
  value: { type: Number, default: 1 },
  type: { type: String, enum: ['consumible', 'coleccionable'], default: 'consumible' },
  history: [
    {
      from: String,
      to: String,
      action: String, // 'emitted', 'transferred', 'redeemed'
      timestamp: Date,
      eventId: String,
    },
  ],
  valid: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  eventId: String,
});

const eventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, required: true },
  name: String,
  date: Date,
  location: String,
  treasurerPhone: String,
  coinsEmitted: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const transactionSchema = new mongoose.Schema({
  from: String,
  to: String,
  coinIds: [String],
  action: String,
  description: String,
  timestamp: { type: Date, default: Date.now },
  eventId: String,
  visible: { type: Boolean, default: true },
});

module.exports = {
  User: mongoose.model('User', userSchema),
  Coin: mongoose.model('Coin', coinSchema),
  Event: mongoose.model('Event', eventSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
};
