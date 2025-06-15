// backend/routes/products.js
const express = require('express');
const multer = require('multer');
const path = require('path'); // Keep path if CATEGORIES_MAP or other parts use it, or for local multer if still mixed
const { productStorage } = require('../config/cloudinary'); // For Cloudinary uploads
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
  "Other vegetable and melon farms": ["Carrots", "Onions", "Broccoli", "Lettuce", "Cucumbers", "Watermelons", "Cantaloupes"],
  "Fruit and nut farms": ["Apples", "Berries", "Peaches", "Grapes", "Almonds", "Walnuts"],
  "Greenhouse and nursery farms": ["Bedding Plants", "Potted Plants", "Shrubs", "Young Trees"],
  "Other crop farming": ["Hay", "Tobacco", "Hops", "Sugarcane"],
  "Beef cattle ranching": ["Steers", "Heifers", "Calves"],
  "Dairy cattle and milk production": ["Raw Milk", "Cream", "Cheese Curds"],
  "Poultry and egg farms": ["Chicken Eggs", "Duck Eggs", "Live Chickens"],
  "Other animal production": ["Goats", "Sheep", "Honey Bees", "Pigs"],
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
// @desc    Get products that are on sale
// @access  Public
router.get('/deals', async (req, res) => {
    console.log("--- HIT: GET /api/products/deals ---");
    try {
        const products = await Product.find({ originalPrice: { $exists: true, $ne: null } })
            .populate('sellerId', 'fullName avatarUrl')
            .limit(10);
        res.json(products);
    } catch (err) {
        console.error("Error fetching deals:", err.message);
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
        if (CATEGORIES_MAP[receivedCategoryName]) {
            const subCategories = CATEGORIES_MAP[receivedCategoryName];
            queryCondition = { category: { $in: subCategories } };
        } else {
            // Handle case where the param is a direct sub-category name or other
             queryCondition = { category: new RegExp(`^${receivedCategoryName}$`, 'i') };
        }
        const products = await Product.find(queryCondition)
            .populate('sellerId', 'fullName avatarUrl')
            .sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        console.error("Error fetching category products:", err.message);
        res.status(500).send('Server Error: Could not fetch category products.');
    }
});

// --- 2. GENERAL GET ROUTES ---

// @route   GET /
// @desc    Get all products, with optional search and limit
// @access  Public
router.get('/', async (req, res) => {
    console.log("--- HIT: GET /api/products (base) ---");
  const { search, limit, category } = req.query; // Added category query param
  try {
    let query = {};
    if (search) {
        query.$text = { $search: search };
    }
    if (category) {
        // Find products by the exact category name provided in the query param
         query.category = new RegExp(`^${category}$`, 'i'); // Case-insensitive match
        // If you intended this route to search within MAIN categories like the /category/:categoryName route:
        // if (CATEGORIES_MAP[category]) {
        //     query.category = { $in: CATEGORIES_MAP[category] };
        // } else {
        //     query.category = new RegExp(`^${category}$`, 'i');
        // }
    }


    let productsQuery = Product.find(query)
      .populate('sellerId', 'fullName avatarUrl')
      .sort({ createdAt: -1 });
    if (limit) {
        productsQuery = productsQuery.limit(parseInt(limit));
    }
    const products = await productsQuery;
    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).send('Server Error');
  }
});


// --- NEW ROUTE: Get products by the logged-in farmer ---
// @route   GET /api/products/my-products
// @desc    Get all products for the currently logged-in user (Farmer only)
// @access  Private (Farmer)
router.get('/my-products', authMiddleware, async (req, res) => {
    // Optional: Add check if req.user.role is 'farmer' or 'admin' if needed
    // if (req.user.role !== 'farmer' && req.user.role !== 'admin') {
    //    return res.status(403).json({ msg: 'Access denied. Only farmers or admins can view their products.' });
    // }
    try {
        // Find products where sellerId matches the logged-in user's ID
        const products = await Product.find({ sellerId: req.user.id })
            .populate('sellerId', 'fullName avatarUrl') // Optional: populate seller info, though not strictly necessary as it's the current user
            .sort({ createdAt: -1 });
        res.json(products);
    } catch (err) {
        console.error("Error fetching user's products:", err.message);
        res.status(500).send('Server Error');
    }
});


// --- DYNAMIC & CUD ROUTES (MODIFIED) ---

