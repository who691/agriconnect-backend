// backend/routes/groups.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const FarmerGroup = require('../models/FarmerGroup');
const Product = require('../models/Product');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/auth');

// Assuming groupCoverStorage is defined in ../config/cloudinary
const { groupCoverStorage } = require('../config/cloudinary'); 

const router = express.Router();

// --- ADD LOGGING HERE ---
console.log("backend/routes/groups.js: Router loaded");

// @route   GET /api/groups
// @desc    Get all groups (used by Groups and Explore)
// @access  Private (authMiddleware ensures user is logged in)
router.get('/', authMiddleware, async (req, res) => {
    console.log("GET /api/groups received"); // <-- Log incoming GET request
    try {
        const { search } = req.query;
        console.log("GET /api/groups - Query params:", req.query); // Log query params
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
            console.log("GET /api/groups - Using search query:", query); // Log the built Mongoose query
        }

        // Use .lean() for faster read operations if you don't need Mongoose document methods
        const groups = await FarmerGroup.find(query)
            .populate('createdBy', 'fullName avatarUrl')
            // --- FIX HERE: Include _id when populating members ---
            .populate('members', 'fullName avatarUrl _id') 
            .sort({ createdAt: -1 })
            .lean(); // <-- Added .lean() for performance

        console.log(`GET /api/groups - Found ${groups.length} groups`); // <-- Log number of groups found
        if (groups.length > 0) {
            console.log("GET /api/groups - First group example:", JSON.stringify(groups[0], null, 2)); // Log first group structure
             if (groups[0].members && Array.isArray(groups[0].members) && groups[0].members.length > 0) {
                 console.log("GET /api/groups - First member in first group (after populate):", JSON.stringify(groups[0].members[0], null, 2));
             }
        }

        res.json(groups);
    } catch (err) {
        console.error("Error fetching all groups:", err.message, err); // <-- Log error details
        res.status(500).send('Server Error');
    }
});

// Keep the multer config defined if needed for *other* routes (like update)
// Ensure uploadGroupCover is defined here if used in other routes
const uploadGroupCover = multer({ storage: groupCoverStorage });


// @route   POST /api/groups
// @desc    Create a new group
// @access  Private (Farmer only)
// NOTE: Multer middleware is removed here to accept JSON body for initial creation without cover image.
router.post('/', authMiddleware, async (req, res) => { 
    console.log("POST /api/groups received (without Multer)"); // <-- Log incoming POST request
    console.log("Authenticated user:", req.user); // <-- Log authenticated user info
    console.log("Request body:", JSON.stringify(req.body, null, 2)); // <-- Log the request body

    const { name, description, type, category, locationName, location } = req.body;

    if (req.user.role !== 'farmer') {
      console.log("POST /api/groups - Access denied: User is not a farmer."); // Log permission denial
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Validation
    if (!name || !description || !type) {
        console.log("POST /api/groups - Validation failed: Missing fields (name, description, type)."); // Log validation failure
        return res.status(400).json({ error: 'Group name, description, and type are required.' });
    }
    // Basic location validation for Location-Based type
     if (type === 'Location-Based' && locationName) {
         // Optional: Add more specific validation if location coords are required with name
          if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
               console.log("POST /api/groups - Warning: Location type is Location-Based, locationName provided, but coords are missing or invalid.", { locationName, location });
               // Decide if you want to reject if coords are missing for locationName or allow just the name
               // For now, allowing just the name if coords are missing, but logging it.
               // return res.status(400).json({ error: 'Location coordinates are required for Location-Based groups.' }); // Uncomment this line if coords are mandatory
          }
     }


    try {
      const newGroupData = {
          name,
          description,
          type,
          createdBy: req.user.id,
          members: [req.user.id], // Creator is always the first member
          // coverImageUrl will be null initially as per your current client/backend setup
      };

      if (type === 'Category-Based') {
          newGroupData.category = category;
      } else if (type === 'Location-Based' && locationName) {
          newGroupData.locationName = locationName;
          if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
              newGroupData.location = {
                  type: 'Point',
                  coordinates: [location.longitude, location.latitude] // GeoJSON format: [longitude, latitude]
              };
               console.log("POST /api/groups - Adding GeoJSON location:", newGroupData.location); // Log added location
          } else {
               console.log("POST /api/groups - Location-Based group created with name but no coordinates.", { name, locationName }); // Log case with no coords
          }
      }

      console.log("POST /api/groups - Attempting to create group with data:", JSON.stringify(newGroupData, null, 2)); // Log data before Mongoose save

      const newGroup = new FarmerGroup(newGroupData);
      const group = await newGroup.save();

      console.log("POST /api/groups - Group saved successfully!", JSON.stringify(group, null, 2)); // <-- Log successful save

      // Populate createdBy and members before sending response back to client
      // This ensures the client receives the populated data structure it expects for detail view
      const populatedGroup = await FarmerGroup.findById(group._id)
          .populate('createdBy', 'fullName avatarUrl')
          .populate('members', 'fullName avatarUrl role _id') // Populate member _id
          .lean();

      console.log("POST /api/groups - Sending populated group response:", JSON.stringify(populatedGroup, null, 2)); // Log the response being sent

      res.status(201).json(populatedGroup); // <-- Send the populated group back

    } catch (err) {
      if (err.code === 11000) {
          console.error("POST /api/groups - Mongoose duplicate key error:", err.message); // Log duplicate error
          return res.status(400).json({ error: 'A group with this name already exists.' });
      }
      if (err.name === 'ValidationError') {
          console.error("POST /api/groups - Mongoose ValidationError:", err.message, err.errors); // Log validation errors
          return res.status(400).json({ error: err.message });
      }
      console.error("POST /api/groups - Unexpected server error:", err); // <-- Log unexpected errors
      res.status(500).send('Server Error');
    }
});


