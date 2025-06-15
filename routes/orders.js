// backend/routes/orders.js

const express = require('express');
const Order = require('../models/Order');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

// @route   GET /api/orders
// @desc    Get all orders for the currently logged-in user
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        console.error("Error fetching orders:", err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/orders
// @desc    Create a new order (from checkout)
// @access  Private
// This is a placeholder for what you would build for a checkout screen.
// It would take a list of items and a shipping address from req.body.
router.post('/', authMiddleware, async (req, res) => {
    const { items, totalAmount, shippingAddress } = req.body;
    
    if (!items || items.length === 0 || !totalAmount || !shippingAddress) {
        return res.status(400).json({ error: 'Missing required order information.' });
    }

    try {
        const newOrder = new Order({
            userId: req.user.id,
            items,
            totalAmount,
            shippingAddress
        });
        const savedOrder = await newOrder.save();
        res.status(201).json(savedOrder);
    } catch (err) {
        console.error("Error creating order:", err.message);
        res.status(500).send('Server Error');
    }
});



router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        
        // Security Check: Make sure the user requesting the order is the one who placed it
        if (order.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized to view this order' });
        }

        res.json(order);
    } catch (err) {
        console.error("Error fetching order:", err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Order not found' });
        }
        res.status(500).send('Server Error');
    }
});


module.exports = router;