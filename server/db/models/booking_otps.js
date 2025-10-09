// db/models/booking_otps.js
const mongoose = require('mongoose');

const booking_otps = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'bookings', required: true, index: true },
  kind: { type: String, enum: ['pickup','delivery'], required: true, index: true },
  code: { type: String, required: true },
  issuedTo: { type: String, enum: ['driver','customer'], required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  isActive: { type: Boolean, default: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
}, { timestamps: true, collection: 'booking_otps' });

booking_otps.index({ booking: 1, kind: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('booking_otps', booking_otps);
