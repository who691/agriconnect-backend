// backend/routes/users.js
const express = require('express');
// Removed bcrypt and jwt as they are only needed for auth (login/register/change-password)
const multer = require('multer');
// Removed path as it's not used in the final Cloudinary storage config
const { avatarStorage } = require('../config/cloudinary'); // Assuming Cloudinary is used for avatars
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth'); // Import the admin middleware
const User = require('../models/User');
const mongoose = require('mongoose'); // Import mongoose for ObjectId validation

const router = express.Router();

// Multer setup for Cloudinary Avatars - used only for PUT /me
const uploadAvatarCloudinary = multer({ storage: avatarStorage });

// --- PRIVATE 'ME' ROUTES (Requires logged-in user) ---

// @route   GET /api/users/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', authMiddleware, async (req, res) => {
    console.log("GET /api/users/me received for user:", req.user.id); // Added log
    try {
        // --- FIX HERE: Explicitly select ALL fields needed by the frontend after login ---
        // Including _id, fullName, phone, role, avatarUrl, notifications, language, AND addresses, location
        const user = await User.findById(req.user.id).select('_id fullName phone role avatarUrl notifications language addresses location area').populate('addresses');
        if (!user) {
             console.log("/users/me - User not found for ID:", req.user.id); // Added log
            // Log out the user on the backend side if their ID is invalid/not found
             // Note: The client AuthContext already handles 401 logout. A 404 here is rarer.
            return res.status(404).json({ error: 'User not found' });
        }
         console.log("/users/me - Found user:", JSON.stringify({ _id: user._id, fullName: user.fullName, role: user.role,area: user.area, hasLocation: !!user.location, addressesCount: user.addresses?.length }, null, 2)); // Added log, simplified output
        res.json(user);
    } catch (err) {
        console.error("Error fetching current user (/me):", err.message, err); // More detailed error log
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/users/me
// @desc    Update user profile (including avatar via Cloudinary) - Only for the logged-in user
// @access  Private
router.put('/me', [authMiddleware, uploadAvatarCloudinary.single('avatar')], async (req, res) => {
    console.log("PUT /api/users/me received for user:", req.user.id); // Added log
    console.log("PUT /api/users/me - Body:", JSON.stringify(req.body, null, 2)); // Added log
    console.log("PUT /api/users/me - File:", req.file ? req.file.path : 'No file'); // Added log

    const { fullName, phone, notifications, language, area } = req.body; // Include other updatable fields
    const profileFields = {};

    // Fetch the current user's notifications to merge (safer than direct overwrite)
    let currentUser;
     try {
         // --- Select notifications only ---
         currentUser = await User.findById(req.user.id).select('notifications');
         if (!currentUser) {
              console.log("PUT /me - User not found during current user fetch:", req.user.id); // Added log
              return res.status(404).json({ msg: 'User not found during update (fetching current)' });
         }
          console.log("PUT /me - Current user notifications before merge:", JSON.stringify(currentUser.notifications, null, 2)); // Added log
     } catch (fetchErr) {
         console.error("Error fetching current user for update merge (/me):", fetchErr.message, fetchErr); // More detailed error log
         return res.status(500).send('Server Error during pre-fetch for update');
     }


    if (fullName !== undefined) profileFields.fullName = fullName; // Allow empty string for fullName if intended
    if (phone !== undefined) profileFields.phone = phone;     // Allow empty string for phone if intended

    // Safely handle nested objects like notifications
    if (notifications !== undefined && typeof notifications === 'object') { // Check if notifications is provided AND is an object
        // Merge incoming notifications with current ones IF currentUser.notifications is also an object
        // Otherwise, just use the incoming notifications object
        if (currentUser.notifications && typeof currentUser.notifications === 'object') {
             profileFields.notifications = { ...currentUser.notifications, ...notifications };
        } else {
            profileFields.notifications = notifications; // Overwrite if existing is not an object
        }
         console.log("PUT /me - Merged/Set notifications:", JSON.stringify(profileFields.notifications, null, 2)); // Added log
    } else if (notifications !== undefined) {
         // If notifications field is sent but is not an object, maybe clear it or handle specifically
         console.warn("PUT /me received notifications field but it's not an object:", notifications);
         // Decide behavior: ignore, clear, or error
         // For now, ignoring invalid notification payload, but could set profileFields.notifications = {} or null if intended
    }

    if (language !== undefined) profileFields.language = language;
    if (area !== undefined) profileFields.area = area;


    if (req.file && req.file.path) { // req.file.path is the Cloudinary URL
        profileFields.avatarUrl = req.file.path;
         console.log("PUT /me - Setting avatarUrl:", profileFields.avatarUrl); // Added log
    }

    try {
        // Ensure the user can only update THEIR OWN profile by using req.user.id
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: profileFields },
            { new: true, runValidators: true } // Return the updated document and run schema validators
        )
        // --- SELECT fields to return after update, INCLUDING all necessary fields ---
        // List all fields you need in the response object on the frontend AFTER update.
        .select('_id fullName phone role avatarUrl notifications language addresses location')
        .populate('addresses');

        if (!updatedUser) {
             console.log("PUT /me - User not found during findByIdAndUpdate:", req.user.id); // Added log
            return res.status(404).json({ msg: 'User not found during update process' });
        }
         console.log("PUT /me - User updated successfully:", JSON.stringify({ _id: updatedUser._id, fullName: updatedUser.fullName, role: updatedUser.role, hasLocation: !!updatedUser.location, addressesCount: updatedUser.addresses?.length }, null, 2)); // Added log
        res.json(updatedUser); // Return the updated user object

    } catch (err) {
        console.error('User update error (/me):', err.message, err); // More detailed error log
        if (err.name === 'ValidationError') {
            // Mongoose validation errors
            const errors = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
        // Catch duplicate key error (e.g., phone number)
        if (err.code === 11000) {
            // Check if the error message is specific to the phone field if possible
             const duplicateKeyField = err.message.includes('phone') ? 'Phone number' : 'Field'; // Simple check
            return res.status(400).json({ msg: `${duplicateKeyField} already in use.` });
        }
        res.status(500).send('Server Error');
    }
});



