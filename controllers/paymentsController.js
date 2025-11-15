// controllers/paymentsController.js
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config();
let User = require('../models/User');
User = User && User.default ? User.default : User;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

const createOrder = async (req, res) => {
  try {
    const { userId, planId, title, price } = req.body;
    if (!userId || !planId || !title || price == null) return res.status(400).json({ message: 'userId, planId, title and price are required' });

    const amountPaise = Math.round(Number(price) * 100);
    if (isNaN(amountPaise) || amountPaise <= 0) return res.status(400).json({ message: 'Invalid price' });

    const notes = { userId: String(userId), planId: String(planId), planTitle: title };
    const options = { amount: amountPaise, currency: 'INR', receipt: `rcpt_${Date.now()}`, payment_capture: 1, notes };

    const order = await razorpay.orders.create(options);

    if (isValidObjectId(userId)) {
      try {
        await User.findByIdAndUpdate(userId, {
          $push: {
            pendingPayments: { orderId: order.id, planId: String(planId), amount: amountPaise, currency: 'INR', createdAt: new Date() },
          },
        }, { upsert: true, new: true });
      } catch (err) {
        console.warn('Warning: failed to push pending payment to user:', err.message || err);
      }
    } else {
      console.warn('createOrder: invalid userId provided, skipping pendingPayments push:', userId);
    }

    return res.json({ order, key: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('createOrder error:', error);
    return res.status(500).json({ message: 'Server error creating order', error: error?.message || String(error) });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ message: 'Missing payment fields' });

    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (generated_signature !== razorpay_signature) return res.status(400).json({ ok: false, message: 'Invalid signature' });

    const order = await razorpay.orders.fetch(razorpay_order_id);
    const notes = order && order.notes ? order.notes : {};
    const userId = notes.userId;
    const planId = notes.planId;
    const planTitle = notes.planTitle || 'Purchased Plan';
    const amountPaise = order.amount;

    if (!userId) {
      console.warn('verifyPayment: order has no userId in notes', order.id);
      return res.status(200).json({ ok: true, message: 'Payment verified but no user mapping found' });
    }
    if (!isValidObjectId(userId)) return res.status(400).json({ ok: false, message: 'Invalid user mapping in order notes' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found while verifying payment' });

    user.purchasedPlans = Array.isArray(user.purchasedPlans) ? user.purchasedPlans : [];
    user.purchasedPlans.forEach((p) => { if (p.status === 'Active') p.status = 'Expired'; });

    const startDate = new Date();
    const months = 1; // if you pass duration in notes you can parse here
    const endDate = new Date(); endDate.setMonth(endDate.getMonth() + months);

    const newPlan = {
      planId: planId ? String(planId) : `manual_${Date.now()}`,
      title: planTitle,
      price: (amountPaise / 100).toString(),
      duration: `${months} Month`,
      startDate,
      endDate,
      status: 'Active',
    };

    user.purchasedPlans.push(newPlan);
    user.planActive = true;

    if (Array.isArray(user.pendingPayments)) {
      user.pendingPayments = user.pendingPayments.filter((pp) => pp.orderId !== razorpay_order_id);
    }

    user.payments = user.payments || [];
    user.payments.push({ razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id, amount: amountPaise, currency: 'INR', createdAt: new Date(), notes });

    await user.save();

    return res.json({ ok: true, message: 'Payment verified and plan activated', plan: newPlan });
  } catch (error) {
    console.error('verifyPayment error:', error);
    return res.status(500).json({ ok: false, message: 'Server error verifying payment', error: error?.message || String(error) });
  }
};

const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !webhookSecret) return res.status(400).send('Bad Request');

    const rawBody = req.body;
    const computed = crypto.createHmac('sha256', webhookSecret).update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(JSON.stringify(rawBody))).digest('hex');
    if (computed !== signature) return res.status(400).send('Invalid signature');

    const payload = Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString('utf8')) : rawBody;
    const event = payload.event;

    if (event === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      if (payment) {
        const orderId = payment.order_id;
        try {
          const order = await razorpay.orders.fetch(orderId);
          const notes = order.notes || {};
          const userId = notes.userId;
          if (userId && isValidObjectId(userId)) {
            const user = await User.findById(userId);
            if (user) {
              user.payments = user.payments || [];
              user.payments.push({ razorpayOrderId: orderId, razorpayPaymentId: payment.id, amount: payment.amount, currency: payment.currency, createdAt: new Date(), notes });
              await user.save();
            }
          }
        } catch (e) {
          console.warn('Webhook order fetch error:', e?.message || e);
        }
      }
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('razorpayWebhook error:', error);
    return res.status(500).send('Server error');
  }
};

module.exports = { createOrder, verifyPayment, razorpayWebhook };
