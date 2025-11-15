// models/User.js
const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    planId: { type: String },
    title: { type: String, required: true },
    price: { type: String, required: true },
    duration: { type: String, required: true }, // e.g. "1 Month"
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ['Active', 'Expired'], default: 'Active' },
  },
  { _id: false }
);

const serviceSchema = new mongoose.Schema(
  {
    serviceTitle: { type: String, required: true },
    field: { type: String, required: true },
    orchid: { type: String, required: true },
    spraysCount: { type: Number, required: true },
    scheduleDate: { type: Date },
    assignedSprayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    address: { type: String, required: true },
    pincode: { type: String, required: true },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const assignedServiceSchema = new mongoose.Schema(
  {
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    scheduleDate: { type: Date, required: true },
    status: { type: String, enum: ['In Progress', 'Completed'], default: 'In Progress' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    type: { type: String, enum: ['farmer', 'sprayer', 'admin'], required: true },
    planActive: { type: Boolean, default: false },
    purchasedPlans: [planSchema],
    bookedServices: [serviceSchema],
    assignedServices: [assignedServiceSchema],
    pendingPayments: { type: Array, default: [] },
    payments: { type: Array, default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
