// Quick test to verify webhook is accessible
const https = require('https');

const testUrl = 'https://power-choosers-crm.vercel.app/api/twilio/voice';

console.log('🧪 Testing webhook accessibility...');
console.log('URL:', testUrl);

const req = https.get(testUrl, (res) => {
    console.log('✅ Status:', res.statusCode);
    console.log('📋 Headers:', res.headers);
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('📄 Response length:', data.length, 'characters');
        if (res.statusCode === 405) {
            console.log('✅ Webhook is accessible (405 = Method not allowed for GET, which is expected)');
        } else {
            console.log('⚠️ Unexpected status code');
        }
    });
});

req.on('error', (e) => {
    console.log('❌ Error:', e.message);
});

req.setTimeout(10000, () => {
    console.log('❌ Timeout - webhook not responding');
    req.destroy();
});