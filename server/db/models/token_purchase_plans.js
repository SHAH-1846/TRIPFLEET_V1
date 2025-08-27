const mongoose = require("mongoose");

const tokenPurchasePlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    tokensAmount: { type: Number, required: true, min: 1 },
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    collection: "token_purchase_plans",
  }
);

tokenPurchasePlanSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("token_purchase_plans", tokenPurchasePlanSchema);
