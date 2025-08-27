const mongoose = require("mongoose");

const freeTokenSettingsSchema = new mongoose.Schema(
  {
    tokensOnRegistration: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  },
  {
    timestamps: true,
    collection: "free_token_settings",
  }
);

module.exports = mongoose.model("free_token_settings", freeTokenSettingsSchema);
