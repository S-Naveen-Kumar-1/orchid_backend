// routes/routes.js
const express = require('express');
const {
  registerUser, loginUser, getAllUsers, purchasePlan, getUserById,
  bookService, getAllBookedServices, assignServiceSlot, updateUser, getUserPurchases,
} = require('../controllers/userController');

const router = express.Router();

// Auth
router.post('/register', registerUser);
router.post('/login', loginUser);

// Users
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);

// purchases
router.get('/users/:id/purchases', getUserPurchases);
router.post('/purchase-plan/:userId', purchasePlan);

// booking
router.post('/book-service/:userId', bookService);

// sprayer/admin
router.get('/sprayer/services', getAllBookedServices);
router.post('/sprayer/assign-slot', assignServiceSlot);

module.exports = router;
