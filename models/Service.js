// models/Service.js
const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema(
  {
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
    byUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who left feedback
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

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
    completedAt: { type: Date, default: null },

    // NEW: feedback array
    feedback: { type: [FeedbackSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Service', ServiceSchema);
