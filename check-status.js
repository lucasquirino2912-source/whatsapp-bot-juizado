// Quick HTTP status checker
const http = require('http');

function checkStatus() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/status',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('📊 Bot Status:');
        console.log('  Status:', json.status);
        console.log('  Connected:', json.connected ? '✅ YES' : '❌ NO');
        console.log('  Has QR:', json.hasQr ? '✅ YES' : '❌ NO');
      } catch (err) {
        console.log('Response:', data);
      }
      process.exit(0);
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error connecting to bot:', error.message);
    process.exit(1);
  });

  req.end();
}

checkStatus();
