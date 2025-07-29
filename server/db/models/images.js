const mongoose = require("mongoose");

const images = new mongoose.Schema({
  originalName: { type: String },
  filename: { type: String, required: true },
  url: { type: String },
  filePath: { type: String },
  fileSize: { type: Number },
  mimeType: { type: String },
  type: { type: String },
  category: { type: String, default: 'general' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
  phone: { type: String }, // for unregistered users
  otpId: { type: mongoose.Schema.Types.ObjectId }, // for unregistered users
  isActive: { type: Boolean, default: true }
},{
    timestamps : true,
});

module.exports = mongoose.model("images", images);
