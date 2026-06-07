const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  size: String,
  color: String,
  sku: String,
  price: Number,
  stock: Number,
  images: [String],
});

const productSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
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
    category: String,
    price: {
      type: Number,
      required: true,
    },
    salePrice: Number,
    images: [String],
    cloudinaryPublicIds: [String],
    variants: [variantSchema],
    stock: {
      type: Number,
      required: true,
      default: 0,
    },
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
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'active',
    },
    tags: [String],
    weight: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
    },
    shippingInfo: {
      weight: Number,
      dimensions: Object,
    },
    attributes: {
      type: Map,
      of: String,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    salesCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