// @route   GET /api/products/:id
// @desc    Get a single product
// @access  Public
router.get('/:id', async (req, res) => {
    console.log("--- HIT: GET /api/products/:id ---");
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
             return res.status(400).json({ msg: 'Invalid product ID format' });
        }
        const product = await Product.findById(req.params.id)
            .populate('sellerId', 'fullName avatarUrl');
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error("Error fetching product by ID:", err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Product not found' });
        }
        res.status(500).send('Server Error');
    }
});


// @route   POST /api/products/
// @desc    Add a new product (Using Cloudinary)
// @access  Private (Farmer only)
router.post('/', [authMiddleware, uploadCloudinary.array('images', 5)], async (req, res) => {
  console.log("--- HIT: POST /api/products ---");
  // console.log("Request body:", req.body); // Log request body
  // console.log("Request files:", req.files); // Log uploaded files

  const {
    name, description, price, unit, category, originalPrice, stockQuantity, externalLink, city, area
  } = req.body;

  if (req.user.role !== 'farmer') {
    return res.status(403).json({ msg: 'Access denied. Only farmers can add products.' });
  }

  // Basic validation for required fields
   if (!name || !price || !unit || !category) {
      return res.status(400).json({ msg: 'Required fields (name, price, unit, category) are missing.' });
   }

  try {
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map(file => file.path); // file.path from CloudinaryStorage
    } else {
        // Optional: Require at least one image
        // return res.status(400).json({ msg: 'At least one image is required.' });
    }

    // Basic validation for price and quantity if present
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
         return res.status(400).json({ msg: 'Invalid price.' });
    }
     const parsedOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;
     if (parsedOriginalPrice !== null && (isNaN(parsedOriginalPrice) || parsedOriginalPrice < 0)) {
         return res.status(400).json({ msg: 'Invalid bulk price.' });
     }
     const parsedStockQuantity = stockQuantity ? parseInt(stockQuantity, 10) : 0;
      if (isNaN(parsedStockQuantity) || parsedStockQuantity < 0) {
          return res.status(400).json({ msg: 'Invalid stock quantity.' });
      }


    const newProduct = new Product({
      name,
      description: description || '', // Default to empty string if not provided
      price: parsedPrice,
      unit,
      category, // Use the category provided in the body
      sellerId: req.user.id, // Link product to the logged-in user
      imageUrls,
      originalPrice: parsedOriginalPrice,
      stockQuantity: parsedStockQuantity,
      externalLink: externalLink || null, // Default to null if empty string
      location: {
        city: city || null, // Default to null if empty string
        area: area || null, // Default to null if empty string
      }
    });

    // Validate against Mongoose schema before saving
    await newProduct.validate();

    const product = await newProduct.save();
    console.log("Product saved:", product._id); // Log saved product ID
    res.status(201).json(product);

  } catch (err) {
    console.error('Product creation error (Cloudinary):', err.message, err);
    if (err.name === 'ValidationError') {
         // Mongoose validation errors
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
    const {
        name, description, price, unit, category, originalPrice, stockQuantity, externalLink, city, area, // Fields to update
        existingImageUrls // Optional: Array of URLs for images to keep (from frontend)
    } = req.body; // Note: req.body will contain non-file fields

    // console.log("--- HIT: PUT /api/products/:id ---");
    // console.log("Product ID:", productId);
    // console.log("Request body:", req.body);
    // console.log("Request files:", req.files);


    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ msg: 'Invalid product ID format' });
    }

    try {
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // --- AUTHORIZATION CHECK: Only seller or admin can update ---
        // Ensure sellerId is converted to string for comparison
        if (product.sellerId.toString() !== req.user.id && req.user.role !== 'admin') {
             return res.status(403).json({ msg: 'Access denied. You can only update your own products.' });
        }
        // --- END AUTHORIZATION CHECK ---

        const updateFields = {};

        // Only add fields to updateFields if they were provided in the request body
        // Use Object.prototype.hasOwnProperty.call(req.body, 'fieldName') for checking undefined vs missing
        if (Object.prototype.hasOwnProperty.call(req.body, 'name')) updateFields.name = name;
        if (Object.prototype.hasOwnProperty.call(req.body, 'description')) updateFields.description = description;

         // Validate and parse price if provided
        if (Object.prototype.hasOwnProperty.call(req.body, 'price')) {
             const parsedPrice = parseFloat(price);
             if (isNaN(parsedPrice) || parsedPrice < 0) {
                 return res.status(400).json({ msg: 'Invalid price.' });
             }
             updateFields.price = parsedPrice;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'unit')) updateFields.unit = unit;
        if (Object.prototype.hasOwnProperty.call(req.body, 'category')) updateFields.category = category;

         // Validate and parse originalPrice if provided
        if (Object.prototype.hasOwnProperty.call(req.body, 'originalPrice')) {
            const parsedOriginalPrice = originalPrice ? parseFloat(originalPrice) : null;
             if (parsedOriginalPrice !== null && (isNaN(parsedOriginalPrice) || parsedOriginalPrice < 0)) {
                return res.status(400).json({ msg: 'Invalid bulk price.' });
             }
            updateFields.originalPrice = parsedOriginalPrice;
        }

         // Validate and parse stockQuantity if provided
        if (Object.prototype.hasOwnProperty.call(req.body, 'stockQuantity')) {
            const parsedStockQuantity = stockQuantity ? parseInt(stockQuantity, 10) : 0;
            if (isNaN(parsedStockQuantity) || parsedStockQuantity < 0) {
                 return res.status(400).json({ msg: 'Invalid stock quantity.' });
            }
             updateFields.stockQuantity = parsedStockQuantity;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'externalLink')) updateFields.externalLink = externalLink || null;


        // Handle location updates: Allow setting to null/empty string or new values
        // Need to merge with existing location data if only one field (city/area) is provided
        let currentOrNewLocation = product.location ? { ...product.location } : {}; // Clone existing or start new
        let locationProvided = false;

        if (Object.prototype.hasOwnProperty.call(req.body, 'city')) {
            currentOrNewLocation.city = city || null;
            locationProvided = true;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'area')) {
            currentOrNewLocation.area = area || null;
             locationProvided = true;
        }


        if(locationProvided) {
            // If both city and area become null/empty, remove the location field
            if (!currentOrNewLocation.city && !currentOrNewLocation.area) {
                updateFields.$unset = { ...updateFields.$unset, location: 1 };
                if (updateFields.location) delete updateFields.location; // Ensure location is not set
            } else {
                // Otherwise, set or update the location field
                updateFields.location = currentOrNewLocation;
                // Ensure $unset is not included if location is set
                if (updateFields.$unset?.location) delete updateFields.$unset.location;
            }
        }


        // Handle image updates: combine existing images with new uploads
        // existingImageUrls is expected to be an array of URLs sent from the frontend
        // for images the user wants to keep. If not provided, keep all current images.
        let newImageUrls = Array.isArray(existingImageUrls) ? existingImageUrls : (product.imageUrls || []); // Default to keeping all current images

        if (req.files && req.files.length > 0) {
            const uploadedUrls = req.files.map(file => file.path);
            newImageUrls = [...newImageUrls, ...uploadedUrls];
        }

         // Set the updated imageUrls array
        if (Object.prototype.hasOwnProperty.call(req.body, 'existingImageUrls') || (req.files && req.files.length > 0)) {
             updateFields.imageUrls = newImageUrls;
        }
        // else if req.body had no 'existingImageUrls' and no new files, imageUrls is not changed by this logic.
        // If the user sends an empty array for existingImageUrls and no new files, this correctly sets imageUrls to [].


        // Optional: Add logic here to delete images from Cloudinary that were removed by the user
        // This requires comparing product.imageUrls before update with newImageUrls.
        // E.g., find URLs in product.imageUrls that are *not* in newImageUrls and delete them via Cloudinary API.
        // Skipping this for now.


        // Perform the update
        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            // Use $set for fields to update, and potentially $unset for fields to remove
            { $set: updateFields, ...(updateFields.$unset ? { $unset: updateFields.$unset } : {}) },
            { new: true, runValidators: true } // Return the updated document and run schema validators
        ).populate('sellerId', 'fullName avatarUrl');

        if (!updatedProduct) {
            // This case is unlikely if findByIdAndUpdate didn't throw but returned null
            return res.status(404).json({ msg: 'Product not found after update attempt' });
        }

        res.json(updatedProduct);

    } catch (err) {
        console.error('Product update error:', err.message, err);
         if (err.name === 'ValidationError') {
             // Mongoose validation errors
            const errors = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: errors.join(', ') });
        }
        res.status(500).send('Server Error');
    }
});


