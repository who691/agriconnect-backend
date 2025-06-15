// backend/models/FarmerGroup.js
const mongoose = require('mongoose');

const FarmerGroupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    type: { type: String, enum: ['Category-Based', 'Location-Based'], required: true },
    category: { type: String, trim: true },
    locationName: { type: String },
    
    // --- THIS IS THE FIX ---
    // Make the entire location object optional.
    // We remove the default value for `type`. The field will only be created
    // if the coordinates are provided.
    location: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] } // [longitude, latitude]
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

// The index now needs to be sparse, so it only indexes documents that HAVE a location field.
FarmerGroupSchema.index({ location: '2dsphere' }, { sparse: true });
FarmerGroupSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('FarmerGroup', FarmerGroupSchema);