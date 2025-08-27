const mongoose = require("mongoose");

const tripTokensSchema = new mongoose.Schema(
  {
    distanceKmFrom: { type: Number, required: true },
    distanceKmTo: { type: Number, required: true },
    tokensRequired: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    collection: "trip_tokens",
  }
);

tripTokensSchema.index({ distanceKmFrom: 1, distanceKmTo: 1 }, { unique: true });

module.exports = mongoose.model("trip_tokens", tripTokensSchema);
