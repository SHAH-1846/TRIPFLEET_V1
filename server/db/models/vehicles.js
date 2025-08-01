const mongoose = require("mongoose");

const vehicles = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    vehicleNumber: {
      type: String,
      required: true,
      // unique: true,
      trim: true,
    },

    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vehicle_types",
      required: true,
    },

    vehicleBodyType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vehicle_body_types",
      required: true,
    },

    goodsAccepted: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "goods_accepted",
      // required: true,
    },

    termsAndConditionsAccepted: {
      type: Boolean,
      required: true,
      default: true,
    },

    vehicleCapacity: { type: Number, required: true }, // in kg or liters
    registrationYear: { type: Number },

    registrationCertificate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "documents",
    },

    status: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vehicle_status",
      default: "684bbcb5a9dcd0556d12b2a5",
    },

    brand: { type: String },
    model: { type: String },
    color: { type: String },

    truckImages: [
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

    isActive: {
      type: Boolean,
      default: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Custom validation for minimum 4 truck images
vehicles.pre('save', function(next) {
  if (this.truckImages && this.truckImages.length < 4) {
    return next(new Error('At least 4 truck images are required'));
  }
  next();
});

vehicles.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.truckImages && update.truckImages.length < 4) {
    return next(new Error('At least 4 truck images are required'));
  }
  next();
});

vehicles.pre('updateOne', function(next) {
  const update = this.getUpdate();
  if (update.truckImages && update.truckImages.length < 4) {
    return next(new Error('At least 4 truck images are required'));
  }
  next();
});

module.exports = mongoose.model("vehicles", vehicles);
