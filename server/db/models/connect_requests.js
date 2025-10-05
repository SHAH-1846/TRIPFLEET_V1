const mongoose = require("mongoose");

const connect_requests = new mongoose.Schema(
  {
    // The user who initiated the connect request
    initiator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // The user who receives the connect request
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    // Reference to the customer request (lead) - required for all connections
    customerRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "customer_requests",
      required: true,
    },

    // Reference to the trip - required for all connections
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "trips",
      required: true,
    },

    // Status of the connect request
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled", "expired", "hold"],
      default: "pending",
    },

    // Whether the initiator has accepted (for mutual acceptance)
    initiatorAccepted: {
      type: Boolean,
      default: false,
    },

    // Whether the recipient has accepted
    recipientAccepted: {
      type: Boolean,
      default: false,
    },

    // Timestamp when the request was accepted by recipient
    acceptedAt: {
      type: Date,
    },

    // Timestamp when the request was accepted by initiator
    initiatorAcceptedAt: {
      type: Date,
    },

    // Timestamp when the request was rejected
    rejectedAt: {
      type: Date,
    },

    // Reason for rejection (if any)
    rejectionReason: {
      type: String,
      trim: true,
    },

    // Whether contact details have been shared (both parties accepted)
    contactDetailsShared: {
      type: Boolean,
      default: false,
    },

    // Timestamp when contact details were shared
    contactDetailsSharedAt: {
      type: Date,
    },

    // Token deduction information (for leads)
    tokenDeduction: {
      tokensRequired: {
        type: Number,
        default: 0,
      },
      tokensDeducted: {
        type: Number,
        default: 0,
      },
      deductedAt: {
        type: Date,
      },
    },

    // Whether the driver has sufficient tokens for this request
    hasSufficientTokens: {
      type: Boolean,
      default: true,
    },

    // Message from initiator (optional)
    message: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // Whether the request is active
    isActive: {
      type: Boolean,
      default: true,
    },

    // Audit fields
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
  },
  {
    timestamps: true,
    collection: "connect_requests",
  }
);

// Indexes for efficient queries
connect_requests.index({ initiator: 1, recipient: 1, customerRequest: 1, trip: 1 }, { unique: true });
connect_requests.index({ initiator: 1, status: 1 });
connect_requests.index({ recipient: 1, status: 1 });
connect_requests.index({ customerRequest: 1, trip: 1 });
connect_requests.index({ status: 1, isActive: 1 });

module.exports = mongoose.model("connect_requests", connect_requests);
