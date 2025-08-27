const mongoose = require("mongoose");

const tripsPricingSchema = new mongoose.Schema(
  {
    // For drivers without subscription or on free plan
    distanceKmFrom: { type: Number, required: true },
    distanceKmTo: { type: Number, required: true },
    priceMinor: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    collection: "trips_pricing",
  }
);

tripsPricingSchema.index({ distanceKmFrom: 1, distanceKmTo: 1 }, { unique: true });

module.exports = mongoose.model("trips_pricing", tripsPricingSchema);
