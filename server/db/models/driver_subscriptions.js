const mongoose = require("mongoose");

const driverSubscriptionSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "subscription_plans", required: true },
    status: { type: String, enum: ["active", "cancelled", "expired"], default: "active" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // Usage tracking
    leadsConsumed: { type: Number, default: 0 },
    leadsDistanceKmConsumed: { type: Number, default: 0 },
    tripsConsumed: { type: Number, default: 0 },
    tripsDistanceKmConsumed: { type: Number, default: 0 },
    // Payment
    priceMinorPaid: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    // Cancellation
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "driver_subscriptions",
  }
);

driverSubscriptionSchema.index({ driver: 1, status: 1, endDate: -1 });

module.exports = mongoose.model("driver_subscriptions", driverSubscriptionSchema);


