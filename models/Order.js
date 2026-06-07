const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
  },
  productName: String,
  quantity: Number,
  price: Number,
  salePrice: Number,
  variant: {
    size: String,
    color: String,
  },
  subtotal: Number,
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [orderItemSchema],
    totalAmount: Number,
    shippingCost: Number,
    tax: Number,
    discount: Number,
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded'],
      default: 'unpaid',
    },
    shippingAddress: {
      firstName: String,
      lastName: String,
      email: String,
      phone: String,
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    billingAddress: {
      firstName: String,
      lastName: String,
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    paymentMethod: String,
    transactionId: String,
    razorpayOrderId: String,
    verificationCode: String,
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    notes: String,
    adminNotes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
