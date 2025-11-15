// controllers/userController.js
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';

const splitName = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' };
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, type } = req.body;
    if (!name || !email || !phone || !password || !type) return res.status(400).json({ message: 'All fields are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(String(password), 10);

    const newUser = new User({ name, email, phone, password: hashed, type });
    await newUser.save();

    const names = splitName(newUser.name);
    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        first_name: names.first_name,
        last_name: names.last_name,
        email: newUser.email,
        mobile: newUser.phone,
        type: newUser.type,
      },
    });
  } catch (err) {
    console.error('Register Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || password === undefined || password === null) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isValid = await bcrypt.compare(String(password), String(user.password));
    if (!isValid) return res.status(401).json({ message: 'Invalid password' });

    const names = splitName(user.name);
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        first_name: names.first_name,
        last_name: names.last_name,
        email: user.email,
        mobile: user.phone,
        type: user.type,
      },
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email phone type');
    return res.status(200).json(users);
  } catch (err) {
    console.error('Get Users Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getUserById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user id' });

    const user = await User.findById(id).select('-password').populate({ path: 'bookedServices.assignedSprayer', select: 'name email phone' });
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.status(200).json(user);
  } catch (err) {
    console.error('Get User Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getUserPurchases = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(id).select('purchasedPlans planActive');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ purchasedPlans: user.purchasedPlans || [], planActive: user.planActive || false });
  } catch (err) {
    console.error('getUserPurchases error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const purchasePlan = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { planId, title, price, duration } = req.body;
    if (!planId || !title || price === undefined || price === null || !duration) return res.status(400).json({ message: 'All plan details are required' });

    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let months = parseInt(String(duration), 10);
    if (isNaN(months) || months <= 0) months = 1;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    user.purchasedPlans = Array.isArray(user.purchasedPlans) ? user.purchasedPlans : [];
    user.purchasedPlans.forEach((p) => { if (p.status === 'Active') p.status = 'Expired'; });

    const newPlan = { planId: String(planId), title, price: String(price), duration: `${months} Month`, startDate, endDate, status: 'Active' };
    user.purchasedPlans.push(newPlan);
    user.planActive = true;
    await user.save();

    return res.status(200).json({ message: 'Plan purchased successfully', plan: newPlan });
  } catch (err) {
    console.error('Purchase Plan Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const bookService = async (req, res) => {
  try {
    const userId = req.params.userId;
    const { field, address, pincode } = req.body;
    if (!field || !address || !pincode) return res.status(400).json({ message: 'Field, Address, and Pincode are required' });

    if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const activePlan = (user.purchasedPlans || []).find((p) => p.status === 'Active');
    if (!activePlan) return res.status(400).json({ message: 'No active plan found' });

    let serviceTitle = 'Fertilizer Spray', orchid = 'Default Orchid', spraysCount = 1;
    if (activePlan.title === 'Starter Plan') { serviceTitle = 'Fertilizer Spray'; orchid = 'Orchid A'; }
    else if (activePlan.title === 'Pesticide Plan') { serviceTitle = 'Pesticide Spray'; orchid = 'Orchid B'; }
    else if (activePlan.title === 'Herbicide Plan') { serviceTitle = 'Herbicide Spray'; orchid = 'Orchid C'; }

    user.bookedServices = Array.isArray(user.bookedServices) ? user.bookedServices : [];
    const newService = { serviceTitle, field, orchid, spraysCount, address, pincode, status: 'Pending' };
    user.bookedServices.push(newService);
    await user.save();

    return res.status(200).json({ message: 'Service booked successfully', service: newService });
  } catch (err) {
    console.error('Book Service Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// sprayer endpoints
export const getAllBookedServices = async (req, res) => {
  try {
    const users = await User.find({ 'bookedServices.status': { $in: ['Pending', 'In Progress'] } });
    const services = [];
    users.forEach((user) => {
      (user.bookedServices || []).forEach((service) => {
        services.push({ userId: user._id, userName: user.name, userPhone: user.phone, ...service.toObject() });
      });
    });
    return res.status(200).json(services);
  } catch (err) {
    console.error('Get Booked Services Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const assignServiceSlot = async (req, res) => {
  try {
    const { serviceId, userId, scheduleDate, sprayerId } = req.body;
    if (!serviceId || !userId || !scheduleDate || !sprayerId) return res.status(400).json({ message: 'All fields are required' });

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(sprayerId)) return res.status(400).json({ message: 'Invalid IDs' });

    const conflicting = await User.findOne({ 'bookedServices.scheduleDate': new Date(scheduleDate) });
    if (conflicting) return res.status(400).json({ message: 'Slot already assigned' });

    const farmer = await User.findById(userId);
    if (!farmer) return res.status(404).json({ message: 'Farmer not found' });

    const service = farmer.bookedServices.id(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    service.scheduleDate = new Date(scheduleDate);
    service.status = 'In Progress';
    service.assignedSprayer = sprayerId;
    await farmer.save();

    const sprayer = await User.findById(sprayerId);
    if (!sprayer) return res.status(404).json({ message: 'Sprayer not found' });

    sprayer.assignedServices = Array.isArray(sprayer.assignedServices) ? sprayer.assignedServices : [];
    sprayer.assignedServices.push({ farmerId: farmer._id, serviceId: service._id, scheduleDate: new Date(scheduleDate), status: 'In Progress' });
    await sprayer.save();

    return res.status(200).json({ message: 'Service assigned', service });
  } catch (err) {
    console.error('Assign Slot Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, email, phone, password } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid user id' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (password) user.password = await bcrypt.hash(String(password), 10);

    const updated = await user.save();
    const names = splitName(updated.name);
    return res.status(200).json({
      message: 'User updated successfully',
      user: { id: updated._id, name: updated.name, first_name: names.first_name, last_name: names.last_name, email: updated.email, phone: updated.phone, type: updated.type },
    });
  } catch (err) {
    console.error('Update User Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
