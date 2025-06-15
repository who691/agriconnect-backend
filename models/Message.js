const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
    groupId: { type: Schema.Types.ObjectId, ref: 'FarmerGroup', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // --- NEW FIELDS ---
    messageType: {
        type: String,
        enum: ['text', 'image', 'audio'],
        required: true,
        default: 'text'
    },
    messageText: { type: String, trim: true }, // Not required for image/audio
    fileUrl: { type: String } // URL to the uploaded image or audio
}, { timestamps: { createdAt: 'sentAt' } });

module.exports = mongoose.model('Message', MessageSchema);