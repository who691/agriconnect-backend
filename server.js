// AgriConnect/backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const { Chapa } = require('chapa-nodejs'); // If you use Chapa

require('dotenv').config();

// Global error handlers... (keep)
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!! BACKEND SERVER: UNHANDLED REJECTION AT !!!', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('!!! BACKEND SERVER: UNCAUGHT EXCEPTION !!!', error);
  process.exit(1);
});


const app = express();
const server = http.createServer(app);

// Initialize Socket.IO... (keep)
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in dev, restrict in prod
    methods: ["GET", "POST"]
  }
});


// --- CHAPA INSTANCE --- (keep if used)
if (!process.env.CHAPA_SECRET_KEY) {
  console.error("\nFATAL ERROR: CHAPA_SECRET_KEY is not set in the .env file.");
  // process.exit(1); // Commented out to allow server start without Chapa key if needed for other features
} else {
   console.log("BACKEND SERVER - CHAPA_SECRET_KEY being used:", process.env.CHAPA_SECRET_KEY.substring(0, 15) + "...");
}

const chapa = process.env.CHAPA_SECRET_KEY ? new Chapa({ secretKey: process.env.CHAPA_SECRET_KEY }) : null;


// --- MODELS --- (keep all your requires here to ensure they are loaded)
 try {
    require('./models/User');
    require('./models/Product');
    require('./models/FarmerGroup');
    require('./models/Order');
    require('./models/QuickAction');
    require('./models/Address');
    require('./models/Message'); // Ensure Message is required
    // Ensure all your models are listed here
} catch (modelError) {
    console.error("Error loading Mongoose models:", modelError);
    // process.exit(1); // Commented out to potentially allow server start if only models fail
}


// --- MIDDLEWARE --- (keep cors, json, static)
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve static files from uploads dir

// --- IMPORT NEW MIDDLEWARE ---
// The middleware needs to be required here so it's available for the route files to use.
const adminAuth = require('./middleware/adminAuth'); // IMPORT the new middleware


// --- API ROUTES --- (keep existing imports)
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products'); // Contains standard, 'my-products', and admin product routes
const groupRoutes = require('./routes/groups'); // Contains standard group routes (add admin routes here if needed)
const orderRoutes = require('./routes/orders'); // Contains standard order routes (add admin routes here if needed)
const contentRoutes = require('./routes/content');
const userRoutes = require('./routes/users'); // Contains standard and admin user routes
const addressRoutes = require('./routes/addresses');
const mediaRoutes = require('./routes/media');
const paymentRoutes = require('./routes/payment');
const farmersMarketRoutes = require('./routes/farmers-market');


