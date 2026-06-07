const express = require('express');
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  confirmPayment,
} = require('../controllers/orderController');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Customer routes
router.post('/', auth, authorize('customer'), createOrder);
router.get('/', auth, authorize('customer'), getOrders);
router.get('/:id', auth, authorize('customer', 'seller', 'admin'), getOrderById);

// Payment routes
router.post('/:id/confirm-payment', auth, confirmPayment);

// Seller/Admin routes
router.put('/:id/status', auth, updateOrderStatus);

module.exports = router;
