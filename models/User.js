import mongoose from "mongoose";

// Plan schema for purchased plans
const planSchema = new mongoose.Schema(
  {
    planId: { type: String }, // "1", "2", etc.
    title: { type: String, required: true },
    price: { type: String, required: true },
    duration: { type: String, required: true }, // e.g., "1 Month"
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    status: { type: String, enum: ["Active", "Expired"], default: "Active" },
  },
  { _id: false }
);

// Service schema for farmer booked services
const serviceSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    orchid: { type: String, required: true },
    spraysCount: { type: Number, required: true },
    scheduleDate: { type: Date, required: false },
    assignedSprayer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    address: { type: String, required: true },
    pincode: { type: String, required: true },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed", "Cancelled"],
      default: "Pending",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true } // important: ensures each booked service has its own _id
);

// Assigned services schema for sprayers
const assignedServiceSchema = new mongoose.Schema(
  {
    farmerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    scheduleDate: { type: Date, required: true },
    status: { type: String, enum: ["In Progress", "Completed"], default: "In Progress" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// User schema
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    type: {
      type: String,
      enum: ["farmer", "sprayer", "admin"],
      required: true,
    },
    planActive: { type: Boolean, default: false },
    purchasedPlans: [planSchema],          // Plans purchased by farmer
    bookedServices: [serviceSchema],       // Services booked by farmer
    assignedServices: [assignedServiceSchema], // Services assigned to sprayer
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
