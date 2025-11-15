// routes/payments.js
const express = require("express");
const router = express.Router();
const paymentsCtrl = require("../controllers/paymentsController");

router.post("/create-order", paymentsCtrl.createOrder);
router.post("/verify-payment", paymentsCtrl.verifyPayment);

// Note: webhook route must be registered in server with bodyParser.raw:
// app.post('/api/payments/webhook', bodyParser.raw({ type: 'application/json' }), paymentsCtrl.razorpayWebhook)

module.exports = router;
