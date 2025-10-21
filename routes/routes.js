const express = require("express");
const { registerUser, loginUser, getAllUsers, purchasePlan, getUserById, bookService, getAllBookedServices, assignServiceSlot, updateUser } = require("../controllers/userController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/users", getAllUsers); 
router.post("/purchase-plan/:userId", purchasePlan);
router.get('/:id', getUserById);          
router.post('/book-service/:userId', bookService);
router.get('/sprayer/services', getAllBookedServices);      // fetch all booked services
router.post('/sprayer/assign-slot', assignServiceSlot);     // assign a slot to a service
router.put('/users/:id', updateUser); // <-- new update route

module.exports = router;
