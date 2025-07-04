const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');

const { marketBannerStorage } = require('../config/cloudinary');

// Assuming adminAuth calls authMiddleware internally, OR
// that authMiddleware populates req.user which adminAuth then checks.
const adminAuth = require('../middleware/adminAuth');
const authMiddleware = require('../middleware/auth'); // Keep this import if you're chaining it explicitly

const Market = require('../models/Market');

const uploadMarketBanner = multer({ storage: marketBannerStorage });


// Helper to format location for frontend (converts [lng, lat] to {latitude, longitude} strings)
const formatLocationForFrontend = (location) => {
    // Return empty strings/null if location or coordinates are missing/invalid
    if (!location) {
         return { address: '', coordinates: null }; // Return null for coordinates if location is missing
    }
     // Check if coordinates exist and are an array with 2 elements of type number
    if (!location.coordinates || !Array.isArray(location.coordinates) || location.coordinates.length !== 2 || typeof location.coordinates[0] !== 'number' || typeof location.coordinates[1] !== 'number') {
         // Return address if available, but null coordinates if missing or invalid format
        return { address: location.address || '', coordinates: null };
    }
    const [longitude, latitude] = location.coordinates;
     // Return coordinates as strings if they are valid numbers
    return {
        address: location.address || '',
        coordinates: {
            latitude: latitude.toString(),
            longitude: longitude.toString(),
        }
    };
};

// Helper to format location for backend (converts {latitude, longitude} strings to [lng, lat] numbers or null)
const formatLocationForBackend = (location) => {
     // If location is a string (from FormData), attempt to parse it
     if (typeof location === 'string') {
         try {
              location = JSON.parse(location);
         } catch (e) {
              console.warn("Failed to parse location JSON string from form data:", e);
              return null; // Return null if parsing fails
         }
     }

     // If location is null, undefined, or not an object, return null
    if (!location || typeof location !== 'object') {
         console.warn("Invalid location data format:", location);
        return null;
    }

     // --- Handling Coordinates ---
     // The frontend AdminEdit screen no longer sends coordinates directly in this format.
     // It sends { address: '...', coordinates: null } if location is edited.
     // We need to be robust and handle potential coordinates being sent if another frontend uses this endpoint,
     // or if an old version of the frontend sends coordinates.
     let backendCoordinates = null;
     if (location.coordinates && typeof location.coordinates === 'object') {
          // If coordinates object is present, try to parse lat/lng from it
          const lat = parseFloat(location.coordinates.latitude);
          const lng = parseFloat(location.coordinates.longitude);

          if (!isNaN(lat) && !isNaN(lng)) {
               backendCoordinates = [lng, lat]; // GeoJSON stores as [longitude, latitude]
          } else {
               console.warn("Invalid coordinates provided in location object:", location.coordinates);
               // If coordinates object is present but values are invalid, backendCoordinates remains null
          }
     } else if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
         // Handle case where coordinates might be sent as a raw array [lng, lat]
          const lng = parseFloat(location.coordinates[0]);
          const lat = parseFloat(location.coordinates[1]);
           if (!isNaN(lat) && !isNaN(lng)) {
               backendCoordinates = [lng, lat];
           } else {
               console.warn("Invalid array coordinates provided in location object:", location.coordinates);
           }
     }
     // If location.coordinates was null, undefined, or not handled above, backendCoordinates remains null.
     // --- End Handling Coordinates ---


     // Return the formatted location object.
    return {
        address: location.address ? location.address.trim() : undefined, // Use undefined to omit if empty, or save empty string if that's desired based on schema
        coordinates: backendCoordinates // Will be null if not provided/invalid
    };
};