// @route   GET /api/groups/nearby
// @desc    Find location-based groups near a given coordinate
// @access  Public (or Private if you want to restrict discovery to logged-in users)
router.get('/nearby', async (req, res) => { // No authMiddleware here based on your previous code
    const { longitude, latitude } = req.query;
    console.log("GET /api/groups/nearby received with coords:", { longitude, latitude });

    if (!longitude || !latitude) {
        console.log("GET /api/groups/nearby - Validation failed: Longitude and latitude are required.");
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
        // --- FIX HERE: Include _id when populating members for nearby groups ---
        .populate('members', 'fullName avatarUrl _id') 
        .sort({ createdAt: -1 })
        .lean(); // Added .lean()

        console.log(`GET /api/groups/nearby - Found ${groups.length} nearby groups.`);
        if (groups.length > 0) {
            console.log("GET /api/groups/nearby - First nearby group example:", JSON.stringify(groups[0], null, 2));
             if (groups[0].members && Array.isArray(groups[0].members) && groups[0].members.length > 0) {
                 console.log("GET /api/groups/nearby - First member in first nearby group (after populate):", JSON.stringify(groups[0].members[0], null, 2));
             }
        }

        res.json(groups);
    } catch (err) {
        console.error("Error fetching nearby groups:", err.message, err);
        res.status(500).send('Server Error');
    }
});


// @route   GET /api/groups/:id
// @desc    Get details for a single group, including members
// @access  Public (or Private if you want to restrict detail view to members/logged-in)
// --- GET SINGLE GROUP DETAILS ---
router.get('/:id', async (req, res) => {
    console.log(`GET /api/groups/${req.params.id} received`); // Log incoming GET request for single group
    try {
      const group = await FarmerGroup.findById(req.params.id)
        .populate('createdBy', 'fullName avatarUrl')
        // This endpoint already correctly populates _id, just ensuring it's explicit
        .populate('members', 'fullName avatarUrl role _id') 
        .lean(); // <-- Added .lean()
      if (!group) {
          console.log(`GET /api/groups/${req.params.id} - Group not found.`); // Log not found
          return res.status(404).json({ msg: 'Group not found' });
      }
      console.log(`GET /api/groups/${req.params.id} - Found group:`, JSON.stringify({ _id: group._id, name: group.name, membersCount: group.members?.length }, null, 2)); // Log found group name
      // Check if members array contains objects with _id
      if (group.members && Array.isArray(group.members) && group.members.length > 0) {
          console.log(`GET /api/groups/${req.params.id} - First member structure:`, JSON.stringify(group.members[0], null, 2));
      }


      res.json(group);
    } catch (err) {
      console.error(`Error fetching group details for ID ${req.params.id}:`, err.message, err); // Log error
      res.status(500).send('Server Error');
    }
  });