// @route   DELETE /api/products/:id
// @desc    Delete a product (Only by the seller or admin)
// @access  Private
router.delete('/:id', authMiddleware, async (req, res) => {
    const productId = req.params.id;

    // console.log("--- HIT: DELETE /api/products/:id ---");
    // console.log("Product ID:", productId);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ msg: 'Invalid product ID format' });
    }

    try {
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // --- AUTHORIZATION CHECK: Only seller or admin can delete ---
         // Ensure sellerId is converted to string for comparison
        if (product.sellerId.toString() !== req.user.id && req.user.role !== 'admin') {
             return res.status(403).json({ msg: 'Access denied. You can only delete your own products.' });
        }
        // --- END AUTHORIZATION CHECK ---

        // Optional: Add logic here to delete images from Cloudinary associated with this product
        // Requires iterating over product.imageUrls and using the Cloudinary API to delete each one.
        // Skipping this for now.

        await Product.findByIdAndDelete(productId);

        res.json({ msg: 'Product removed' });

    } catch (err) {
        console.error('Product deletion error:', err.message, err);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Product not found (error during query)' });
        }
        res.status(500).send('Server Error');
    }
});

// --- ADMIN ROUTES FOR PRODUCTS ---

// @route   GET /api/products/admin/all
// @desc    Get ALL products (Admin only)
// @access  Private (Admin)
router.get('/admin/all', [authMiddleware, adminAuth], async (req, res) => {
    try {
        const products = await Product.find().populate('sellerId', 'fullName avatarUrl');
        res.json(products);
    } catch (err) {
        console.error("Admin error fetching all products:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/products/admin/:id
// @desc    Delete a specific product by ID (Admin only)
// @access  Private (Admin)
router.delete('/admin/:id', [authMiddleware, adminAuth], async (req, res) => {
    const productId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ msg: 'Invalid product ID format' });
    }

    try {
        const product = await Product.findByIdAndDelete(productId);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found for deletion' });
        }

        // Optional: Add logic here to delete images from Cloudinary associated with this product

        res.json({ msg: 'Product removed by admin' });

    } catch (err) {
        console.error('Admin product deletion error:', err.message, err);
         if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Product not found for deletion (query error)' });
        }
        res.status(500).send('Server Error');
    }
});

