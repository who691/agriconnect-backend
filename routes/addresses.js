// backend/routes/addresses.js
const express = require('express');
const Address = require('../models/Address'); // Import the separate Address model (from backend/models/Address.js)
const User = require('../models/User');     // <--- IMPORT THE USER MODEL HERE
const authMiddleware = require('../middleware/auth');
const mongoose = require('mongoose'); // Import mongoose

const router = express.Router();

// Helper function for consistent error responses (Keep this function as is)
const handleMongooseError = (err, res) => {
    if (err.name === 'ValidationError') {
        console.error("Addresses Route - ValidationError:", err.message, err.errors);
        const errors = Object.values(err.errors).map(val => val.message);
        return res.status(400).json({ msg: errors.join(', ') });
    }
    if (err.name === 'CastError') {
        console.error("Addresses Route - CastError:", err.message, err.kind, err.value);
         return res.status(400).json({ msg: `Invalid ${err.kind}: ${err.value}` });
    }
    console.error("Addresses Route - Unexpected Server Error:", err.message, err);
    res.status(500).send('Server Error');
};


// @route   POST /api/addresses
// @desc    Add a new address for the user
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
    console.log("POST /api/addresses received for user:", req.user.id);
    console.log("POST /api/addresses - Body:", JSON.stringify(req.body, null, 2));

    const { addressLine1, addressLine2, city, state, zipCode, isDefault, location } = req.body;

    try {
        // Find the user first to update their addresses array later
        // Select only addresses field for efficiency unless other user fields are needed immediately
        // We need the 'addresses' field to push the new address ID into it.
        const user = await User.findById(req.user.id).select('addresses');
        if (!user) {
             console.warn(`POST /api/addresses - User ${req.user.id} not found.`);
             return res.status(404).json({ msg: 'User not found' });
        }
         console.log(`POST /api/addresses - User ${req.user.id} found.`);


        // If the new address is default, unset any other default addresses for this user
        if (isDefault) {
            console.log("POST /api/addresses - New address is default, unsetting other defaults for user:", req.user.id);
            // Find and unset isDefault for all other addresses that are currently default for this user
             await Address.updateMany(
                 { userId: req.user.id, isDefault: true }, // Find other default addresses for this user
                 { $set: { isDefault: false } }
            );
             console.log("POST /api/addresses - Other defaults unset.");
        }

        // Prepare address data for the separate Address document
        const addressData = {
             userId: req.user.id, // Link this address to the user
             addressLine1: addressLine1,
             addressLine2: addressLine2,
             city: city,
             state: state,
             zipCode: zipCode,
             isDefault: isDefault === true, // Ensure boolean
             // Handle location data if provided and is a valid object with lat/lng
             ...(location && typeof location === 'object' && location.latitude !== undefined && location.longitude !== undefined && {
                 location: {
                     type: 'Point',
                     coordinates: [location.longitude, location.latitude] // GeoJSON format: [lng, lat]
                 }
             })
        };

        console.log("POST /api/addresses - Attempting to save new address data:", JSON.stringify(addressData, null, 2));

        const newAddress = new Address(addressData);
        const address = await newAddress.save(); // Save the address as a separate document in the Address collection

        console.log("POST /api/addresses - Address saved successfully:", address._id);

        // --- STEP 1: Add the new address ID to the user's addresses array ---
        // This pushes the ObjectId reference onto the 'addresses' array in the User document
        user.addresses.push(address._id);
        // --- STEP 2: Save the updated User document ---
        // This save WILL SUCCEED ONLY IF the User schema's 'addresses' field is defined as array of ObjectIds
        // (i.e., NOT embedded documents)
        await user.save();
        console.log(`POST /api/addresses - Added address ${address._id} to user ${req.user.id} addresses array.`);
        // --- END STEPS FOR USER DOCUMENT UPDATE ---

        // Now fetch the newly updated user document and POPULATE its addresses
        // This is done so the frontend AuthContext gets the complete, latest list immediately upon success
        // Fetch all necessary user fields plus the populated addresses
        const updatedUser = await User.findById(req.user.id)
             .select('_id fullName phone role avatarUrl notifications language addresses location') // Select all necessary user fields for the frontend User context
             .populate('addresses'); // <--- POPULATE THE ADDRESSES FIELD to include the actual Address documents

         console.log(`POST /api/addresses - Returning updated user with ${updatedUser.addresses.length} addresses.`);

        // Respond with the updated user object, which includes the full populated addresses array
        // The frontend AuthContext will update its user state with this response.
        res.status(201).json(updatedUser); // Use 201 Created status

    } catch (err) {
         console.error("POST /api/addresses - Error:", err);
         handleMongooseError(err, res); // Use the helper for error handling
    }
});

