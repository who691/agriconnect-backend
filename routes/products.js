// backend/routes/products.js
const express = require('express');
const multer = require('multer');
const path = require('path');
// Assuming productStorage is defined in ../config/cloudinary
const { productStorage } = require('../config/cloudinary'); 
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth'); // Import admin auth
const Product = require('../models/Product');
const mongoose = require('mongoose'); // Import mongoose for ObjectId validation

const router = express.Router();

// Multer setup for Cloudinary (used in POST/PUT route)
const uploadCloudinary = multer({ storage: productStorage });

// CATEGORIES_MAP (if used by GET /category/:categoryName) - Keep this
const CATEGORIES_MAP = {
  "Grain and oilseed farms": ["Wheat", "Oats", "Field Peas", "Dry Beans", "Lentils", "Mustard", "Flaxseed", "Canola", "Corn", "Soybeans"],
  "Potato and tomato farms": ["Russet Potatoes", "Red Potatoes", "Roma Tomatoes", "Heirloom Tomatoes"],
  "Vegetable and melon farms": ["Carrots", "Onions", "Broccoli", "Lettuce", "Cucumbers", "Watermelons", "Cantaloupes"],
  "Fruit and nut farms": ["Apples", "Berries", "Peaches", "Grapes", "Almonds", "Walnuts"],
  "Greenhouse and nursery farms": ["Bedding Plants", "Potted Plants", "Shrubs", "Young Trees"],
  "Crop farming": ["Hay", "Tobacco", "Hops", "Sugarcane"],
  "Beef cattle ranching": ["Steers", "Heifers", "Calves"],
  "Dairy cattle and milk production": ["Raw Milk", "Cream", "Cheese Curds"],
  "Poultry and egg farms": ["Chicken Eggs", "Duck Eggs", "Live chickens"], // Corrected typo "Live Chickens" -> "Live chickens" based on your usage elsewhere potentially
  "Animal production": ["Goats", "Sheep", "Honey Bees", "Pigs"],
  "Machinery and equipment": ["Tractors", "Plows", "Harvesters", "Irrigation Parts", "Tools"],
};