// IMPORTANT: Ensure this module.exports is at the very end of the file
module.exports = router;





// // backend/routes/products.js
// const express = require('express');
// // const multer = require('multer'); // Already defined above or import if in separate file
// // const path = require('path'); // Already defined above or import
// const supabase = require('../config/supabaseClient'); // Adjust path
// const authMiddleware = require('../middleware/auth');
// const Product = require('../models/Product');

// const router = express.Router();
// // upload (Multer instance) should be defined here or imported

// // POST /api/products - Create a new product
// router.post('/', [authMiddleware, upload.array('images', 5)], async (req, res) => {
//   const { name, description, price, unit, category, /* other fields */ } = req.body;

//   if (req.user.role !== 'farmer') {
//     return res.status(403).json({ msg: 'Access denied.' });
//   }

//   try {
//     let imageUrls = [];
//     if (req.files && req.files.length > 0) {
//       for (const file of req.files) {
//         const fileExt = path.extname(file.originalname).toLowerCase();
//         const fileNameInBucket = `products/${req.user.id}-${Date.now()}${fileExt}`;

//         const { data: uploadData, error: uploadError } = await supabase.storage
//           .from('product-images') // YOUR SUPABASE BUCKET FOR PRODUCTS
//           .upload(fileNameInBucket, file.buffer, {
//             contentType: file.mimetype,
//             cacheControl: '3600', // Cache for 1 hour
//             upsert: false, // true to overwrite, false to error if name exists
//           });

//         if (uploadError) {
//           console.error('Supabase product image upload error:', uploadError);
//           continue; // Skip this image if upload failed
//         }

//         // Get public URL
//         const { data: publicUrlData } = supabase.storage
//           .from('product-images') // Same bucket name
//           .getPublicUrl(fileNameInBucket);

//         if (publicUrlData && publicUrlData.publicUrl) {
//           imageUrls.push(publicUrlData.publicUrl);
//         }
//       }
//     }

//     const newProduct = new Product({
//       name,
//       description,
//       price: parseFloat(price),
//       unit,
//       category,
//       sellerId: req.user.id,
//       imageUrls, // Array of Supabase public URLs
//       // ... add other product fields
//     });

//     const product = await newProduct.save();
//     res.status(201).json(product);

