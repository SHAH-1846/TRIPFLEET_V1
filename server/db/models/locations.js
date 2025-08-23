const mongoose = require("mongoose");

const locations = new mongoose.Schema(
  {
    circleName: {
      type: String,
      trim: true,
      required: true,
    },
    regionName: {
      type: String,
      trim: true,
      required: true,
    },
    divisionName: {
      type: String,
      trim: true,
      required: true,
    },
    officeName: {
      type: String,
      trim: true,
      required: true,
    },
    pincode: {
      type: String,
      trim: true,
      required: true,
    },
    officeType: {
      type: String,
      trim: true,
      required: true,
    },
    delivery: {
      type: String,
      trim: true,
      required: true,
    },
    district: {
      type: String,
      trim: true,
      required: true,
    },
    stateName: {
      type: String,
      trim: true,
      required: true,
    },
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude] - GeoJSON format
        required: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Text indexes for search functionality
locations.index({
  circleName: "text",
  regionName: "text",
  divisionName: "text",
  officeName: "text",
  pincode: "text",
  officeType: "text",
  delivery: "text",
  district: "text",
  stateName: "text",
});

// Individual indexes for better query performance
locations.index({ circleName: 1 });
locations.index({ regionName: 1 });
locations.index({ divisionName: 1 });
locations.index({ officeName: 1 });
locations.index({ pincode: 1 });
locations.index({ officeType: 1 });
locations.index({ district: 1 });
locations.index({ stateName: 1 });

// Geospatial index for location-based queries
locations.index({ coordinates: "2dsphere" });

// Compound indexes for common query patterns
locations.index({ stateName: 1, district: 1 });
locations.index({ stateName: 1, district: 1, officeType: 1 });
locations.index({ pincode: 1, officeType: 1 });

module.exports = mongoose.model("locations", locations);
