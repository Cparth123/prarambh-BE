const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const { uploadImageToCloudinary, deleteImageFromCloudinary } = require('../utils/cloudinary');

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET || 'your_jwt_secret_key',
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key',
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, role = 'customer' } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({ message: 'Please provide all required fields (email, password, firstName, lastName, phone)' });
    }

    // Validate phone number format
    const cleanedPhone = phone.replace(/[\s\-()]/g, '');
    const isPhoneValid = /^\+?[1-9]\d{8,14}$/.test(cleanedPhone);
    if (!isPhoneValid) {
      return res.status(400).json({ message: 'Please provide a valid phone number (9 to 15 digits, e.g. +91 98765 43210)' });
    }

    if (role === 'admin') {
      return res.status(403).json({ message: 'Registering new administrators is prohibited.' });
    }

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
    });

    // If seller, create store
    if (role === 'seller') {
      const store = new Store({
        sellerId: user._id,
        name: req.body.storeName || firstName + ' ' + lastName,
        slug: (req.body.storeName || firstName + ' ' + lastName).toLowerCase().replace(/\s+/g, '-'),
      });
      await store.save();
      user.storeId = store._id;
    }

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    // Store refresh token in database
    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 3600000, // 1 hour
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 604800000, // 7 days
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      accessToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    // Store refresh token
    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 3600000,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 604800000,
    });

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      accessToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      const user = await User.findById(req.user.userId);
      user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== refreshToken);
      await user.save();
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key'
    );

    const user = await User.findById(decoded.userId);
    if (!user || !user.refreshTokens.some((rt) => rt.token === refreshToken)) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id, user.role);

    // Update refresh token
    user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== refreshToken);
    user.refreshTokens.push({ token: newRefreshToken });
    await user.save();

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000,
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 604800000,
    });

    res.json({ accessToken });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update profile details
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, profileImage, whatsappEnabled } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    
    if (phone !== undefined) {
      if (!phone) {
        return res.status(400).json({ message: 'Phone number is required' });
      }
      const cleanedPhone = phone.replace(/[\s\-()]/g, '');
      const isPhoneValid = /^\+?[1-9]\d{8,14}$/.test(cleanedPhone);
      if (!isPhoneValid) {
        return res.status(400).json({ message: 'Please provide a valid phone number (9 to 15 digits, e.g. +91 98765 43210)' });
      }
      user.phone = phone;
    }
    if (whatsappEnabled !== undefined) user.whatsappEnabled = whatsappEnabled;

    if (profileImage !== undefined) {
      if (typeof profileImage === 'string' && profileImage.startsWith('data:image/')) {
        const folder = `ecommers/users/${user._id}`;
        const uploaded = await uploadImageToCloudinary(profileImage, folder, `profile-${Date.now()}`);
        
        if (user.profileImagePublicId) {
          try {
            await deleteImageFromCloudinary(user.profileImagePublicId);
          } catch (err) {
            console.warn('Failed to delete old profile image:', err.message);
          }
        }
        
        user.profileImage = uploaded.url;
        user.profileImagePublicId = uploaded.publicId;
      } else if (profileImage === null || profileImage === '') {
        if (user.profileImagePublicId) {
          try {
            await deleteImageFromCloudinary(user.profileImagePublicId);
          } catch (err) {
            console.warn('Failed to delete profile image:', err.message);
          }
        }
        user.profileImage = null;
        user.profileImagePublicId = null;
      }
    }

    await user.save();
    res.json({ message: 'Profile updated successfully', user: user.toJSON() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update addresses list
exports.updateAddresses = async (req, res) => {
  try {
    const { addresses } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.addresses = addresses;
    await user.save();
    res.json({ message: 'Addresses updated successfully', user: user.toJSON() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide current and new password' });
    }

    const user = await User.findById(req.user.userId).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete account cascadingly
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete user profile image from Cloudinary
    if (user.profileImagePublicId) {
      try {
        await deleteImageFromCloudinary(user.profileImagePublicId);
      } catch (err) {
        console.warn('Failed to delete user profile image:', err.message);
      }
    }

    if (user.role === 'seller') {
      // Find seller's store
      const store = await Store.findOne({ sellerId: user._id });
      if (store) {
        // Find all products by seller
        const products = await Product.find({ sellerId: user._id });
        for (const product of products) {
          // Delete product images from Cloudinary
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
        
        // Delete products from database
        await Product.deleteMany({ sellerId: user._id });

        // Delete store from database
        await Store.findByIdAndDelete(store._id);
      }
    }

    // Delete reviews written by this customer
    if (user.role === 'customer') {
      const Review = require('../models/Review');
      await Review.deleteMany({ customerId: user._id });
    }

    // Finally delete user
    await User.findByIdAndDelete(userId);

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.googleAuth = async (req, res) => {
  try {
    const { idToken, role = 'customer', storeName } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Please provide Google ID token' });
    }

    // Verify token with Google API
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!response.ok) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }
    const payload = await response.json();

    if (!payload.sub) {
      return res.status(400).json({ message: 'Invalid Google token payload' });
    }

    const googleId = payload.sub;
    const email = payload.email?.toLowerCase();
    const firstName = payload.given_name || 'Google';
    const lastName = payload.family_name || 'User';
    const profileImage = payload.picture;

    // Check if user already has googleId
    let user = await User.findOne({ googleId });

    if (!user) {
      // Check if user exists with the same email
      user = await User.findOne({ email });
      if (user) {
        // Link googleId to existing user
        user.googleId = googleId;
        if (!user.profileImage) {
          user.profileImage = profileImage;
        }
        await user.save();
      } else {
        // Register new user via Google
        if (role === 'admin') {
          return res.status(403).json({ message: 'Registering administrators is prohibited.' });
        }

        user = new User({
          email,
          googleId,
          firstName,
          lastName,
          profileImage,
          role,
          isVerified: true,
        });

        if (role === 'seller') {
          const sName = storeName || `${firstName} ${lastName}`;
          const store = new Store({
            sellerId: user._id,
            name: sName,
            slug: sName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Math.floor(Math.random() * 1000),
          });
          await store.save();
          user.storeId = store._id;
        }

        await user.save();
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    // Store refresh token
    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 3600000, // 1 hour
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 604800000, // 7 days
    });

    res.status(200).json({
      message: 'Google login successful',
      user: user.toJSON(),
      accessToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
