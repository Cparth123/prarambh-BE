const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');

// Get dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalSellers = await User.countDocuments({ role: 'seller' });
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();

    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);

    res.json({
      totalUsers,
      totalSellers,
      totalProducts,
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all users
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;

    let filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const users = await User.find(filter)
      .select('-password')
      .limit(Number(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      users,
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

// Get user details
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password').populate('storeId');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update user status
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, isVerified } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (isActive !== undefined) user.isActive = isActive;
    if (isVerified !== undefined) user.isVerified = isVerified;

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all sellers for verification
exports.getSellers = async (req, res) => {
  try {
    const { page = 1, limit = 20, verified } = req.query;

    let filter = { role: 'seller' };
    if (verified === 'false') filter.isVerified = false;

    const skip = (page - 1) * limit;

    const sellers = await User.find(filter)
      .populate('storeId')
      .limit(Number(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      sellers,
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

// Verify seller
exports.verifySeller = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true }
    ).populate('storeId');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    let filter = {};
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;

    const products = await Product.find(filter)
      .populate('sellerId', 'firstName lastName email')
      .limit(Number(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);

    res.json({
      products,
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

// Update product status
exports.updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get reviews for moderation
exports.getReviewsForModeration = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'pending' } = req.query;

    const skip = (page - 1) * limit;

    const reviews = await Review.find({ status })
      .populate('customerId', 'firstName lastName email')
      .populate('productId', 'name')
      .limit(Number(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Review.countDocuments({ status });

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

// Approve/Reject review
exports.updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const review = await Review.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all orders
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    let filter = {};
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const orders = await Order.find(filter)
      .populate('customerId', 'firstName lastName email')
      .limit(Number(limit))
      .skip(skip)
      .sort({ createdAt: -1 });

    const total = await Order.countDocuments(filter);

    res.json({
      orders,
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

// Get platform settings (commission rates, etc.)
exports.getSettings = async (req, res) => {
  try {
    // This would typically fetch from a settings collection
    res.json({
      commissionRate: 10,
      tax: 0,
      currency: 'USD',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update platform settings
exports.updateSettings = async (req, res) => {
  try {
    const { commissionRate, tax } = req.body;
    res.json({
      commissionRate,
      tax,
      currency: 'USD',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update user details & status
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, role, isActive, isVerified } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.email === 'prarambha@gmail.com' && email && email !== 'prarambha@gmail.com') {
      return res.status(400).json({ message: 'Changing default admin email is prohibited.' });
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (isVerified !== undefined) user.isVerified = isVerified;

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete user cascadingly
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.email === 'prarambha@gmail.com') {
      return res.status(400).json({ message: 'Deleting the default administrator is prohibited.' });
    }

    const { deleteImageFromCloudinary } = require('../utils/cloudinary');
    if (user.profileImagePublicId) {
      try {
        await deleteImageFromCloudinary(user.profileImagePublicId);
      } catch (err) {
        console.warn('Failed to delete user profile image:', err.message);
      }
    }

    if (user.role === 'seller') {
      const store = await Store.findOne({ sellerId: user._id });
      if (store) {
        const products = await Product.find({ sellerId: user._id });
        for (const product of products) {
          if (product.cloudinaryPublicIds && product.cloudinaryPublicIds.length > 0) {
            for (const publicId of product.cloudinaryPublicIds) {
              if (publicId) {
                try {
                  await deleteImageFromCloudinary(publicId);
                } catch (err) {
                  console.warn('Failed to delete product image from Cloudinary:', err.message);
                }
              }
            }
          }
        }
        await Product.deleteMany({ sellerId: user._id });
        await Store.findByIdAndDelete(store._id);
      }
    }

    if (user.role === 'customer') {
      await Review.deleteMany({ customerId: user._id });
    }

    await User.findByIdAndDelete(id);
    res.json({ message: 'User and associated data deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
