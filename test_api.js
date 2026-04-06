const jwt = require("jsonwebtoken");
const http = require("http");

const token = jwt.sign({ id: 1, role: "admin" }, "my_super_secret_key_123", { expiresIn: "1d" });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/appointments',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token
  }
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
});

req.on('error', e => console.error(e));
req.end();
