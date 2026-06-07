const express = require('express');
const {
  createReview,
  getProductReviews,
  updateReview,
  deleteReview,
} = require('../controllers/reviewController');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/product/:productId', getProductReviews);

// Customer routes
router.post('/', auth, authorize('customer'), createReview);
router.put('/:id', auth, authorize('customer'), updateReview);
router.delete('/:id', auth, deleteReview);

module.exports = router;
