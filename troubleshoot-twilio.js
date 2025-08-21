// Twilio Voice SDK Troubleshooting Script
// Run this in your browser's developer console to diagnose issues

console.log('=== Twilio Voice SDK Troubleshooting ===');

async function troubleshootTwilio() {
    try {
        console.log('1. Checking API Base URL...');
        const base = window.API_BASE_URL;
        console.log('API_BASE_URL:', base);
        
        if (!base) {
            console.error('❌ API_BASE_URL is not configured');
            return;
        }
        
        console.log('2. Testing token endpoint...');
        const tokenUrl = `${base.replace(/\/$/, '')}/api/twilio/token?identity=agent`;
        console.log('Token URL:', tokenUrl);
        
        const response = await fetch(tokenUrl);
        console.log('Token response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Token request failed:', errorText);
            return;
        }
        
        const tokenData = await response.json();
        console.log('✅ Token received');
        
        if (!tokenData.token) {
            console.error('❌ No token in response:', tokenData);
            return;
        }
        
        console.log('3. Decoding JWT token...');
        try {
            const parts = tokenData.token.split('.');
            if (parts.length !== 3) {
                console.error('❌ Invalid JWT format');
                return;
            }
            
            const payload = JSON.parse(atob(parts[1]));
            console.log('Token payload:', payload);
            
            // Check expiration
            const now = Math.floor(Date.now() / 1000);
            const exp = payload.exp;
            const iat = payload.iat;
            
            console.log('Token issued at:', new Date(iat * 1000));
            console.log('Token expires at:', new Date(exp * 1000));
            console.log('Current time:', new Date());
            console.log('Time until expiry:', Math.floor((exp - now) / 60), 'minutes');
            
            if (exp <= now) {
                console.error('❌ Token is expired!');
                return;
            }
            
            if (exp - now < 300) { // Less than 5 minutes
                console.warn('⚠️  Token expires in less than 5 minutes');
            }
            
        } catch (e) {
            console.error('❌ Failed to decode JWT:', e);
            return;
        }
        
        console.log('4. Checking Twilio SDK availability...');
        if (typeof Twilio === 'undefined') {
            console.error('❌ Twilio SDK not loaded. Add script tag:');
            console.error('<script src="https://sdk.twilio.com/js/voice/releases/2.11.0/twilio.min.js"></script>');
            return;
        }
        
        console.log('✅ Twilio SDK is available');
        console.log('SDK Version:', Twilio.Device.version || 'Unknown');
        
        console.log('5. Testing device creation...');
        try {
            const device = new Twilio.Device(tokenData.token, {
                codecPreferences: ['opus', 'pcmu'],
                fakeLocalDTMF: true,
                enableImprovedSignalingErrorPrecision: true,
                logLevel: 'debug'
            });
            
            console.log('✅ Device created successfully');
            
            // Test device registration
            console.log('6. Testing device registration...');
            
            let registrationTimeout;
            const registrationPromise = new Promise((resolve, reject) => {
                device.on('registered', () => {
                    console.log('✅ Device registered successfully');
                    clearTimeout(registrationTimeout);
                    resolve();
                });
                
                device.on('error', (error) => {
                    console.error('❌ Device error:', error);
                    clearTimeout(registrationTimeout);
                    reject(error);
                });
                
                registrationTimeout = setTimeout(() => {
                    reject(new Error('Registration timeout'));
                }, 10000);
            });
            
            await device.register();
            await registrationPromise;
            
            console.log('✅ All tests passed! Twilio Voice SDK is working correctly.');
            
        } catch (deviceError) {
            console.error('❌ Device creation/registration failed:', deviceError);
        }
        
    } catch (error) {
        console.error('❌ Troubleshooting failed:', error);
    }
}

// Also provide environment check helper
function checkEnvironment() {
    console.log('=== Environment Check ===');
    console.log('User Agent:', navigator.userAgent);
    console.log('Protocol:', location.protocol);
    console.log('Host:', location.host);
    
    // Check for HTTPS (required for WebRTC)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        console.error('❌ HTTPS required for WebRTC. Use https:// or test on localhost');
    } else {
        console.log('✅ Protocol check passed');
    }
    
    // Check for WebRTC support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('❌ WebRTC not supported in this browser');
    } else {
        console.log('✅ WebRTC support detected');
    }
    
    // Check for microphone permission
    navigator.permissions?.query({name: 'microphone'}).then(result => {
        console.log('Microphone permission:', result.state);
    }).catch(() => {
        console.log('Could not check microphone permission');
    });
}

// Run the troubleshooting
checkEnvironment();
troubleshootTwilio();

// Export for manual use
window.troubleshootTwilio = troubleshootTwilio;
window.checkEnvironment = checkEnvironment;
