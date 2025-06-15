const express = require('express');
const Address = require('../models/Address');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// @route   POST /api/addresses
// @desc    Add a new address for the user
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
    const { addressLine1, addressLine2, city, state, zipCode, isDefault } = req.body;
    try {
        // If the new address is default, unset any other default addresses for this user
        if (isDefault) {
            await Address.updateMany({ userId: req.user.id }, { $set: { isDefault: false } });
        }
        const newAddress = new Address({ userId: req.user.id, ...req.body });
        const address = await newAddress.save();
        res.status(201).json(address);
    } catch (err) { res.status(500).send('Server Error'); }
});

// @route   GET /api/addresses
// @desc    Get all addresses for the user
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
    try {
        const addresses = await Address.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 });
        res.json(addresses);
    } catch (err) { res.status(500).send('Server Error'); }
});

// @route   PUT /api/addresses/:id
// @desc    Update an address
// @access  Private
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        if (req.body.isDefault) {
             await Address.updateMany({ userId: req.user.id }, { $set: { isDefault: false } });
        }
        const address = await Address.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
        res.json(address);
    } catch (err) { res.status(500).send('Server Error'); }
});


// @route   DELETE /api/addresses/:id
// @desc    Delete an address
// @access  Private
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await Address.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Address removed' });
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;