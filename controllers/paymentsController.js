// controllers/paymentsController.js
const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/User"); // CommonJS import

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const isValidObjectId = (id) => typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

/**
 * Create Razorpay order.
 * Request body: { userId, planId, title, price, duration }
 * Adds planDuration to order notes so verifyPayment can create the correct duration.
 */
exports.createOrder = async (req, res) => {
  try {
    const { userId, planId, title, price, duration } = req.body;
    if (!userId || !planId || !title || price == null) {
      return res.status(400).json({ message: "userId, planId, title and price are required" });
    }
    if (!isValidObjectId(userId)) return res.status(400).json({ message: "Invalid userId" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Block if any active plan exists (server-side authoritative guard)
    const anyActive = (user.purchasedPlans || []).some((p) => {
      if (p.status === "Active") {
        if (p.endDate) return new Date(p.endDate) > new Date();
        return true;
      }
      if (p.endDate) return new Date(p.endDate) > new Date();
      return false;
    });
    if (anyActive) {
      return res.status(400).json({ message: "User already has an active plan. Cannot create order." });
    }

    const amountPaise = Math.round(Number(price) * 100);
    if (isNaN(amountPaise) || amountPaise <= 0) return res.status(400).json({ message: "Invalid price" });

    const notes = {
      userId: String(userId),
      planId: String(planId),
      planTitle: title,
      planDuration: String(duration || ""),
    };

    const options = {
      amount: amountPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes,
    };

    const order = await razorpay.orders.create(options);

    // Save a pendingPayments entry (best-effort)
    try {
      await User.findByIdAndUpdate(userId, {
        $push: {
          pendingPayments: {
            orderId: order.id,
            planId: String(planId),
            amount: amountPaise,
            currency: "INR",
            createdAt: new Date(),
          },
        },
      });
    } catch (err) {
      console.warn("Warning: failed to push pending payment to user:", err && err.message ? err.message : err);
    }

    return res.json({ order });
  } catch (error) {
    console.error("createOrder error:", error && error.stack ? error.stack : error);
    return res.status(500).json({ message: "Server error creating order", error: error?.message || String(error) });
  }
};

/**
 * Verify payment and activate plan.
 * Request body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * If verification success -> activates plan and returns { ok: true, plan: newPlan }
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment fields" });
    }

    // verify signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.warn("Invalid signature for payment", { razorpay_order_id, razorpay_payment_id });
      return res.status(400).json({ ok: false, message: "Invalid signature" });
    }

    // fetch order to read notes
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const notes = order && order.notes ? order.notes : {};
    const userId = notes.userId;
    const planId = notes.planId;
    const planTitle = notes.planTitle || "Purchased Plan";
    const planDurationNote = notes.planDuration || "";
    const amountPaise = order.amount;

    if (!userId || !isValidObjectId(userId)) {
      console.warn("verifyPayment: missing/invalid userId in order notes", razorpay_order_id);
      return res.status(400).json({ ok: false, message: "Invalid order notes (no user mapping)" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    // Double-check: block if there is already an active plan (shouldn't happen normally)
    const anyActive = (user.purchasedPlans || []).some((p) => {
      if (p.status === "Active") {
        if (p.endDate) return new Date(p.endDate) > new Date();
        return true;
      }
      if (p.endDate) return new Date(p.endDate) > new Date();
      return false;
    });
    if (anyActive) {
      // cleanup pending payment
      user.pendingPayments = (user.pendingPayments || []).filter((pp) => pp.orderId !== razorpay_order_id);
      await user.save();
      return res.status(400).json({ ok: false, message: "User already has an active plan. Activation denied." });
    }

    // compute months from notes if present
    let months = 1;
    if (planDurationNote) {
      // accept formats like "1 Month", "3 Months" or numeric strings
      const parsed = parseInt(String(planDurationNote).replace(/[^\d]/g, ""), 10);
      if (!isNaN(parsed) && parsed > 0) months = parsed;
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    const newPlan = {
      planId: planId ? String(planId) : `manual_${Date.now()}`,
      title: planTitle,
      price: String(amountPaise / 100),
      duration: `${months} Month`,
      startDate,
      endDate,
      status: "Active",
    };

    user.purchasedPlans = user.purchasedPlans || [];
    user.purchasedPlans.push(newPlan);
    user.planActive = true;

    // remove pending payments entry if present
    user.pendingPayments = (user.pendingPayments || []).filter((pp) => pp.orderId !== razorpay_order_id);

    // add payment record
    user.payments = user.payments || [];
    user.payments.push({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: amountPaise,
      currency: "INR",
      createdAt: new Date(),
      notes,
    });

    await user.save();

    return res.json({ ok: true, message: "Payment verified and plan activated", plan: newPlan });
  } catch (error) {
    console.error("verifyPayment error:", error && error.stack ? error.stack : error);
    return res.status(500).json({ ok: false, message: "Server error verifying payment", error: error?.message || String(error) });
  }
};

/**
 * Webhook: keep raw body parsing in server.js and register route there:
 * app.post('/api/payments/webhook', bodyParser.raw({ type: 'application/json' }), razorpayWebhook)
 */
exports.razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    if (!signature || !webhookSecret) {
      console.warn("Webhook missing signature or webhook secret not configured");
      return res.status(400).send("Bad Request");
    }

    const rawBody = req.body;
    const computed = crypto
      .createHmac("sha256", webhookSecret)
      .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(JSON.stringify(rawBody)))
      .digest("hex");

    if (computed !== signature) {
      console.warn("Invalid webhook signature");
      return res.status(400).send("Invalid signature");
    }

    const payload = Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString("utf8")) : rawBody;
    const event = payload.event;

    if (event === "payment.captured") {
      const payment = payload.payload?.payment?.entity;
      if (payment) {
        console.log("WEBHOOK: payment.captured", payment.id, "amount:", payment.amount);
        const orderId = payment.order_id;
        try {
          const order = await razorpay.orders.fetch(orderId);
          const notes = order.notes || {};
          const userId = notes.userId;
          if (userId && isValidObjectId(userId)) {
            const user = await User.findById(userId);
            if (user) {
              user.payments = user.payments || [];
              user.payments.push({
                razorpayOrderId: orderId,
                razorpayPaymentId: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                createdAt: new Date(),
                notes,
              });
              await user.save();
            }
          } else {
            console.warn("Webhook: order notes missing/invalid userId for order:", orderId);
          }
        } catch (e) {
          console.warn("Webhook order fetch error:", e && e.message ? e.message : e);
        }
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("razorpayWebhook error:", error && error.stack ? error.stack : error);
    return res.status(500).send("Server error");
  }
};
