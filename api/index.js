const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const otpStore = {};

app.post('/api/send-otp', async (req, res) => {
    const { phone_number } = req.body;

    if (!phone_number) {
        return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    otpStore[phone_number] = {
        otp: generatedOTP,
        expiresAt: Date.now() + 5 * 60 * 1000 
    };

    try {
        await axios.post('https://app.notify.lk/api/v1/send', {
            user_id: process.env.NOTIFY_USER_ID,
            api_key: process.env.NOTIFY_API_KEY,
            sender_id: 'NotifyDEMO',
            to: phone_number,
            message: `Your Philos verification code is: ${generatedOTP}`
        });

        return res.status(200).json({ success: true, message: "OTP sent successfully." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to send SMS." });
    }
});

app.post('/api/verify-otp', (req, res) => {
    const { phone_number, otp } = req.body;
    const record = otpStore[phone_number];

    if (!record || Date.now() > record.expiresAt) {
        return res.status(400).json({ success: false, message: "OTP expired or invalid." });
    }

    if (record.otp === otp) {
        delete otpStore[phone_number];
        return res.status(200).json({ success: true, message: "Phone number verified!" });
    } else {
        return res.status(400).json({ success: false, message: "Invalid OTP code." });
    }
});

module.exports = app;