//   } catch (err) {
//     console.error('Product creation error (Supabase):', err.message);
//     if (err.name === 'ValidationError') {
//       return res.status(400).json({ msg: err.message });
//     }
//     res.status(500).send('Server Error');
//   }
// });

// module.exports = router;

// // backend/routes/products.js

// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const Product = require('../models/Product');
// const authMiddleware = require('../middleware/auth');


// const router = express.Router();


// const CATEGORIES_MAP = {
//   "Grain and oilseed farms": ["Wheat", "Oats", "Field Peas", "Dry Beans", "Lentils", "Mustard", "Flaxseed", "Canola", "Corn", "Soybeans"],
//   "Potato and tomato farms": ["Russet Potatoes", "Red Potatoes", "Roma Tomatoes", "Heirloom Tomatoes"],
//   "Other vegetable and melon farms": ["Carrots", "Onions", "Broccoli", "Lettuce", "Cucumbers", "Watermelons", "Cantaloupes"],
//   "Fruit and nut farms": ["Apples", "Berries", "Peaches", "Grapes", "Almonds", "Walnuts"],
//   "Greenhouse and nursery farms": ["Bedding Plants", "Potted Plants", "Shrubs", "Young Trees"],
//   "Other crop farming": ["Hay", "Tobacco", "Hops", "Sugarcane"],
//   "Beef cattle ranching": ["Steers", "Heifers", "Calves"],
//   "Dairy cattle and milk production": ["Raw Milk", "Cream", "Cheese Curds"],
//   "Poultry and egg farms": ["Chicken Eggs", "Duck Eggs", "Live Chickens"],
//   "Other animal production": ["Goats", "Sheep", "Honey Bees", "Pigs"],
//   "Machinery and equipment": ["Tractors", "Plows", "Harvesters", "Irrigation Parts", "Tools"],
// };

// // --- Multer Configuration --- (Keep as is)
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => cb(null, 'uploads/products/'),
//   filename: (req, file, cb) => cb(null, `product-${Date.now()}${path.extname(file.originalname)}`)
// });
// const upload = multer({ storage: storage });


// // --- 1. SPECIALIZED GET ROUTES (MUST BE FIRST) ---

// // @route   GET /api/products/featured
// // @desc    Get featured products
// // @access  Public
// router.get('/featured', async (req, res) => {
//     try {
//         const products = await Product.find({ isFeatured: true })
//             .populate('sellerId', 'fullName avatarUrl')
//             .limit(4); // A reasonable limit for featured
//         res.json(products);
//     } catch (err) {
//         console.error("Error fetching featured products:", err.message);
//         res.status(500).send('Server Error');
//     }
// });

// // @route   GET /api/products/new-arrivals
// // @desc    Get the latest products
// // @access  Public
// router.get('/new-arrivals', async (req, res) => {
//     try {
//         const products = await Product.find({})
//             .populate('sellerId', 'fullName avatarUrl')
//             .sort({ createdAt: -1 })
//             .limit(10);
//         res.json(products);
//     } catch (err) {
//         console.error("Error fetching new arrivals:", err.message);
//         res.status(500).send('Server Error');
//     }
// });

// // @route   GET /api/products/deals
// // @desc    Get products that are on sale
// // @access  Public
// // --- NEW ROUTE ---
// router.get('/deals', async (req, res) => {
//     try {
//         // This assumes your Product schema has an 'originalPrice' field. See Step 4.
//         const products = await Product.find({ originalPrice: { $exists: true, $ne: null } })
//             .populate('sellerId', 'fullName avatarUrl')
//             .limit(10);
//         res.json(products);
//     } catch (err) {
//         console.error("Error fetching deals:", err.message);
//         res.status(500).send('Server Error');
//     }
// });


// // @route   GET /api/products/category/:categoryName
// // @desc    Get products by category name
// // @access  Public
// router.get('/category/:categoryName', async (req, res) => {
//     try {
//         const receivedCategoryName = req.params.categoryName;
//         let products;
//         let queryCondition;

//         // Check if the receivedCategoryName is a known main category
//         if (CATEGORIES_MAP[receivedCategoryName]) {
//             // It's a main category, find products in its sub-categories
//             const subCategories = CATEGORIES_MAP[receivedCategoryName];
//             queryCondition = { category: { $in: subCategories } };
//             // For case-insensitivity with $in, you'd typically map subCategories to regex:
//             // queryCondition = { category: { $in: subCategories.map(sc => new RegExp(`^${sc}$`, 'i')) } };
//             // However, since your sub-categories are fairly standard, direct match after proper casing during product creation is often fine.
//             // If you want to be robust against minor casing issues from various sources:
//             // const subCategoriesRegex = subCategories.map(sc => new RegExp(`^${sc}$`, 'i'));
//             // queryCondition = { category: { $in: subCategoriesRegex } };
//         } else {
//             // Assume it's a sub-category name directly, or a category not in our main map
//             queryCondition = { category: new RegExp(`^${receivedCategoryName}$`, 'i') };
//         }

