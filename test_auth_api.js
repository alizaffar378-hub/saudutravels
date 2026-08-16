const http = require('http');

const testPayload = JSON.stringify({
  email: "admin@saudipak.com",
  password: "admin123"
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testPayload)
  }
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log("Status Code:", res.statusCode);
    console.log("Response:", body);
    if (res.statusCode === 200 && JSON.parse(body).success === true) {
      console.log("SUCCESS: Authentication API is working correctly!");
    } else {
      console.error("FAILED: Authentication API test failed.");
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error("Connection error:", e.message);
  process.exit(1);
});

req.write(testPayload);
req.end();
