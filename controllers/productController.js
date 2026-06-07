const crypto = require('crypto');
const Product = require('../models/Product');
const Store = require('../models/Store');
const { uploadImageToCloudinary, deleteImageFromCloudinary } = require('../utils/cloudinary');

const slugify = (text) =>
  text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const generateUniqueSlug = async (name, excludeProductId = null) => {
  const baseSlug = slugify(name) || 'product';
  let slug = baseSlug;
  let count = 1;

  while (
    await Product.exists(
      excludeProductId
        ? { slug, _id: { $ne: excludeProductId } }
        : { slug }
    )
  ) {
    slug = `${baseSlug}-${count++}`;
  }

  return slug;
};


// Get all products with filters
exports.getProducts = async (req, res) => {
  try {
    const { category, minPrice, maxPrice, search, sellerId, page = 1, limit = 12 } = req.query;
    
    let filter = { status: 'active' };
    
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (sellerId) filter.sellerId = sellerId;
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    
    const skip = (page - 1) * limit;
    
    const products = await Product.find(filter)
      .populate('sellerId', 'firstName lastName')
      .populate('storeId', 'name rating')
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

// Get single product
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id)
      .populate('sellerId', 'firstName lastName email phone')
      .populate('storeId', 'name rating reviewCount policies');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Increment view count
    product.viewCount += 1;
    await product.save();
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create product (seller only)
exports.createProduct = async (req, res) => {
  let uploadedPublicIds = [];

  try {
    const { name, description, category, price, salePrice, stock, images, variants } = req.body;
    const sellerId = req.user.userId;

    // Get seller's store
    const store = await Store.findOne({ sellerId });
    if (!store) {
      return res.status(404).json({ message: 'Seller store not found' });
    }

    const slug = await generateUniqueSlug(name);
    const folder = `ecommers/products/${slug}`;

    // Upload images first (before saving to DB)
    const uploads = images && Array.isArray(images)
      ? await Promise.all(
          images.map(async (image, index) =>
            typeof image === 'string' && image.startsWith('data:')
              ? await uploadImageToCloudinary(image, folder, `${slug}-${index + 1}`)
              : { url: image, publicId: null }
          )
        )
      : [];

    // Track uploaded IDs for cleanup in case of error
    uploadedPublicIds = uploads.map((item) => item.publicId).filter(Boolean);

    // Only create product if image upload succeeded
    const product = new Product({
      sellerId,
      storeId: store._id,
      name,
      slug,
      description,
      category,
      price,
      salePrice,
      stock,
      images: uploads.map((item) => item.url),
      cloudinaryPublicIds: uploads.map((item) => item.publicId || ""),
      variants,
    });

    await product.save();

    res.status(201).json(product);
  } catch (error) {
    // Cleanup uploaded images if product creation failed
    if (uploadedPublicIds.length > 0) {
      for (const publicId of uploadedPublicIds) {
        try {
          await deleteImageFromCloudinary(publicId);
          console.log(`Cleaned up failed upload: ${publicId}`);
        } catch (cleanupErr) {
          console.warn(`Failed to cleanup image ${publicId}:`, cleanupErr?.message);
        }
      }
    }
    res.status(500).json({ message: error.message });
  }
};

// Update product (seller & admin authorized)
exports.updateProduct = async (req, res) => {
  let newUploadedPublicIds = [];

  try {
    const { id } = req.params;
    const { name, description, category, price, salePrice, stock, images, status } = req.body;
    const userId = req.user.userId;
    
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    if (product.sellerId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }
    
    const slug = name && name !== product.name
      ? await generateUniqueSlug(name, product._id)
      : product.slug;
    const folder = `ecommers/products/${slug}`;

    const existingImageMap = new Map();
    (product.images || []).forEach((url, index) => {
      const pid = product.cloudinaryPublicIds?.[index];
      existingImageMap.set(url, pid !== undefined && pid !== null ? pid : "");
    });

    // Process images: upload new ones, keep existing ones
    const uploads = images && Array.isArray(images)
      ? await Promise.all(
          images.map(async (image, index) => {
            if (typeof image === 'string' && image.startsWith('data:')) {
              const uniqueId = `${slug}-${Date.now()}-${index + 1}`;
              const uploaded = await uploadImageToCloudinary(image, folder, uniqueId);
              newUploadedPublicIds.push(uploaded.publicId);
              return uploaded;
            }
            return { url: image, publicId: existingImageMap.has(image) ? existingImageMap.get(image) : "" };
          })
        )
      : product.images.map((url, index) => ({
          url,
          publicId: (product.cloudinaryPublicIds?.[index] !== undefined && product.cloudinaryPublicIds?.[index] !== null)
            ? product.cloudinaryPublicIds[index]
            : ""
        }));

    const newImages = uploads.map((item) => item.url);
    const newPublicIds = uploads.map((item) => item.publicId || "");

    // Delete removed Cloudinary images
    const removedImageIds = [];
    (product.cloudinaryPublicIds || []).forEach((publicId, index) => {
      const url = product.images?.[index];
      if (publicId && url && !newImages.includes(url)) {
        removedImageIds.push(publicId);
      }
    });

    await Promise.all(
      removedImageIds.map(async (publicId) => {
        try {
          await deleteImageFromCloudinary(publicId);
        } catch (err) {
          console.warn('Failed to delete removed Cloudinary image:', err?.message || err);
        }
      })
    );

    // Update product fields
    Object.assign(product, {
      name: name || product.name,
      slug,
      description: description || product.description,
      category: category || product.category,
      price: price || product.price,
      salePrice: salePrice || product.salePrice,
      stock: stock !== undefined ? stock : product.stock,
      images: newImages,
      cloudinaryPublicIds: newPublicIds,
      status: status || product.status,
    });

    await product.save();
    res.json(product);
  } catch (error) {
    // Cleanup newly uploaded images if update failed
    if (newUploadedPublicIds.length > 0) {
      for (const publicId of newUploadedPublicIds) {
        try {
          await deleteImageFromCloudinary(publicId);
          console.log(`Cleaned up failed upload during update: ${publicId}`);
        } catch (cleanupErr) {
          console.warn(`Failed to cleanup image ${publicId}:`, cleanupErr?.message);
        }
      }
    }
    res.status(500).json({ message: error.message });
  }
};

// Delete product (seller & admin authorized)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    if (product.sellerId.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this product' });
    }

    // Delete Cloudinary images
    if (product.cloudinaryPublicIds?.length) {
      await Promise.all(
        product.cloudinaryPublicIds.map(async (publicId) => {
          if (publicId) {
            try {
              await deleteImageFromCloudinary(publicId);
            } catch (err) {
              console.warn('Cloudinary delete failed for', publicId, err?.message || err);
            }
          }
        })
      );
    }

    await Product.findByIdAndDelete(id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller's products
exports.getSellerProducts = async (req, res) => {
  try {
    const sellerId = req.user.userId;
    const { page = 1, limit = 12, status } = req.query;
    
    let filter = { sellerId };
    if (status) filter.status = status;
    
    const skip = (page - 1) * limit;
    
    const products = await Product.find(filter)
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
