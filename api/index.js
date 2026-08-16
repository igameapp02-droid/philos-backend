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

// ✅ Firestore Database එකට සම්බන්ධ වෙනවා
const db = admin.firestore();

// 🚀 Send OTP Endpoint
app.post('/api/send-otp', async (req, res) => {
    const { phone_number } = req.body;

    if (!phone_number) {
        return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // ✅ මතකයේ (Memory) නෙමේ, Firestore එකේ Save කරනවා
        await db.collection('otps').doc(phone_number).set({
            otp: generatedOTP,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        console.log("🔄 GENERATED OTP: " + generatedOTP + " FOR: " + phone_number);

        await axios.post('https://app.notify.lk/api/v1/send', {
            user_id: process.env.NOTIFY_USER_ID,
            api_key: process.env.NOTIFY_API_KEY,
            sender_id: 'NotifyDEMO',
            to: phone_number,
            message: `Your Philos verification code is: ${generatedOTP}`
        });

        return res.status(200).json({ success: true, message: "OTP sent successfully." });
    } catch (error) {
        console.error("❌ ERROR:", error.message);
        return res.status(500).json({ success: false, message: "Failed to send SMS." });
    }
});

// 🚀 Verify OTP & Generate Firebase Token Endpoint
app.post('/api/verify-otp', async (req, res) => {
    const { phone_number, otp } = req.body;
    
    console.log("🔐 VERIFY REQUEST FOR: " + phone_number + " WITH OTP: " + otp);

    try {
        // ✅ Firestore එකෙන් OTP එක ගන්නවා
        const doc = await db.collection('otps').doc(phone_number).get();

        if (!doc.exists) {
            console.log("❌ OTP NOT FOUND");
            return res.status(400).json({ success: false, message: "OTP not found. Please request again." });
        }

        const record = doc.data();

        if (Date.now() > record.expiresAt) {
            console.log("❌ OTP EXPIRED");
            await db.collection('otps').doc(phone_number).delete();
            return res.status(400).json({ success: false, message: "OTP expired." });
        }

        if (record.otp !== otp) {
            console.log("❌ OTP MISMATCH");
            return res.status(400).json({ success: false, message: "Invalid OTP code." });
        }

        // ✅ හරියටම ගැලපුණාම Firestore එකෙන් මකනවා
        await db.collection('otps').doc(phone_number).delete();

        const formattedPhone = phone_number.startsWith('+') ? phone_number : `+${phone_number}`;

        let userRecord;
        try {
            userRecord = await admin.auth().getUserByPhoneNumber(formattedPhone);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                userRecord = await admin.auth().createUser({ phoneNumber: formattedPhone });
            } else {
                throw error; 
            }
        }

        const customToken = await admin.auth().createCustomToken(userRecord.uid);
        console.log("✅ CUSTOM TOKEN GENERATED!");

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