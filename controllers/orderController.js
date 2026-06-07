const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Store = require('../models/Store');
const crypto = require('crypto');
const { sendOrderConfirmationEmails } = require('../utils/emailService');

// Initialize Razorpay
const Razorpay = require('razorpay');
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

if (!razorpayKeyId || !razorpayKeySecret) {
  console.warn('Razorpay keys not configured. Payment features will be unavailable.');
}

const razorpay = razorpayKeyId && razorpayKeySecret 
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

// Create order
exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, billingAddress, paymentMethod = 'razorpay' } = req.body;
    const customerId = req.user.userId;
    
    // Validate items
    let totalAmount = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }
      
      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
      
      const itemPrice = product.salePrice || product.price;
      const subtotal = itemPrice * item.quantity;
      
      orderItems.push({
        productId: product._id,
        sellerId: product.sellerId,
        storeId: product.storeId,
        productName: product.name,
        quantity: item.quantity,
        price: product.price,
        salePrice: itemPrice,
        variant: item.variant,
        subtotal,
      });
      
      totalAmount += subtotal;
    }
    
    // Create order in DB
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const order = new Order({
      orderNumber,
      customerId,
      items: orderItems,
      totalAmount,
      shippingAddress,
      billingAddress,
      paymentMethod,
      paymentStatus: paymentMethod === 'offline' ? 'pending' : 'unpaid',
      status: paymentMethod === 'offline' ? 'processing' : 'pending',
      verificationCode: paymentMethod === 'offline' ? Math.floor(100000 + Math.random() * 900000).toString() : undefined,
    });
    
    await order.save();

    // Handle offline payment (COD)
    if (paymentMethod === 'offline') {
      // Decrement stock immediately
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: -item.quantity } }
        );
      }

      // Create notifications for all sellers in the order
      const sellerIds = [...new Set(order.items.map(item => item.sellerId.toString()))];
      for (const sellerId of sellerIds) {
        const notification = new Notification({
          userId: sellerId,
          title: 'New Offline Order Received',
          message: `You have received a new Cash on Delivery / Hand Payment order ${order.orderNumber}. Please deliver the items and collect payment in-hand within 5 days.`,
          type: 'order',
          orderId: order._id,
        });
        await notification.save();
      }
      await triggerWhatsAppSimulation(order);
      await sendOrderConfirmationEmails(order);
    }

    // Create Razorpay order
    let razorpayOrder = null;
    if (paymentMethod === 'razorpay' && razorpay) {
      try {
        razorpayOrder = await razorpay.orders.create({
          amount: Math.round(totalAmount * 100), // Razorpay expects amount in paise
          currency: 'INR',
          receipt: order.orderNumber,
          notes: {
            orderId: order._id.toString(),
            customerId,
          },
        });

        // Store Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();
      } catch (razorpayError) {
        console.error('Razorpay order creation failed:', razorpayError);
      }
    }

    res.status(201).json({
      order,
      razorpayOrder: razorpayOrder ? {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      } : null,
      razorpayKeyId,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user's orders
exports.getOrders = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { page = 1, limit = 10, status } = req.query;
    
    let filter = { customerId };
    if (status) filter.status = status;
    
    const skip = (page - 1) * limit;
    
    const orders = await Order.find(filter)
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

// Get order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const order = await Order.findById(id).populate('items.productId');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check authorization
    const isCustomer = order.customerId.toString() === userId;
    const isSeller = order.items.some((item) => item.sellerId && item.sellerId.toString() === userId);
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isSeller && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update order status (seller/admin only)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, carrier, verificationCode } = req.body;
    const userId = req.user.userId;
    
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if user is the seller or admin
    const isSellerInOrder = order.items.some(
      (item) => item.sellerId.toString() === userId
    );
    
    if (!isSellerInOrder && req.user.role !== 'admin') {
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

// Confirm payment (Razorpay)
exports.confirmPayment = async (req, res) => {
  try {
    const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Verify Razorpay signature
    if (razorpaySignature && razorpayPaymentId && razorpayOrderId && razorpay) {
      try {
        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
          .createHmac('sha256', razorpayKeySecret)
          .update(body)
          .digest('hex');

        if (expectedSignature !== razorpaySignature) {
          return res.status(400).json({ message: 'Invalid payment signature' });
        }
      } catch (verifyError) {
        console.error('Signature verification failed:', verifyError);
        return res.status(400).json({ message: 'Payment verification failed' });
      }
    }

    // Mark payment as confirmed
    order.paymentStatus = 'paid';
    order.status = 'processing';
    order.transactionId = razorpayPaymentId;
    
    // Update product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } }
      );
    }
    
    await order.save();
    await triggerWhatsAppSimulation(order);
    await sendOrderConfirmationEmails(order);
    res.json({ message: 'Payment confirmed', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const triggerWhatsAppSimulation = async (order) => {
  try {
    const customer = await User.findById(order.customerId);
    const adminUser = await User.findOne({ role: 'admin' });

    // 1. WhatsApp to Customer
    if (customer && customer.whatsappEnabled) {
      console.log(`
================================================================================
[SIMULATED WHATSAPP MESSAGE TO CUSTOMER]
Recipient Phone: ${customer.phone || 'N/A (No phone number configured)'}
Recipient Name:  ${customer.firstName} ${customer.lastName}
Message:
"Dear ${customer.firstName}, thank you for ordering from Prarambha! 
Your order #${order.orderNumber} has been placed successfully. 
Total Amount: ₹${order.totalAmount.toFixed(2)}. 
Payment Method: ${order.paymentMethod === 'offline' ? 'Cash/Hand Payment' : 'Razorpay Online'}.
${order.paymentMethod === 'offline' && order.verificationCode ? `Please share this delivery verification code with the agent to confirm delivery: ${order.verificationCode}` : ''}
Thank you for shopping with us!"
================================================================================
      `);
    }

    // 2. WhatsApp to Admin
    if (adminUser && adminUser.whatsappEnabled) {
      console.log(`
================================================================================
[SIMULATED WHATSAPP MESSAGE TO ADMIN]
Recipient Phone: ${adminUser.phone || 'N/A (No phone number configured)'}
Recipient Name:  ${adminUser.firstName} ${adminUser.lastName} (Administrator)
Message:
"System Alert: A new order #${order.orderNumber} has been placed!
Customer: ${customer ? `${customer.firstName} ${customer.lastName} (${customer.email})` : 'Unknown'}
Grand Total: ₹${order.totalAmount.toFixed(2)}
Payment Method: ${order.paymentMethod === 'offline' ? 'Cash/Hand Payment (Offline)' : 'Razorpay Online (Paid)'}."
================================================================================
      `);
    }

    // 3. WhatsApp to Sellers
    // Group order items by sellerId
    const itemsBySeller = {};
    for (const item of order.items) {
      if (item.sellerId) {
        const sId = item.sellerId.toString();
        if (!itemsBySeller[sId]) {
          itemsBySeller[sId] = [];
        }
        itemsBySeller[sId].push(item);
      }
    }

    for (const [sellerId, items] of Object.entries(itemsBySeller)) {
      const sellerUser = await User.findById(sellerId);
      const sellerStore = await Store.findOne({ sellerId });
      
      // Check if store allows WhatsApp alerts
      if (sellerUser && sellerStore && sellerStore.whatsappEnabled) {
        const itemSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const itemsListStr = items.map(i => `- ${i.productName} (Qty: ${i.quantity})`).join('\n');
        
        console.log(`
================================================================================
[SIMULATED WHATSAPP MESSAGE TO SELLER]
Recipient Phone: ${sellerUser.phone || 'N/A (No phone number configured)'}
Recipient Name:  ${sellerUser.firstName} ${sellerUser.lastName} (Seller - ${sellerStore.name})
Message:
"Hello ${sellerUser.firstName}, your storefront "${sellerStore.name}" has received a new order for fulfillment!
Order Number: #${order.orderNumber}
Customer: ${customer ? `${customer.firstName} ${customer.lastName}` : 'Guest'} (Contact: ${customer?.phone || 'No phone provided'})
Items to Fulfill:
${itemsListStr}
Items Subtotal: ₹${itemSubtotal.toFixed(2)}
Payment Method: ${order.paymentMethod === 'offline' ? 'Cash/Hand Payment (COD)' : 'Razorpay Online'}
${order.paymentMethod === 'offline' && order.verificationCode ? `Please collect the payment in-hand and input the customer's verification code (${order.verificationCode.slice(0, 3)}***) in your panel to verify delivery.` : ''}"
================================================================================
        `);
      }
    }
  } catch (error) {
    console.error('Error during WhatsApp simulation:', error);
  }
};
