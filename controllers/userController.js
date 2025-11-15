// controllers/userController.js
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Razorpay from 'razorpay'; // if used elsewhere (keep import if needed)

// Helper: split name into first + last (best-effort)
const splitName = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/);
  const first_name = parts.length ? parts[0] : '';
  const last_name = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return { first_name, last_name };
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, type } = req.body;

    if (!name || !email || !phone || !password || !type)
      return res.status(400).json({ message: 'All fields are required' });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'Email already registered' });

    // Ensure password is a string before hashing
    const hashedPassword = await bcrypt.hash(String(password), 10);

    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      type,
    });

    await newUser.save();

    const { first_name, last_name } = splitName(newUser.name);

    const userResponse = {
      id: newUser._id,
      name: newUser.name,
      first_name,
      last_name,
      email: newUser.email,
      mobile: newUser.phone,
      type: newUser.type,
    };

    return res.status(201).json({ message: 'User registered successfully', user: userResponse });
  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || password === undefined || password === null) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // bcrypt.compare expects (string, string) — coerce both sides
    const plain = String(password);
    const hashed = String(user.password);

    const isPasswordValid = await bcrypt.compare(plain, hashed);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    const { first_name, last_name } = splitName(user.name);

    // Success response shaped for the mobile client
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        first_name,
        last_name,
        email: user.email,
        mobile: user.phone,
        type: user.type,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email phone type');
    return res.status(200).json(users);
  } catch (error) {
    console.error('Get Users Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const purchasePlan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, title, price, duration } = req.body;

    if (!planId || !title || price === undefined || price === null || !duration) {
      return res.status(400).json({ message: 'All plan details are required' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Calculate months from duration string (e.g., "1 Month", "3 Months", "6 Months")
    let months = parseInt(String(duration), 10);
    if (isNaN(months) || months <= 0) months = 1;

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    // Ensure purchasedPlans array exists
    user.purchasedPlans = Array.isArray(user.purchasedPlans) ? user.purchasedPlans : [];

    // Expire any active plans
    user.purchasedPlans.forEach((p) => {
      if (p.status === 'Active') p.status = 'Expired';
    });

    const newPlan = {
      planId: String(planId),
      title,
      price,
      duration,
      startDate,
      endDate,
      status: 'Active',
    };

    user.purchasedPlans.push(newPlan);
    user.planActive = true;

    await user.save();

    return res.status(200).json({ message: 'Plan purchased successfully', plan: newPlan });
  } catch (error) {
    console.error('Purchase Plan Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password')
      .populate({
        path: 'bookedServices.assignedSprayer',
        select: 'name email phone',
      });

    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json(user);
  } catch (error) {
    console.error('Get User Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const bookService = async (req, res) => {
  try {
    const { userId } = req.params;
    const { field, address, pincode } = req.body;

    if (!field || !address || !pincode) {
      return res.status(400).json({ message: 'Field, Address, and Pincode are required' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const activePlan = (user.purchasedPlans || []).find((p) => p.status === 'Active');
    if (!activePlan) return res.status(400).json({ message: 'No active plan found' });

    // Assign service based on plan title
    let serviceTitle = 'Fertilizer Spray';
    let orchid = 'Default Orchid';
    let spraysCount = 1;

    switch (activePlan.title) {
      case 'Starter Plan':
        serviceTitle = 'Fertilizer Spray';
        orchid = 'Orchid A';
        spraysCount = 1;
        break;
      case 'Pesticide Plan':
        serviceTitle = 'Pesticide Spray';
        orchid = 'Orchid B';
        spraysCount = 1;
        break;
      case 'Herbicide Plan':
        serviceTitle = 'Herbicide Spray';
        orchid = 'Orchid C';
        spraysCount = 1;
        break;
      default:
        serviceTitle = 'Fertilizer Spray';
    }

    user.bookedServices = Array.isArray(user.bookedServices) ? user.bookedServices : [];

    const newService = {
      serviceTitle,
      field,
      orchid,
      spraysCount,
      address,
      pincode,
      status: 'Pending',
    };

    user.bookedServices.push(newService);
    await user.save();

    return res.status(200).json({ message: 'Service booked successfully', service: newService });
  } catch (error) {
    console.error('Book Service Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAllBookedServices = async (req, res) => {
  try {
    const users = await User.find({ 'bookedServices.status': { $in: ['Pending', 'In Progress'] } });

    const services = [];

    users.forEach((user) => {
      (user.bookedServices || []).forEach((service) => {
        services.push({
          userId: user._id,
          userName: user.name,
          userPhone: user.phone,
          ...service.toObject(),
        });
      });
    });

    return res.status(200).json(services);
  } catch (error) {
    console.error('Get Booked Services Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const assignServiceSlot = async (req, res) => {
  try {
    const { serviceId, userId, scheduleDate, sprayerId } = req.body;

    if (!serviceId || !userId || !scheduleDate || !sprayerId)
      return res.status(400).json({ message: 'All fields are required' });

    // Check conflicting service for same slot
    const conflictingService = await User.findOne({
      'bookedServices.scheduleDate': new Date(scheduleDate),
    });
    if (conflictingService) return res.status(400).json({ message: 'Slot already assigned for another service' });

    // Update Farmer
    const farmer = await User.findById(userId);
    if (!farmer) return res.status(404).json({ message: 'Farmer not found' });

    const service = farmer.bookedServices.id(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    service.scheduleDate = new Date(scheduleDate);
    service.status = 'In Progress';
    service.assignedSprayer = sprayerId;

    await farmer.save();

    // Update Sprayer
    const sprayer = await User.findById(sprayerId);
    if (!sprayer) return res.status(404).json({ message: 'Sprayer not found' });

    sprayer.assignedServices = Array.isArray(sprayer.assignedServices) ? sprayer.assignedServices : [];
    sprayer.assignedServices.push({
      farmerId: farmer._id,
      serviceId: service._id,
      scheduleDate: new Date(scheduleDate),
      status: 'In Progress',
    });

    await sprayer.save();

    return res.status(200).json({ message: 'Service assigned successfully', service });
  } catch (error) {
    console.error('Assign Slot Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;

    if (password) {
      user.password = await bcrypt.hash(String(password), 10);
    }

    const updatedUser = await user.save();

    const { first_name, last_name } = splitName(updatedUser.name);

    const userResponse = {
      id: updatedUser._id,
      name: updatedUser.name,
      first_name,
      last_name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      type: updatedUser.type,
    };

    return res.status(200).json({ message: 'User updated successfully', user: userResponse });
  } catch (error) {
    console.error('Update User Error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
