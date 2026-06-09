// Test if raw body is being preserved correctly
const express = require('express');
const app = express();

// IMPORTANT: This must come BEFORE any body parser
app.use(
  express.json({
    verify: (req, res, buf, encoding) => {
      if (req.url.includes('/test-webhook')) {
        req.rawBody = buf;
        console.log('✅ Raw body preserved:', buf.length, 'bytes');
        console.log('📝 Raw body sample:', buf.toString('utf8').substring(0, 100));
      }
    },
  })
);

app.post('/test-webhook', (req, res) => {
  console.log('\n🔔 Test webhook received');
  console.log('  - Body type:', typeof req.body);
  console.log('  - Body keys:', Object.keys(req.body || {}));
  console.log('  - rawBody exists:', !!req.rawBody);
  console.log('  - rawBody is Buffer:', Buffer.isBuffer(req.rawBody));
  console.log('  - rawBody length:', req.rawBody?.length || 0);
  
  res.json({ 
    success: true,
    receivedRawBody: !!req.rawBody,
    rawBodyLength: req.rawBody?.length || 0
  });
});

app.listen(3002, () => {
  console.log('🚀 Test server running on http://localhost:3002');
  console.log('📡 Test with ngrok: https://estimate-character-draw.ngrok-free.dev/test-webhook');
  console.log('\n📋 Test command:');
  console.log('curl -X POST https://estimate-character-draw.ngrok-free.dev/test-webhook \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"test": "data"}\'');
});
