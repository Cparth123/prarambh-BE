const express = require('express');
const {
  getStore,
  updateStore,
  getDashboard,
  getSellerOrders,
  updateOrderStatus,
  getAnalytics,
  getNotifications,
  markNotificationAsRead,
} = require('../controllers/sellerController');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Seller routes (require seller role)
router.get('/store', auth, authorize('seller'), getStore);
router.put('/store', auth, authorize('seller'), updateStore);
router.get('/dashboard', auth, authorize('seller'), getDashboard);
router.get('/orders', auth, authorize('seller'), getSellerOrders);
router.put('/orders/:orderId/status', auth, authorize('seller'), updateOrderStatus);
router.get('/analytics', auth, authorize('seller'), getAnalytics);
router.get('/notifications', auth, authorize('seller'), getNotifications);
router.put('/notifications/:id/read', auth, authorize('seller'), markNotificationAsRead);

module.exports = router;