// --- 1. SPECIALIZED GET ROUTES (MUST BE FIRST) ---
// @route   GET /featured
// @desc    Get featured products
// @access  Public
router.get('/featured', async (req, res) => {
    console.log("--- HIT: GET /api/products/featured ---");
    try {
        const products = await Product.find({ isFeatured: true })
            .populate('sellerId', 'fullName avatarUrl')
            .limit(4);
        res.json(products);
    } catch (err) {
        console.error("Error fetching featured products:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /new-arrivals
// @desc    Get the latest products
// @access  Public
router.get('/new-arrivals', async (req, res) => {
    console.log("--- HIT: GET /api/products/new-arrivals ---");
    try {
        const products = await Product.find({})
            .populate('sellerId', 'fullName avatarUrl')
            .sort({ createdAt: -1 })
            .limit(10);
        res.json(products);
    } catch (err) {
        console.error("Error fetching new arrivals:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /deals
// @desc    Get products that are on sale (all time)
// @access  Public
// Keeping this route as is for general "deals" but fixing the condition
router.get('/deals', async (req, res) => {
    console.log("--- HIT: GET /api/products/deals ---");
    try {
        // Find products where originalPrice exists, is greater than 0, AND price is strictly less than originalPrice
        const products = await Product.find({
            originalPrice: { $exists: true, $ne: null, $gt: 0 },
            $expr: { $lt: ["$price", "$originalPrice"] } // FIX: Use $lt (less than) for deals
        })
        .populate('sellerId', 'fullName avatarUrl')
        .sort({ createdAt: -1 }); // Optionally sort by creation date or another relevant field for sales
        // Removed the .limit(10) here to fetch all matching deals, you can add it back or use a query parameter if needed.

        res.json(products);
    } catch (err) {
        console.error("Error fetching deals:", err.message); // Corrected log message
        res.status(500).send('Server Error');
    }
});

// --- MODIFIED ROUTE: Get recent deals (default 7 days, accepts 'days' query param) ---
// @route   GET /weekly-deals
// @desc    Get products on sale created in the last X days, sorted by latest
// @access  Public
router.get('/weekly-deals', async (req, res) => {
    console.log("--- HIT: GET /api/products/weekly-deals ---");
    try {
        const days = parseInt(req.query.days) || 7;
        console.log(`Fetching deals from the last ${days} days.`);

        const dateAgo = new Date();
        dateAgo.setDate(dateAgo.getDate() - days);

        const products = await Product.find({
            createdAt: { $gte: dateAgo },
            originalPrice: { $exists: true, $ne: null, $gt: 0 },
            $expr: { $lt: ["$price", "$originalPrice"] } // Correct condition for deals
        })
        .populate('sellerId', 'fullName avatarUrl')
        .sort({ createdAt: -1 });

        res.json(products);
    } catch (err) {
        console.error("Error fetching recent deals:", err.message); // Corrected log message
        res.status(500).send('Server Error');
    }
});


// @route   GET /category/:categoryName
// @desc    Get products by category name
// @access  Public
router.get('/category/:categoryName', async (req, res) => {
    console.log("--- HIT: GET /api/products/category/:categoryName ---");
    try {
        const receivedCategoryName = req.params.categoryName;
        let queryCondition;
        // Use case-insensitive regex for robustness in matching categories
        const categoryRegex = new RegExp(`^${receivedCategoryName}$`, 'i');

        // Check if the receivedCategoryName is a known main category (case-insensitive check)
        const mainCategoryMatch = Object.keys(CATEGORIES_MAP).find(key => key.toLowerCase() === receivedCategoryName.toLowerCase());

        if (mainCategoryMatch) {
            // It's a main category, find products in its sub-categories (case-insensitive)
            const subCategories = CATEGORIES_MAP[mainCategoryMatch];
             const subCategoriesRegex = subCategories.map(sc => new RegExp(`^${sc}$`, 'i'));
             queryCondition = { category: { $in: subCategoriesRegex } };
             console.log(`Fetching products for main category "${mainCategoryMatch}". Query condition:`, queryCondition);
        } else {
            // Assume it's a sub-category name directly, or a category not in our map
            // Use case-insensitive regex for the single category name
            queryCondition = { category: categoryRegex };
             console.log(`Fetching products for category "${receivedCategoryName}". Query condition:`, queryCondition);
        }


        const products = await Product.find(queryCondition)
            .populate('sellerId', 'fullName avatarUrl')
            .sort({ createdAt: -1 }); // Optional: sort results

        res.json(products);
    } catch (err) {
        console.error("Error fetching category products:", err.message);
        res.status(500).send('Server Error: Could not fetch category products.');
    }
});

// --- 2. GENERAL GET ROUTES ---

// @route   GET /
// @desc    Get all products, with optional search, limit, pagination, and category filter
// @access  Public
// --- MODIFIED ROUTE TO HANDLE sellerId FILTER ---
router.get('/', async (req, res) => {
    console.log("--- HIT: GET /api/products (base) ---");
    // Extract query parameters, including search, limit, page, category, and sellerId
    const { search, limit, category, page = 1, sellerId } = req.query;
    const limitNum = parseInt(limit) || 12; // Default limit matches Home screen 'More To Find'
    const pageNum = parseInt(page) || 1;
    const skip = (pageNum - 1) * limitNum;

    try {
        let findQuery = {}; // Object to build Mongoose query criteria

        // Add search criteria (assuming you have a text index on your Product model for $text search)
        if (search) {
             // Using $text search
            findQuery.$text = { $search: search };
            // Alternative/Addition: Case-insensitive regex search on specific fields if no text index or for partial matches
             // const searchRegex = new RegExp(search, 'i');
             // findQuery.$or = [
             //     { name: searchRegex },
             //     { description: searchRegex },
             //     { category: searchRegex },
             //     { tags: searchRegex }
             // ];
        }

        // Add category filter
        if (category) {
             findQuery.category = new RegExp(`^${category}$`, 'i'); // Case-insensitive category match
        }

        // --- FIX HERE: Add sellerId filter if present ---
        if (sellerId) {
            // Validate the sellerId format
            if (!mongoose.Types.ObjectId.isValid(sellerId)) {
                 console.warn(`GET /api/products: Invalid sellerId format received: ${sellerId}`);
                 return res.status(400).json({ msg: 'Invalid seller ID format provided.' });
            }
            // Add to the query object. Mongoose will cast the string to ObjectId.
            findQuery.sellerId = sellerId; 
            console.log(`GET /api/products: Filtering by sellerId: ${sellerId}`);
        }
        // --- END FIX ---

        let query = Product.find(findQuery); // Start building the query with filters

        // Apply sorting
        // If search is active, sort by text score first, then by creation date
        // Otherwise, sort by creation date descending (latest first)
        query = query.sort(search ? { score: { $meta: "textScore" }, createdAt: -1 } : { createdAt: -1 });


        // Apply pagination IF limit is greater than 0
        if (limitNum > 0) {
             query = query.skip(skip).limit(limitNum);
        } else if (limit !== undefined && limitNum === 0) {
             // Handle case where limit=0 might be intended to return nothing or special case
             // For now, just handle it like no limit or return empty array later
        }


        // Populate seller info
        query = query.populate('sellerId', 'fullName avatarUrl');

        // Execute the query
        const products = await query.exec();

        // Optional: Get total count for pagination info (needed for client pagination logic, but not strictly for this fetch)
        // const totalProducts = await Product.countDocuments(findQuery); // Use the same findQuery

        res.json(products); // Return the fetched products
    } catch (err) {
        console.error("Error fetching products (base route):", err.message, err);
         // Specific error handling for CastError (e.g., invalid sellerId if it wasn't caught by isValid)
         if (err.name === 'CastError') { // Catch general CastErrors
              if (err.path === 'sellerId') {
                  return res.status(400).json({ msg: 'Invalid seller ID format provided.' });
              }
              // Handle other potential CastErrors if necessary
         }
        res.status(500).send('Server Error');
    }
});


// @route   GET /api/products/my-products
// @desc    Get all products for the currently logged-in user (Farmer only)
// @access  Private (Farmer)
router.get('/my-products', authMiddleware, async (req, res) => {
    console.log("--- HIT: GET /api/products/my-products ---");
    try {
        const products = await Product.find({ sellerId: req.user.id })
            .populate('sellerId', 'fullName avatarUrl')
            .sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        console.error("Error fetching user's products:", err.message);
        res.status(500).send('Server Error');
    }
});


// --- 3. DYNAMIC & CUD ROUTES (MUST BE LAST OR NEAR LAST) ---

// @route   GET /api/products/:id
// @desc    Get a single product (THIS MUST BE AFTER SPECIFIC ROUTES LIKE /featured)
// @access  Public
router.get('/:id', async (req, res) => {
    console.log("--- HIT: GET /api/products/:id ---");
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             return res.status(400).json({ msg: 'Invalid product ID format' });
        }
        const product = await Product.findById(req.params.id)
            .populate('sellerId', 'fullName avatarUrl');
             // .lean(); // Can use lean if no Mongoose methods are needed after fetching

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error("Error fetching product by ID:", err.message);
        if (err.kind === 'ObjectId') { // More specific check for CastError on ID
            return res.status(404).json({ msg: 'Product not found (query error)' });
        }
        res.status(500).send('Server Error');
    }
});


// @route   POST /api/products/
// @desc    Add a new product (Using Cloudinary)
// @access  Private (Farmer only)
router.post('/', [authMiddleware, uploadCloudinary.array('images', 5)], async (req, res) => {
  console.log("--- HIT: POST /api/products ---");
  const {
    name, description, price, unit, category, originalPrice, stockQuantity, externalLink, city, area
  } = req.body;

  if (req.user.role !== 'farmer') {
    return res.status(403).json({ msg: 'Access denied. Only farmers can add products.' });
  }

   if (!name || price === undefined || !unit || !category) { // Check for price existence specifically
      return res.status(400).json({ msg: 'Required fields (name, price, unit, category) are missing.' });
   }

  try {
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map(file => file.path); // Cloudinary URL is in file.path
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
         return res.status(400).json({ msg: 'Invalid price.' });
    }
     const parsedOriginalPrice = originalPrice ? parseFloat(originalPrice) : undefined; // Use undefined for optional
     if (parsedOriginalPrice !== undefined && (isNaN(parsedOriginalPrice) || parsedOriginalPrice < 0)) {
         return res.status(400).json({ msg: 'Invalid bulk price.' });
     }
     const parsedStockQuantity = stockQuantity !== undefined ? parseInt(stockQuantity, 10) : undefined; // Use undefined for optional
      if (parsedStockQuantity !== undefined && (isNaN(parsedStockQuantity) || parsedStockQuantity < 0)) {
          return res.status(400).json({ msg: 'Invalid stock quantity.' });
      }

      // Validate location if provided
      let productLocation = undefined; // Use undefined for optional field
      if (city !== undefined || area !== undefined) {
           productLocation = {};
           if (city !== undefined) productLocation.city = city || null;
           if (area !== undefined) productLocation.area = area || null;
      }
      // Note: If location is a GeoJSON Point in schema, this requires different handling


    const newProduct = new Product({
      name,
      description: description || '',
      price: parsedPrice,
      unit,
      category, // This should be the sub-category string
      sellerId: req.user.id,
      imageUrls, // Array of Cloudinary URLs
      originalPrice: parsedOriginalPrice,
      stockQuantity: parsedStockQuantity,
      externalLink: externalLink || null,
      location: productLocation // Use the optional location object
    });

    // await newProduct.validate(); // Mongoose save already runs validation

    const product = await newProduct.save();
    console.log("Product saved:", product._id);
    res.status(201).json(product);

  } catch (err) {
    console.error('Product creation error (Cloudinary):', err.message, err);
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(val => val.message);
        return res.status(400).json({ msg: errors.join(', ') });
    }
    res.status(500).send('Server Error');
  }
});


// @route   PUT /api/products/:id
// @desc    Update a product (Only by the seller or admin)
// @access  Private
router.put('/:id', [authMiddleware, uploadCloudinary.array('images', 5)], async (req, res) => {
    const productId = req.params.id;
    // Include all possible updatable fields
    const {
        name, description, price, unit, category, originalPrice, stockQuantity, externalLink, city, area,
        existingImageUrls, // Expect array of URLs to keep
        // Add admin-only fields if needed here, protected by adminAuth middleware
        // isFeatured, // Example
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ msg: 'Invalid product ID format' });
    }

    try {
        // Find the existing product to check ownership and current data
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Check authorization: seller or admin
        if (product.sellerId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
             // If unauthorized, clean up any newly uploaded files before returning
             if (req.files && req.files.length > 0) {
                  // TODO: Implement Cloudinary cleanup for uploaded images req.files here
                  console.warn(`Attempted unauthorized update of product ${productId}. Cleaning up uploaded images.`);
             }
             return res.status(403).json({ msg: 'Access denied. You can only update your own products.' });
        }

        // Build update fields dynamically based on provided body keys
        const updateFields = {};
        const unsetFields = {}; // To handle explicitly setting fields to null/undefined or removing

        // Process standard fields
        if (Object.prototype.hasOwnProperty.call(req.body, 'name')) updateFields.name = name;
        if (Object.prototype.hasOwnProperty.call(req.body, 'description')) updateFields.description = description; // Allow setting description to empty string
        if (Object.prototype.hasOwnProperty.call(req.body, 'unit')) updateFields.unit = unit;
        if (Object.prototype.hasOwnProperty.call(req.body, 'category')) updateFields.category = category; // Allow changing category

        // Process numerical fields with validation
        if (Object.prototype.hasOwnProperty.call(req.body, 'price')) {
             const parsedPrice = parseFloat(price);
             if (isNaN(parsedPrice) || parsedPrice < 0) {
                 // TODO: Implement Cloudinary cleanup here if files were uploaded
                 return res.status(400).json({ msg: 'Invalid price value.' });
             }
             updateFields.price = parsedPrice;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'originalPrice')) {
            const parsedOriginalPrice = originalPrice ? parseFloat(originalPrice) : undefined; // Treat as optional/removable
             if (parsedOriginalPrice !== undefined && (isNaN(parsedOriginalPrice) || parsedOriginalPrice < 0)) {
                 // TODO: Implement Cloudinary cleanup here
                return res.status(400).json({ msg: 'Invalid bulk price.' });
             }
            updateFields.originalPrice = parsedOriginalPrice;
             // If originalPrice is explicitly set to null/undefined/empty string, add to unset
             if (originalPrice === null || originalPrice === '' || originalPrice === undefined) {
                  unsetFields.originalPrice = 1;
             } else if (updateFields.originalPrice !== undefined) {
                  delete unsetFields.originalPrice; // Ensure it's not in unset if a valid value was provided
             }
        } else if (Object.prototype.hasOwnProperty.call(req.body, 'originalPrice') && (originalPrice === null || originalPrice === '')) {
             // Explicitly sent null/empty string for originalPrice when it wasn't already defined
             unsetFields.originalPrice = 1;
        }


        if (Object.prototype.hasOwnProperty.call(req.body, 'stockQuantity')) {
            const parsedStockQuantity = stockQuantity !== undefined ? parseInt(stockQuantity, 10) : undefined; // Treat as optional/removable
            if (parsedStockQuantity !== undefined && (isNaN(parsedStockQuantity) || parsedStockQuantity < 0)) {
                 // TODO: Implement Cloudinary cleanup here
                 return res.status(400).json({ msg: 'Invalid stock quantity.' });
            }
             updateFields.stockQuantity = parsedStockQuantity;
              // If stockQuantity is explicitly set to null/undefined/empty string, add to unset
             if (stockQuantity === null || stockQuantity === '' || stockQuantity === undefined) {
                  unsetFields.stockQuantity = 1;
             } else if (updateFields.stockQuantity !== undefined) {
                   delete unsetFields.stockQuantity; // Ensure it's not in unset if a valid value was provided
             }
        } else if (Object.prototype.hasOwnProperty.call(req.body, 'stockQuantity') && (stockQuantity === null || stockQuantity === '')) {
             // Explicitly sent null/empty string for stockQuantity when it wasn't already defined
             unsetFields.stockQuantity = 1;
        }


        // Process externalLink (optional, can be cleared)
         if (Object.prototype.hasOwnProperty.call(req.body, 'externalLink')) {
              updateFields.externalLink = externalLink || null; // Allow null/empty string to clear
              if (externalLink === null || externalLink === '') {
                   unsetFields.externalLink = 1;
               } else if (updateFields.externalLink !== null) {
                   delete unsetFields.externalLink;
               }
         } else if (Object.prototype.hasOwnProperty.call(req.body, 'externalLink') && externalLink === null) {
               unsetFields.externalLink = 1;
         }


        // Process location (city, area) - treat as sub-fields of a nested object
        let locationProvidedInBody = false;
        let currentOrNewLocation = product.location ? { ...product.location } : {}; // Start with existing or empty object

        if (Object.prototype.hasOwnProperty.call(req.body, 'city')) {
             currentOrNewLocation.city = city || null; // Allow clearing city
             locationProvidedInBody = true;
        }
         if (Object.prototype.hasOwnProperty.call(req.body, 'area')) {
             currentOrNewLocation.area = area || null; // Allow clearing area
             locationProvidedInBody = true;
        }

        // If location fields were provided in the body, decide how to set/unset the location object
        if(locationProvidedInBody) {
             // If both city and area are null/empty, consider unsetting the whole location object
             if (!currentOrNewLocation.city && !currentOrNewLocation.area) {
                 unsetFields.location = 1; // Unset the entire location field
                 if (updateFields.location) delete updateFields.location; // Remove from updateFields if accidentally added
             } else {
                 // Otherwise, update/set the location object with potentially null/empty city/area
                 updateFields.location = currentOrNewLocation;
                 if (unsetFields.location) delete unsetFields.location; // Ensure it's not in unset
             }
        } else if (Object.prototype.hasOwnProperty.call(req.body, 'location') && req.body.location === null) {
             // Handle case where 'location: null' is sent explicitly to clear location
             unsetFields.location = 1;
              if (updateFields.location) delete updateFields.location;
        }
        // If location was not provided in the body at all, we don't touch the existing location field


        // Handle images: combine existing URLs (sent in body) with new URLs (from files)
        let combinedImageUrls = Array.isArray(existingImageUrls) ? existingImageUrls : (product.imageUrls || []); // Start with existing from body or product
         // Filter out any null/undefined/empty strings from existingImageUrls just in case
         combinedImageUrls = combinedImageUrls.filter(url => url && typeof url === 'string');


        if (req.files && req.files.length > 0) {
            const uploadedUrls = req.files.map(file => file.path); // Cloudinary URLs
            combinedImageUrls = [...combinedImageUrls, ...uploadedUrls];
        }

         // Only update the imageUrls field if existingImageUrls was provided in the body
         // OR if new files were uploaded. This prevents accidentally clearing images
         // if the client didn't send existingImageUrls (e.g., partial update).
         if (Object.prototype.hasOwnProperty.call(req.body, 'existingImageUrls') || (req.files && req.files.length > 0)) {
              updateFields.imageUrls = combinedImageUrls;
         } else if (Object.prototype.hasOwnProperty.call(req.body, 'imageUrls') && (req.body.imageUrls === null || req.body.imageUrls === '')) {
             // Handle case where 'imageUrls: null' or empty string is sent explicitly to clear all images
             updateFields.imageUrls = [];
         }


        // --- Admin-specific field updates (Requires adminAuth middleware already applied) ---
        // Example: Allow admin to toggle 'isFeatured'
        // Check if the user is an admin AND the 'isFeatured' field was provided in the body
        // if (req.user.role === 'admin' && Object.prototype.hasOwnProperty.call(req.body, 'isFeatured')) {
        //      updateFields.isFeatured = Boolean(req.body.isFeatured); // Ensure it's a boolean
        // }


        // Perform the update using $set for fields to set/update and $unset for fields to remove
        // Combine $set and $unset operations
        const updateOperation = { $set: updateFields };
        if (Object.keys(unsetFields).length > 0) {
             updateOperation.$unset = unsetFields;
        }

        console.log("Product update operation:", JSON.stringify(updateOperation, null, 2));

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updateOperation, // Pass the combined update object
            { new: true, runValidators: true } // Return the updated document and run schema validators
        ).populate('sellerId', 'fullName avatarUrl'); // Re-populate seller info for response

        if (!updatedProduct) {
            return res.status(404).json({ msg: 'Product not found after update attempt' });
        }

        res.json(updatedProduct); // Return the updated product

    } catch (err) {
        console.error('Product update error:', err.message, err); // Keep the full error logging
         if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
         // Catch duplicate key error (e.g., if you had unique product names and tried to update to one that exists)
         if (err.code === 11000) {
            return res.status(400).json({ msg: 'Duplicate key error.' }); // Refine message based on what's unique
         }
         // Catch CastError for invalid ObjectId in productId if somehow not caught earlier
         if (err.name === 'CastError' && err.path === '_id') {
             return res.status(400).json({ msg: 'Invalid product ID format.' });
         }

        res.status(500).send('Server Error');
    }
});


