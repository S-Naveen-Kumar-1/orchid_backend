// models/User.js
const mongoose = require('mongoose');

const planSchema = new mongoose.Schema(
  {
    planId: { type: String },
    title: { type: String, required: true },
    price: { type: String, required: true },
    duration: { type: String, required: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ['Active', 'Expired'], default: 'Active' },
  },
  { _id: false }
);

const serviceSchema = new mongoose.Schema(
  {
    serviceTitle: { type: String },
    field: { type: String },
    orchid: { type: String },
    spraysCount: { type: Number, default: 1 },
    scheduleDate: { type: Date },
    assignedSprayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    address: { type: String },
    pincode: { type: String },
    status: { type: String, enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const assignedServiceSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  scheduleDate: { type: Date, required: true },
  status: { type: String, enum: ['In Progress', 'Completed'], default: 'In Progress' },
  createdAt: { type: Date, default: Date.now },
});

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
    pendingPayments: [
      {
        orderId: String,
        planId: String,
        amount: Number,
        currency: String,
        createdAt: Date,
      },
    ],
    payments: [
      {
        razorpayOrderId: String,
        razorpayPaymentId: String,
        amount: Number,
        currency: String,
        createdAt: Date,
        notes: Object,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
