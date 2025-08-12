const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const driverConnection = new Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  requested: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Ensure unique connections between any two drivers
driverConnection.index({ requester: 1, requested: 1 }, { unique: true });

// Indexes for efficient queries
driverConnection.index({ requester: 1, status: 1 });
driverConnection.index({ requested: 1, status: 1 });
driverConnection.index({ status: 1, isActive: 1 });

module.exports = mongoose.model('driver_connections', driverConnection);
