const mongoose = require("mongoose");

const bookings = new mongoose.Schema(
  {
    // Required identifiers
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "trips",
      required: true,
      index: true,
    },
    customerRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer_requests",
      required: true,
      unique: true, // ensure one request is booked only once
      index: true,
    },
    // Parties
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    initiator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    connectRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "connect_requests",
    },

    // Booking details
    price: { type: Number },
    pickupDate: { type: Date },
    notes: { type: String, trim: true },

    // Status lifecycle
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected", "cancelled", "completed"],
      default: "pending",
      index: true,
    },
    initiatorAccepted: { type: Boolean, default: true },
    recipientAccepted: { type: Boolean, default: false },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
    cancelledAt: { type: Date },
    completedAt: { type: Date },

    isActive: { type: Boolean, default: true },
    bookedAt: { type: Date },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    collection: "bookings",
  }
);

bookings.index({ trip: 1, status: 1 });
bookings.index({ driver: 1, status: 1 });
bookings.index({ customer: 1, status: 1 });

module.exports = mongoose.model("bookings", bookings);
