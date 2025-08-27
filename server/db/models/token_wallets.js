const mongoose = require("mongoose");

const tokenWalletSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "users", unique: true, required: true },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "token_wallets",
  }
);

tokenWalletSchema.index({ driver: 1 }, { unique: true });

module.exports = mongoose.model("token_wallets", tokenWalletSchema);