// @route   GET /api/groups/:id/products
// @desc    Get all products from members of a specific group
// @access  Public
router.get('/:id/products', async (req, res) => { // No authMiddleware here based on your previous code
    console.log(`GET /api/groups/${req.params.id}/products received`);
    try {
        const group = await FarmerGroup.findById(req.params.id).lean(); // Use lean here too
        if (!group) {
             console.log(`GET /api/groups/${req.params.id}/products - Group ${req.params.id} not found.`);
             return res.status(404).json({ msg: 'Group not found' });
        }

        // Ensure memberIds is an array of valid IDs
        const memberIds = group.members?.filter(m => m && m.toString()) || []; // Filter out null/undefined members

        console.log(`GET /api/groups/${req.params.id}/products - Fetching products for member IDs:`, memberIds);

        const products = await Product.find({ sellerId: { $in: memberIds } })
            .populate('sellerId', 'fullName')
            .sort({ createdAt: -1 })
            .lean(); // Added .lean()

        console.log(`GET /api/groups/${req.params.id}/products - Found ${products.length} products.`);

        res.json(products);
    } catch (err) {
        console.error(`Error fetching group products for group ${req.params.id}:`, err.message, err);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/groups/:id/messages
// @desc    Get all historical chat messages for a group
// @access  Private
router.get('/:id/messages', authMiddleware, async (req, res) => {
    console.log(`GET /api/groups/${req.params.id}/messages received for user ${req.user.id}`);
    try {
        // Check if the user is a member of the group before showing messages
        const group = await FarmerGroup.findById(req.params.id).lean(); // Use lean
        if (!group) {
            console.log(`GET /api/groups/${req.params.id}/messages - Group ${req.params.id} not found.`);
            return res.status(404).json({ msg: 'Group not found' });
        }
        // Ensure group.members is an array and contains the user's ID
        const isMember = group.members?.some(memberId => memberId?.toString() === req.user.id.toString()) || false; // Use .toString() for comparison
        if (!isMember) {
             console.log(`GET /api/groups/${req.params.id}/messages - User ${req.user.id} is not a member.`);
             return res.status(403).json({ msg: 'Access denied. You are not a member of this group.' });
        }

        const messages = await Message.find({ groupId: req.params.id })
            .populate('senderId', 'fullName avatarUrl _id') // Populate sender info including _id
            .sort({ sentAt: 'asc' }) // Oldest messages first
            .lean(); // Added .lean()

        console.log(`GET /api/groups/${req.params.id}/messages - Found ${messages.length} messages.`);
         if (messages.length > 0) {
              console.log(`GET /api/groups/${req.params.id}/messages - First message senderId structure:`, JSON.stringify(messages[0].senderId, null, 2));
         }


        res.json(messages);
    } catch (err) {
        console.error(`Error fetching messages for group ${req.params.id}:`, err.message, err);
        res.status(500).send('Server Error');
    }
});


// @route   POST /api/groups/:id/toggle-membership
// @desc    Join or leave a group
// @access  Private
router.post('/:id/toggle-membership', authMiddleware, async (req, res) => {
    console.log(`POST /api/groups/${req.params.id}/toggle-membership received for user ${req.user.id}`); // Log request
    try {
        const group = await FarmerGroup.findById(req.params.id);
        const userId = req.user.id;

        if (!group) {
            console.log(`Toggle membership failed: Group ${req.params.id} not found.`);
            return res.status(404).json({ msg: 'Group not found' });
        }

        // Ensure group.members is initialized as an array if it's null or undefined
        if (!Array.isArray(group.members)) {
            group.members = [];
        }

        // Use Mongoose's .id comparison or convert to string if necessary for strict comparison
        const isMember = group.members.some(memberId => memberId?.toString() === userId.toString());

        if (isMember) {
            // Check if user is the creator - creator cannot leave
            if (group.createdBy.equals(userId)) { // Use .equals() for ObjectId comparison
                 console.log(`Toggle membership failed: Creator ${userId} cannot leave group ${req.params.id}.`);
                 return res.status(400).json({ error: 'The creator cannot leave the group.' });
            }
            // Use Mongoose pull method
            group.members.pull(userId);
            console.log(`User ${userId} left group ${req.params.id}.`);
        } else {
            group.members.push(userId);
            console.log(`User ${userId} joined group ${req.params.id}.`);
        }
        await group.save();

        // Optional: Re-populate the group to send back the updated members list if needed
        // const updatedGroup = await FarmerGroup.findById(group._id).populate('members', 'fullName avatarUrl');

        // Return the new membership status
        // Note: After a successful join/leave, the client should typically re-fetch the group details
        // to update the UI accurately (member count, button state, etc.).
        res.json({ isMember: !isMember });
    } catch (err) {
        console.error("Error toggling membership:", err.message, err); // Log error
        res.status(500).send('Server Error');
    }
});


module.exports = router;
