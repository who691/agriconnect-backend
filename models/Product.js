// backend/models/Product.js

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  price: { type: Number, required: true },
  unit: { type: String, required: true, default: 'kg' },
  category: { type: String, required: true },
  
  // --- FIX #1: This is the most important change ---
  // Changed from a single `imageUrl` string to an array of strings.
  imageUrls: [{ type: String }],
  
  // --- NEW FIELDS to match your form ---
  originalPrice: { type: Number, default: null }, // For bulk/sale price
  stockQuantity: { type: Number, default: 0 },
  externalLink: { type: String, default: null },
  location: {
    city: { type: String, trim: true },
    area: { type: String, trim: true }
  },

  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  isFeatured: { type: Boolean, default: false },
  viewCount: { type: Number, default: 0 },

}, { timestamps: true });

// --- FIX #2: Add `category` to the text index for better searching ---
ProductSchema.index({ name: 'text', description: 'text', category: 'text' });

module.exports = mongoose.model('Product', ProductSchema);