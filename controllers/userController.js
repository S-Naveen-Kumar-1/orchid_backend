// controllers/userController.js
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");

const splitName = (fullName = "") => {
  const parts = String(fullName).trim().split(/\s+/);
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") || "" };
};

const isValidObjectId = (id) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

exports.registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, type } = req.body;
    if (!name || !email || !phone || !password || !type) return res.status(400).json({ message: "All fields are required" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const newUser = new User({ name, email, phone, password: hashedPassword, type });
    await newUser.save();

    const { first_name, last_name } = splitName(newUser.name);
    return res.status(201).json({
      message: "User registered successfully",
      user: { id: newUser._id, name: newUser.name, first_name, last_name, email: newUser.email, mobile: newUser.phone, type: newUser.type },
    });
  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || password === undefined || password === null) return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(String(password), String(user.password));
    if (!valid) return res.status(401).json({ message: "Invalid password" });

    const { first_name, last_name } = splitName(user.name);
    return res.status(200).json({
      message: "Login successful",
      user: { id: user._id, name: user.name, first_name, last_name, email: user.email, mobile: user.phone, type: user.type },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, "name email phone type");
    return res.status(200).json(users);
  } catch (err) {
    console.error("GetAllUsers Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Purchase plan endpoint (keeps same behavior but refuses purchase if active plan exists)
exports.purchasePlan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, title, price, duration } = req.body;
    if (!planId || !title || price == null || !duration) return res.status(400).json({ message: "All plan details are required" });
    if (!isValidObjectId(userId)) return res.status(400).json({ message: "Invalid userId" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Block if any active plan exists
    const anyActive = (user.purchasedPlans || []).some((p) => {
      if (p.status === "Active") {
        if (p.endDate) return new Date(p.endDate) > new Date();
        return true;
      }
      if (p.endDate) return new Date(p.endDate) > new Date();
      return false;
    });
    if (anyActive) return res.status(400).json({ message: "Cannot purchase while an active plan exists" });

    let months = parseInt(String(duration).replace(/[^\d]/g, ""), 10);
    if (isNaN(months) || months <= 0) months = 1;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    const newPlan = { planId: String(planId), title, price: String(price), duration: `${months} Month`, startDate, endDate, status: "Active" };

    user.purchasedPlans = user.purchasedPlans || [];
    user.purchasedPlans.push(newPlan);
    user.planActive = true;
    await user.save();

    return res.status(200).json({ message: "Plan activated", plan: newPlan });
  } catch (err) {
    console.error("purchasePlan error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const user = await User.findById(id).select("-password").populate({ path: "bookedServices.assignedSprayer", select: "name email phone" });
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json(user);
  } catch (err) {
    console.error("getUserById error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// Book service (requires active plan)
exports.bookService = async (req, res) => {
  try {
    const { userId } = req.params;
    const { field, address, pincode } = req.body;
    if (!field || !address || !pincode) return res.status(400).json({ message: "Field, Address, and Pincode are required" });
    if (!isValidObjectId(userId)) return res.status(400).json({ message: "Invalid userId" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const activePlan = (user.purchasedPlans || []).find((p) => {
      if (p.status === "Active") {
        if (p.endDate) return new Date(p.endDate) > new Date();
        return true;
      }
      if (p.endDate) return new Date(p.endDate) > new Date();
      return false;
    });
    if (!activePlan) return res.status(400).json({ message: "No active plan found" });

    const service = {
      serviceTitle: activePlan.title || "Fertilizer Spray",
      field,
      orchid: "Orchid A",
      spraysCount: 1,
      address,
      pincode,
      status: "Pending",
    };

    user.bookedServices = user.bookedServices || [];
    user.bookedServices.push(service);
    await user.save();
    return res.status(200).json({ message: "Service booked", service });
  } catch (err) {
    console.error("bookService error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// getAllBookedServices and assignServiceSlot remain similar to previous implementations
exports.getAllBookedServices = async (req, res) => {
  try {
    const users = await User.find({ "bookedServices.status": { $in: ["Pending", "In Progress"] } });
    const services = [];
    users.forEach((u) => {
      (u.bookedServices || []).forEach((s) => {
        services.push({ userId: u._id, userName: u.name, userPhone: u.phone, ...s.toObject() });
      });
    });
    return res.status(200).json(services);
  } catch (err) {
    console.error("getAllBookedServices error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.assignServiceSlot = async (req, res) => {
  try {
    const { serviceId, userId, scheduleDate, sprayerId } = req.body;
    if (!serviceId || !userId || !scheduleDate || !sprayerId) return res.status(400).json({ message: "All fields are required" });

    const conflicting = await User.findOne({ "bookedServices.scheduleDate": new Date(scheduleDate) });
    if (conflicting) return res.status(400).json({ message: "Slot already assigned" });

    const farmer = await User.findById(userId);
    if (!farmer) return res.status(404).json({ message: "Farmer not found" });
    const service = farmer.bookedServices.id(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

    service.scheduleDate = new Date(scheduleDate);
    service.status = "In Progress";
    service.assignedSprayer = sprayerId;
    await farmer.save();

    const sprayer = await User.findById(sprayerId);
    if (!sprayer) return res.status(404).json({ message: "Sprayer not found" });
    sprayer.assignedServices = sprayer.assignedServices || [];
    sprayer.assignedServices.push({ farmerId: farmer._id, serviceId: service._id, scheduleDate: new Date(scheduleDate), status: "In Progress" });
    await sprayer.save();

    return res.status(200).json({ message: "Assigned", service });
  } catch (err) {
    console.error("assignServiceSlot error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const { name, email, phone, password } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (password) user.password = await bcrypt.hash(String(password), 10);

    const updated = await user.save();
    return res.status(200).json({ message: "User updated", user: { id: updated._id, name: updated.name, email: updated.email, phone: updated.phone, type: updated.type } });
  } catch (err) {
    console.error("updateUser error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