// Helper to parse JSON strings that might come from FormData
const parseFormDataFields = (body) => {
     const parsedBody = { ...body };

     // Attempt to parse 'location' field if it's a string
     if (typeof parsedBody.location === 'string') {
         try {
              parsedBody.location = JSON.parse(parsedBody.location);
         } catch (e) {
              console.warn("Failed to parse location string from form data:", e);
              parsedBody.location = undefined; // Set to undefined if parsing fails
         }
     } else if (parsedBody.hasOwnProperty('location') && (parsedBody.location === null || (typeof parsedBody.location !== 'object' && !Array.isArray(parsedBody.location)))) {
          // If location exists but is null or not an object/array, treat as invalid
          console.warn("Invalid non-string, non-object/array location data format:", parsedBody.location);
          parsedBody.location = undefined;
     }


     // Attempt to parse 'specialOffers' field if it's a string
     if (typeof parsedBody.specialOffers === 'string') {
          try {
              parsedBody.specialOffers = JSON.parse(parsedBody.specialOffers);
               if (!Array.isArray(parsedBody.specialOffers)) {
                    console.warn("Parsed specialOffers string but it's not an array. Setting to undefined.");
                     parsedBody.specialOffers = undefined; // Set to undefined if not an array
               }
          } catch (e) {
               console.warn("Failed to parse specialOffers string from form data:", e);
               parsedBody.specialOffers = undefined; // Set to undefined if parsing fails
          }
     }
      // If specialOffers exists but is not an array (after parsing or if it wasn't a string)
      if (parsedBody.hasOwnProperty('specialOffers') && !Array.isArray(parsedBody.specialOffers)) {
          console.warn("Special offers field is present but not an array. Setting to undefined:", parsedBody.specialOffers);
           parsedBody.specialOffers = undefined; // Ensure it's undefined if not an array
      }


     // Attempt to parse 'participatingFarmers' field if it's a string
      // NOTE: The current admin frontend sends participatingFarmersDisplay, NOT participatingFarmers (IDs).
      // This parsing logic is here in case another frontend sends this field,
      // or if you change the admin frontend to send farmer IDs.
      // For the current admin frontend, this block won't be triggered for PUT requests.
      if (typeof parsedBody.participatingFarmers === 'string') {
         try {
              parsedBody.participatingFarmers = JSON.parse(parsedBody.participatingFarmers);
               if (!Array.isArray(parsedBody.participatingFarmers)) {
                     console.warn("Parsed participatingFarmers string but it's not an array. Setting to undefined.");
                    parsedBody.participatingFarmers = undefined; // Set to undefined if not an array
               } else {
                    // Filter for valid ObjectIds if it's an array
                     parsedBody.participatingFarmers = parsedBody.participatingFarmers.filter(mongoose.Types.ObjectId.isValid);
               }
         } catch (e) {
              console.warn("Failed to parse participatingFarmers string from form data:", e);
              parsedBody.participatingFarmers = undefined; // Set to undefined if parsing fails
         }
      }
       // If participatingFarmers exists but is not an array (after parsing)
       if (parsedBody.hasOwnProperty('participatingFarmers') && !Array.isArray(parsedBody.participatingFarmers)) {
           console.warn("Participating farmers field is present but not an array. Setting to undefined:", parsedBody.participatingFarmers);
            parsedBody.participatingFarmers = undefined; // Ensure it's undefined if not an array
       }


     return parsedBody;
};


// GET /current route
router.get('/current', async (req, res) => {
    console.log("GET /api/farmers-market/current endpoint hit.");
    try {
        const market = await Market.findOne({ isActive: true })
                                    .populate('participatingFarmers', 'fullName avatarUrl specialties _id') // *** ADDED POPULATE HERE ***
                                    .lean(); // Get plain JavaScript object

        if (market) {
             console.log("GET /api/farmers-market/current: Found active market.", market._id);
             // Log fetched special offers and participating farmers before sending
             console.log("  Special Offers:", market.specialOffers);
             console.log("  Participating Farmers (IDs):", market.participatingFarmers?.map(f => f?._id)); // Log IDs after populate

             market.location = formatLocationForFrontend(market.location); // Format location for frontend
             res.json(market);
        } else {
             console.warn("GET /api/farmers-market/current: No active market found in DB.");
             res.status(404).json({ msg: 'Farmer\'s Market details not found.' });
        }

    } catch (err) {
        console.error("Error in GET /api/farmers-market/current:", err.message, err);
         if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
              return res.status(503).json({ msg: 'Database unavailable.' });
         }
        res.status(500).send('Server Error fetching market details');
    }
});

