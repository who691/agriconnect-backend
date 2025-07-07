

// backend/routes/media.js
const express = require('express');
const multer = require('multer');
const { chatMediaStorage } = require('../config/cloudinary'); // Adjust path
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: chatMediaStorage });

// POST /api/media/upload - Upload a file for chat
router.post('/upload', [authMiddleware, upload.single('media')], async (req, res) => {
  // 'media' is the field name from your frontend FormData
  if (!req.file) {
    return res.status(400).json({ msg: 'No file uploaded.' });
  }

  try {
    // req.file.path contains the Cloudinary URL
    res.status(201).json({
      message: 'File uploaded successfully',
      fileUrl: req.file.path, // This URL will be stored in your Message model
    });
  } catch (err) {
    console.error('Chat media upload error (Cloudinary):', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
