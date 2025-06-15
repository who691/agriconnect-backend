// backend/routes/users.js
const express = require('express');
const multer = require('multer');
const { avatarStorage } = require('../config/cloudinary');
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth'); // Import the new middleware
const User = require('../models/User');
const mongoose = require('mongoose'); // Import mongoose for ObjectId validation

const router = express.Router();

// Multer setup for Cloudinary Avatars
const uploadAvatarCloudinary = multer({ storage: avatarStorage });

// @route   GET /api/users/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error("Error fetching current user:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/users/me
// @desc    Update user profile (including avatar via Cloudinary) - Only for the logged-in user
// @access  Private
router.put('/me', [authMiddleware, uploadAvatarCloudinary.single('avatar')], async (req, res) => {
    const { fullName, phone, notifications, language } = req.body; // Include other updatable fields
    const profileFields = {};

    // Fetch the current user's notifications to merge (safer than direct overwrite)
    // If the user object is already populated in req.user by authMiddleware,
    // you might be able to use req.user.notifications directly, but fetching ensures latest data.
    let currentUser;
     try {
         currentUser = await User.findById(req.user.id).select('notifications');
         if (!currentUser) {
              return res.status(404).json({ msg: 'User not found during update (fetching current)' });
         }
     } catch (fetchErr) {
         console.error("Error fetching current user for update merge:", fetchErr.message);
         return res.status(500).send('Server Error during pre-fetch for update');
     }


    if (fullName !== undefined) profileFields.fullName = fullName; // Allow empty string for fullName if intended
    if (phone !== undefined) profileFields.phone = phone;     // Allow empty string for phone if intended

    // Safely handle nested objects like notifications
    if (notifications && typeof notifications === 'object') {
        // Merge incoming notifications with current ones
        profileFields.notifications = { ...currentUser.notifications, ...notifications };
    } else if (notifications !== undefined) {
         // If notifications field is sent but is not an object, maybe clear it or handle specifically
         console.warn("PUT /me received notifications field but it's not an object:", notifications);
         // Decide behavior: ignore, clear, or error
         // For now, ignoring invalid notification payload
    }

    if (language !== undefined) profileFields.language = language;


    if (req.file && req.file.path) { // req.file.path is the Cloudinary URL
        profileFields.avatarUrl = req.file.path;
    }

    try {
        // Ensure the user can only update THEIR OWN profile by using req.user.id
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: profileFields },
            { new: true, runValidators: true } // runValidators ensures schema validation runs on updates
        ).select('-password');

        if (!updatedUser) {
            // This case is unlikely if findByIdAndUpdate didn't throw but returned null,
            // unless the user was deleted between finding and updating, but good to handle.
            return res.status(404).json({ msg: 'User not found during update process' });
        }
        res.json(updatedUser);
    } catch (err) {
        console.error('User update error (Cloudinary):', err.message);
        if (err.name === 'ValidationError') {
            // Mongoose validation errors
            const errors = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
        // Catch duplicate key error (e.g., phone number)
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'Phone number already in use.' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/users/top-farmers
// @desc    Get top-rated users with the role 'farmer'
// @access  Public
router.get('/top-farmers', async (req, res) => {
    try {
        const { limit } = req.query;
        let query = User.find({ role: 'farmer' })
            .sort({ rating: -1 }) // Highest rating first
            .select('fullName avatarUrl rating _id'); // Send necessary data

        if (limit && parseInt(limit, 10) > 0) {
            query = query.limit(parseInt(limit, 10));
        }

        const farmers = await query.exec(); // Added .exec() for clarity with Mongoose queries
        res.json(farmers);
    } catch (err) {
        console.error("Error fetching top farmers:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/users/:id
// @desc    Get a user's public profile by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        // Validate if req.params.id is a valid ObjectId before querying
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }

        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error("Error fetching user by ID:", err.message);
        // err.kind === 'ObjectId' check is good, but initial validation is better
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found (error during query)' });
        }
        res.status(500).send('Server Error');
    }
});

// --- ADMIN ROUTES FOR USERS ---

// @route   GET /api/users/admin/all
// @desc    Get ALL users (Admin only)
// @access  Private (Admin)
router.get('/admin/all', [authMiddleware, adminAuth], async (req, res) => {
    try {
        // Optionally exclude passwords for all users, even for admin
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        console.error("Admin error fetching all users:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/users/admin/:id
// @desc    Get a specific user by ID (Admin only)
// @access  Private (Admin)
router.get('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
     try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }
        const user = await User.findById(req.params.id).select('-password'); // Exclude password
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error("Admin error fetching user by ID:", err.message);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found (error during query)' });
        }
        res.status(500).send('Server Error');
    }
});


// @route   PUT /api/users/admin/:id
// @desc    Update a specific user by ID (Admin only)
// @access  Private (Admin)
router.put('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
    // Allowed fields for admin to update
    const { fullName, phone, role, notifications, language, rating, addresses } = req.body;
    const updateFields = {};

    if (fullName !== undefined) updateFields.fullName = fullName;
    if (phone !== undefined) updateFields.phone = phone;
    if (role !== undefined) updateFields.role = role; // Admin can change role
    if (rating !== undefined) updateFields.rating = rating; // Admin can set rating

    // Admin can overwrite notifications entirely
    if (notifications !== undefined && typeof notifications === 'object') {
        updateFields.notifications = notifications;
    } else if (notifications !== undefined) {
         console.warn("Admin PUT /admin/:id received notifications field but it's not an object:", notifications);
    }
    if (language !== undefined) updateFields.language = language;

    // Admin can overwrite addresses entirely (or modify structure if needed)
    if (addresses !== undefined && Array.isArray(addresses)) {
        updateFields.addresses = addresses;
    } else if (addresses !== undefined) {
        console.warn("Admin PUT /admin/:id received addresses field but it's not an array:", addresses);
    }


    try {
        // Validate the ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, // Use param ID here
            { $set: updateFields },
            { new: true, runValidators: true } // runValidators ensures schema validation runs on updates
        ).select('-password'); // Exclude password from response

        if (!updatedUser) {
            return res.status(404).json({ msg: 'User not found for update' });
        }
        res.json(updatedUser);
    } catch (err) {
        console.error('Admin user update error:', err.message);
         if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
         if (err.code === 11000) {
            return res.status(400).json({ msg: 'Phone number already in use by another user.' });
        }
        res.status(500).send('Server Error');
    }
});


