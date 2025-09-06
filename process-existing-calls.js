#!/usr/bin/env node

/**
 * Script to process existing calls with AI insights
 * Run with: node process-existing-calls.js
 */

const API_BASE_URL = 'http://localhost:3000';

async function processExistingCalls() {
    try {
        console.log('🔍 Fetching existing calls...');
        
        // Get all calls
        const response = await fetch(`${API_BASE_URL}/api/calls`);
        const data = await response.json();
        
        if (!data.ok || !data.calls) {
            console.error('❌ Failed to fetch calls:', data);
            return;
        }
        
        console.log(`📞 Found ${data.calls.length} calls`);
        
        // Process calls that don't have AI insights
        const callsToProcess = data.calls.filter(call => 
            !call.aiInsights && call.status === 'completed' && call.duration > 0
        );
        
        console.log(`🤖 ${callsToProcess.length} calls need AI processing`);
        
        if (callsToProcess.length === 0) {
            console.log('✅ All calls already have AI insights!');
            return;
        }
        
        // Process each call
        for (const call of callsToProcess) {
            console.log(`\n🔄 Processing call: ${call.id}`);
            console.log(`   To: ${call.to}, Duration: ${call.duration}s`);
            
            try {
                const processResponse = await fetch(`${API_BASE_URL}/api/process-call`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callSid: call.id })
                });
                
                const processData = await processResponse.json();
                
                if (processData.success) {
                    console.log(`   ✅ AI processing completed`);
                    console.log(`   📝 Summary: ${processData.aiInsights?.summary?.substring(0, 100)}...`);
                } else {
                    console.log(`   ❌ Failed: ${processData.error}`);
                }
                
                // Wait a bit between calls to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
        }
        
        console.log('\n🎉 Processing complete!');
        console.log('💡 Refresh your browser to see the AI insights in the Call Insights modal.');
        
    } catch (error) {
        console.error('❌ Script error:', error);
    }
}

// Run the script
processExistingCalls();

