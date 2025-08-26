const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: false, trim: true },
    // Limits
    maxLeads: { type: Number, required: false },
    maxLeadsDistanceKm: { type: Number, required: false },
    maxTrips: { type: Number, required: false },
    maxTripsDistanceKm: { type: Number, required: false },
    // Duration in days
    durationDays: { type: Number, required: true },
    // Price for full duration in smallest currency unit (e.g., paise)
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "subscription_plans",
  }
);

subscriptionPlanSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("subscription_plans", subscriptionPlanSchema);