// @route   DELETE /api/products/:id
// @desc    Delete a product (Only by the seller or admin)
// @access  Private
router.delete('/:id', authMiddleware, async (req, res) => {
    const productId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ msg: 'Invalid product ID format' });
    }

    try {
        // Find the product first to check ownership
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Check if the logged-in user is the seller or an admin
        if (product.sellerId.toString() !== req.user.id.toString() && req.user.role !== 'admin') {
             return res.status(403).json({ msg: 'Access denied. You can only delete your own products.' });
        }

        // If authorized, delete the product and its images
        // TODO: Implement Cloudinary cleanup for the product's images here
        // You'll need to loop through product.imageUrls and delete each one from Cloudinary

        await Product.findByIdAndDelete(productId); // Use findByIdAndDelete for direct deletion


        res.json({ msg: 'Product removed successfully' }); // More user-friendly message

    } catch (err) {
        console.error('Product deletion error:', err.message, err);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Product not found for deletion (query error)' });
        }
        res.status(500).send('Server Error');
    }
});

// --- ADMIN ROUTES FOR PRODUCTS ---

// @route   GET /api/products/admin/all
// @desc    Get ALL products (Admin only)
// @access  Private (Admin)
router.get('/admin/all', [authMiddleware, adminAuth], async (req, res) => {
     console.log("--- HIT: GET /api/products/admin/all ---");
     try {
        // Get all products, populate seller info
        const products = await Product.find()
            .populate('sellerId', 'fullName phone email') // Populate necessary seller fields
            .sort({ createdAt: -1 })
            .lean(); // Use lean() for performance

        console.log(`Admin fetched ${products.length} products.`);
        res.json(products);
     } catch (err) {
        console.error("Admin error fetching all products:", err.message, err);
        res.status(500).send('Server Error');
     }
});