//         products = await Product.find(queryCondition)
//             .populate('sellerId', 'fullName avatarUrl')
//             .sort({ createdAt: -1 }); // Optional: sort results

//         res.json(products);
//     } catch (err) {
//         console.error("Error fetching category products:", err.message);
//         res.status(500).send('Server Error: Could not fetch category products.');
//     }
// });


// // --- 2. GENERAL GET ROUTES ---

// // @route   GET /api/products
// // @desc    Get all products, with optional search and limit
// // @access  Public
// // --- MODIFIED ROUTE ---
// router.get('/', async (req, res) => {
//   const { search, limit } = req.query;
//   try {
//     let query = search ? { $text: { $search: search } } : {};
    
//     // Use Mongoose chaining for cleaner queries
//     let productsQuery = Product.find(query)
//       .populate('sellerId', 'fullName avatarUrl')
//       .sort({ createdAt: -1 });

//     // Apply limit if it's provided in the query string
//     if (limit) {
//         productsQuery = productsQuery.limit(parseInt(limit));
//     }

//     const products = await productsQuery;
//     res.json(products);

//   } catch (err) {
//     console.error("Error fetching products:", err.message);
//     res.status(500).send('Server Error');
//   }
// });


// // --- 3. DYNAMIC & CUD ROUTES (MUST BE LAST OR NEAR LAST) ---

// // @route   GET /api/products/:id
// // @desc    Get a single product (THIS MUST BE AFTER SPECIFIC ROUTES LIKE /featured)
// // @access  Public
// router.get('/:id', async (req, res) => {
//     try {
//         const product = await Product.findById(req.params.id)
//             .populate('sellerId', 'fullName avatarUrl');

//         if (!product) {
//             return res.status(404).json({ msg: 'Product not found' });
//         }
//         res.json(product);
//     } catch (err) {
//         console.error("Error fetching product by ID:", err.message);
//         if (err.kind === 'ObjectId') {
//             return res.status(404).json({ msg: 'Product not found' });
//         }
//         res.status(500).send('Server Error');
//     }
// });


// // @route   POST /api/products
// // @desc    Add a new product
// // @access  Private (Farmer only)
// router.post('/', [authMiddleware, upload.array('images', 5)], async (req, res) => {
//   // --- EDIT 2: Destructure all the new fields from the form ---
//   const { 
//     name, 
//     description, 
//     price, 
//     unit, 
//     category,       // The sub-category
//     originalPrice,  // This is the bulk price
//     stockQuantity, 
//     externalLink,
//     city,
//     area
//   } = req.body;

//   if (req.user.role !== 'farmer') {
//     return res.status(403).json({ error: 'Access denied. Only farmers can add products.' });
//   }

//   try {
//     // --- EDIT 3: Process the `req.files` array for multiple image paths ---
//     let imageUrls = [];
//     if (req.files && req.files.length > 0) {
//       imageUrls = req.files.map(file => `/uploads/products/${file.filename}`);
//     }

//     // --- EDIT 4: Create the new Product object with all fields ---
//     // Ensure this matches your updated Product schema in `models/Product.js`
//     const newProduct = new Product({
//       name,
//       description,
//       price: parseFloat(price),
//       unit,
//       category,
//       sellerId: req.user.id,
//       imageUrls: imageUrls, // Use the new plural `imageUrls` field

//       // Optional fields
//       originalPrice: originalPrice ? parseFloat(originalPrice) : null,
//       stockQuantity: stockQuantity ? parseInt(stockQuantity, 10) : 0,
//       externalLink: externalLink || null,
//       location: {
//         city: city || null,
//         area: area || null,
//       }
//     });

//     const product = await newProduct.save();
//     res.status(201).json(product);

//   } catch (err) {
//     console.error("Error creating product:", err);
//     if (err.name === 'ValidationError') {
//         return res.status(400).json({ error: err.message });
//     }
//     res.status(500).send('Server Error');
//   }
// });


// module.exports = router;