/**
 * Shared Conversational Intelligence Processing Module
 * 
 * Provides consistent process call functionality across:
 * - Contact Detail page
 * - Account Detail page  
 * - Calls page
 */

window.SharedCIProcessor = (function() {
    'use strict';

    // SVG icons
    function svgEye() {
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }

    function svgSpinner() {
        return '<span class="ci-btn-spinner" aria-hidden="true"></span>';
    }

    // Unified process call function
    async function processCall(callSid, recordingSid, btn, options = {}) {
        const {
            onSuccess = null,
            onError = null,
            onComplete = null,
            context = 'unknown'
        } = options;

        if (!callSid || !btn) {
            console.warn(`[SharedCI:${context}] Missing required parameters:`, { callSid, btn });
            return false;
        }

        console.log(`[SharedCI:${context}] Processing call:`, { callSid, recordingSid });

        try {
            // Set loading state
            btn.innerHTML = svgSpinner();
            btn.classList.add('processing');
            btn.disabled = true;

            // Show loading toast
            if (window.ToastManager) {
                window.ToastManager.showToast({
                    type: 'info',
                    title: 'Processing Call',
                    message: 'Starting conversational intelligence analysis...',
                    sound: false
                });
            }

            // Get API base URL
            let base = (window.crm && typeof window.crm.getApiBaseUrl === 'function')
                ? window.crm.getApiBaseUrl()
                : (window.PUBLIC_BASE_URL || window.API_BASE_URL || 'https://power-choosers-crm.vercel.app');
            base = String(base).replace(/\/$/, '');

            // Make CI request
            const response = await fetch(`${base}/api/twilio/ci-request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    callSid: callSid,
                    recordingSid: recordingSid
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error(`[SharedCI:${context}] CI request error:`, response.status, err);
                
                const errorMessage = (err && (err.error || err.details)) 
                    ? String(err.error || err.details) 
                    : `CI request failed: ${response.status} ${response.statusText}`;

                if (window.ToastManager) {
                    window.ToastManager.showToast({
                        type: 'error',
                        title: 'Processing Failed',
                        message: errorMessage
                    });
                }

                // Reset button state
                btn.innerHTML = svgEye();
                btn.classList.remove('processing');
                btn.classList.add('not-processed');
                btn.disabled = false;
                btn.title = 'Process Call';

                if (onError) onError(err);
                return false;
            }

            const result = await response.json();
            console.log(`[SharedCI:${context}] CI processing initiated:`, result);

            // Update button to show processing state
            btn.innerHTML = svgSpinner();
            btn.title = 'Processing call insights...';
            btn.classList.remove('not-processed');
            btn.classList.add('processing');

            // Store transcript SID for status checking
            if (result && result.transcriptSid) {
                btn.setAttribute('data-transcript-sid', result.transcriptSid);
            }

            // Show success toast
            if (window.ToastManager) {
                window.ToastManager.showToast({
                    type: 'success',
                    title: 'Processing Started',
                    message: 'Call analysis in progress. You\'ll be notified when complete.',
                    sound: false
                });
            }

            // Start polling for completion
            pollForCompletion(callSid, btn, {
                context,
                onSuccess,
                onError,
                onComplete
            });

            return true;

        } catch (error) {
            console.error(`[SharedCI:${context}] Failed to trigger CI processing:`, error);

            // Reset button state
            btn.innerHTML = svgEye();
            btn.classList.remove('processing');
            btn.disabled = false;

            // Show error toast
            if (window.ToastManager) {
                window.ToastManager.showToast({
                    type: 'error',
                    title: 'Processing Failed',
                    message: 'Unable to start call analysis. Please try again.'
                });
            }

            if (onError) onError(error);
            return false;
        }
    }

    // Polling function for insights completion
    function pollForCompletion(callSid, btn, options = {}) {
        const {
            context = 'unknown',
            onSuccess = null,
            onError = null,
            onComplete = null
        } = options;

        let attempts = 0;
        const maxAttempts = 40; // ~2 minutes at 3s intervals
        const delayMs = 3000;
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm.vercel.app';

        const isReady = (call) => {
            const hasTranscript = !!(call && typeof call.transcript === 'string' && call.transcript.trim());
            const insights = call && call.aiInsights;
            const hasInsights = !!(insights && typeof insights === 'object' && Object.keys(insights).length > 0);
            return hasTranscript && hasInsights;
        };

        const finalizeReady = (call) => {
            console.log(`[SharedCI:${context}] Processing complete for:`, callSid);

            // Reset button to ready state
            btn.innerHTML = svgEye();
            btn.classList.remove('processing', 'not-processed');
            btn.disabled = false;
            btn.title = 'View AI insights';

            // Show completion toast
            if (window.ToastManager) {
                window.ToastManager.showToast({
                    type: 'success',
                    title: 'Insights Ready',
                    message: 'Click the eye icon to view call insights.'
                });
            }

            if (onSuccess) onSuccess(call);
            if (onComplete) onComplete(call, true);
        };

        const attempt = () => {
            attempts++;
            
            fetch(`${base}/api/calls?callSid=${encodeURIComponent(callSid)}`)
                .then(r => r.json())
                .then(j => {
                    const call = j && j.ok && Array.isArray(j.calls) && j.calls[0];
                    
                    if (call && isReady(call)) {
                        finalizeReady(call);
                        return;
                    }

                    if (attempts < maxAttempts) {
                        setTimeout(attempt, delayMs);
                    } else {
                        console.warn(`[SharedCI:${context}] Polling timed out for:`, callSid);
                        
                        // Reset to unprocessed state
                        btn.innerHTML = svgEye();
                        btn.classList.remove('processing');
                        btn.classList.add('not-processed');
                        btn.disabled = false;
                        btn.title = 'Process Call';

                        if (onError) onError(new Error('Processing timeout'));
                        if (onComplete) onComplete(null, false);
                    }
                })
                .catch(err => {
                    console.error(`[SharedCI:${context}] Polling error:`, err);
                    
                    if (attempts < maxAttempts) {
                        setTimeout(attempt, delayMs);
                    } else {
                        btn.innerHTML = svgEye();
                        btn.classList.remove('processing');
                        btn.classList.add('not-processed');
                        btn.disabled = false;
                        btn.title = 'Process Call';

                        if (onError) onError(err);
                        if (onComplete) onComplete(null, false);
                    }
                });
        };

        attempt();
    }

    // Enhanced polling with background trigger
    async function pollWithBackgroundTrigger(callSid, btn, options = {}) {
        const {
            context = 'unknown',
            onSuccess = null,
            onError = null,
            onComplete = null
        } = options;

        // First try to trigger background processing
        try {
            const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm.vercel.app';
            
            await fetch(`${base}/api/twilio/poll-ci-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid })
            }).catch(() => {}); // Fire and forget
            
            console.log(`[SharedCI:${context}] Background processing triggered for:`, callSid);
        } catch (error) {
            console.warn(`[SharedCI:${context}] Background trigger failed:`, error);
        }

        // Then start regular polling
        pollForCompletion(callSid, btn, options);
    }

    // Public API
    return {
        processCall,
        pollForCompletion,
        pollWithBackgroundTrigger,
        
        // Utility functions
        isCallReady: (call) => {
            const hasTranscript = !!(call && typeof call.transcript === 'string' && call.transcript.trim());
            const insights = call && call.aiInsights;
            const hasInsights = !!(insights && typeof insights === 'object' && Object.keys(insights).length > 0);
            return hasTranscript && hasInsights;
        },

        setButtonProcessingState: (btn) => {
            if (!btn) return;
            btn.innerHTML = svgSpinner();
            btn.classList.add('processing');
            btn.disabled = true;
        },

        setButtonReadyState: (btn) => {
            if (!btn) return;
            btn.innerHTML = svgEye();
            btn.classList.remove('processing', 'not-processed');
            btn.disabled = false;
            btn.title = 'View AI insights';
        },

        setButtonUnprocessedState: (btn) => {
            if (!btn) return;
            btn.innerHTML = svgEye();
            btn.classList.remove('processing');
            btn.classList.add('not-processed');
            btn.disabled = false;
            btn.title = 'Process Call';
        }
    };
})();