// @route   PATCH /api/users/me
// @desc    Partially update user profile (e.g., language, notifications)
// @access  Private
// NOTE: This route is specifically for partial updates *without* file uploads.
router.patch('/me', authMiddleware, async (req, res) => {
    console.log("PATCH /api/users/me received for user:", req.user.id); // Log entry point
    console.log("PATCH /api/users/me - Body:", JSON.stringify(req.body, null, 2)); // Log request body

    const updateFields = {}; // Object to hold fields to update

    // Define explicitly allowed fields for partial updates via PATCH
    // This prevents unauthorized updates to fields like 'role', 'rating', 'avatarUrl' (use PUT for avatar)
    const allowedPatchFields = ['fullName', 'phone', 'notifications', 'language','area'];

    // Process allowed fields from the request body
    allowedPatchFields.forEach(field => {
        // Check if the field exists in the request body (including if value is null)
        if (req.body.hasOwnProperty(field) && req.body[field] !== undefined) {
             // Special handling for notifications to merge instead of replace if it's an object
             if (field === 'notifications' && typeof req.body[field] === 'object' && req.body[field] !== null) {
                  // Defer notifications merge logic until after the loop
                  return; // Skip adding directly to updateFields for now
             }
             // For simple fields like fullName, phone, language, add directly
             updateFields[field] = req.body[field];
             console.log(`PATCH /me - Adding field "${field}":`, updateFields[field]);
        } else if (req.body.hasOwnProperty(field) && req.body[field] === undefined) {
             // If a field is explicitly set to undefined in the payload, ignore it.
             // If you wanted to allow setting a field to null, you'd adjust this check.
             console.log(`PATCH /me - Ignoring field "${field}" as value is undefined.`);
        }
    });


    // --- Handle Notifications Merge Separately ---
    // Only if 'notifications' was present in the request body AND is a valid object
    if (req.body.hasOwnProperty('notifications') && typeof req.body.notifications === 'object' && req.body.notifications !== null) {
         try {
             // Fetch only the current notifications field for the user
             const currentUserForNotifications = await User.findById(req.user.id).select('notifications');

             // Check if the user exists and has existing notifications (or if existing is null/undefined)
             if (currentUserForNotifications) {
                 // Merge the incoming notifications object with the existing one
                 // If currentUserForNotifications.notifications is null or not an object,
                 // the spread operator will handle it gracefully, resulting in just req.body.notifications
                 updateFields.notifications = {
                     ...(currentUserForNotifications.notifications && typeof currentUserForNotifications.notifications === 'object' ? currentUserForNotifications.notifications : {}),
                     ...req.body.notifications
                 };
                 console.log("PATCH /me - Merged notifications:", JSON.stringify(updateFields.notifications, null, 2));
             } else {
                  // This case should ideally not happen if authMiddleware passes, but included for robustness
                 console.error("PATCH /me - User not found when fetching notifications for merge.");
                 // Decide: error out or proceed? Proceeding might lose the notification update. Erroring is safer.
                 return res.status(404).json({ msg: 'User not found when attempting notification update' });
             }
         } catch (fetchErr) {
             console.error("Error fetching current user for notifications merge (PATCH /me):", fetchErr.message, fetchErr);
             // Error out if we can't merge notifications safely? Or just log a warning and skip notifications?
             // Skipping the notification update but proceeding with others might be acceptable.
             console.warn("PATCH /me - Failed to fetch current notifications for merging. Skipping notification update.");
             // Remove notifications from updateFields if it was added previously (it wasn't with the current logic, but safe check)
             delete updateFields.notifications;
         }
    } else if (req.body.hasOwnProperty('notifications') && req.body.notifications !== undefined) {
        // If notifications field is sent but is not a valid non-null object, warn/ignore.
        console.warn("PATCH /me received notifications field but it's not a valid non-null object:", req.body.notifications);
        // Don't add to updateFields, effectively ignoring the invalid input for notifications.
    }


    // Check if there are any fields left to update after processing
    if (Object.keys(updateFields).length === 0) {
        console.log("PATCH /me - No valid fields provided for update after processing.");
         return res.status(400).json({ msg: 'No valid fields provided for update' });
    }

    try {
        // Find user by ID and update the fields using $set
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateFields }, // Use $set for partial update
            { new: true, runValidators: true } // Return the updated document and run schema validators
        )
        // Select fields to return after update, INCLUDING all necessary fields for AuthContext
        .select('_id fullName phone role avatarUrl notifications language addresses location area')
        .populate('addresses'); // Re-populate addresses

        if (!updatedUser) {
             console.log("PATCH /me - User not found for update:", req.user.id);
            return res.status(404).json({ msg: 'User not found for update' });
        }

        console.log("PATCH /me - User updated successfully:", JSON.stringify({ _id: updatedUser._id, fullName: updatedUser.fullName, role: updatedUser.role, language: updatedUser.language,area: updatedUser.area, hasLocation: !!updatedUser.location, addressesCount: updatedUser.addresses?.length }, null, 2));

        res.json(updatedUser); // Return the updated user object

    } catch (err) {
        console.error('User profile patch error (/me):', err.message, err);
         if (err.name === 'ValidationError') {
             // Mongoose validation errors (e.g., language not in enum, invalid phone format)
             const errors = Object.values(err.errors).map(val => val.message);
             return res.status(400).json({ msg: errors.join(', ') });
         }
         // Catch duplicate key error (e.g., phone number uniqueness)
         if (err.code === 11000) {
             const duplicateKeyField = err.message.includes('phone') ? 'Phone number' : 'Field';
             return res.status(400).json({ msg: `${duplicateKeyField} already in use.` });
         }
        res.status(500).send('Server Error');
    }
});






