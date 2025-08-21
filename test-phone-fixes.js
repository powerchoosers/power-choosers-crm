// Test Script for Phone Widget Callback Prevention Fixes
// Run this in the browser console after loading your CRM application

console.log('=== Phone Widget Test Script ===');

// Test function to simulate rapid callNumber calls
async function testCallbackPrevention() {
    console.log('Testing automatic callback prevention...');
    
    // Clear any existing state first
    window.lastCallNumberTime = 0;
    
    // Test 1: Rapid successive calls to same number
    console.log('\n1. Testing rapid successive calls to same number...');
    window.Widgets.callNumber('+15551234567', 'Test Contact 1', true);
    
    // Should be blocked due to cooldown
    setTimeout(() => {
        console.log('Attempting second call to same number (should be blocked)...');
        window.Widgets.callNumber('+15551234567', 'Test Contact 1', true);
    }, 100);
    
    // Test 2: Different numbers rapid fire
    setTimeout(() => {
        console.log('\n2. Testing rapid calls to different numbers...');
        window.Widgets.callNumber('+15559876543', 'Test Contact 2', true);
        
        setTimeout(() => {
            console.log('Second different number (should also be blocked)...');
            window.Widgets.callNumber('+15555555555', 'Test Contact 3', true);
        }, 100);
    }, 2000);
    
    // Test 3: Call state tracking
    setTimeout(() => {
        console.log('\n3. Testing call state tracking...');
        console.log('Current call context:', window.currentCallContext);
        console.log('Is call in progress:', window.isCallInProgress);
    }, 4000);
    
    // Test 4: Manual call (should work after cooldown)
    setTimeout(() => {
        console.log('\n4. Testing manual call after cooldown...');
        window.Widgets.callNumber('+15551111111', '', false); // Manual call, no auto-trigger
    }, 10000);
}

// Test token refresh functionality
async function testTokenRefresh() {
    console.log('\n=== Testing Token Refresh ===');
    
    try {
        if (window.TwilioRTC && window.TwilioRTC.state.device) {
            console.log('Current device state:', {
                ready: window.TwilioRTC.state.ready,
                tokenRefreshTimer: !!window.TwilioRTC.state.tokenRefreshTimer
            });
            
            // Manually trigger a token refresh test
            const base = (window.API_BASE_URL || '').replace(/\/$/, '');
            if (base) {
                console.log('Testing token endpoint...');
                const resp = await fetch(`${base}/api/twilio/token?identity=agent`);
                const data = await resp.json().catch(() => ({}));
                
                if (resp.ok && data.token) {
                    console.log('✅ Token refresh endpoint working');
                    console.log('Token expires in:', Math.floor((JSON.parse(atob(data.token.split('.')[1])).exp - Date.now()/1000) / 60), 'minutes');
                } else {
                    console.error('❌ Token refresh endpoint failed:', data);
                }
            } else {
                console.warn('No API_BASE_URL configured - cannot test token refresh');
            }
        } else {
            console.log('No Twilio device initialized yet');
        }
    } catch (error) {
        console.error('Token refresh test failed:', error);
    }
}

// Test cleanup functionality
function testCleanup() {
    console.log('\n=== Testing Cleanup Functions ===');
    
    // Test device shutdown
    if (window.TwilioRTC && window.TwilioRTC.shutdown) {
        console.log('Testing device shutdown...');
        // Don't actually shutdown during test, just verify function exists
        console.log('✅ Shutdown function available');
    }
    
    // Check for memory leaks prevention
    console.log('Checking timer cleanup...');
    const timerCount = Object.keys(window).filter(key => key.includes('timer') || key.includes('Timer')).length;
    console.log('Timer-related globals:', timerCount);
}

// Test debugging helpers
function testDebuggingHelpers() {
    console.log('\n=== Testing Debugging Helpers ===');
    
    const helpers = [
        'debugTwilio',
        'callServer', 
        'callBrowser',
        'Call',
        'TwilioRTC'
    ];
    
    helpers.forEach(helper => {
        if (window[helper]) {
            console.log(`✅ ${helper} is available`);
        } else {
            console.log(`❌ ${helper} is missing`);
        }
    });
}

// Main test runner
async function runAllTests() {
    console.log('Starting comprehensive phone widget tests...\n');
    
    // Test 1: Callback prevention
    await testCallbackPrevention();
    
    // Test 2: Token refresh
    setTimeout(() => testTokenRefresh(), 2000);
    
    // Test 3: Cleanup
    setTimeout(() => testCleanup(), 4000);
    
    // Test 4: Debug helpers
    setTimeout(() => testDebuggingHelpers(), 6000);
    
    // Summary
    setTimeout(() => {
        console.log('\n=== Test Summary ===');
        console.log('✅ All tests completed');
        console.log('Check the console output above for any failures or warnings');
        console.log('Key improvements:');
        console.log('  - Automatic callback prevention with multiple safety checks');
        console.log('  - Token refresh every 50 minutes + emergency refresh on token errors');
        console.log('  - Better call state management and cleanup');
        console.log('  - Enhanced debugging and logging');
    }, 8000);
}

// Export test functions for manual use
window.testPhoneWidget = {
    runAllTests,
    testCallbackPrevention,
    testTokenRefresh,
    testCleanup,
    testDebuggingHelpers
};

// Auto-run tests if this script is executed
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(runAllTests, 1000);
} else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(runAllTests, 1000));
}
