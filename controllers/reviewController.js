const Review = require('../models/Review');
const Product = require('../models/Product');

// Create review
exports.createReview = async (req, res) => {
  try {
    const { productId, orderId, rating, title, comment, images } = req.body;
    const customerId = req.user.userId;
    
    // Check if user already reviewed this product
    const existingReview = await Review.findOne({ productId, customerId });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }
    
    const review = new Review({
      productId,
      orderId,
      customerId,
      rating,
      title,
      comment,
      images,
    });
    
    await review.save();
    
    // Update product rating
    const reviews = await Review.find({ productId, status: 'approved' });
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    
    await Product.findByIdAndUpdate(productId, {
      rating: avgRating,
      reviewCount: reviews.length,
    });
    
    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get product reviews
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sortBy = 'newest' } = req.query;
    
    let sort = { createdAt: -1 };
    if (sortBy === 'helpful') sort = { helpful: -1 };
    if (sortBy === 'rating-high') sort = { rating: -1 };
    if (sortBy === 'rating-low') sort = { rating: 1 };
    
    const skip = (page - 1) * limit;
    
    const reviews = await Review.find({ productId, status: 'approved' })
      .populate('customerId', 'firstName lastName profileImage')
      .sort(sort)
      .limit(Number(limit))
      .skip(skip);
    
    const total = await Review.countDocuments({ productId, status: 'approved' });
    
    res.json({
      reviews,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update review
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, title, comment, images } = req.body;
    const customerId = req.user.userId;
    
    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    
    if (review.customerId.toString() !== customerId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    Object.assign(review, { rating, title, comment, images });
    await review.save();
    
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete review
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = req.user.userId;
    
    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    
    if (review.customerId.toString() !== customerId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    await Review.findByIdAndDelete(id);
    res.json({ message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