// --- PUBLIC ROUTES ---

// @route   GET /api/users/top-farmers
// @desc    Get top-rated users with the role 'farmer'
// @access  Public
router.get('/top-farmers', async (req, res) => {
    console.log("GET /api/users/top-farmers received"); // Added log
    try {
        const { limit } = req.query;
        // Filter for role 'farmer' AND rating > 0 (assuming rating > 0 means "Top")
        // Adding .lean() for performance as this is a read-only list
        let query = User.find({ role: 'farmer', rating: { $gt: 0 } }) // Filter for rating > 0
            .sort({ rating: -1, fullName: 1 }) // Highest rating first, then alphabetical
            // --- Select necessary data, INCLUDING _id ---
            .select('_id fullName avatarUrl rating phone') 
            .lean(); // Added .lean()

        if (limit && parseInt(limit, 10) > 0) {
            query = query.limit(parseInt(limit, 10));
        }

        const farmers = await query.exec();
         console.log(`GET /api/users/top-farmers - Found ${farmers.length} farmers.`); // Added log
        res.json(farmers);
    } catch (err) {
        console.error("Error fetching top farmers:", err.message, err); // More detailed error log
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/users/:id
// @desc    Get a user's public profile by ID
// @access  Public
router.get('/:id', async (req, res) => {
     console.log(`GET /api/users/${req.params.id} received`); // Added log
    try {
        // Validate if req.params.id is a valid ObjectId before querying
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             console.log(`GET /api/users/${req.params.id} - Invalid ID format.`); // Added log
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }

        // --- Select necessary public data, INCLUDING _id ---
        // Adding .lean() for performance
        const user = await User.findById(req.params.id)
            .select('_id fullName role avatarUrl rating phone') // Select public fields
            .lean(); // Added .lean()

        if (!user) {
            console.log(`GET /api/users/${req.params.id} - User not found.`); // Added log
            return res.status(404).json({ msg: 'User not found' });
        }
         console.log(`GET /api/users/${req.params.id} - Found user:`, JSON.stringify({ _id: user._id, fullName: user.fullName, role: user.role }, null, 2)); // Added log
        res.json(user);
    } catch (err) {
        console.error(`Error fetching user by ID ${req.params.id}:`, err.message, err); // More detailed error log
        // err.kind === 'ObjectId' check is good, but initial validation is better
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found (query error)' });
        }
        res.status(500).send('Server Error');
    }
});

// --- ADMIN ROUTES (Requires Admin role) ---

// @route   GET /api/users/admin/all
// @desc    Get ALL users (Admin only)
// @access  Private (Admin)
router.get('/admin/all', [authMiddleware, adminAuth], async (req, res) => {
     console.log("GET /api/users/admin/all received (Admin)"); // Added log
     const fieldsQuery = req.query.fields; // e.g., ?fields=fullName,phone,role,rating,_id
     let selectFields = '-password'; // Default: exclude password

    if (fieldsQuery) {
         // Split fields query string, ensure _id is always included for list keys
        const requestedFields = fieldsQuery.split(',').map(f => f.trim()).filter(f => f !== 'password'); // Remove password even if requested
         if (!requestedFields.includes('_id')) {
             requestedFields.push('_id'); // Always include _id
         }
         selectFields = requestedFields.join(' '); // Format for Mongoose select
    } else {
         // If no fields query, select default useful admin fields
         // --- Select default fields, INCLUDING _id, and fields for admin list ---
         selectFields = '_id fullName phone role rating avatarUrl createdAt lastLogin'; 
    }

    try {
        // Use the dynamic selectFields
        // Adding .lean() for performance
        const users = await User.find().select(selectFields).lean(); 
         console.log(`GET /api/users/admin/all - Found ${users.length} users.`); // Added log
        res.json(users);
    } catch (err) {
        console.error("Admin error fetching all users:", err.message, err); // More detailed error log
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/users/admin/:id
// @desc    Get a specific user by ID (Admin only)
// @access  Private (Admin)
router.get('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
     console.log(`GET /api/users/admin/${req.params.id} received (Admin)`); // Added log
     try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             console.log(`GET /api/users/admin/${req.params.id} - Invalid ID format.`); // Added log
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }
        // --- Select all fields except password, INCLUDING _id ---
        // Adding .lean() for performance
        const user = await User.findById(req.params.id).select('-password').lean(); 
        if (!user) {
            console.log(`GET /api/users/admin/${req.params.id} - User not found.`); // Added log
            return res.status(404).json({ msg: 'User not found' });
        }
        console.log(`GET /api/users/admin/${req.params.id} - Found user:`, JSON.stringify({ _id: user._id, fullName: user.fullName, role: user.role }, null, 2)); // Added log
        res.json(user);
    } catch (err) {
        console.error(`Admin error fetching user by ID ${req.params.id}:`, err.message, err); // More detailed error log
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found (query error)' });
        }
        res.status(500).send('Server Error');
    }
});


