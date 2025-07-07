const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth'); // <-- ADD THIS LINE

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  const { fullName, phone, password, role, location, language, area } = req.body;

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
      language: language,
      area: area
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
        const user = await User.findOne({ phone }).select('+password');
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
                    language: user.language,
                    area: user.area,
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

router.post('/change-password', authMiddleware, async (req, res) => {
    console.log("POST /api/auth/change-password received for user:", req.user.id); // Added log

    const { oldPassword, newPassword } = req.body;

    // Basic validation
    if (!oldPassword || !newPassword) {
        console.log("Change password error: Missing old or new password in body.");
        return res.status(400).json({ error: 'Please provide both old and new passwords.' });
    }

     // It's good practice to validate new password length on the backend too
     if (newPassword.length < 6) {
         console.log("Change password error: New password too short.");
         return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
     }


    try {
        // 1. Find the user by ID and EXPLICITLY SELECT the password field
        const user = await User.findById(req.user.id).select('+password'); // <-- ADD THIS .select('+password')

        if (!user) {
            console.log("Change password error: User not found in DB for ID:", req.user.id);
            // This case should ideally not happen if authMiddleware works correctly, but good for safety
            return res.status(404).json({ error: 'User not found.' });
        }

        console.log("Change password: User found. Comparing passwords...");

        // 2. Compare the provided old password with the hashed password from the database
        // This should now work because 'user.password' will contain the hash
        const isMatch = await bcrypt.compare(oldPassword, user.password);

        if (!isMatch) {
            console.log("Change password error: Incorrect old password.");
            return res.status(400).json({ error: 'Incorrect current password.' }); // Send a specific error message
        }

        console.log("Change password: Old password matched. Hashing new password...");

        // 3. If old password matches, hash the new password
        const salt = await bcrypt.genSalt(10); // Generate a salt
        user.password = await bcrypt.hash(newPassword, salt); // Hash the new password

        // 4. Save the user with the new hashed password
        await user.save();

        console.log("Change password: Password updated successfully for user:", user._id);

        // 5. Send success response
        res.json({ msg: 'Password changed successfully' }); // Send a success message

    } catch (err) {
        // This catch block handles unexpected errors like database issues
        console.error('Server Error changing password:', err.message, err); // Log detailed server error
        res.status(500).json({ error: 'Server Error changing password.' }); // Send a generic server error message
    }
});

module.exports = router;
