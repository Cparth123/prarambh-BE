const express = require('express');
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
} = require('../controllers/productController');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', getProducts);
router.get('/:id', getProductById);

// Seller/Admin routes
router.post('/', auth, authorize('seller'), createProduct);
router.put('/:id', auth, authorize('seller', 'admin'), updateProduct);
router.delete('/:id', auth, authorize('seller', 'admin'), deleteProduct);
router.get('/seller/products', auth, authorize('seller'), getSellerProducts);

module.exports = router;