// @route   DELETE /api/users/admin/:id
// @desc    Delete a specific user by ID (Admin only)
// @access  Private (Admin)
router.delete('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }
        // Prevent admin from deleting themselves (optional but good practice)
        if (req.user.id === req.params.id.toString()) { // Compare as strings
             return res.status(400).json({ msg: 'Cannot delete your own admin account via this route' });
        }

        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ msg: 'User not found for deletion' });
        }
        res.json({ msg: 'User removed' });
    } catch (err) {
        console.error('Admin user deletion error:', err.message);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found for deletion (query error)' });
        }
        res.status(500).send('Server Error');
    }
});


// IMPORTANT: Ensure this module.exports is at the very end of the file
module.exports = router;





// // backend/routes/users.js
// const express = require('express');
// // Multer (upload), path, supabase, authMiddleware, User model imports...
// const supabase = require('../config/supabaseClient');
// const authMiddleware = require('../middleware/auth');
// const User = require('../models/User');
// const path = require('path');

// const router = express.Router();
// // upload (Multer instance) should be defined here or imported

// // PUT /api/users/me - Update current user's profile
// router.put('/me', [authMiddleware, upload.single('avatar')], async (req, res) => {
//   const { fullName, phone } = req.body;
//   const updateFields = {};

//   if (fullName) updateFields.fullName = fullName;
//   if (phone) updateFields.phone = phone;

//   if (req.file) {
//     try {
//       const fileExt = path.extname(req.file.originalname).toLowerCase();
//       // Use a consistent name for user's avatar, e.g., based on user ID, to allow overwriting
//       const fileNameInBucket = `avatars/${req.user.id}${fileExt}`;

//       const { error: uploadError } = await supabase.storage
//         .from('avatars') // YOUR SUPABASE BUCKET FOR AVATARS
//         .upload(fileNameInBucket, req.file.buffer, {
//           contentType: req.file.mimetype,
//           upsert: true, // Important: Overwrite existing avatar
//         });

//       if (uploadError) throw uploadError;

//       const { data: publicUrlData } = supabase.storage
//         .from('avatars')
//         .getPublicUrl(fileNameInBucket);

//       if (publicUrlData && publicUrlData.publicUrl) {
//         updateFields.avatarUrl = publicUrlData.publicUrl;
//       }
//     } catch (uploadErr) {
//       console.error('Supabase avatar upload error:', uploadErr);
//       // Decide if an avatar upload failure should prevent other profile updates
//     }
//   }

