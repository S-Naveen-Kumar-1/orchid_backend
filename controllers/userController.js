import bcrypt from "bcryptjs";
import User from "../models/User.js";

export const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, type } = req.body;

    if (!name || !email || !phone || !password || !type)
      return res.status(400).json({ message: "All fields are required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      type,
    });


    await newUser.save();
     const userResponse = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      type: newUser.type,
    };
    res.status(201).json({ message: "User registered successfully", user: userResponse });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Success response
    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        type: user.type,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email phone type'); 
    res.status(200).json(users);
  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
export const purchasePlan = async (req, res) => {
  try {
    const { userId } = req.params; // user ID from params
    const { planId, title, price, duration } = req.body; // plan info from frontend

    if (!planId || !title || !price || !duration) {
      return res.status(400).json({ message: "All plan details are required" });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Calculate end date
    const startDate = new Date();
    let months = parseInt(duration); // expects "1 Month" or "3 Months"
    if (isNaN(months)) months = 1; // fallback
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    // Expire any active plans
    user.purchasedPlans.forEach(p => {
      if (p.status === "Active") p.status = "Expired";
    });

    const newPlan = {
      planId: planId.toString(), // store as string
      title,
      price,
      duration,
      startDate,
      endDate,
      status: "Active",
    };

    // Add new plan
    user.purchasedPlans.push(newPlan);
    user.planActive = true;

    await user.save();

    res.status(200).json({ message: "Plan purchased successfully", plan: newPlan });
  } catch (error) {
    console.error("Purchase Plan Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password')
      .populate({
        path: 'bookedServices.assignedSprayer', // populate sprayer info
        select: 'name email phone', // only include these fields
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Get User Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const bookService = async (req, res) => {
  try {
    const { userId } = req.params;
    const { field, address, pincode } = req.body;

    if (!field || !address || !pincode) {
      return res.status(400).json({ message: "Field, Address, and Pincode are required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const activePlan = user.purchasedPlans?.find(p => p.status === "Active");
    if (!activePlan) return res.status(400).json({ message: "No active plan found" });

    // Assign service based on plan
    let serviceTitle = "Fertilizer Spray";
    let orchid = "Default Orchid";
    let spraysCount = 1;

    switch (activePlan.title) {
      case "Starter Plan":
        serviceTitle = "Fertilizer Spray";
        orchid = "Orchid A";
        spraysCount = 1;
        break;
      case "Pesticide Plan":
        serviceTitle = "Pesticide Spray";
        orchid = "Orchid B";
        spraysCount = 1;
        break;
      case "Herbicide Plan":
        serviceTitle = "Herbicide Spray";
        orchid = "Orchid C";
        spraysCount = 1;
        break;
      default:
        serviceTitle = "Fertilizer Spray";
    }

    const newService = {
      serviceTitle,
      field,
      orchid,
      spraysCount,
      address,
      pincode,
      status: "Pending",
    };

    user.bookedServices.push(newService);
    await user.save();

    res.status(200).json({ message: "Service booked successfully", service: newService });
  } catch (error) {
    console.error("Book Service Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// controllers/userController.js
export const getAllBookedServices = async (req, res) => {
  try {
    const users = await User.find({ 'bookedServices.status': { $in: ['Pending', 'In Progress'] } });

    const services = [];

    users.forEach(user => {
      user.bookedServices.forEach(service => {
        services.push({
          userId: user._id,
          userName: user.name,
          userPhone: user.phone,
          ...service.toObject(),
        });
      });
    });

    res.status(200).json(services);
  } catch (error) {
    console.error('Get Booked Services Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
export const assignServiceSlot = async (req, res) => {
  try {
    const { serviceId, userId, scheduleDate, sprayerId } = req.body;

    if (!serviceId || !userId || !scheduleDate || !sprayerId)
      return res.status(400).json({ message: "All fields are required" });

    // Check if the slot is already taken
    const conflictingService = await User.findOne({
      "bookedServices.scheduleDate": new Date(scheduleDate),
    });
    if (conflictingService)
      return res.status(400).json({ message: "Slot already assigned for another service" });

    // ---------------- Update Farmer ----------------
    const farmer = await User.findById(userId);
    if (!farmer) return res.status(404).json({ message: "Farmer not found" });

    const service = farmer.bookedServices.id(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

    service.scheduleDate = new Date(scheduleDate);
    service.status = "In Progress";
    service.assignedSprayer = sprayerId;

    await farmer.save();

    // ---------------- Update Sprayer ----------------
    const sprayer = await User.findById(sprayerId);
    if (!sprayer) return res.status(404).json({ message: "Sprayer not found" });

    sprayer.assignedServices = sprayer.assignedServices || [];
    sprayer.assignedServices.push({
      farmerId: farmer._id,
      serviceId: service._id,
      scheduleDate: new Date(scheduleDate),
      status: "In Progress",
    });

    await sprayer.save();

    res.status(200).json({ message: "Service assigned successfully", service });
  } catch (error) {
    console.error("Assign Slot Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// Update user details
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params; // user ID from params
    const { name, email, phone, password } = req.body;

    // Find user by ID
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;

    // Update password if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }

    const updatedUser = await user.save();

    // Exclude password from response
    const userResponse = {
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      type: updatedUser.type,
    };

    res.status(200).json({ message: "User updated successfully", user: userResponse });
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