// @route   DELETE /api/products/admin/:id
// @desc    Delete a specific product by ID (Admin only)
// @access  Private (Admin)
router.delete('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
    const productId = req.params.id;
    console.log(`--- HIT: DELETE /api/products/admin/${productId} ---`);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
         console.log(`Admin delete product: Invalid product ID format: ${productId}`);
        return res.status(400).json({ msg: 'Invalid product ID format' });
    }

    try {
        // Optional: Find the product first if you need its data (e.g., images to delete from Cloudinary)
        // const productToDelete = await Product.findById(productId);
        // if (!productToDelete) {
        //      return res.status(404).json({ msg: 'Product not found for deletion' });
        // }
        // TODO: Implement Cloudinary cleanup for the product's images here using productToDelete.imageUrls


        const product = await Product.findByIdAndDelete(productId);

        if (!product) {
             console.log(`Admin delete product: Product not found for deletion: ${productId}`);
            return res.status(404).json({ msg: 'Product not found for deletion' });
        }

         console.log(`Admin deleted product: ${productId}`);
        res.json({ msg: 'Product removed by admin successfully' });

    } catch (err) {
        console.error(`Admin product deletion error for ID ${productId}:`, err.message, err);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Product not found for deletion (query error)' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/products/admin/:id/featured
// @desc    Toggle isFeatured status for a product (Admin only)
// @access  Private (Admin)
router.put('/admin/:id/featured', [authMiddleware, adminAuth], async (req, res) => {
    const productId = req.params.id;

    console.log(`--- HIT: PUT /api/products/admin/${productId}/featured ---`);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        console.log(`Invalid product ID format for featured toggle: ${productId}`);
        return res.status(400).json({ msg: 'Invalid product ID format' });
    }

    try {
        const product = await Product.findById(productId);

        if (!product) {
             console.log(`Product not found for featured toggle: ${productId}`);
            return res.status(404).json({ msg: 'Product not found' });
        }

        product.isFeatured = !product.isFeatured;
        await product.save();

        console.log(`Product ${productId} featured status toggled to: ${product.isFeatured}`);

        // Return updated status and potentially other fields needed by admin UI
        res.json({ _id: product._id, isFeatured: product.isFeatured });

    } catch (err) {
        console.error(`Admin product featured toggle error for ID ${productId}:`, err.message, err);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Product not found (query error)' });
        }
        res.status(500).send('Server Error');
    }
});


module.exports = router; // Ensure this is at the end;i