// GET /:id route (Admin)
router.get('/:id', authMiddleware, adminAuth, async (req, res) => { // Ensure authMiddleware runs before adminAuth
     const marketId = req.params.id;
    console.log(`GET /api/farmers-market/${marketId} endpoint hit (Admin).`);
     if (!mongoose.Types.ObjectId.isValid(marketId)) {
          console.log(`GET /api/farmers-market/${marketId}: Invalid ID format.`);
          return res.status(400).json({ msg: 'Invalid market ID format' });
     }

    try {
        const market = await Market.findById(marketId)
                                   .populate('participatingFarmers', 'fullName avatarUrl specialties _id') // Populate farmer details
                                   .lean(); // Get plain JavaScript object

        if (market) {
             console.log(`GET /api/farmers-market/${marketId}: Found market.`, market._id);
              // Log fetched special offers and participating farmers before sending
             console.log("  Special Offers:", market.specialOffers);
             console.log("  Participating Farmers (IDs):", market.participatingFarmers?.map(f => f?._id));

             market.location = formatLocationForFrontend(market.location); // Format location for frontend
             res.json(market);
        } else {
             console.warn(`GET /api/farmers-market/${marketId}: Market not found in DB.`);
             res.status(404).json({ msg: 'Market not found.' });
        }

    } catch (err) {
        console.error(`Error in GET /api/farmers-market/${marketId}:`, err.message, err);
         if (err.kind === 'ObjectId') {
             return res.status(404).json({ msg: 'Market not found.' });
         }
         if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
              return res.status(503).json({ msg: 'Database unavailable.' });
         }
        res.status(500).send('Server Error fetching market details by ID');
    }
});


// POST / route (Admin, WITH file upload) - Order: Multer -> Auth -> AdminCheck -> handler
router.post(
    '/',
    // 1. Process multipart form data and handle file upload
    uploadMarketBanner.single('bannerImage'),
    // 2. Authenticate the user based on the token (populates req.user)
    authMiddleware,
    // 3. Authorize the user (check if req.user has the 'admin' role)
    adminAuth,
    // 4. Route handler logic
    async (req, res, next) => {
        console.log("POST /api/farmers-market endpoint hit (Admin).");
        console.log("Request body keys (AFTER upload & Auth):", Object.keys(req.body));
        console.log("Uploaded file (AFTER upload & Auth):", req.file);
        console.log("Authenticated user ID:", req.user ? req.user.id : 'N/A');
        console.log("Authenticated user Role:", req.user ? req.user.role : 'N/A');


        // Parse fields that might be JSON strings from FormData
        // Note: The admin frontend sends 'participatingFarmersDisplay', not 'participatingFarmers'
        const { eventName, date, location, description, specialOffers, isActive, participatingFarmersDisplay } = parseFormDataFields(req.body);
         const bannerImageUrl = req.file ? req.file.path : undefined; // Cloudinary path if file uploaded

        // Validation
        if (!eventName || !date || !location || !description) {
             console.warn("POST /: Missing required fields (eventName, date, location, description).");
            return res.status(400).json({ msg: 'Missing required fields (eventName, date, location, description)' });
         }

         // Format location for backend storage (handles potentially missing coordinates)
         const backendLocation = formatLocationForBackend(location);
         // Check if location object itself is valid (has address field if needed, etc.)
         // Simple check: ensure backendLocation is not null if location was provided
         if (location !== undefined && backendLocation === null && location !== null) {
              console.warn("POST /: Invalid location data provided.");
               return res.status(400).json({ msg: 'Invalid location data provided.' });
         }
          // If location was explicitly null from frontend, backendLocation is null, which is handled.


        try {
             // Note: participatingFarmers is NOT set here based on the admin UI's 'participatingFarmersDisplay' field.
             // If you want the admin to manage the actual farmer links, you'd need a different UI/backend approach
             // (e.g., admin selecting farmers from a list of users).
             // For now, the 'participatingFarmers' array will remain empty or require separate backend logic to update.
            const newMarket = new Market({
                eventName: eventName.trim(),
                date: date.trim(),
                location: backendLocation, // Use the formatted location
                description: description.trim(),
                bannerImageUrl: bannerImageUrl, // Set the uploaded image URL
                 participatingFarmers: [], // Keep this empty unless you have another way to add IDs
    participatingFarmersDisplayText: Array.isArray(participatingFarmersDisplay) ? participatingFarmersDisplay.map(s => s ? s.trim() : '').filter(s => s) : [], // <-- Save the display text here
                specialOffers: Array.isArray(specialOffers) ? specialOffers.map(offer => offer ? offer.trim() : '').filter(offer => offer) : [], // Ensure array and trim offers
                // participatingFarmers: Array.isArray(participatingFarmers) ? participatingFarmers.filter(mongoose.Types.ObjectId.isValid) : [], // This line is from the old logic that expected IDs, keeping it commented
                isActive: isActive !== undefined ? Boolean(isActive) : false // Ensure boolean
                // participatingFarmersDisplay is not saved to the Market schema
            });

            const savedMarket = await newMarket.save();
            console.log("POST /api/farmers-market: Market created successfully.", savedMarket._id);

             // Populate and format the saved market for the response
             const populatedSavedMarket = await Market.findById(savedMarket._id)
                 .populate('participatingFarmers', 'fullName avatarUrl specialties _id')
                 .lean();

             if (populatedSavedMarket) {
                populatedSavedMarket.location = formatLocationForFrontend(populatedSavedMarket.location);
             }

            res.status(201).json(populatedSavedMarket);

        } catch (err) {
            console.error("Error in POST /api/farmers-market route handler:", err.message, err);
             // Check for Mongoose validation errors
             if (err.name === 'ValidationError') {
                  const messages = Object.values(err.errors).map(val => val.message);
                 return res.status(400).json({ msg: messages.join(' ') });
             }
             // Pass other errors to the global error handler (if configured) or send generic 500
            next(err); // Pass the error to the next error-handling middleware
        }
});


