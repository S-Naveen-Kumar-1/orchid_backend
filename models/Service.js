// models/Service.js
const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    serviceTitle: { type: String, required: true },
    field: { type: String, required: true },
    orchid: { type: String, default: 'Orchid A' },
    spraysCount: { type: Number, default: 1 },
    scheduleDate: { type: Date },
    assignedSprayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    address: { type: String, required: true },
    pincode: { type: String, required: true },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },

    // NEW: timestamp when service was completed
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Service', ServiceSchema);
