const mongoose = require("mongoose");

// helper
function isValidObjectId(id) {
  // allow strings that are valid ObjectId only
  return mongoose.Types.ObjectId.isValid(id);
}

const createOrder = async (req, res) => {
  try {
    const { userId, planId, title, price } = req.body;
    if (!userId || !planId || !title || price == null) {
      return res.status(400).json({ message: "userId, planId, title and price are required" });
    }

    // convert to paise
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
        userId: String(userId),
        planId: String(planId),
        planTitle: title
      }
    };

    const order = await razorpay.orders.create(options);

    // only attempt to push pendingPayments if userId looks like a valid ObjectId
    if (isValidObjectId(userId)) {
      try {
        await User.findByIdAndUpdate(
          userId,
          {
            $push: {
              pendingPayments: {
                orderId: order.id,
                planId: String(planId),
                amount: amountPaise,
                currency: "INR",
                createdAt: new Date()
              }
            }
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.warn("Warning: failed to push pending payment to user:", err.message);
      }
    } else {
      console.warn("createOrder: received invalid userId, skipping pendingPayments push:", userId);
    }

    return res.json({ order });
  } catch (error) {
    console.error("createOrder error:", error?.message || error);
    return res.status(500).json({ message: "Server error creating order", error: error?.message });
  }
};


const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ message: "Missing payment fields" });

    // Validate signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.warn("Invalid signature for payment", { razorpay_order_id, razorpay_payment_id });
      return res.status(400).json({ ok: false, message: "Invalid signature" });
    }

    // signature valid — fetch order to read notes
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const notes = order.notes || {};
    const userId = notes.userId;
    const planId = notes.planId;
    const planTitle = notes.planTitle || "Purchased Plan";
    const amountPaise = order.amount;

    if (!userId) {
      console.warn("Order has no userId note", order);
      // still return ok so client doesn't retry, but warn in logs
      return res.status(200).json({ ok: true, message: "Payment verified but no user mapping found" });
    }

    // validate userId
    if (!isValidObjectId(userId)) {
      console.warn("verifyPayment: order notes contain invalid userId:", userId);
      // Option: store payment record in a central payments collection for manual reconciliation
      return res.status(400).json({ ok: false, message: "Invalid user mapping in order notes" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found while verifying payment" });

    // expire existing active plans
    if (user.purchasedPlans && user.purchasedPlans.length) {
      user.purchasedPlans.forEach((p) => {
        if (p.status === "Active") p.status = "Expired";
      });
    }

    const startDate = new Date();
    const months = 1;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const newPlan = {
      planId: planId ? String(planId) : `manual_${Date.now()}`,
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
    console.error("verifyPayment error:", error?.message || error);
    return res.status(500).json({ ok: false, message: "Server error verifying payment", error: error?.message });
  }
};
