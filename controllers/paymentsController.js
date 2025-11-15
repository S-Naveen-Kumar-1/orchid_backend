// controllers/paymentsController.js
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();
let User = require("../models/User");
User = User && User.default ? User.default : User;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createOrder = async (req, res) => {
  try {
    const { userId, planId, title, price } = req.body;
    if (!userId || !planId || !title || !price) {
      return res.status(400).json({ message: "userId, planId, title and price are required" });
    }

    const amountPaise = Math.round(Number(price) * 100);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      return res.status(400).json({ message: "Invalid price" });
    }

    const options = {
      amount: amountPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: {
        userId: userId.toString(),
        planId: planId.toString(),
        planTitle: title
      }
    };

    const order = await razorpay.orders.create(options);

    // Save pending payment on user (optional)
    try {
      await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            pendingPayments: {
              orderId: order.id,
              planId: planId.toString(),
              amount: amountPaise,
              currency: "INR",
              createdAt: new Date()
            }
          }
        },
        { upsert: true }
      );
    } catch (err) {
      console.warn("Warning: failed to push pending payment to user:", err.message);
    }

    return res.json({ order });
  } catch (error) {
    console.error("createOrder error:", error);
    return res.status(500).json({ message: "Server error creating order", error: error.message });
  }
};

/**
 * POST /api/payments/verify-payment
 * body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Verifies signature and activates plan in user record.
 */
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ message: "Missing payment fields" });

    // Compute HMAC SHA256 signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.warn("Invalid signature for payment", { razorpay_order_id, razorpay_payment_id });
      return res.status(400).json({ ok: false, message: "Invalid signature" });
    }

    // Signature valid — fetch order to read notes
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const notes = order.notes || {};
    const userId = notes.userId;
    const planId = notes.planId;
    const planTitle = notes.planTitle || "Purchased Plan";
    const amountPaise = order.amount;

    if (!userId) {
      console.warn("Order has no userId note", order);
      return res.status(200).json({ ok: true, message: "Payment verified but no user mapping found" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found while verifying payment" });

    // Expire active plans (same logic as your purchasePlan)
    if (user.purchasedPlans && user.purchasedPlans.length) {
      user.purchasedPlans.forEach((p) => {
        if (p.status === "Active") p.status = "Expired";
      });
    }

    const startDate = new Date();
    const months = 1; // default; change if you pass duration via notes
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const newPlan = {
      planId: planId ? planId.toString() : `manual_${Date.now()}`,
      title: planTitle,
      price: (amountPaise / 100).toString(),
      duration: `${months} Month`,
      startDate,
      endDate,
      status: "Active"
    };

    user.purchasedPlans = user.purchasedPlans || [];
    user.purchasedPlans.push(newPlan);
    user.planActive = true;

    // Remove pendingPayments entry if present
    if (user.pendingPayments && user.pendingPayments.length) {
      user.pendingPayments = user.pendingPayments.filter((pp) => pp.orderId !== razorpay_order_id);
    }

    user.payments = user.payments || [];
    user.payments.push({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: amountPaise,
      currency: "INR",
      createdAt: new Date(),
      notes
    });

    await user.save();

    return res.json({ ok: true, message: "Payment verified and plan activated", plan: newPlan });
  } catch (error) {
    console.error("verifyPayment error:", error);
    return res.status(500).json({ ok: false, message: "Server error verifying payment", error: error.message });
  }
};

/**
 * POST /api/payments/webhook
 * IMPORTANT: this expects raw body (register route with bodyParser.raw in server)
 */
const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!signature || !webhookSecret) {
      console.warn("Webhook missing signature or webhook secret not configured");
      return res.status(400).send("Bad Request");
    }

    // req.body is a Buffer (raw body) — compute HMAC over raw body
    const expected = crypto.createHmac("sha256", webhookSecret).update(req.body).digest("hex");
    if (expected !== signature) {
      console.warn("Invalid webhook signature");
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    const event = payload.event;

    if (event === "payment.captured") {
      const payment = payload.payload.payment.entity;
      console.log("WEBHOOK: payment.captured", payment.id, "amount:", payment.amount);

      // Reconcile: fetch order & notes to map to user
      const orderId = payment.order_id;
      try {
        const order = await razorpay.orders.fetch(orderId);
        const notes = order.notes || {};
        const userId = notes.userId;
        if (userId) {
          const user = await User.findById(userId);
          if (user) {
            user.payments = user.payments || [];
            user.payments.push({
              razorpayOrderId: orderId,
              razorpayPaymentId: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              createdAt: new Date(),
              notes
            });
            // NOTE: do NOT blindly activate plan here if verifyPayment already did it.
            // If you want webhooks to be authoritative, implement idempotency checks here.
            await user.save();
          }
        }
      } catch (e) {
        console.warn("Webhook order fetch error:", e.message);
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("razorpayWebhook error:", error);
    return res.status(500).send("Server error");
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  razorpayWebhook
};
