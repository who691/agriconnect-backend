const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth'); // <-- ADD THIS LINE

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  const { fullName, phone, password, role, location, language } = req.body;

  // Basic validation
  if (!fullName || !phone || !password || !role || !location || !language) {
    return res.status(400).json({ error: 'Please provide all required fields.' });
  }
   if (!location.latitude || !location.longitude) {
    return res.status(400).json({ error: 'Valid location data is required.' });
  }

  try {
    // 1. Check if user already exists
    let user = await User.findOne({ phone });
    if (user) {
      return res.status(400).json({ error: 'User with this phone number already exists.' });
    }

    // 2. Create new user instance
    user = new User({
      fullName,
      phone,
      password, // Plain password for now, will be hashed next
      role,
      location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude] // GeoJSON format: [lng, lat]
      },
      language: language
    });

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // 4. Save the user to the database
    await user.save();

    // 5. Return success response (DO NOT return the password)
    // The user object from MongoDB will have an _id, which is exactly what you need for chat, etc.
    res.status(201).json({
      message: 'User registered successfully!',
      userId: user._id
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/auth/login
// @desc    Login a user and return a JWT
router.post('/login', async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ error: 'Please provide phone and password.' });
    }

    try {
        // 1. Check if user exists
        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials.' });
        }

        // 2. Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials.' });
        }

        // 3. User is valid, create JWT payload
        const payload = {
            user: {
                id: user.id, // or user._id
                role: user.role
            }
        };

        // 4. Sign the token
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            // 5. Return the token and user info (without password)
            res.json({
                token,
                user: {
                    id: user.id,
                    fullName: user.fullName,
                    phone: user.phone,
                    role: user.role,
                    avatarUrl: user.avatarUrl,
                    // You can add location here if needed on login
                }
            });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/change-password', authMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Please provide both old and new passwords.' });
    }

    try {
        const user = await User.findById(req.user.id);

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Incorrect current password.' });
        }
        
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        
        await user.save();
        res.json({ msg: 'Password updated successfully.' });

    } catch (err) {
        console.error("Password change error:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;