// @route   PUT /api/users/admin/:id
// @desc    Update a specific user by ID (Admin only)
// @access  Private (Admin)
router.put('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
     console.log(`PUT /api/users/admin/${req.params.id} received (Admin)`); // Added log
     console.log("PUT /api/users/admin/:id - Body:", JSON.stringify(req.body, null, 2)); // Added log
    // Allowed fields for admin to update
    // Note: Password change should ideally be a separate, more secure endpoint, not via standard PUT
    const { fullName, phone, role, notifications, language, rating, addresses } = req.body;
    const updateFields = {};

    if (fullName !== undefined) updateFields.fullName = fullName;
    if (phone !== undefined) updateFields.phone = phone;
    if (role !== undefined) updateFields.role = role; // Admin can change role

    // Handle 'rating' update with validation
    if (rating !== undefined) {
        const parsedRating = parseFloat(rating);
         // Validate rating is a number and within a reasonable range (e.g., 0 to 5)
        if (isNaN(parsedRating) || parsedRating < 0 || parsedRating > 5) {
             console.log(`PUT /api/users/admin/${req.params.id} - Invalid rating value:`, rating); // Added log
             return res.status(400).json({ msg: 'Invalid rating value. Must be between 0 and 5.' });
        }
        updateFields.rating = parsedRating; // Admin can set rating
    }

    // Admin can overwrite notifications entirely
    if (notifications !== undefined && typeof notifications === 'object') {
        updateFields.notifications = notifications;
         console.log("PUT /api/users/admin/:id - Setting notifications:", JSON.stringify(notifications, null, 2)); // Added log
    } else if (notifications !== undefined) {
         console.warn("Admin PUT /admin/:id received notifications field but it's not an object:", notifications);
    }
    if (language !== undefined) updateFields.language = language;

    // Admin can overwrite addresses entirely (or modify structure if needed)
    // Note: Handling nested array updates via $set replaces the whole array.
    // For partial updates to arrays, you might need $push, $pull, $set (for specific elements), etc.
    if (addresses !== undefined && Array.isArray(addresses)) {
        updateFields.addresses = addresses;
         console.log("PUT /api/users/admin/:id - Setting addresses:", JSON.stringify(addresses, null, 2)); // Added log
    } else if (addresses !== undefined) {
        console.warn("Admin PUT /admin/:id received addresses field but it's not an array:", addresses);
    }
    
    // Note: Admin updating user's location might be a separate concern,
    // and would also need validation similar to registration.

    try {
        // Validate the ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             console.log(`PUT /api/users/admin/${req.params.id} - Invalid ID format.`); // Added log
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id, // Use param ID here
            { $set: updateFields },
            { new: true, runValidators: true } // Return the updated document and run schema validators
        )
        // --- SELECT fields to return after update, INCLUDING all necessary fields ---
        // List all fields you need in the response object on the frontend.
        // Mongoose will automatically exclude 'password' if it has `select: false` in the schema,
        // or if you just don't include it here.
        // Adding .lean() for performance if this response is mainly for display
        .select('_id fullName phone role rating avatarUrl notifications language addresses location')
        .lean(); 

        if (!updatedUser) {
             console.log(`PUT /api/users/admin/${req.params.id} - User not found for update.`); // Added log
            return res.status(404).json({ msg: 'User not found for update' });
        }
         console.log(`PUT /api/users/admin/${req.params.id} - User updated successfully:`, JSON.stringify({ _id: updatedUser._id, fullName: updatedUser.fullName, role: updatedUser.role, hasLocation: !!updatedUser.location, addressesCount: updatedUser.addresses?.length }, null, 2)); // Added log
        res.json(updatedUser); // Return the updated user object

    } catch (err) {
        console.error(`Admin user update error for ID ${req.params.id}:`, err.message, err); // More detailed error logging
         if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
         if (err.code === 11000) {
            // Consider checking if the error message explicitly mentions the phone field
            const duplicateKeyField = err.message.includes('phone') ? 'Phone number' : 'Field'; // Basic check
            return res.status(400).json({ msg: `${duplicateKeyField} already in use by another user.` });
        }
        res.status(500).send('Server Error');
    }
});


