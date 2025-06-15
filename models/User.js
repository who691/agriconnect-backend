// backend/models/User.js

const mongoose = require('mongoose');

// Define a sub-schema for addresses
const AddressSchema = new mongoose.Schema({
  addressLine1: { type: String, required: true },
  addressLine2: { type: String },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  type: { type: String, enum: ['shipping', 'billing'], default: 'shipping' },
  isDefault: { type: Boolean, default: false }
});


const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  // Your role enum was 'buyer', but your frontend calls farmers, so let's stick with that
  role: { type: String, enum: ['farmer', 'consumer', 'admin'], required: true },
  avatarUrl: { type: String },
  location: { /* ... (from before) */ },
  // For 'Top Farmers' feature. We will sort by this field.
  rating: { type: Number, default: 0, min: 0, max: 5 }, // <-- ADD THIS FIELD
  // --- NEW FIELDS FOR SETTINGS ---
  addresses: [AddressSchema], 
  notifications: {
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
  },
  language: { type: String, default: 'en' },

}, { timestamps: true });

UserSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('User', UserSchema);