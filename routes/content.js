// backend/routes/content.js
const express = require('express');
const router = express.Router();
const QuickAction = require('../models/QuickAction');

// @route   GET /api/content/quick-actions
// @desc    Get all quick action items
// @access  Public
router.get('/quick-actions', async (req, res) => {
  try {
    const actions = await QuickAction.find().sort({ order: 1 });
    res.json(actions);
  } catch (err) {
    console.error('Error fetching quick actions:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;