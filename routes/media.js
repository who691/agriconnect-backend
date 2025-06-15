

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








// // backend/routes/media.js
// const express = require('express');
// // Multer (upload), path, supabase, authMiddleware imports...
// const supabase = require('../config/supabaseClient');
// const authMiddleware = require('../middleware/auth');
// const path = require('path');


// const router = express.Router();
// // upload (Multer instance) should be defined here or imported


// // POST /api/media/upload - Upload a file for chat
// router.post('/upload', [authMiddleware, upload.single('media')], async (req, res) => {
//   if (!req.file) {
//     return res.status(400).json({ msg: 'No file uploaded.' });
//   }

//   try {
//     const fileExt = path.extname(req.file.originalname).toLowerCase();
//     const fileNameInBucket = `chat-media/${req.user.id}-${Date.now()}${fileExt}`;

//     const { error: uploadError } = await supabase.storage
//       .from('chat-media') // YOUR SUPABASE BUCKET FOR CHAT MEDIA
//       .upload(fileNameInBucket, req.file.buffer, {
//         contentType: req.file.mimetype,
//       });

//     if (uploadError) throw uploadError;

//     const { data: publicUrlData } = supabase.storage
//       .from('chat-media')
//       .getPublicUrl(fileNameInBucket);

//     if (!publicUrlData || !publicUrlData.publicUrl) {
//         throw new Error('Failed to get public URL for chat media');
//     }

//     res.status(201).json({
//       message: 'File uploaded successfully',
//       fileUrl: publicUrlData.publicUrl, // This URL will be stored in your Message model
//     });

//   } catch (err) {
//     console.error('Chat media upload error (Supabase):', err);
//     res.status(500).send('Server Error');
//   }
// });

// module.exports = router;







// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const authMiddleware = require('../middleware/auth'); // For security

// const router = express.Router();

// // Configure Multer for storing chat media
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/chat-media/'); // This folder must exist and be writable
//   },
//   filename: (req, file, cb) => {
//     // req.user.id should be available here due to authMiddleware
//     cb(null, `media-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
//   }
// });

// // Create the multer instance with our storage configuration
// const upload = multer({ storage: storage });

// // @route   POST /api/media/upload
// // @desc    Upload an image or audio file for chat
// // @access  Private
// router.post(
//   '/upload',
//   [authMiddleware, upload.single('media')], // 'media' MUST match the name in FormData
//   (req, res) => {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file was uploaded.' });
//     }
    
//     // If upload is successful, return the public URL of the uploaded file
//     res.status(201).json({
//       message: 'File uploaded successfully',
//       fileUrl: `/uploads/chat-media/${req.file.filename}` // This is the path the client needs
//     });
//   }
// );

// module.exports = router;