// PUT /:id route (Admin, WITH file upload) - Order: Multer -> Auth -> AdminCheck -> handler
router.put(
    '/:id',
    // 1. Process multipart form data and handle file upload
    uploadMarketBanner.single('bannerImage'),
    // 2. Authenticate the user
    authMiddleware,
    // 3. Authorize the user
    adminAuth,
    // 4. Route handler logic
    async (req, res, next) => {
         const marketId = req.params.id;
        console.log(`PUT /api/farmers-market/${marketId} endpoint hit (Admin).`);
         console.log("Request body keys (AFTER upload & Auth):", Object.keys(req.body));
         console.log("Uploaded file (AFTER upload & Auth):", req.file);
        console.log("Authenticated user ID:", req.user ? req.user.id : 'N/A');
        console.log("Authenticated user Role:", req.user ? req.user.role : 'N/A');


         if (!mongoose.Types.ObjectId.isValid(marketId)) {
              console.log(`PUT /api/farmers-market/${marketId}: Invalid ID format.`);
              return res.status(400).json({ msg: 'Invalid market ID format' });
         }

         // Parse fields that might be JSON strings from FormData
         // Note: The admin frontend sends 'participatingFarmersDisplay', NOT 'participatingFarmers' (IDs)
         // Also extract the bannerImageUrl from body explicitly to check if it's null for removal
         const { eventName, date, location, description, specialOffers, isActive, bannerImageUrl, participatingFarmersDisplay } = parseFormDataFields(req.body);

         const updateFields = {};

         // Only add fields to updateFields if they were included in the request body
         // (This allows partial updates)
         if (req.body.hasOwnProperty('eventName')) updateFields.eventName = eventName ? eventName.trim() : undefined;
         if (req.body.hasOwnProperty('date')) updateFields.date = date ? date.trim() : undefined;
         if (req.body.hasOwnProperty('description')) updateFields.description = description ? description.trim() : undefined;
         // Check if isActive is explicitly sent before updating
         if (req.body.hasOwnProperty('isActive')) {
             // Need to check against the original value from the request body string 'true' or 'false'
             // or the boolean value after parsing. Using the parsed boolean is safer.
             updateFields.isActive = Boolean(isActive);
         }
 if (req.body.hasOwnProperty('participatingFarmersDisplay')) {
      if (!Array.isArray(participatingFarmersDisplay)) {
          console.warn(`PUT /${marketId} - Participating farmers display field is not an array.`);
           return res.status(400).json({ msg: 'Participating farmers display must be an array of strings.' });
       }
       updateFields.participatingFarmersDisplayText = participatingFarmersDisplay.map(s => s ? s.trim() : '').filter(s => s); // <-- Save the display text here
 }

         // --- Image Handling ---
         if (req.file) {
             // If a new file was uploaded, set the new bannerImageUrl
             console.log(`PUT /${marketId} - New file uploaded. Setting bannerImageUrl to:`, req.file.path);
             updateFields.bannerImageUrl = req.file.path;
              // TODO: Add logic here to delete the OLD banner image from Cloudinary if it existed
              // You would fetch the market first to get the old URL: const oldMarket = await Market.findById(marketId);
              // Then if oldMarket.bannerImageUrl exists and is different from the new one, delete it.
         } else if (req.body.hasOwnProperty('bannerImageUrl') && bannerImageUrl === null) {
              // If no new file, but bannerImageUrl was explicitly sent as null in the body,
              // it means the frontend requested removal of the existing image.
              console.log(`PUT /${marketId} - No new file, but bannerImageUrl is null in body. Setting bannerImageUrl to null (removal requested).`);
              updateFields.bannerImageUrl = null;
               // TODO: Add logic here to delete the OLD banner image from Cloudinary corresponding to this marketId
         }
         // If req.file is null AND req.body.bannerImageUrl is not null/undefined,
         // it means the field was not included or was the old URL.
         // In this case, we simply don't include bannerImageUrl in `updateFields`,
         // and Mongoose $set will keep the existing value in the database.
         // --- End Image Handling ---


         // --- Location Handling ---
         // Check if the 'location' key exists in the *original* body (parsed or not)
         if (req.body.hasOwnProperty('location')) {
              if (location === undefined) {
                 // location was in body but failed parseFormDataFields -> Invalid format
                 console.warn(`PUT /${marketId} - Location field in body failed to parse or was invalid type.`);
                 return res.status(400).json({ msg: 'Invalid location data format.' });
              }
               // If location exists and is not undefined after parsing
               const backendLocation = formatLocationForBackend(location); // Format for DB
                // Check if the formatting resulted in null, but the original location wasn't null itself
                if (backendLocation === null && location !== null) {
                   console.warn(`PUT /${marketId} - Invalid location data provided that resulted in null backend format.`);
                   return res.status(400).json({ msg: 'Invalid location data provided.' });
               }
               updateFields.location = backendLocation; // Can be { address, coordinates: null } or just null
         }
         // If req.body does NOT have 'location', Mongoose $set will keep the existing location field.
         // --- End Location Handling ---


         // --- Special Offers Handling ---
          // Check if the 'specialOffers' key exists in the *original* body
         if (req.body.hasOwnProperty('specialOffers')) {
              if (!Array.isArray(specialOffers)) {
                  // specialOffers was in body but parseFormDataFields didn't make it an array
                  console.warn(`PUT /${marketId} - Special offers field in body is not an array.`);
                  return res.status(400).json({ msg: 'Special offers must be an array.' });
              }
              // If specialOffers field is present and is an array (after parsing)
             updateFields.specialOffers = specialOffers.map(offer => offer ? offer.trim() : '').filter(offer => offer); // Trim and filter empty
         }
          // If req.body does NOT have 'specialOffers', Mongoose $set will keep the existing specialOffers array.
         // --- End Special Offers Handling ---


         // --- Participating Farmers Handling ---
         // The admin edit screen sends 'participatingFarmersDisplay' (string array), not 'participatingFarmers' (IDs).
         // The Market schema's 'participatingFarmers' field expects ObjectIds.
         // We are NOT updating the 'participatingFarmers' (ID list) based on the 'participatingFarmersDisplay' (string list)
         // sent by the frontend. This would require backend logic to find farmer users by name/phone, which is complex
         // and might not be intended by the current UI design.
         // If you *do* want to update the list of *linked farmer users* via this form, you would need to change
         // the frontend to send farmer IDs, and then the backend would use those IDs here:
         //
         // if (req.body.hasOwnProperty('participatingFarmers') && Array.isArray(participatingFarmers)) { // Check for the *ID* field
         //      // Ensure the array contains valid ObjectIds
         //      const validFarmerIds = participatingFarmers.filter(mongoose.Types.ObjectId.isValid);
         //      updateFields.participatingFarmers = validFarmerIds;
         // } else if (req.body.hasOwnProperty('participatingFarmers') && participatingFarmers !== undefined) {
         //     console.warn(`PUT /${marketId} - Participating farmers field in body is not an array of IDs.`);
         //      return res.status(400).json({ msg: 'Participating farmers must be an array of IDs.' });
         // }
         //
         // For now, we assume 'participatingFarmers' is *not* updated by this admin UI,
         // and the string list 'participatingFarmersDisplay' sent by the frontend is ignored by the schema save.
         // If you want to *save* the string list for display purposes, you would need to add
         // a new field (e.g., `participatingFarmersDisplay: [{ type: String }]`) to your Market schema.
         //
         // If you ADDED `participatingFarmersDisplay` to the schema, the update logic would look like this:
         // if (req.body.hasOwnProperty('participatingFarmersDisplay') && Array.isArray(participatingFarmersDisplay)) {
         //      updateFields.participatingFarmersDisplay = participatingFarmersDisplay.map(s => s ? s.trim() : '').filter(s => s);
         // } else if (req.body.hasOwnProperty('participatingFarmersDisplay') && participatingFarmersDisplay !== undefined) {
         //      console.warn(`PUT /${marketId} - Participating farmers display field is not an array.`);
         //      return res.status(400).json({ msg: 'Participating farmers display must be an array of strings.' });
         // }
         //
         // Assuming for this fix, the `participatingFarmers` (ID list) is NOT updated by this route.

        if (Object.keys(updateFields).length === 0) {
             console.log(`PUT /api/farmers-market/${marketId}: No valid fields provided for update.`);
             // It's reasonable to return 200 OK if the request was valid but had no fields to update,
             // or 400 if the intention was to update but no *updatable* fields were sent.
             // Let's return 200 as it's technically a successful request that didn't change data.
             const unchangedMarket = await Market.findById(marketId)
                                         .populate('participatingFarmers', 'fullName avatarUrl specialties _id')
                                         .lean();
             if (unchangedMarket) {
                 unchangedMarket.location = formatLocationForFrontend(unchangedMarket.location);
                 return res.json(unchangedMarket);
             } else {
                  // Should not happen if isValid ObjectId check passed, but good fallback
                 return res.status(404).json({ msg: 'Market not found.' });
             }
        }

        console.log(`PUT /api/farmers-market/${marketId}: Update fields:`, updateFields);


        try {
            const updatedMarket = await Market.findByIdAndUpdate(
                marketId,
                { $set: updateFields }, // Use $set to only update provided fields
                { new: true, runValidators: true } // Return the updated document and run schema validators
            )
            .populate('participatingFarmers', 'fullName avatarUrl specialties _id') // Populate for response
            .lean(); // Get plain JavaScript object

            if (!updatedMarket) {
                 console.warn(`PUT /api/farmers-market/${marketId}: Market not found for update.`);
                return res.status(404).json({ msg: 'Market not found for update' });
            }
             console.log(`PUT /api/farmers-market/${marketId}: Market updated successfully.`, updatedMarket._id);

             // Format location for frontend response
             updatedMarket.location = formatLocationForFrontend(updatedMarket.location);

            res.json(updatedMarket); // Send the updated market details

        } catch (err) {
            console.error(`Error in PUT /api/farmers-market/${marketId} route handler:`, err.message, err);
             // Check for Mongoose validation errors
             if (err.name === 'ValidationError') {
                  const messages = Object.values(err.errors).map(val => val.message);
                 return res.status(400).json({ msg: messages.join(' ') });
             }
             // Check for casting errors (e.g., sending a non-ObjectId string to participatingFarmers if it were updated)
              if (err.name === 'CastError') {
                  return res.status(400).json({ msg: `Invalid data format for field: ${err.path}` });
              }
             // Pass other errors
            next(err); // Pass the error to the next error-handling middleware
        }
});

