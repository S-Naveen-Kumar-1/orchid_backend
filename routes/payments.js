// routes/payments.js
const express = require('express');
const router = express.Router();
const paymentsCtrl = require('../controllers/paymentsController');

router.post('/create-order', paymentsCtrl.createOrder);
router.post('/verify-payment', paymentsCtrl.verifyPayment);
// webhook registered in server.js with raw parser
module.exports = router;
