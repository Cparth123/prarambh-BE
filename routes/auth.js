const express = require('express');
const {
  register,
  login,
  googleAuth,
  logout,
  refreshToken,
  getCurrentUser,
  updateProfile,
  updateAddresses,
  changePassword,
  deleteAccount,
} = require('../controllers/authController');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/logout', auth, logout);
router.post('/refresh-token', refreshToken);
router.get('/me', auth, getCurrentUser);
router.put('/profile', auth, updateProfile);
router.put('/addresses', auth, updateAddresses);
router.put('/change-password', auth, changePassword);
router.delete('/account', auth, deleteAccount);

module.exports = router;
