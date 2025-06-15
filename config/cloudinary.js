// config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Use HTTPS URLs
});

// Storage engine for Product Images
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'agriconnect/products', // Folder in Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }], // Optional image transformation
  },
});

// Storage engine for User Avatars
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'agriconnect/avatars',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
  },
});

// Storage engine for Chat Media
const chatMediaStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'agriconnect/chat-media',
    resource_type: 'auto', // Allows images, videos, raw files etc.
    // Consider adding transformations or validations as needed
  },
});


// --- ADD THIS ---
// Storage engine for Group Cover Images
const groupCoverStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'agriconnect/group-covers',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 1200, height: 400, crop: 'fill' }], // Adjust as needed
  },
});
// --- END ADD ---

module.exports = {
  productStorage,
  avatarStorage,
  chatMediaStorage,
  groupCoverStorage,
};