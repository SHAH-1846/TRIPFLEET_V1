const mongoose = require("mongoose");

const trips = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },

    tripAddedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "vehicles",
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },

    goodsType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'goods_accepted',
      required: true,
    },

    tripStartLocation: {
      address: String,
      coordinates: {
        type: [Number], // [lng, lat]
        required: true
      },
    },

    tripDestination: {
      address: String,
      coordinates: {
        type: [Number], // [lng, lat]
        required: true
      },
    },

    // routeCoordinates: [
    //   {
    //     lat: Number,
    //     lng: Number,
    //   },
    // ],

    routeGeoJSON: {
      type: {
        type: String,
        enum: ["LineString"],
        default: "LineString",
      },
      coordinates: {
        type: [[Number]], //[lng, lat]
      },
    },

    distance: {
      value: Number, // in meters
      text: String, // readable, e.g., "120 km"
    },

    duration: {
      value: Number, // in seconds
      text: String, // e.g., "2 hours 15 mins"
    },

    isStarted: {
      type: Boolean,
      default: false,
    },

    isActive : {
      type: Boolean,
      default: true,
    },

    status: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "trip_status",
      default: "684942f5ff32840ef8e726f0",
    },

    actualStartTime: Date,
    actualEndTime: Date,

    currentLocation: {
      type: { type: String, default: "Point" },
      coordinates: [Number], //[lng, lat]
    },
    
    lastUpdated: Date,
    tripDate: Date,
    startTime: String,
    endTime: String,
    tripStartDate: {
      type: Date,
      required: true,
    },
    tripEndDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true
    },
    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
  },
  {
    timestamps: true,
  }
);

trips.index({ "tripStartLocation.address": "text", "tripDestination.address": "text" });
//Add 2dsphere index for routeGeoJSON
trips.index({ routeGeoJSON: "2dsphere" });
//Add 2dsphere indexes for location coordinates
trips.index({ "tripStartLocation.coordinates": "2dsphere" });
trips.index({ "tripDestination.coordinates": "2dsphere" });
trips.index({ "currentLocation.coordinates": "2dsphere" });
module.exports = mongoose.model("trips", trips);
