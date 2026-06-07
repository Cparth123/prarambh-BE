const Store = require('../models/Store');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Notification = require('../models/Notification');

// Get seller store
exports.getStore = async (req, res) => {
  try {
    const sellerId = req.user.userId;
    const store = await Store.findOne({ sellerId });

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    res.json(store);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update seller store
exports.updateStore = async (req, res) => {
  try {
    const sellerId = req.user.userId;
    const { name, description, logo, banner, policies, whatsappEnabled } = req.body;

    const store = await Store.findOne({ sellerId });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    Object.assign(store, { name, description, logo, banner, policies });
    if (whatsappEnabled !== undefined) store.whatsappEnabled = whatsappEnabled;
    await store.save();

    res.json(store);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller dashboard data
exports.getDashboard = async (req, res) => {
  try {
    const sellerId = req.user.userId;

    const store = await Store.findOne({ sellerId });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    // Get stats
    const products = await Product.countDocuments({ sellerId });
    const orders = await Order.find({ 'items.sellerId': sellerId });

    const totalRevenue = orders.reduce((sum, order) => {
      const sellerItems = order.items.filter((item) => item.sellerId.toString() === sellerId);
      const itemsRevenue = sellerItems.reduce((s, item) => s + item.subtotal, 0);
      return sum + itemsRevenue;
    }, 0);

    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o) => o.status === 'pending').length;

    res.json({
      store,
      stats: {
        products,
        totalOrders,
        pendingOrders,
        totalRevenue,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller orders
exports.getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;

    let filter = { 'items.sellerId': sellerId };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const orders = await Order.find(filter)
      .populate('customerId', 'firstName lastName email')
      .populate('items.productId', 'name')
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

// Update seller order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, trackingNumber, carrier, verificationCode } = req.body;
    const sellerId = req.user.userId;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if seller has items in this order
    const hasSellerItems = order.items.some((item) => item.sellerId.toString() === sellerId);
    if (!hasSellerItems) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check offline verification code
    if (order.paymentMethod === 'offline' && status === 'delivered') {
      if (!verificationCode) {
        return res.status(400).json({ message: 'Verification code is required to complete delivery.' });
      }
      if (verificationCode !== order.verificationCode) {
        return res.status(400).json({ message: 'Invalid verification code. Please ask the customer for the correct code.' });
      }
      order.paymentStatus = 'paid';
    }

    order.status = status;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (carrier) order.carrier = carrier;

    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller analytics
exports.getAnalytics = async (req, res) => {
  try {
    const sellerId = req.user.userId;
    const { period = 'month' } = req.query;

    const orders = await Order.find({ 'items.sellerId': sellerId }).populate('items.productId');

    // Calculate analytics
    const topProducts = {};
    const dailySales = {};

    orders.forEach((order) => {
      const sellerItems = order.items.filter((item) => item.sellerId.toString() === sellerId);

      sellerItems.forEach((item) => {
        if (!topProducts[item.productId._id]) {
          topProducts[item.productId._id] = {
            product: item.productName,
            sales: 0,
            revenue: 0,
          };
        }
        topProducts[item.productId._id].sales += item.quantity;
        topProducts[item.productId._id].revenue += item.subtotal;
      });

      // Daily sales
      const date = order.createdAt.toISOString().split('T')[0];
      if (!dailySales[date]) {
        dailySales[date] = { date, revenue: 0, orders: 0 };
      }
      const dayRevenue = sellerItems.reduce((sum, item) => sum + item.subtotal, 0);
      dailySales[date].revenue += dayRevenue;
      dailySales[date].orders += 1;
    });

    const topProductsList = Object.values(topProducts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const salesChart = Object.values(dailySales).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res.json({
      topProducts: topProductsList,
      salesChart,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get notifications for seller
exports.getNotifications = async (req, res) => {
  try {
    const sellerId = req.user.userId;
    const notifications = await Notification.find({ userId: sellerId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.userId;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: sellerId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