// @route   GET /api/addresses
// @desc    Get all addresses for the user (This route fetches *only* addresses.
//          The frontend AddressesScreen in this scenario relies on /api/users/me for the user's full profile including populated addresses)
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
    console.log("GET /api/addresses received for user:", req.user.id);
    try {
        // Find addresses belonging to this user. Sort by default first.
        const addresses = await Address.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 }).lean(); // Add .lean() for performance
        console.log(`GET /api/addresses - Found ${addresses.length} addresses for user ${req.user.id}`);
        res.json(addresses); // Return just the list of addresses
    } catch (err) {
         console.error("GET /api/addresses - Error:", err);
         handleMongooseError(err, res);
    }
});

// @route   PUT /api/addresses/:id
// @desc    Update an address
// @access  Private
router.put('/:id', authMiddleware, async (req, res) => {
    console.log(`PUT /api/addresses/${req.params.id} received for user:`, req.user.id);
    console.log("PUT /api/addresses/:id - Body:", JSON.stringify(req.body, null, 2));

     const { addressLine1, addressLine2, city, state, zipCode, isDefault, location } = req.body;

     // Prepare update fields for the separate Address document
     const updateFields = {
         addressLine1: addressLine1,
         addressLine2: addressLine2,
         city: city,
         state: state,
         zipCode: zipCode,
         isDefault: isDefault === true, // Ensure boolean
          // Handle location update if provided and valid
         ...(location !== undefined && typeof location === 'object' && {
             location: (location && location.latitude !== undefined && location.longitude !== undefined) ?
                 { type: 'Point', coordinates: [location.longitude, location.latitude] } :
                 null // Set location to null if explicitly sent as null/empty data
         })
     };


    try {
         // Find and update the address document, ensuring it belongs to the logged-in user
         // findOneAndUpdate is safer than findById followed by save in concurrent scenarios
         const address = await Address.findOneAndUpdate(
             { _id: req.params.id, userId: req.user.id }, // Find criteria: match ID and user ID
             { $set: updateFields }, // Update data using $set to update specific fields
             { new: true, runValidators: true } // Options: return the updated document, run schema validators
         ).lean(); // Add .lean() for performance unless you need Mongoose document methods after this

         if (!address) {
             console.warn(`PUT /api/addresses/${req.params.id} - Address not found or does not belong to user ${req.user.id}`);
              return res.status(404).json({ msg: 'Address not found or you do not have permission to edit it.' });
         }
         console.log(`PUT /api/addresses/${req.params.id} - Address ${address._id} found and updated successfully.`);


        // If the updated address is now default, unset others for this user
        // This must happen AFTER we confirm the update succeeded and the address belongs to the user
        if (address.isDefault) {
            console.log(`PUT /api/addresses/${req.params.id} - Updated address is default, unsetting others for user ${req.user.id}`);
             await Address.updateMany(
                 { userId: req.user.id, _id: { $ne: req.params.id }, isDefault: true }, // Find other *default* addresses of this user, excluding the current one
                 { $set: { isDefault: false } }
             );
             console.log("PUT /api/addresses/:id - Other defaults unset.");
        }

        // After updating the address document, the user document's addresses array itself hasn't changed
        // (only the content of one referenced document did).
        // However, the frontend relies on fetching the *user* with populated addresses for list updates.
        // So, we re-fetch and return the populated user here too for consistency with POST/DELETE.
        const updatedUser = await User.findById(req.user.id)
             .select('_id fullName phone role avatarUrl notifications language addresses location') // Select all necessary user fields
             .populate('addresses'); // <--- POPULATE THE ADDRESSES FIELD
         console.log(`PUT /api/addresses/${req.params.id} - Returning updated user with ${updatedUser.addresses.length} addresses.`);


        // Respond with the updated user object, which includes the full populated addresses array
        res.json(updatedUser); // Use 200 OK status by default for PUT

    } catch (err) {
         console.error("PUT /api/addresses/:id - Error:", err);
         handleMongooseError(err, res);
    }
});


