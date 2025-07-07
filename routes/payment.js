// AgriConnect/backend/routes/payment.js
const express = require('express');
const { Chapa } = require('chapa-nodejs'); // Chapa SDK is required here

const router = express.Router();

// POST /api/payment/initialize-payment
router.post('/initialize-payment', async (req, res) => {
    // --- Instantiate Chapa SDK here, only when this route is hit ---
    if (!process.env.CHAPA_SECRET_KEY) {
        console.error("CHAPA_ROUTE: CHAPA_SECRET_KEY is not set.");
        return res.status(500).json({ message: "Payment system configuration error." });
    }
    const chapa = new Chapa({ secretKey: process.env.CHAPA_SECRET_KEY });

    const {
        amount,
        currency = 'ETB',
        email,
        first_name,
        last_name,
        phone_number,
        tx_ref,
        // Ensure WEBHOOK_SITE_ID is in your .env
        callback_url = `https://webhook.site/${process.env.WEBHOOK_SITE_ID || 'YOUR_WEBHOOK_ID_FALLBACK'}`, // Changed fallback text
        return_url
    } = req.body;

    console.log("CHAPA_ROUTE: Received /initialize-payment request body:", JSON.stringify(req.body, null, 2));
    console.log("CHAPA_ROUTE: Using WEBHOOK_SITE_ID:", process.env.WEBHOOK_SITE_ID || "NOT SET (using fallback)");

    if (!amount || !email || !first_name || !last_name || !tx_ref || !return_url) {
        return res.status(400).json({ message: 'Missing required fields for payment initialization.' });
    }

    const initializeOptions = {
        amount: String(amount),
        currency: currency,
        email: email,
        first_name: first_name,
        last_name: last_name,
        phone_number: phone_number || '0900000000', // Default if not provided
        tx_ref: tx_ref,
        callback_url: callback_url,
        return_url: return_url,
    };

    try {
        console.log("CHAPA_ROUTE: Initializing Chapa payment with options:", JSON.stringify(initializeOptions, null, 2));
        const response = await chapa.initialize(initializeOptions);
        console.log("CHAPA_ROUTE: Chapa SDK Initialize Response:", JSON.stringify(response, null, 2));
        res.json(response);
    } catch (sdkError) {
        console.error('--- CHAPA_ROUTE: Chapa SDK Initialize Error ---');
        // Your detailed error logging (copied from your original code)
        console.error("RAW sdkError OBJECT:", JSON.stringify(sdkError, Object.getOwnPropertyNames(sdkError), 2));
        console.error("Type of sdkError:", typeof sdkError);
        if (sdkError && sdkError.toString) {
            console.error("sdkError.toString():", sdkError.toString());
        }
        console.error("Error Name:", sdkError.name);
        console.error("Raw Error Message from SDK:", sdkError.message);

        if (sdkError.response && sdkError.response.data) {
            console.error(">>> Chapa API Response Data (from sdkError.response.data):", JSON.stringify(sdkError.response.data, null, 2));
        }
        if (typeof sdkError.message === 'object' && sdkError.message !== null) {
            console.error("SDK Error Message (if object):", JSON.stringify(sdkError.message, null, 2));
        }
        if (sdkError.isAxiosError && sdkError.response) {
            console.error("Axios Error - Status:", sdkError.response.status);
            console.error("Axios Error - Data (from Axios):", JSON.stringify(sdkError.response.data, null, 2));
        }
        console.error("Error Stack:", sdkError.stack);

        let clientErrorMessage = 'SDK Error processing payment.';
        let chapaApiActualError = null;

        if (sdkError.response && sdkError.response.data) {
            chapaApiActualError = sdkError.response.data;
            clientErrorMessage = chapaApiActualError.msg || chapaApiActualError.message || JSON.stringify(chapaApiActualError);
        } else if (sdkError.message) {
            clientErrorMessage = (typeof sdkError.message === 'string') ? sdkError.message : JSON.stringify(sdkError.message);
        }

        res.status(sdkError.response?.status || 500).json({ // Used optional chaining for status
            message: 'Failed to initialize payment using Chapa SDK.',
            sdkErrorDetails: clientErrorMessage,
            chapaApiError: chapaApiActualError,
            fullSdkErrorForDev: process.env.NODE_ENV === 'development' && sdkError ? JSON.parse(JSON.stringify(sdkError, Object.getOwnPropertyNames(sdkError))) : 'Details hidden in production'
        });
    }
});

// GET /api/payment/verify-payment/:tx_ref
router.get('/verify-payment/:tx_ref', async (req, res) => {
    // --- Instantiate Chapa SDK here, only when this route is hit ---
    if (!process.env.CHAPA_SECRET_KEY) {
        console.error("CHAPA_ROUTE: CHAPA_SECRET_KEY is not set.");
        return res.status(500).json({ message: "Payment system configuration error." });
    }
    const chapa = new Chapa({ secretKey: process.env.CHAPA_SECRET_KEY });

    const { tx_ref } = req.params;
    try {
        console.log(`CHAPA_ROUTE: Verifying payment via SDK for tx_ref: ${tx_ref}`);
        const response = await chapa.verify({ tx_ref });
        console.log("CHAPA_ROUTE: Chapa SDK Verify Response for", tx_ref, ":", JSON.stringify(response, null, 2));
        res.json(response);
    } catch (error) {
        console.error(`--- CHAPA_ROUTE: Chapa SDK Verify Error for ${tx_ref} ---`);
        // Your detailed error logging (similar to above, simplified here for brevity)
        console.error("Verify Error Message:", error.message);
        console.error("Verify Error Stack:", error.stack); // Important for debugging
        res.status(error.response?.status || 500).json({ // Used optional chaining for status
            message: 'SDK Verify Failed',
            errorDetails: error.message,
            fullErrorForDev: process.env.NODE_ENV === 'development' && error ? JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))) : 'Details hidden in production'
        });
    }
});

module.exports = router;
