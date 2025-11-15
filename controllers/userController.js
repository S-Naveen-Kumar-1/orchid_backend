// controllers/userController.js
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Service = require('../models/Service');

const splitName = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/);
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' };
};

const isValidObjectId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);

const findActivePlan = (purchasedPlans = []) => {
  const now = new Date();
  return (purchasedPlans || []).find((p) => {
    if (!p) return false;
    if (p.status === 'Active') {
      if (p.endDate) return new Date(p.endDate) > now;
      return true;
    }
    if (p.endDate) return new Date(p.endDate) > now;
    return false;
  });
};

// -------------------- basic user endpoints --------------------
exports.registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, type } = req.body;
    if (!name || !email || !phone || !password || !type) return res.status(400).json({ message: 'All fields are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const newUser = new User({ name, email, phone, password: hashedPassword, type });
    await newUser.save();

    const { first_name, last_name } = splitName(newUser.name);
    return res.status(201).json({
      message: 'User registered successfully',
      user: { id: newUser._id, name: newUser.name, first_name, last_name, email: newUser.email, mobile: newUser.phone, type: newUser.type },
    });
  } catch (err) {
    console.error('Register Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || password === undefined || password === null) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(String(password), String(user.password));
    if (!valid) return res.status(401).json({ message: 'Invalid password' });

    const { first_name, last_name } = splitName(user.name);
    return res.status(200).json({
      message: 'Login successful',
      user: { id: user._id, name: user.name, first_name, last_name, email: user.email, mobile: user.phone, type: user.type },
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email phone type');
    return res.status(200).json(users);
  } catch (err) {
    console.error('GetAllUsers Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });
    const user = await User.findById(id).select('-password').populate('bookedServices').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ user });
  } catch (err) {
    console.error('getUserById error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// -------------------- purchases / plans --------------------
exports.purchasePlan = async (req, res) => {
  try {
    const { userId } = req.params;
    let { planId, title, price, duration } = req.body;

    if (!planId || !title || price == null || !duration) return res.status(400).json({ message: 'All plan details are required' });
    if (!isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const anyActive = !!findActivePlan(user.purchasedPlans || []);
    if (anyActive) return res.status(400).json({ message: 'Cannot purchase while an active plan exists' });

    let months = parseInt(String(duration).replace(/[^\d]/g, ''), 10);
    if (isNaN(months) || months <= 0) months = 1;

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    const spraysPerMonthMap = {
      'starter': 2,
      'starter_1': 2,
      'pro': 3,
      'pro_1': 3,
      'premium': 4,
      'premium_1': 4,
    };
    const lookupKey = String(planId || title).toLowerCase();
    let perMonth = 1;
    Object.keys(spraysPerMonthMap).forEach((k) => {
      if (lookupKey.includes(k)) perMonth = spraysPerMonthMap[k];
    });
    const m = String(title).match(/(\d+)\s*Spray/i);
    if (m) perMonth = parseInt(m[1], 10);

    const spraysAllowed = perMonth * months;

    const newPlan = {
      planId: String(planId),
      title,
      price: String(price),
      duration: `${months} Month`,
      startDate,
      endDate,
      status: 'Active',
      spraysAllowed,
      spraysUsed: 0,
    };

    user.purchasedPlans = user.purchasedPlans || [];
    user.purchasedPlans.push(newPlan);
    user.planActive = true;
    await user.save();

    return res.status(200).json({ message: 'Plan activated', plan: newPlan });
  } catch (err) {
    console.error('purchasePlan error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserPurchases = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

    const user = await User.findById(id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const services = await Service.find({ user: id }).populate('assignedSprayer', 'name email phone').lean();

    return res.status(200).json({
      purchasedPlans: user.purchasedPlans || [],
      planActive: user.planActive || false,
      bookedServices: services || [],
      payments: user.payments || [],
      pendingPayments: user.pendingPayments || [],
      user,
    });
  } catch (err) {
    console.error('getUserPurchases error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// -------------------- booking endpoints (use Service model) --------------------
exports.bookService = async (req, res) => {
  try {
    const { userId } = req.params;
    const { serviceTitle, field, address, pincode, spraysCount = 1, notes } = req.body;

    if (!isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId' });
    if (!field || !address || !pincode) return res.status(400).json({ message: 'Field, Address, and Pincode are required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const activePlan = findActivePlan(user.purchasedPlans || []);
    if (!activePlan && !user.planActive) return res.status(400).json({ message: 'No active plan found' });

    const remaining = (activePlan.spraysAllowed || 0) - (activePlan.spraysUsed || 0);
    if (remaining <= 0) {
      return res.status(400).json({ message: 'No remaining sprays on your active plan. Please purchase a new plan.' });
    }
    if (spraysCount > remaining) {
      return res.status(400).json({ message: `Requested ${spraysCount} sprays but only ${remaining} remaining in your plan.` });
    }

    const alreadyOpen = await Service.findOne({ user: userId, status: { $in: ['Pending', 'In Progress'] } });
    if (alreadyOpen) {
      return res.status(400).json({ message: 'You already have a booking pending or in progress. Edit or cancel it before creating a new one.' });
    }

    const serviceObj = new Service({
      user: user._id,
      serviceTitle: serviceTitle || (activePlan && activePlan.title) || 'Fertilizer Spray',
      field,
      orchid: 'Orchid A',
      spraysCount,
      address,
      pincode,
      status: 'Pending',
      notes,
    });

    await serviceObj.save();

    user.bookedServices = user.bookedServices || [];
    user.bookedServices.push(serviceObj._id);

    const planIdx = (user.purchasedPlans || []).findIndex((p) => {
      if (!p) return false;
      if (String(p.planId) === String(activePlan.planId)) return true;
      if (p.title === activePlan.title && p.startDate && activePlan.startDate && String(p.startDate) === String(activePlan.startDate)) return true;
      return false;
    });

    if (planIdx !== -1) {
      user.purchasedPlans[planIdx].spraysUsed = (user.purchasedPlans[planIdx].spraysUsed || 0) + spraysCount;
    } else {
      const firstActive = user.purchasedPlans.find((p) => p.status === 'Active' && (!p.endDate || new Date(p.endDate) > new Date()));
      if (firstActive) firstActive.spraysUsed = (firstActive.spraysUsed || 0) + spraysCount;
    }

    await user.save();

    return res.status(200).json({ message: 'Service booked', service: serviceObj });
  } catch (err) {
    console.error('bookService error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.editBooking = async (req, res) => {
  try {
    const { userId, bookingId } = req.params;
    const { serviceTitle, field, address, pincode, spraysCount, notes } = req.body;

    if (!isValidObjectId(userId) || !isValidObjectId(bookingId)) return res.status(400).json({ message: 'Invalid id(s)' });

    const service = await Service.findById(bookingId);
    if (!service) return res.status(404).json({ message: 'Booking not found' });

    if (String(service.user) !== String(userId)) return res.status(403).json({ message: 'Not allowed to edit this booking' });

    if (service.status !== 'Pending') return res.status(400).json({ message: 'Only pending bookings can be edited' });

    if (spraysCount !== undefined && Number(spraysCount) !== Number(service.spraysCount)) {
      const u = await User.findById(userId);
      const activePlan = findActivePlan(u.purchasedPlans || []);
      if (!activePlan) return res.status(400).json({ message: 'No active plan found' });

      const oldCount = Number(service.spraysCount || 0);
      const newCount = Number(spraysCount || 0);
      const diff = newCount - oldCount;

      const remaining = (activePlan.spraysAllowed || 0) - (activePlan.spraysUsed || 0);
      if (diff > 0 && remaining < diff) {
        return res.status(400).json({ message: `Not enough remaining sprays to increase to ${newCount}.` });
      }

      const planIdx = (u.purchasedPlans || []).findIndex((p) => {
        if (!p) return false;
        if (String(p.planId) === String(activePlan.planId)) return true;
        if (p.title === activePlan.title && p.startDate && activePlan.startDate && String(p.startDate) === String(activePlan.startDate)) return true;
        return false;
      });
      if (planIdx !== -1) {
        u.purchasedPlans[planIdx].spraysUsed = Math.max(0, (u.purchasedPlans[planIdx].spraysUsed || 0) + diff);
      } else {
        const firstActive = u.purchasedPlans.find((p) => p.status === 'Active' && (!p.endDate || new Date(p.endDate) > new Date()));
        if (firstActive) firstActive.spraysUsed = Math.max(0, (firstActive.spraysUsed || 0) + diff);
      }
      await u.save();
      service.spraysCount = newCount;
    }

    if (serviceTitle) service.serviceTitle = serviceTitle;
    if (field) service.field = field;
    if (address) service.address = address;
    if (pincode) service.pincode = pincode;
    if (notes) service.notes = notes;

    await service.save();

    return res.status(200).json({ message: 'Booking updated', service });
  } catch (err) {
    console.error('editBooking error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const { userId, bookingId } = req.params;
    if (!isValidObjectId(userId) || !isValidObjectId(bookingId)) return res.status(400).json({ message: 'Invalid id(s)' });

    const service = await Service.findById(bookingId);
    if (!service) return res.status(404).json({ message: 'Booking not found' });

    if (String(service.user) !== String(userId)) return res.status(403).json({ message: 'Not allowed to cancel this booking' });

    if (service.status !== 'Pending') return res.status(400).json({ message: 'Only pending bookings can be cancelled' });

    try {
      const user = await User.findById(userId);
      const activePlanIdx = (user.purchasedPlans || []).findIndex((p) => {
        if (!p) return false;
        if (p.status === 'Active' && (!p.endDate || new Date(p.endDate) > new Date())) {
          return true;
        }
        return false;
      });
      if (activePlanIdx !== -1) {
        user.purchasedPlans[activePlanIdx].spraysUsed = Math.max(0, (user.purchasedPlans[activePlanIdx].spraysUsed || 0) - (service.spraysCount || 1));
        await user.save();
      }
    } catch (e) {
      console.warn('Could not decrement spraysUsed on cancel:', e && e.message ? e.message : e);
    }

    service.status = 'Cancelled';
    await service.save();

    try {
      await User.findByIdAndUpdate(userId, { $pull: { bookedServices: service._id } });
    } catch (e) {
      console.warn('Failed to pull service ref from user.bookedServices', e && e.message ? e.message : e);
    }

    return res.status(200).json({ message: 'Booking cancelled', service });
  } catch (err) {
    console.error('cancelBooking error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// admin / sprayer view
// controllers/userController.js  (replace getAllBookedServices)
exports.getAllBookedServices = async (req, res) => {
  try {
    // optional status filter: e.g. /sprayer/services?status=Pending
    const { status } = req.query;

    const filter = {};
    if (status) {
      // validate status value
      const allowed = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
      if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status filter' });
      filter.status = status;
    } else {
      // no status filter: return all services (or you can restrict to specific statuses)
      // filter.status = { $in: ['Pending', 'In Progress', 'Completed'] }; // alternative
    }

    const services = await Service.find(filter)
      .populate('user', 'name email phone') // farmer info
      .populate('assignedSprayer', 'name email phone') // sprayer info
      .lean();

    // Simplify fields for frontend convenience
    const mapped = services.map(s => ({
      ...s,
      userName: s.user ? s.user.name : '',
      userPhone: s.user ? s.user.phone : '',
      assignedSprayerId: s.assignedSprayer ? (s.assignedSprayer._id || s.assignedSprayer) : null,
    }));

    return res.status(200).json(mapped);
  } catch (err) {
    console.error('getAllBookedServices error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.assignServiceSlot = async (req, res) => {
  try {
    const { serviceId, scheduleDate, sprayerId } = req.body;
    if (!serviceId || !scheduleDate || !sprayerId) return res.status(400).json({ message: 'All fields are required' });
    if (!isValidObjectId(serviceId) || !isValidObjectId(sprayerId)) return res.status(400).json({ message: 'Invalid id(s)' });

    const conflicting = await Service.findOne({ scheduleDate: new Date(scheduleDate), status: { $in: ['In Progress', 'Pending'] } });
    if (conflicting && String(conflicting._id) !== String(serviceId)) {
      return res.status(400).json({ message: 'Slot already assigned' });
    }

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    service.scheduleDate = new Date(scheduleDate);
    service.status = 'In Progress';
    service.assignedSprayer = sprayerId;
    await service.save();

    const sprayer = await User.findById(sprayerId);
    if (!sprayer) return res.status(404).json({ message: 'Sprayer not found' });

    sprayer.assignedServices = sprayer.assignedServices || [];
    sprayer.assignedServices.push({
      farmerId: service.user,
      serviceId: service._id,
      scheduleDate: new Date(scheduleDate),
      status: 'In Progress',
      createdAt: new Date(),
    });
    await sprayer.save();

    return res.status(200).json({ message: 'Assigned', service });
  } catch (err) {
    console.error('assignServiceSlot error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

    const { name, email, phone, password } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (password) user.password = await bcrypt.hash(String(password), 10);

    const updated = await user.save();
    return res.status(200).json({ message: 'User updated', user: { id: updated._id, name: updated.name, email: updated.email, phone: updated.phone, type: updated.type } });
  } catch (err) {
    console.error('updateUser error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};


/**
 * acceptService: Sprayer claims a pending service (no schedule given).
 * Body: { serviceId, sprayerId }
 * Sets assignedSprayer, status='In Progress', scheduleDate = now
 */
exports.acceptService = async (req, res) => {
  try {
    const { serviceId, sprayerId } = req.body;
    if (!serviceId || !sprayerId) return res.status(400).json({ message: 'serviceId and sprayerId are required' });
    if (!isValidObjectId(serviceId) || !isValidObjectId(sprayerId)) return res.status(400).json({ message: 'Invalid id(s)' });

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });
    if (service.status !== 'Pending') return res.status(400).json({ message: 'Only pending services can be accepted' });

    // set assigned sprayer and change status
    service.assignedSprayer = sprayerId;
    service.status = 'In Progress';
    service.scheduleDate = new Date(); // immediate acceptance time; sprayer can later reassign schedule via assignServiceSlot
    await service.save();

    // add assignedServices entry for sprayer
    const sprayer = await User.findById(sprayerId);
    if (!sprayer) return res.status(404).json({ message: 'Sprayer not found' });

    sprayer.assignedServices = sprayer.assignedServices || [];
    sprayer.assignedServices.push({
      farmerId: service.user,
      serviceId: service._id,
      scheduleDate: service.scheduleDate,
      status: 'In Progress',
      createdAt: new Date(),
    });
    await sprayer.save();

    return res.status(200).json({ message: 'Service accepted', service });
  } catch (err) {
    console.error('acceptService error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * completeService: Sprayer marks a service as completed.
 * Body: { serviceId, sprayerId }
 * Validates sprayer is assigned then set status = 'Completed' and update sprayer record.
 */
exports.completeService = async (req, res) => {
  try {
    const { serviceId, sprayerId } = req.body;
    if (!serviceId || !sprayerId) return res.status(400).json({ message: 'serviceId and sprayerId are required' });

    if (!isValidObjectId(serviceId) || !isValidObjectId(sprayerId)) return res.status(400).json({ message: 'Invalid id(s)' });

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    if (!service.assignedSprayer || String(service.assignedSprayer) !== String(sprayerId)) {
      return res.status(403).json({ message: 'You are not assigned to this service' });
    }

    service.status = 'Completed';
    service.completedAt = new Date();
    await service.save();

    const sprayer = await User.findById(sprayerId);
    if (sprayer) {
      sprayer.assignedServices = (sprayer.assignedServices || []).map((as) => {
        // as may be a subdocument or plain object
        const sid = as.serviceId ? String(as.serviceId) : String(as._id || as);
        if (sid === String(service._id)) {
          // keep other fields but update status
          return { ... (as.toObject ? as.toObject() : as), status: 'Completed' };
        }
        return as;
      });
      await sprayer.save();
    }

    return res.status(200).json({ message: 'Service completed', service });
  } catch (err) {
    console.error('completeService error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
