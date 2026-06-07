const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';
    
    await mongoose.connect(mongoUri);

    console.log('MongoDB connected successfully');
    
    // Seed default admin
    const User = require('../models/User');
    const bcrypt = require('bcryptjs');
    try {
      const adminEmail = process.env.ADMIN_EMAIL || 'prarambha@gmail.com';
      const adminPassword = process.env.ADMIN_PASSWORD || 'prarambha@123';
      const adminExists = await User.findOne({ email: adminEmail });
      if (!adminExists) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminPassword, salt);
        const admin = new User({
          email: adminEmail,
          password: hashedPassword,
          firstName: 'Prarambha',
          lastName: 'Admin',
          role: 'admin',
          phone: '+91 98765 43210',
          whatsappEnabled: true,
          isVerified: true,
          isActive: true,
        });
        await admin.save();
        console.log(`Default admin seeded successfully: ${adminEmail} / ${adminPassword}`);
      }
    } catch (seedErr) {
      console.error('Error seeding default admin:', seedErr.message);
    }

    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
