// backend/routes/orders.js

const express = require('express');
const Order = require('../models/Order'); // Your Mongoose Order model
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
router.post('/', authMiddleware, async (req, res) => {
    // Expect items, totalAmount, shippingAddress (as object), AND tx_ref
    const { items, totalAmount, shippingAddress, tx_ref, status } = req.body; // <-- Added status here to potentially use it

    // Added tx_ref check to the initial validation
    if (!items || items.length === 0 || !totalAmount || !shippingAddress || !tx_ref) {
        return res.status(400).json({ error: 'Missing required order information (items, totalAmount, shippingAddress, or tx_ref).' });
    }

    // Add check for shippingAddress being an object and having required nested fields
    // This provides a more specific 400 error before Mongoose validation
    if (typeof shippingAddress !== 'object' || shippingAddress === null ||
        !shippingAddress.address || !shippingAddress.city || !shippingAddress.postalCode) {
         console.error("Received invalid shippingAddress structure:", shippingAddress);
         return res.status(400).json({ error: 'Invalid shippingAddress structure. Requires object with address, city, postalCode.' });
    }

    // Optional: Add a check for the 'status' value itself against known/allowed statuses if you want
    // const allowedStatuses = ['pending', 'awaiting_payment', 'processing', 'shipped', 'delivered', 'cancelled']; // Match your Mongoose enum
    // if (status && !allowedStatuses.includes(status)) {
    //      console.error("Received invalid status value:", status);
    //      return res.status(400).json({ error: `Invalid status value: ${status}` });
    // }


    try {
        // Check if an order with this tx_ref already exists (important for idempotency)
         const existingOrder = await Order.findOne({ tx_ref });
         if (existingOrder) {
             console.warn(`Order with tx_ref ${tx_ref} already exists. Returning existing order.`);
             return res.status(200).json(existingOrder); // Return existing order if found
         }

        const newOrder = new Order({
            userId: req.user.id,
            items,
            totalAmount,
            shippingAddress, // Should now be the object from the frontend
            tx_ref, // Save the transaction reference
            status: status || 'pending', // <-- Use status from frontend if provided, otherwise default to 'pending'. This line's exact behavior depends on your schema's default.
        });

        const savedOrder = await newOrder.save(); // Mongoose validation runs here (including the enum check on `status`)
        console.log(`Order saved successfully with ID: ${savedOrder._id} and tx_ref: ${savedOrder.tx_ref}`); // Log success

        res.status(201).json(savedOrder);
    } catch (err) {
        console.error("Error creating order:", err.message, err); // More detailed logging
        // Check for duplicate key error (if tx_ref is unique in schema)
         if (err.code === 11000) {
             return res.status(400).json({ error: `Order with transaction reference ${tx_ref} already exists.` });
         }
        // If it's a Mongoose validation error, extract details
         if (err.name === 'ValidationError') {
             const errors = Object.keys(err.errors).map(key => err.errors[key].message);
             return res.status(400).json({ error: `Order validation failed: ${errors.join(', ')}` });
         }
        res.status(500).json({ error: 'Server Error saving order.' }); // Send a generic JSON error response
    }
});

// @route   GET /api/orders/:id
// @desc    Get a single order by ID for the currently logged-in user
// @access  Private
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

// @route   DELETE /api/orders/:id
// @desc    Delete an order
// @access  Private
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const orderId = req.params.id;

        // Find the order and ensure it belongs to the authenticated user
        // Also ensure its status allows deletion (e.g., only pending or awaiting_payment)
        const order = await Order.findOneAndDelete({
            _id: orderId,
            userId: req.user.id,
            // Status check allows deleting if status is 'pending' OR 'awaiting_payment'
            status: { $in: ['pending', 'awaiting_payment'] }
        });

        if (!order) {
            // If order wasn't found OR didn't belong to the user OR had wrong status
            // Check specifically if the order exists and belongs to the user but has a status that prevents deletion
            const foundOrder = await Order.findById(orderId);
             if (foundOrder && foundOrder.userId.toString() === req.user.id) {
                  return res.status(403).json({ msg: 'Order status does not allow deletion.' });
             }
            return res.status(404).json({ msg: 'Order not found or not authorized to delete.' });
        }

        console.log(`Order deleted successfully: ${orderId}`);
        res.json({ msg: 'Order removed' }); // Send a success message back
    } catch (err) {
        console.error("Error deleting order:", err.message);
        // If it's a CastError for the ID format, it's like a 404
        if (err.name === 'CastError') {
             return res.status(404).json({ msg: 'Invalid Order ID format.' });
        }
        res.status(500).send('Server Error'); // Send a generic server error
    }
});


module.exports = router;