//   try {
//     const user = await User.findByIdAndUpdate(
//       req.user.id,
//       { $set: updateFields },
//       { new: true, runValidators: true }
//     ).select('-password');

//     if (!user) return res.status(404).json({ msg: 'User not found' });
//     res.json(user);
//   } catch (err) {
//     console.error('User update error (Supabase):', err.message);
//     if (err.name === 'ValidationError') {
//         return res.status(400).json({ msg: err.message });
//     }
//     res.status(500).send('Server Error');
//   }
// });

// module.exports = router;





// // backend/routes/users.js

// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const User = require('../models/User');
// const authMiddleware = require('../middleware/auth');

// const router = express.Router();

// // --- Multer for Avatar Uploads ---
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/avatars/'),
//   filename: (req, file, cb) => cb(null, `avatar-${req.user.id}${path.extname(file.originalname)}`)
// });

// const fileFilter = (req, file, cb) => {
//     if (file.mimetype.startsWith('image')) {
//         cb(null, true);
//     } else {
//         cb(new Error('Not an image! Please upload an image.'), false);
//     }
// };

// const upload = multer({ storage: storage, fileFilter: fileFilter });


// // --- PRIVATE 'ME' ROUTES ---

// // @route   GET /api/users/me
// // @desc    Get current user's profile
// // @access  Private
// router.get('/me', authMiddleware, async (req, res) => {
//     try {
//         const user = await User.findById(req.user.id).select('-password');
//         if (!user) {
//             return res.status(404).json({ error: 'User not found' });
//         }
//         res.json(user);
//     } catch (err) {
//         res.status(500).send('Server Error');
//     }
// });

// // @route   PUT /api/users/me
// // @desc    Update user profile
// // @access  Private
// router.put('/me', [authMiddleware, upload.single('avatar')], async (req, res) => {
//     const { fullName, phone } = req.body;
//     const profileFields = {};
//     if (fullName) profileFields.fullName = fullName;
//     if (phone) profileFields.phone = phone;
//     if (req.file) {
//         profileFields.avatarUrl = `/uploads/avatars/${req.file.filename}`;
//     }

//     try {
//         let user = await User.findByIdAndUpdate(
//             req.user.id,
//             { $set: profileFields },
//             { new: true }
//         ).select('-password');
//         res.json(user);
//     } catch (err) {
//         console.error("Error updating user:", err.message);
//         res.status(500).send('Server Error');
//     }
// });


// // --- SPECIALIZED PUBLIC ROUTES (MUST BE BEFORE '/:id') ---

// // @route   GET /api/users/top-farmers
// // @desc    Get top-rated users with the role 'farmer'
// // @access  Public
// // --- THIS IS THE ROUTE THAT FIXES THE 404 ERROR ---
// // router.get('/top-farmers', async (req, res) => {
// //     try {
// //         const farmers = await User.find({ role: 'farmer' })
// //             .sort({ rating: -1 }) // Highest rating first
// //             .limit(10)
// //             .select('fullName avatarUrl rating'); // Only send necessary data

// //         res.json(farmers);
// //     } catch (err) {
// //         console.error("Error fetching top farmers:", err.message);
// //         res.status(500).send('Server Error');
// //     }
// // });

// router.get('/top-farmers', async (req, res) => {
//     try {
//         const { limit } = req.query; // Check for a limit query parameter
//         let query = User.find({ role: 'farmer' })
//             .sort({ rating: -1 })
//             .select('fullName avatarUrl rating _id'); // Ensure _id is selected

//         if (limit && parseInt(limit) > 0) { // If a specific limit is requested
//             query = query.limit(parseInt(limit));
//         }
//         // If no limit query param, it will return all farmers matching the role

//         const farmers = await query;
//         res.json(farmers);
//     } catch (err) {
//         console.error("Error fetching top farmers:", err.message);
//         res.status(500).send('Server Error');
//     }
// });


// // --- DYNAMIC PUBLIC ROUTES (MUST BE LAST) ---

// // @route   GET /api/users/:id
// // @desc    Get a user's public profile by ID
// // @access  Public
// router.get('/:id', async (req, res) => {
//     try {
//         const user = await User.findById(req.params.id).select('-password');
//         if (!user) {
//             return res.status(404).json({ msg: 'User not found' });
//         }
//         res.json(user);
//     } catch (err) {
//         console.error(err.message);
//         if (err.kind === 'ObjectId') {
//             return res.status(404).json({ msg: 'User not found' });
//         }
//         res.status(500).send('Server Error');
//     }
// });

// module.exports = router;