// DELETE route (Admin)
router.delete('/:id', authMiddleware, adminAuth, async (req, res) => { // Ensure authMiddleware runs before adminAuth
    const marketId = req.params.id;
    console.log(`DELETE /api/farmers-market/${marketId} endpoint hit (Admin).`);
     if (!mongoose.Types.ObjectId.isValid(marketId)) {
          console.log(`DELETE /api/farmers-market/${marketId}: Invalid ID format.`);
          return res.status(400).json({ msg: 'Invalid market ID format' });
     }

    try {
        const deletedMarket = await Market.findByIdAndDelete(marketId);

        if (!deletedMarket) {
             console.log(`DELETE /api/farmers-market/${marketId} - Market not found for deletion.`);
            return res.status(404).json({ msg: 'Market not found for deletion' });
        }

         console.log(`DELETE /api/farmers-market/${marketId} - Market deleted successfully:`, deletedMarket._id);
         // TODO: If deletedMarket had a bannerImageUrl, add logic here to delete the file from Cloudinary

        res.json({ msg: 'Market details removed' });

    } catch (err) {
        console.error(`Error in DELETE /api/farmers-market/${marketId}:`, err.message, err);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Market not found for deletion (query error)' });
         }
         if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
              return res.status(503).json({ msg: 'Database unavailable.' });
         }
        res.status(500).send('Server Error deleting market details');
    }
});

module.exports = router;   