// --- MOUNT API ROUTES --- (keep existing mounts)
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes); // This router handles /products, /products/my-products, /products/admin/*
app.use('/api/groups', groupRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/users', userRoutes); // This router handles /users, /users/admin/*
app.use('/api/addresses', addressRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/farmers-market', farmersMarketRoutes);

// Mount payment routes only if Chapa is initialized
if (chapa) {
  app.use('/api/payment', paymentRoutes);
   console.log("Payment routes mounted.");
} else {
   console.warn("CHAPA_SECRET_KEY not set. Payment routes will not be mounted.");
}


// You could optionally create separate admin routers if you prefer:
// Example:
// const adminRouter = express.Router();
// // Apply auth and adminAuth middleware once for the entire admin router
// adminRouter.use(authMiddleware); 
// adminRouter.use(adminAuth);
// // Then include admin-specific routes inside this router
// adminRouter.use('/users', require('./routes/admin/users')); // e.g., new file backend/routes/admin/users.js
// adminRouter.use('/products', require('./routes/admin/products')); // e.g., new file backend/routes/admin/products.js
// app.use('/api/admin', adminRouter); // Mount the admin router


// --- Socket.IO Logic --- (keep)
io.on('connection', (socket) => {
  console.log('A user connected via WebSocket:', socket.id);

  // ... (keep your existing socket handlers like joinGroup, sendMessage, disconnect, etc.) ...

   socket.on('joinGroup', (groupId) => {
    socket.join(groupId); // Make the socket join the room
    console.log(`Socket ${socket.id} joined group ${groupId}`);
  });

  socket.on('sendMessage', async (payload) => {
      // ... (keep your sendMessage logic - ensure it uses the Message model required earlier)
        console.log('[Socket sendMessage] RAW PAYLOAD RECEIVED:', JSON.stringify(payload, null, 2));

      try {
          const { groupId, senderId, messageText, messageType, fileUrl } = payload;

          // Basic Validations
          if (!groupId) {
              console.error('[Socket sendMessage] ERROR: groupId is missing in payload!', payload);
              socket.emit('messageError', { error: "Internal server error: Group ID missing." });
              return;
          }
          if (!senderId) {
              console.error('[Socket sendMessage] ERROR: senderId is missing in payload!', payload);
              socket.emit('messageError', { error: "Internal server error: Sender ID missing." });
              return;
          }
          if (messageType === 'text' && (messageText === undefined || messageText.trim() === '')) {
              console.error('[Socket sendMessage] ERROR: messageText is missing or empty for text message!', payload);
              socket.emit('messageError', { error: "Cannot send an empty text message." });
              return;
          }
          if ((messageType === 'image' || messageType === 'audio') && !fileUrl) {
              console.error(`[Socket sendMessage] ERROR: fileUrl is missing for ${messageType} message!`, payload);
              socket.emit('messageError', { error: `${messageType.charAt(0).toUpperCase() + messageType.slice(1)} URL missing.` });
              return;
          }

          console.log(`[Socket sendMessage] Attempting to create Message document with groupId: ${groupId}, senderId: ${senderId}`);

          const newMessageDocument = new Message({ // Using the Message model required earlier
              groupId: groupId,
              senderId: senderId,
              messageText: messageType === 'text' ? messageText.trim() : null,
              fileUrl: (messageType === 'image' || messageType === 'audio') ? fileUrl : null,
              messageType: messageType,
              // sentAt will be automatically set due to `timestamps: { createdAt: 'sentAt' }` in your MessageSchema
          });
          
          console.log('[Socket sendMessage] Message document BEFORE save:', JSON.stringify(newMessageDocument.toObject(), null, 2));

          const savedMessage = await newMessageDocument.save();
          console.log(`[Socket sendMessage] Message SAVED successfully to DB. Saved document:`, JSON.stringify(savedMessage.toObject(), null, 2));
          console.log(`[Socket sendMessage] CONFIRMATION: groupId in SAVED document is: ${savedMessage.groupId}`);

          // Populate senderId to include sender's details when broadcasting
          const populatedMessage = await Message.findById(savedMessage._id)
              .populate('senderId', 'fullName avatarUrl _id') // Select specific fields from User
              .lean(); // .lean() returns a plain JS object, faster for read-only

          if (!populatedMessage) {
              console.error(`[Socket sendMessage] CRITICAL: Could not find/populate message after saving. ID: ${savedMessage._id}`);
              socket.emit('messageError', { error: "Server error: Message details could not be prepared after saving." });
              return;
          }
          
          console.log(`[Socket sendMessage] Broadcasting 'newMessage' to group room: ${groupId}. Populated message data:`, JSON.stringify(populatedMessage, null, 2));
          io.to(groupId).emit('newMessage', populatedMessage); // Emit to all clients in the group room

      } catch (error) {
          console.error('[Socket sendMessage] FULL ERROR during save or broadcast:', error);
          if (error.name === 'ValidationError') {
              console.error('[Socket sendMessage] Validation Error Details:', error.errors);
              socket.emit('messageError', { error: "Invalid message data. " + error.message });
          } else {
              socket.emit('messageError', { error: "Server error: Could not send your message." });
          }
          console.error('[Socket sendMessage] Payload at time of error:', JSON.stringify(payload, null, 2));
      }
  });


  socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.id}. Reason: ${reason}`);
  });

  socket.on('connect_error', (err) => {
      console.error("Socket.IO client connection error (server-side log):", socket.id, err.message, err.data || err);
  });

});


// --- DATABASE CONNECTION & SERVER START ---
const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("FATAL ERROR: MONGO_URI is not set in the .env file.");
    process.exit(1); // Exit if MongoDB URI is missing - this is critical
}

const startServer = async () => {
  try {
    // Mongoose connection options (recommended)
    const mongoOptions = {
      serverSelectionTimeoutMS: 5000, // Keep trying to connect for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      // useNewUrlParser: true, // Deprecated, remove
      // useUnifiedTopology: true, // Deprecated, remove
      // useCreateIndex: true, // Deprecated, remove
      // useFindAndModify: false // Deprecated, remove
    };
    await mongoose.connect(MONGO_URI, mongoOptions);
    console.log('MongoDB Connected successfully!');
    
    // Use 'server.listen' (the http server) instead of 'app.listen' for Socket.IO
    server.listen(PORT, () => console.log(`Server (with Socket.IO) running on port ${PORT}`));

  } catch (err) {
    console.error('FATAL: MongoDB Connection Error:', err.message, err);
    // Consider adding a more detailed error check, e.g., `if (err.name === 'MongoNetworkError')`
    process.exit(1); // Exit if MongoDB connection fails - this is critical
  }
};

startServer();
