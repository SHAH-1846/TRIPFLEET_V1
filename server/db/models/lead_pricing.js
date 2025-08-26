const mongoose = require("mongoose");

const leadPricingSchema = new mongoose.Schema(
  {
    // For drivers without subscription or on free plan
    distanceKmFrom: { type: Number, required: true },
    distanceKmTo: { type: Number, required: true },
    priceMinor: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "lead_pricing",
  }
);

leadPricingSchema.index({ distanceKmFrom: 1, distanceKmTo: 1 }, { unique: true });

module.exports = mongoose.model("lead_pricing", leadPricingSchema);


