require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

// ✅ Load credentials from environment variables
const {
PAYU_CLIENT_ID,
PAYU_CLIENT_SECRET,
PAYU_POS_ID,
PAYU_API_URL,
PAYU_SECOND_KEY,
ECWID_STORE_ID,
ECWID_API_TOKEN
} = process.env;

// ---------- STEP 1: VERIFY ECWID SIGNATURE ----------
function verifyEcwidSignature(body, signature) {
const payload = JSON.stringify(body);
const calculated = crypto.createHmac('sha256', ECWID_API_TOKEN).update(payload).digest('base64');
return calculated === signature;
}

// ---------- STEP 2: PAYMENT INITIATION FROM ECWID ----------
app.post('/pay', async (req, res) => {
try {
const signature = req.headers['x-ecwid-signature'];
const orderData = req.body;

```
// Optional: Verify Ecwid signature
if (!verifyEcwidSignature(orderData, signature)) {
  console.error('❌ Invalid Ecwid signature');
  return res.status(403).send('Invalid signature');
}

console.log('✅ Received order from Ecwid:', orderData.cart?.order?.orderNumber);

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
const ecwidOrderId = orderData.cart?.order?.id;
const returnUrl = orderData.cart?.order?.returnUrl || 'https://panzlyzeczkami.pl/checkout';
const payuResp = await axios.post(`${PAYU_API_URL}/api/v2_1/orders`, {
  notifyUrl: "https://ecwid-payu.onrender.com/notify", // 👈 PayU will call this
  continueUrl: returnUrl,
  customerIp: "127.0.0.1",
  merchantPosId: PAYU_POS_ID,
  description: `Order ${orderData.cart.order.orderNumber}`,
  currencyCode: orderData.cart.order.currency,
  totalAmount: (orderData.cart.order.total * 100).toString(),
  extOrderId: ecwidOrderId,
  products: orderData.cart.order.items.map(item => ({
    name: item.name,
    unitPrice: (item.price * 100).toString(),
    quantity: item.quantity
  }))
}, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

const redirectUrl = payuResp.data.redirectUri;
console.log('➡️ Redirect customer to:', redirectUrl);

// Respond to Ecwid with redirect link
res.json({ redirectUrl });
```

} catch (err) {
console.error('💥 Error creating PayU order:', err.response?.data || err.message);
res.status(500).send('Payment error');
}
});

// ---------- STEP 3: PAYU NOTIFICATION CALLBACK ----------
app.post('/notify', async (req, res) => {
try {
const notification = req.body;
console.log('🔔 PayU Notification:', notification);

```
const ecwidOrderId = notification?.order?.extOrderId;
const status = notification?.order?.status;

if (!ecwidOrderId) {
  console.error('❌ Missing Ecwid Order ID');
  return res.status(400).send('Bad notification');
}

let paymentStatus = 'INCOMPLETE';
if (status === 'COMPLETED') paymentStatus = 'PAID';
if (status === 'CANCELED' || status === 'REJECTED') paymentStatus = 'CANCELLED';

await axios.post(
  `https://app.ecwid.com/api/v3/${ECWID_STORE_ID}/orders/${ecwidOrderId}/payment_status`,
  { paymentStatus },
  { headers: { Authorization: `Bearer ${ECWID_API_TOKEN}` } }
);

console.log(`✅ Ecwid order ${ecwidOrderId} updated to ${paymentStatus}`);
res.send('OK');
```

} catch (err) {
console.error('💥 Error in PayU notification:', err.response?.data || err.message);
res.status(500).send('Notify error');
}
});

// ---------- STEP 4: TEST ROUTE ----------
app.get('/', (req, res) => {
res.send('✅ Ecwid + PayU integration server is running.');
});

// ---------- SERVER ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
});
