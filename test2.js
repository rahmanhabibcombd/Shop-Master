import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/gateways/whatsapp/connect-otp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`BODY: ${data.substring(0, 100)}`);
  });
});

req.on('error', e => console.error(e));
req.write(JSON.stringify({ phone: '1234567890', token: 'test' }));
req.end();
