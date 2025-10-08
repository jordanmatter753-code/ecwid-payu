// ---------- STEP 1: PAYMENT INITIATION FROM ECWID ----------
app.post('/pay', async (req, res) => {
  try {
    const orderData = req.body; // Ecwid will send order info here

    // 👇 Add this line to print full request data for debugging
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
      continueUrl: "https://panzlyzeczkami.pl/?payment_success=true", // 👈 redirect buyer here after success
      customerIp: "127.0.0.1",
      merchantPosId: PAYU_POS_ID,
      description: `Order ${orderData.cart.order.orderNumber}`,
      currencyCode: orderData.cart.order.currency,
      totalAmount: (orderData.cart.order.total * 100).toString(), // PayU expects cents
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

    // Send Ecwid the redirect link
    res.json({ redirectUrl });

  } catch (err) {
    console.error("Error creating PayU order:", err.response?.data || err.message);
    res.status(500).send("Payment error");
  }
});
