const mongoose = require("mongoose");

const customer_requests = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    pickupLocation: {
      address: { type: String, required: true },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    dropoffLocation: {
      address: { type: String, required: true },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    distance: {
      value: Number, // in meters
      text: String, // readable, e.g., "120 km"
    },
    duration: {
      value: Number, // in seconds
      text: String, // e.g., "2 hours 15 mins"
    },
    packageDetails: {
      weight: { type: Number }, // in kg
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
      },
      description: { type: String },
    },
    images: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "images",
      },
    ],
    documents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "documents",
      },
    ],
    pickupTime: {
      type: Date,
      required: false,
    },
    status: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer_request_status",
      default: "684da101412825ef8b404711",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // NEW: Precomputed counters for connect requests
    connectStats: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      accepted: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      hold: { type: Number, default: 0 },
      updatedAt: { type: Date },
    },
    // matchedTrip: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "trips",
    //   required: false,
    // },
  },
  {
    timestamps: true,
    collection: "customer_requests",
  }
);

// Indexes for spatial queries (2dsphere on [lng, lat] arrays)
customer_requests.index({ "pickupLocation.coordinates": "2dsphere" });
customer_requests.index({ "dropoffLocation.coordinates": "2dsphere" });
// Text index to enable search on title and description
customer_requests.index({ title: "text", description: "text" });

// NEW: Indexes to accelerate filters/sorts by connect counts
customer_requests.index({ "connectStats.pending": -1, isActive: 1 });
customer_requests.index({ "connectStats.accepted": -1, isActive: 1 });
customer_requests.index({ "connectStats.rejected": -1, isActive: 1 });
customer_requests.index({ "connectStats.total": -1, isActive: 1 });

module.exports = mongoose.model("customer_requests", customer_requests);
