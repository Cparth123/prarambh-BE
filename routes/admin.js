const express = require('express');
const {
  getDashboardStats,
  getUsers,
  getUserById,
  updateUserStatus,
  getSellers,
  verifySeller,
  getAllProducts,
  updateProductStatus,
  getReviewsForModeration,
  updateReviewStatus,
  getAllOrders,
  getSettings,
  updateSettings,
  updateUser,
  deleteUser,
} = require('../controllers/adminController');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require admin role
router.use(auth, authorize('admin'));

// Dashboard
router.get('/dashboard/stats', getDashboardStats);

// Users management
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id/status', updateUserStatus);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Sellers management
router.get('/sellers', getSellers);
router.put('/sellers/:id/verify', verifySeller);

// Products management
router.get('/products', getAllProducts);
router.put('/products/:id/status', updateProductStatus);

// Reviews moderation
router.get('/reviews', getReviewsForModeration);
router.put('/reviews/:id/status', updateReviewStatus);

// Orders
router.get('/orders', getAllOrders);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
