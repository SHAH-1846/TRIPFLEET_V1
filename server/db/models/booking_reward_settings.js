const mongoose = require("mongoose");

const distanceSlabSchema = new mongoose.Schema({
    minKm: { type: Number, required: true, min: 0 },       // inclusive
    maxKm: { type: Number, required: true, min: 0 },       // exclusive; use a large number for “infinity”
    baseTokens: { type: Number, required: true, min: 0 },  // tokens to be apportioned by stage %

    // NEW: minimum elapsed-time thresholds (in minutes)
    minMinutesConfirmToPickup: { type: Number, required: true, min: 0 },
    minMinutesPickupToDelivery: { type: Number, required: true, min: 0 },
}, { _id: false });

const booking_reward_settings = new mongoose.Schema({
    isActive: { type: Boolean, default: true },

    // Percent shares per stage, 0..100; sum can be <= 100 to reserve headroom
    confirmationPct: { type: Number, required: true, min: 0, max: 100 },
    pickupPct: { type: Number, required: true, min: 0, max: 100 },
    deliveryPct: { type: Number, required: true, min: 0, max: 100 },

    // Distance-based slabs
    distanceSlabs: { type: [distanceSlabSchema], default: [] },

    effectiveAt: { type: Date, default: () => new Date() },

    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
}, {
    timestamps: true,
    collection: "booking_reward_settings",
});

// Optional index to quickly retrieve the active settings by recency
booking_reward_settings.index({ isActive: 1, effectiveAt: -1 });

module.exports = mongoose.model("booking_reward_settings", booking_reward_settings);
