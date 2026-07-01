import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/gateways/whatsapp/connect-walink',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
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
req.write(JSON.stringify({ secret: 'test' }));
req.end();
