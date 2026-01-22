// Call Processing Web Worker
// Handles all heavy call logging and data processing off the main thread

// Import the updateCallStatus function logic
async function updateCallStatus(phoneNumber, status, startTime, duration = 0, callId = null, fromNumber = null, callType = 'outgoing') {
  try {
    const base = (self.API_BASE_URL || '').replace(/\/$/, '');
    if (!base) return;
    
    const callSid = callId || `call_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date(startTime).toISOString();
    
    // For incoming calls, use the caller's number as 'from' and business number as 'to'
    // For outgoing calls, use business number as 'from' and target number as 'to'
    const isIncoming = callType === 'incoming';
    const biz = getBusinessNumberE164();
    const callFrom = isIncoming ? (fromNumber || phoneNumber) : biz;
    const callTo = isIncoming ? biz : phoneNumber;
    
    const payload = {
      callSid: callSid,
      to: callTo,
      from: callFrom,
      status: status,
      duration: duration,
      durationSec: duration,
      callTime: timestamp,
      timestamp: timestamp,
      // Include call context (will be passed from main thread)
      accountId: null,
      accountName: null,
      contactId: null,
      contactName: null,
      source: 'phone-widget',
      targetPhone: String(phoneNumber || '').replace(/\D/g, '').slice(-10),
      businessPhone: biz
    };

    // Only write to /api/calls on 'completed' status
    if (status === 'completed') {
      console.log('[CallWorker] POST /api/calls (background)', { base, payload });

      // Fire-and-forget API call
      fetch(`${base}/api/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(resp => resp.json()).then(respJson => {
        console.log('[CallWorker] /api/calls response (background)', { status: 'success', body: respJson });
      }).catch(err => {
        console.log('[CallWorker] /api/calls error (non-blocking)', err);
      });
    }
    
  } catch (error) {
    console.error('[CallWorker] Failed to update call status:', error);
  }
}

// Helper function to get business number
function getBusinessNumberE164() {
  // This would need to be passed from main thread or stored in worker
  return '+1234567890'; // Placeholder - will be passed from main thread
}

// Handle messages from main thread
self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  try {
    switch (type) {
      case 'CALL_COMPLETED':
        console.log('[CallWorker] Processing call completion:', data);
        await updateCallStatus(
          data.phoneNumber,
          'completed',
          data.startTime,
          data.duration,
          data.callSid,
          data.fromNumber,
          data.callType
        );
        
        // Notify main thread that call was logged
        self.postMessage({
          type: 'CALL_LOGGED',
          data: { phoneNumber: data.phoneNumber, callSid: data.callSid }
        });
        break;
        
      case 'SET_BUSINESS_NUMBER':
        self.businessNumber = data.businessNumber;
        break;
        
      case 'SET_API_BASE_URL':
        self.API_BASE_URL = data.apiBaseUrl;
        break;
        
      default:
        console.warn('[CallWorker] Unknown message type:', type);
    }
  } catch (error) {
    console.error('[CallWorker] Error processing message:', error);
    self.postMessage({
      type: 'ERROR',
      data: { error: error.message }
    });
  }
};
