// backend/models/QuickAction.js
const mongoose = require('mongoose');

const QuickActionSchema = new mongoose.Schema({
  label: { type: String, required: true },
  iconName: { type: String, required: true },
  route: { type: String, required: true },
  color: { type: String, default: '#4CAF50' },
  order: { type: Number, default: 0 }
});

module.exports = mongoose.model('QuickAction', QuickActionSchema);