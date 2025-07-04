const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MarketSchema = new Schema({
    eventName: { type: String, required: true, trim: true },
    date: { type: String, trim: true },
    location: {
        address: { type: String, trim: true },
        coordinates: {
            type: [Number],
            index: '2dsphere',
            required: false,
        }
    },
    description: { type: String, trim: true },
    bannerImageUrl: { type: String, trim: true },
    specialOffers: [{ type: String, trim: true }],
    participatingFarmers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    participatingFarmersDisplayText: [{ // <-- ADD THIS NEW FIELD
        type: String,
        trim: true
    }],
    isActive: { type: Boolean, default: false },

}, {
    timestamps: true
});

MarketSchema.index({ isActive: 1 });

module.exports = mongoose.model('Market', MarketSchema);