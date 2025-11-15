// routes/payments.js
const express = require("express");
const router = express.Router();
const paymentsCtrl = require("../controllers/paymentsController");

// create-order & verify-payment use JSON body
router.post("/create-order", paymentsCtrl.createOrder);
router.post("/verify-payment", paymentsCtrl.verifyPayment);

// webhook route will be registered in server with bodyParser.raw to keep raw body.
// If you want to mount here, ensure you register raw parser in server.js before this router.

module.exports = router;