// @route   DELETE /api/users/admin/:id
// @desc    Delete a specific user by ID (Admin only)
// @access  Private (Admin)
router.delete('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
     console.log(`DELETE /api/users/admin/${req.params.id} received (Admin)`); // Added log
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             console.log(`DELETE /api/users/admin/${req.params.id} - Invalid ID format.`); // Added log
             return res.status(400).json({ msg: 'Invalid user ID format' });
        }
        // Prevent admin from deleting themselves (optional but good practice)
        if (req.user.id === req.params.id.toString()) { // Compare as strings
             console.log(`DELETE /api/users/admin/${req.params.id} - Cannot delete self.`); // Added log
             return res.status(400).json({ msg: 'Cannot delete your own admin account via this route' });
        }

        const user = await User.findByIdAndDelete(req.params.id).lean(); // Add lean()

        if (!user) {
             console.log(`DELETE /api/users/admin/${req.params.id} - User not found for deletion.`); // Added log
            return res.status(404).json({ msg: 'User not found for deletion' });
        }
         console.log(`DELETE /api/users/admin/${req.params.id} - User deleted successfully:`, user._id); // Added log
        res.json({ msg: 'User removed' });
    } catch (err) {
        console.error(`Admin user deletion error for ID ${req.params.id}:`, err.message, err); // More detailed error log
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'User not found for deletion (query error)' });
        }
        res.status(500).send('Server Error');
    }
});


// IMPORTANT: Ensure this module.exports is at the very end of the file
module.exports = router;
