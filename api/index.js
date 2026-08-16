const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());
app.use(cors());

// ✅ Firebase Admin SDK Initialize
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const otpStore = {};

// 🚀 Send OTP Endpoint
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

    // ⚠️ මෙතනදී console එකට print කරනවා, Vercel logs වලින් බලන්න
    console.log("🔄 GENERATED OTP: " + generatedOTP + " FOR: " + phone_number);

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
        console.error("Notify.lk Error:", error.message);
        return res.status(500).json({ success: false, message: "Failed to send SMS." });
    }
});

// 🚀 Verify OTP & Generate Firebase Token Endpoint
app.post('/api/verify-otp', async (req, res) => {
    const { phone_number, otp } = req.body;
    
    console.log("🔐 VERIFY REQUEST FOR: " + phone_number + " WITH OTP: " + otp);

    const record = otpStore[phone_number];

    if (!record) {
        console.log("❌ OTP NOT FOUND IN MEMORY");
        return res.status(400).json({ success: false, message: "OTP not found. Please request again." });
    }

    if (Date.now() > record.expiresAt) {
        console.log("❌ OTP EXPIRED");
        delete otpStore[phone_number];
        return res.status(400).json({ success: false, message: "OTP expired." });
    }

    if (record.otp !== otp) {
        console.log("❌ OTP MISMATCH. Stored: " + record.otp + ", Entered: " + otp);
        return res.status(400).json({ success: false, message: "Invalid OTP code." });
    }

    // ✅ හරියටම ගැලපුණාම මකනවා
    delete otpStore[phone_number];

    try {
        // 🔥 FIX 3: Phone number එකට ඉස්සරහ + එක දානවා
        const formattedPhone = phone_number.startsWith('+') ? phone_number : `+${phone_number}`;

        let userRecord;
        try {
            userRecord = await admin.auth().getUserByPhoneNumber(formattedPhone);
            console.log("✅ EXISTING USER FOUND: " + userRecord.uid);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                userRecord = await admin.auth().createUser({
                    phoneNumber: formattedPhone
                });
                console.log("✅ NEW USER CREATED: " + userRecord.uid);
            } else {
                throw error; 
            }
        }

        // 🔥 Custom Token එක හදනවා
        const customToken = await admin.auth().createCustomToken(userRecord.uid);
        console.log("✅ CUSTOM TOKEN GENERATED SUCCESSFULLY!");

        return res.status(200).json({
            success: true,
            message: "Phone number verified!",
            custom_token: customToken
        });

    } catch (error) {
        console.error("❌ FIREBASE ERROR:", error.message);
        return res.status(500).json({ success: false, message: "Internal server error: " + error.message });
    }
});

module.exports = app;