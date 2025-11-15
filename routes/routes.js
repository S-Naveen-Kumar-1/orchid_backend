// routes/users.js
const express = require('express');
const router = express.Router();
const userCtrl = require('../controllers/userController');

router.post('/register', userCtrl.registerUser);
router.post('/login', userCtrl.loginUser);
router.get('/users', userCtrl.getAllUsers);

// purchase & payments fallback
router.post('/purchase-plan/:userId', userCtrl.purchasePlan);

// user read endpoints
router.get('/users/:id', userCtrl.getUserById);
router.get('/users/:id/purchases', userCtrl.getUserPurchases);

// booking / service endpoints
router.post('/book-service/:userId', userCtrl.bookService);
router.put('/edit-booking/:userId/:bookingId', userCtrl.editBooking);
router.post('/cancel-booking/:userId/:bookingId', userCtrl.cancelBooking);

// sprayer/admin endpoints
router.get('/sprayer/services', userCtrl.getAllBookedServices);
router.post('/sprayer/assign-slot', userCtrl.assignServiceSlot);

router.put('/users/:id', userCtrl.updateUser);

module.exports = router;
