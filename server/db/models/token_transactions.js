const mongoose = require("mongoose");

const tokenTransactionSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, trim: true },
    reference: { type: String, trim: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "token_purchase_plans" },
  },
  {
    timestamps: true,
    collection: "token_transactions",
  }
);

tokenTransactionSchema.index({ driver: 1, createdAt: -1 });

module.exports = mongoose.model("token_transactions", tokenTransactionSchema);
