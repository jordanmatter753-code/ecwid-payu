require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// ✅ Create the Express app BEFORE using it
const app = express();
app.use(bodyParser.json());

// ✅ Load credentials from .env file
const {
  PAYU_CLIENT_ID,
  PAYU_CLIENT_SECRET,
  PAYU_POS_ID,
  PAYU_API_URL,
  PAYU_SECOND_KEY,
  ECWID_STORE_ID,
  ECWID_API_TOKEN
} = process.env;

// ---------- STEP 1: PAYMENT INITIATION FROM ECWID ----------
app.post('/pay', async (req, res) => {
  try {
    const orderData = req.body; // Ecwid will send order info here

    // 👇 Added debug print
    console.log("Received order from Ecwid:", JSON.stringify(req.body, null, 2));

    // 1. Get OAuth token from PayU
    const tokenResp = await axios.post(`${PAYU_API_URL}/pl/standard/user/oauth/authorize`, null, {
      params: {
        grant_type: 'client_credentials',
        client_id: PAYU_CLIENT_ID,
        client_secret: PAYU_CLIENT_SECRET
      }
    });

    const accessToken = tokenResp.data.access_token;

    // 2. Create order in PayU
    const payuResp = await axios.post(`${PAYU_API_URL}/api/v2_1/orders`, {
      notifyUrl: "https://ecwid-payu.onrender.com/notify",
      continueUrl: "https://panzlyzeczkami.pl/?payment_success=true",
      customerIp: "127.0.0.1",
      merchantPosId: PAYU_POS_ID,
      description: `Order ${orderData.cart.order.orderNumber}`,
      currencyCode: orderData.cart.order.currency,
      totalAmount: (orderData.cart.order.total * 100).toString(),
      products: orderData.cart.order.items.map(item => ({
        name: item.name,
        unitPrice: (item.price * 100).toString(),
        quantity: item.quantity
      }))
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const redirectUrl = payuResp.data.redirectUri;
    console.log("Redirect customer to:", redirectUrl);
    res.json({ redirectUrl });

  } catch (err) {
    console.error("Error creating PayU order:", err.response?.data || err.message);
    res.status(500).send("Payment error");
  }
});

// ---------- STEP 2: PAYU NOTIFICATION CALLBACK ----------
app.post('/notify', async (req, res) => {
  try {
    const notification = req.body;
    console.log("PayU Notification:", notification);

    const ecwidOrderId = notification?.order?.extOrderId;
    const payuStatus = notification?.order?.status;

    if (!ecwidOrderId) {
      console.error("Missing Ecwid order ID in notification");
      return res.status(400).send("Missing order ID");
    }

    let paymentStatus = "INCOMPLETE";
    if (payuStatus === "COMPLETED") paymentStatus = "PAID";
    if (payuStatus === "CANCELED" || payuStatus === "REJECTED") paymentStatus = "CANCELLED";

    await axios.post(
      `https://app.ecwid.com/api/v3/${ECWID_STORE_ID}/orders/${ecwidOrderId}/payment_status`,
      { paymentStatus },
      { headers: { Authorization: `Bearer ${ECWID_API_TOKEN}` } }
    );

    console.log(`✅ Updated Ecwid order ${ecwidOrderId} → ${paymentStatus}`);
    res.send("OK");
  } catch (err) {
    console.error("Error in PayU notification:", err.response?.data || err.message);
    res.status(500).send("Notify error");
  }
});

// ---------- SERVER ----------
app.get('/', (req, res) => {
  res.send('✅ PayU integration is running! Use /pay for payment requests.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 PayU integration server running on http://localhost:${PORT}`);
});
