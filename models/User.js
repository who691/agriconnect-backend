


const mongoose = require('mongoose');
const Schema = mongoose.Schema; // <--- ENSURE Schema is imported from mongoose


// --- IMPORTANT: DO NOT define the AddressSchema here if you are using referenced documents ---
// The Address schema should be defined in its own file (backend/models/Address.js)
// and should export a model named 'Address'.

const UserSchema = new Schema({

    // --- NEW: Area Field ---
    area: {
        type: String,
        trim: true,
        required: false, // Make area optional
        // Add validation here if needed (e.g., enum, min/max length)
    },
  fullName: { type: String, required: true, trim: true },
  // Assuming phone is optional but unique
  phone: { type: String, unique: true, trim: true, sparse: true },
  // Assuming you store hashed passwords
  // It's good practice to select: false on password by default
  password: { type: String, required: true, select: false }, // Consider renaming to passwordHash later
  // Use your actual roles
  role: { type: String, enum: ['farmer', 'consumer', 'admin'], required: true, default: 'consumer' }, // Set a default role
  avatarUrl: { type: String },
  location: {
      type: {
          type: String,
          enum: ['Point'],
          default: 'Point' // Default type for GeoJSON Point
      },
      coordinates: {
          type: [Number], // [longitude, latitude]
          index: '2dsphere', // GeoJSON index for proximity queries
          default: [0, 0] // Default coordinates if none provided (or use null/undefined)
      }
  },
  // For 'Top Farmers' feature if applicable
  rating: { type: Number, default: 0, min: 0, max: 5 },

  // --- CORRECTED ADDRESSES FIELD FOR REFERENCED DOCUMENTS ---
  // Define 'addresses' as an array of references (ObjectIds) to the Address model.
  // The 'ref' value ('Address') must exactly match the name used when you
  // defined and exported your Address model in backend/models/Address.js
  addresses: [{
      type: Schema.Types.ObjectId, // <--- Define it as an array where each element is an ObjectId
      ref: 'Address' // <--- This tells Mongoose which collection/model the ObjectIds point to
  }],
  // --- END OF CORRECTED ADDRESSES FIELD ---


  notifications: {
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
  },
  language: { type: String, default: 'en' },

}, {
    timestamps: true, // Adds createdAt and updatedAt fields
    toJSON: { virtuals: true }, // Include virtuals when converting to JSON
    toObject: { virtuals: true } // Include virtuals when converting to object
});

// Add index for the location field if needed for geospatial queries
UserSchema.index({ location: '2dsphere' });

// Optional: Add a virtual field for addresses count
// This virtual is useful on the frontend when you get the user object via /me
// It will automatically calculate the count from the 'addresses' array.
UserSchema.virtual('addressesCount').get(function() {
    // Check if addresses is an array (it will be if populated or contains ObjectIds)
     return Array.isArray(this.addresses) ? this.addresses.length : 0;
});


// Export the model
// The string 'User' here is the model name. This is what you reference
// from the Address schema (ref: 'User').
module.exports = mongoose.model('User', UserSchema);  





















// backend/models/User.js

// const mongoose = require('mongoose');

// // Define a sub-schema for addresses
// const AddressSchema = new mongoose.Schema({
//   addressLine1: { type: String, required: true },
//   addressLine2: { type: String },
//   city: { type: String, required: true },
//   state: { type: String, required: true },
//   zipCode: { type: String, required: true },
//   type: { type: String, enum: ['shipping', 'billing'], default: 'shipping' },
//   isDefault: { type: Boolean, default: false }
// });


// const UserSchema = new mongoose.Schema({
//   fullName: { type: String, required: true, trim: true },
//   phone: { type: String, required: true, unique: true, trim: true },
//   password: { type: String, required: true },
//   // Your role enum was 'buyer', but your frontend calls farmers, so let's stick with that
//   role: { type: String, enum: ['farmer', 'consumer', 'admin'], required: true },
//   avatarUrl: { type: String },
//   location: { /* ... (from before) */ },
//   // For 'Top Farmers' feature. We will sort by this field.
//   rating: { type: Number, default: 0, min: 0, max: 5 }, // <-- ADD THIS FIELD
//   // --- NEW FIELDS FOR SETTINGS ---
//   addresses: [AddressSchema], 
//   notifications: {
//       orderUpdates: { type: Boolean, default: true },
//       promotions: { type: Boolean, default: false },
//   },
//   language: { type: String, default: 'en' },

// }, { timestamps: true });

// UserSchema.index({ location: '2dsphere' });

// module.exports = mongoose.model('User', UserSchema);

