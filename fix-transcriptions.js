// Manual transcription fix script
// This will trigger transcription for all existing calls that have recordings but no transcripts

const https = require('https');

const VERCEL_URL = 'https://power-choosers-crm.vercel.app';

async function makeRequest(url, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function fixTranscriptions() {
    console.log('🔍 Fetching call data...');
    
    // Get debug health data
    const healthResponse = await makeRequest(`${VERCEL_URL}/api/debug/health`);
    
    if (healthResponse.status !== 200) {
        console.error('❌ Failed to fetch health data:', healthResponse.data);
        return;
    }
    
    const healthData = healthResponse.data;
    const calls = healthData.firestore.lastCalls || [];
    
    console.log(`📞 Found ${calls.length} calls`);
    
    // Filter calls that have recordings but no transcripts
    const callsNeedingTranscription = calls.filter(call => 
        call.hasRecording && call.transcriptLen === 0
    );
    
    console.log(`🎯 ${callsNeedingTranscription.length} calls need transcription`);
    
    if (callsNeedingTranscription.length === 0) {
        console.log('✅ All calls already have transcripts!');
        return;
    }
    
    // Process each call
    for (const call of callsNeedingTranscription) {
        console.log(`\n🔄 Processing call: ${call.id}`);
        
        try {
            // Try to trigger transcription
            const processResponse = await makeRequest(
                `${VERCEL_URL}/api/process-call`,
                'POST',
                { callSid: call.id }
            );
            
            if (processResponse.status === 200) {
                console.log(`✅ Transcription triggered for ${call.id}`);
            } else {
                console.log(`⚠️  Transcription failed for ${call.id}:`, processResponse.data);
            }
            
            // Wait a bit between requests
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`❌ Error processing ${call.id}:`, error.message);
        }
    }
    
    console.log('\n🎉 Transcription fix complete!');
    console.log('📊 Check your CRM in a few minutes to see the transcripts.');
}

// Run the fix
fixTranscriptions().catch(console.error);
