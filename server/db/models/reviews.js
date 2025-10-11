// db/models/reviews.js
const mongoose = require('mongoose');

const reviews = new mongoose.Schema({
  // Core linking
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'bookings', required: true, index: true }, // unique with rater
  trip: { type: mongoose.Schema.Types.ObjectId, ref: 'trips', required: true, index: true },
  customerRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'customer_requests', required: true, index: true },
  connectRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'connect_requests', index: true },

  // Parties
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },

  // Who wrote this review and who is being reviewed
  rater: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },
  ratee: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, index: true },

  // Roles for clarity and guard rails
  raterRole: { type: String, enum: ['driver','customer'], required: true, index: true },
  rateeRole: { type: String, enum: ['driver','customer'], required: true },

  // Rating content
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, trim: true, maxlength: 120 },
  comment: { type: String, trim: true, maxlength: 2000 },

  // Moderation and visibility
  isPublished: { type: Boolean, default: true, index: true },
  isReported: { type: Boolean, default: false },
  reportReason: { type: String, trim: true, maxlength: 500 },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  moderatedAt: { type: Date },

  // Audit
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
}, {
  timestamps: true,
  collection: 'reviews'
});

// Uniqueness: one review per rater per booking
reviews.index({ booking: 1, rater: 1 }, { unique: true });

// Helpful compound indexes
reviews.index({ ratee: 1, isPublished: 1, createdAt: -1 });
reviews.index({ driver: 1, isPublished: 1, createdAt: -1 });
reviews.index({ customer: 1, isPublished: 1, createdAt: -1 });

module.exports = mongoose.model('reviews', reviews);
