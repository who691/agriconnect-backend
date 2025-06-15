const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrderItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }, // Price at the time of purchase
    imageUrl: { type: String }
});

const OrderSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [OrderItemSchema],
    totalAmount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    shippingAddress: {
        // You can make this a detailed object
        address: { type: String, required: true },
        city: { type: String, required: true },
        postalCode: { type: String, required: true }
    }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);