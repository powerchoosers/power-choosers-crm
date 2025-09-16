#!/usr/bin/env node

// Diagnostic script to check call leg structure and recording details
// Run: node debug-call-recording.js CA2be77ef3fee2da3a76eccb6126549cf9

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID || 'ACed7d3374950ebc936eff95454c05a57f';
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!authToken) {
    console.error('❌ TWILIO_AUTH_TOKEN environment variable not set');
    console.log('Set it with: $env:TWILIO_AUTH_TOKEN = "your_auth_token"');
    process.exit(1);
}

const callSid = process.argv[2] || 'CA2be77ef3fee2da3a76eccb6126549cf9';

async function debugCall(callSid) {
    const client = twilio(accountSid, authToken);
    
    try {
        console.log('🔍 Analyzing call:', callSid);
        console.log('==========================================\n');
        
        // Get the main call details
        const call = await client.calls(callSid).fetch();
        console.log('📞 MAIN CALL DETAILS:');
        console.log('  Call SID:', call.sid);
        console.log('  From:', call.from);
        console.log('  To:', call.to);
        console.log('  Direction:', call.direction);
        console.log('  Status:', call.status);
        console.log('  Parent Call SID:', call.parentCallSid || 'None (this is parent)');
        console.log('  Duration:', call.duration, 'seconds');
        console.log();
        
        // Get all recordings for this call
        const recordings = await client.recordings.list({ 
            callSid: callSid,
            limit: 10 
        });
        
        console.log('🎵 RECORDINGS FOR THIS CALL:');
        if (recordings.length === 0) {
            console.log('  ❌ No recordings found for this call');
        } else {
            recordings.forEach((recording, index) => {
                console.log(`  Recording ${index + 1}:`);
                console.log('    SID:', recording.sid);
                console.log('    Channels:', recording.channels);
                console.log('    Track:', recording.track);
                console.log('    Source:', recording.source);
                console.log('    Call SID:', recording.callSid);
                console.log('    Duration:', recording.duration, 'seconds');
                console.log('    Status:', recording.status);
                console.log();
            });
        }
        
        // Check for child calls (calls that were dialed from this call)
        console.log('🔗 CHECKING FOR CHILD CALLS:');
        try {
            const allCalls = await client.calls.list({ 
                parentCallSid: callSid,
                limit: 10
            });
            
            if (allCalls.length === 0) {
                console.log('  ❌ No child calls found');
                
                // Also check if THIS call is a child call
                if (call.parentCallSid) {
                    console.log('  ℹ️  This call IS a child call of:', call.parentCallSid);
                    
                    // Get parent call details
                    const parentCall = await client.calls(call.parentCallSid).fetch();
                    console.log('  📞 PARENT CALL DETAILS:');
                    console.log('    Call SID:', parentCall.sid);
                    console.log('    From:', parentCall.from);
                    console.log('    To:', parentCall.to);
                    console.log('    Direction:', parentCall.direction);
                    console.log();
                    
                    // Check parent call recordings
                    const parentRecordings = await client.recordings.list({ 
                        callSid: parentCall.sid,
                        limit: 10 
                    });
                    
                    console.log('  🎵 PARENT CALL RECORDINGS:');
                    if (parentRecordings.length === 0) {
                        console.log('    ❌ No recordings found for parent call');
                    } else {
                        parentRecordings.forEach((recording, index) => {
                            console.log(`    Recording ${index + 1}:`);
                            console.log('      SID:', recording.sid);
                            console.log('      Channels:', recording.channels);
                            console.log('      Track:', recording.track);
                            console.log('      Source:', recording.source);
                            console.log('      Call SID:', recording.callSid);
                            console.log();
                        });
                    }
                }
            } else {
                console.log(`  ✅ Found ${allCalls.length} child call(s):`);
                
                for (const childCall of allCalls) {
                    console.log(`  📞 CHILD CALL: ${childCall.sid}`);
                    console.log('    From:', childCall.from);
                    console.log('    To:', childCall.to);
                    console.log('    Direction:', childCall.direction);
                    console.log('    Status:', childCall.status);
                    
                    // Get recordings for each child call
                    const childRecordings = await client.recordings.list({ 
                        callSid: childCall.sid,
                        limit: 10 
                    });
                    
                    console.log('    🎵 CHILD RECORDINGS:');
                    if (childRecordings.length === 0) {
                        console.log('      ❌ No recordings found for this child call');
                    } else {
                        childRecordings.forEach((recording, index) => {
                            console.log(`      Recording ${index + 1}:`);
                            console.log('        SID:', recording.sid);
                            console.log('        Channels:', recording.channels, recording.channels === 2 ? '✅' : '❌');
                            console.log('        Track:', recording.track);
                            console.log('        Source:', recording.source);
                            console.log();
                        });
                    }
                    console.log();
                }
            }
        } catch (error) {
            console.log('  ❌ Error checking for child calls:', error.message);
        }
        
        console.log('==========================================');
        console.log('🎯 ANALYSIS SUMMARY:');
        
        const hasChildCalls = await client.calls.list({ 
            parentCallSid: callSid,
            limit: 1 
        }).then(calls => calls.length > 0);
        
        if (hasChildCalls) {
            console.log('✅ This is a PARENT call that dialed out to other numbers');
            console.log('   Recording should happen on the CHILD call leg for dual-channel');
        } else if (call.parentCallSid) {
            console.log('✅ This is a CHILD call (was dialed from another call)');
            console.log('   Recording should happen on THIS call for dual-channel');
        } else {
            console.log('⚠️  This appears to be a simple call with no dial operations');
        }
        
        const monoRecordings = recordings.filter(r => r.channels === 1);
        const dualRecordings = recordings.filter(r => r.channels === 2);
        
        if (monoRecordings.length > 0) {
            console.log(`❌ Found ${monoRecordings.length} mono recording(s) - this is the problem!`);
        }
        if (dualRecordings.length > 0) {
            console.log(`✅ Found ${dualRecordings.length} dual-channel recording(s) - good!`);
        }
        
        if (recordings.length === 0) {
            console.log('❌ No recordings found at all - check webhook configuration');
        }
        
        console.log('\n💡 RECOMMENDATIONS:');
        if (monoRecordings.length > 0 && !hasChildCalls && !call.parentCallSid) {
            console.log('- This appears to be a simple call without Dial operations');
            console.log('- Simple calls cannot have dual-channel recordings');
            console.log('- You need calls that use <Dial> to bridge two parties');
        } else if (monoRecordings.length > 0) {
            console.log('- Recording is happening on the wrong call leg');
            console.log('- Ensure Dial TwiML has recordingChannels="dual"');
            console.log('- Check that dial-status webhook starts recording on DialCallSid');
        }
        
    } catch (error) {
        console.error('❌ Error analyzing call:', error.message);
        if (error.code === 20404) {
            console.log('Call not found. Check the Call SID.');
        }
    }
}

debugCall(callSid);