const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: String,
    logo: String,
    banner: String,
    category: String,
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    policies: {
      shipping: String,
      returns: String,
      refunds: String,
    },
    bankAccount: {
      accountHolderName: String,
      accountNumber: String,
      routingNumber: String,
      bankName: String,
    },
    stripeAccountId: String,
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    whatsappEnabled: {
      type: Boolean,
      default: true,
    },
    followerCount: {
      type: Number,
      default: 0,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Store', storeSchema);