// @route   DELETE /api/addresses/:id
// @desc    Delete an address
// @access  Private
router.delete('/:id', authMiddleware, async (req, res) => {
    console.log(`DELETE /api/addresses/${req.params.id} received for user:`, req.user.id);

    try {
         // Find and delete the address document, ensuring it belongs to the logged-in user
         const addressToDelete = await Address.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

         if (!addressToDelete) {
              console.warn(`DELETE /api/addresses/${req.params.id} - Address not found or does not belong to user ${req.user.id}`);
             return res.status(404).json({ msg: 'Address not found or you do not have permission to delete it.' });
         }
         console.log(`DELETE /api/addresses/${req.params.id} - Address ${addressToDelete._id} found and deleted.`);

         // --- STEP 1: Remove the address ID from the user's addresses array ---
         // Find the user and update their addresses array by pulling the deleted address's ID
         const user = await User.findById(req.user.id);
         if (user) {
             // Use filter to create a new array without the deleted ID.
             // Ensure comparison is between strings or ObjectIds if possible.
             user.addresses = user.addresses.filter(addressId => addressId && addressId.toString() !== req.params.id.toString());
             await user.save(); // Save the updated User document
             console.log(`DELETE /api/addresses/${req.params.id} - Removed address ID from user ${req.user.id} addresses array.`);

              // Optional: If the deleted address was the default, you might want to set a new default here
              // E.g., if user.addresses.length > 0, set the first remaining one as default.
              // This would require an extra update query on the Address collection.
              /*
              if (addressToDelete.isDefault && user.addresses.length > 0) {
                  try {
                      const firstRemainingAddressId = user.addresses[0]; // Get the first ID remaining
                      await Address.findByIdAndUpdate(firstRemainingAddressId, { $set: { isDefault: true } });
                      console.log(`DELETE /api/addresses/${req.params.id} - Set address ${firstRemainingAddressId} as new default.`);
                  } catch (defaultErr) {
                       console.error(`DELETE /api/addresses/${req.params.id} - Failed to set new default address:`, defaultErr);
                       // Log but don't necessarily fail the delete operation
                  }
              }
              */
         } else {
              console.warn(`DELETE /api/addresses/${req.params.id} - User ${req.user.id} not found when trying to remove address ID.`);
         }
         // --- END STEPS FOR USER DOCUMENT UPDATE ---

        // After deleting the address document and updating the user's addresses array,
        // re-fetch and return the updated user document with populated addresses.
         const updatedUser = await User.findById(req.user.id)
             .select('_id fullName phone role avatarUrl notifications language addresses location') // Select all necessary user fields
             .populate('addresses'); // <--- POPULATE THE ADDRESSES FIELD
         console.log(`DELETE /api/addresses/${req.params.id} - Returning updated user with ${updatedUser.addresses.length} addresses.`);


        // Respond with the updated user object, which includes the full populated addresses array
        res.json(updatedUser); // Use 200 OK status by default for DELETE

    } catch (err) {
        console.error("DELETE /api/addresses/:id - Error:", err);
        handleMongooseError(err, res);
    }
});


module.exports = router;
