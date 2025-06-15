// backend/routes/groups.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const FarmerGroup = require('../models/FarmerGroup');
const Product = require('../models/Product');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

const { groupCoverStorage } = require('../config/cloudinary');

const router = express.Router();


router.get('/', authMiddleware, async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query = {
                $or: [
                    { name: searchRegex },
                    { description: searchRegex },
                    { locationName: searchRegex },
                    { category: searchRegex }
                ]
            };
        }
        const groups = await FarmerGroup.find(query)
            .populate('createdBy', 'fullName avatarUrl')
            .populate('members', 'fullName avatarUrl')
            .sort({ createdAt: -1 });
        res.json(groups);
    } catch (err) {
        console.error("Error fetching all groups:", err.message);
        res.status(500).send('Server Error');
    }
});


// --- Multer for Group Cover Images ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/covers/'), // Separate folder for covers
  filename: (req, file, cb) => cb(null, `cover-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage: storage });

// @route   POST /api/groups
// @desc    Create a new group
// @access  Private (Farmer only)

const uploadGroupCover = multer({ storage: groupCoverStorage });

router.post('/', [authMiddleware, uploadGroupCover.single('coverImage')], async (req, res) => {
  // 'coverImage' should be the name of the field in your form data for the cover image
  const { name, description, type, category, locationName, location } = req.body;

  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  // Validation
  if (!name || !description || !type) {
      return res.status(400).json({ error: 'Group name, description, and type are required.' });
  }

  try {
    const newGroupData = {
        name,
        description,
        type,
        createdBy: req.user.id, // Correct: Use req.user.id
        // The creator is always the first member.
        members: [req.user.id],
    };

    // --- ADD LOGIC TO HANDLE UPLOADED FILE DATA ---
    // Check if a file was uploaded and get the Cloudinary URL
    if (req.file && req.file.path) {
        // Assuming you have a 'coverImageUrl' field in your FarmerGroup model
        newGroupData.coverImageUrl = req.file.path; // req.file.path contains the Cloudinary URL
        console.log("Group cover image uploaded to Cloudinary:", newGroupData.coverImageUrl);
    } else {
        console.log("No group cover image uploaded.");
    }
    // --- END LOGIC ---


    if (type === 'Category-Based') {
        newGroupData.category = category;
    } else if (type === 'Location-Based' && locationName) {
        newGroupData.locationName = locationName;
        // Ensure location object and coordinates are correctly formatted for GeoJSON if provided
        if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
             newGroupData.location = {
                type: 'Point',
                coordinates: [location.longitude, location.latitude] // GeoJSON format: [longitude, latitude]
            };
        }
        // If locationName is provided but coordinates are not, the `location` field won't be set
        // If you need just the name without coordinates, you'd need a separate field in the schema
    }

    const newGroup = new FarmerGroup(newGroupData);
    const group = await newGroup.save();
    res.status(201).json(group);

  } catch (err) {
    // Add logging for validation errors related to location if they occur
    if (err.name === 'ValidationError') {
        console.error("Group creation ValidationError:", err.message, err.errors);
        // Specific check for GeoJSON location validation if needed
        if (err.errors && err.errors['location.type']) {
             return res.status(400).json({ error: 'Invalid location format. Latitude and longitude are required for Location-Based groups if location is provided.' });
        }
        return res.status(400).json({ error: err.message });
    }
     if (err.code === 11000) {
        // Handle duplicate name error
        return res.status(400).json({ error: 'A group with this name already exists.' });
    }
    console.error("Error creating group:", err);
    res.status(500).send('Server Error');
  }
});

// router.post('/', authMiddleware, async (req, res) => {
//   const { name, description, type, category, locationName, location } = req.body;

//   if (req.user.role !== 'farmer') {
//     return res.status(403).json({ error: 'Access denied.' });
//   }

//   // Validation
//   if (!name || !description || !type) {
//       return res.status(400).json({ error: 'Group name, description, and type are required.' });
//   }

//   try {
//     const newGroupData = {
//         name,
//         description,
//         type,
//         createdBy: req.user.id, // Correct: Use req.user.id
//         // --- THIS IS THE FIX ---
//         // The creator is always the first member.
//         // Use `req.user.id` here instead of `user.id`.
//         members: [req.user.id], 
//     };

//     if (type === 'Category-Based') {
//         newGroupData.category = category;
//     } else if (type === 'Location-Based' && locationName) {
//         newGroupData.locationName = locationName;
//         if (location?.latitude && location?.longitude) {
//             newGroupData.location = {
//                 type: 'Point',
//                 coordinates: [location.longitude, location.latitude]
//             };
//         }
//     }

//     const newGroup = new FarmerGroup(newGroupData);
//     const group = await newGroup.save();
//     res.status(201).json(group);

//   } catch (err) {
//     if (err.code === 11000) {
//         return res.status(400).json({ error: 'A group with this name already exists.' });
//     }
//     if (err.name === 'ValidationError') {
//         return res.status(400).json({ error: err.message });
//     }
//     console.error("Error creating group:", err);
//     res.status(500).send('Server Error');
//   }
// });



router.get('/nearby', async (req, res) => {
    const { longitude, latitude } = req.query;

    if (!longitude || !latitude) {
        return res.status(400).json({ error: 'Longitude and latitude are required.' });
    }

    try {
        const groups = await FarmerGroup.find({
            type: 'Location-Based', // Only find location-based groups
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: 50000 // Find groups within 50km (50,000 meters)
                }
            }
        }).populate('createdBy', 'fullName avatarUrl')
        .populate('members', 'fullName avatarUrl') // <-- ADD THIS LINE
        .sort({ createdAt: -1 });
        
        res.json(groups);
    } catch (err) {
        console.error("Error fetching nearby groups:", err.message);
        res.status(500).send('Server Error');
    }
});


// @route   GET /api/groups/:id
// @desc    Get details for a single group, including members
// @access  Public
// --- GET SINGLE GROUP DETAILS ---
router.get('/:id', async (req, res) => {
  try {
    const group = await FarmerGroup.findById(req.params.id)
      .populate('createdBy', 'fullName avatarUrl')
      .populate('members', 'fullName avatarUrl role');
    if (!group) return res.status(404).json({ msg: 'Group not found' });
    res.json(group);
  } catch (err) {
    console.error("Error fetching group details:", err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/groups/:id/products
// @desc    Get all products from members of a specific group
// @access  Public
router.get('/:id/products', async (req, res) => {
    try {
        const group = await FarmerGroup.findById(req.params.id);
        if (!group) return res.status(404).json({ msg: 'Group not found' });
        
        const memberIds = group.members;
        const products = await Product.find({ sellerId: { $in: memberIds } }).populate('sellerId', 'fullName');
        res.json(products);
    } catch (err) {
        console.error("Error fetching group products:", err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/:id/messages', authMiddleware, async (req, res) => {
    try {
        // Optional: Check if the user is a member of the group before showing messages
        const group = await FarmerGroup.findById(req.params.id);
        if (!group || !group.members.some(memberId => memberId.equals(req.user.id))) {
             return res.status(403).json({ msg: 'Access denied. You are not a member of this group.' });
        }

        const messages = await Message.find({ groupId: req.params.id })
            .populate('senderId', 'fullName avatarUrl') // Populate sender info
            .sort({ sentAt: 'asc' }); // Oldest messages first

        res.json(messages);
    } catch (err) {
        console.error("Error fetching messages:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/groups/:id/messages
// @desc    Get all historical chat messages for a group
// @access  Private
// @route   POST /api/groups/:id/messages
// @desc    Post a new message (for persistence, real-time is handled by Socket.IO)
// @access  Private
// --- POST A NEW MESSAGE ---
router.post('/:id/messages', authMiddleware, async (req, res) => {
    // This route is for saving text messages. We'll add a separate one for files later.
    try {
        const newMessage = new Message({
            groupId: req.params.id,
            senderId: req.user.id,
            messageText: req.body.messageText,
            messageType: 'text', // Explicitly set type
        });
        await newMessage.save();
        
        // Populate the sender info before sending back
        const populatedMessage = await Message.findById(newMessage._id).populate('senderId', 'fullName avatarUrl');
        
        // This response isn't strictly necessary if Socket.IO handles broadcasting,
        // but it's good for confirmation.
        res.status(201).json(populatedMessage); 
    } catch (err) {
        res.status(500).send('Server Error');
    }
});
// @route   POST /api/groups/:id/toggle-membership
// @desc    Join or leave a group
// @access  Private
router.post('/:id/toggle-membership', authMiddleware, async (req, res) => {
    try {
        const group = await FarmerGroup.findById(req.params.id);
        const userId = req.user.id;
        const isMember = group.members.some(memberId => memberId.equals(userId));
        
        if (isMember) {
            group.members.pull(userId); // Mongoose helper to remove from array
        } else {
            group.members.push(userId); // Add to array
        }
        await group.save();
        res.json({ isMember: !isMember }); // Return the new membership status
    } catch (err) {
        console.error("Error toggling membership:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;