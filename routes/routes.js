// routes/users.js
const express = require("express");
const router = express.Router();
const userCtrl = require("../controllers/userController");

router.post("/register", userCtrl.registerUser);
router.post("/login", userCtrl.loginUser);
router.get("/users", userCtrl.getAllUsers);
router.post("/purchase-plan/:userId", userCtrl.purchasePlan);
router.get("/users/:id", userCtrl.getUserById);
router.post("/book-service/:userId", userCtrl.bookService);
router.get("/sprayer/services", userCtrl.getAllBookedServices);
router.post("/sprayer/assign-slot", userCtrl.assignServiceSlot);
router.put("/users/:id", userCtrl.updateUser);

module.exports = router;
