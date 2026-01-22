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

    function svgAIStars() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 48 48">
            <path fill="white" d="M23.426,31.911l-1.719,3.936c-0.661,1.513-2.754,1.513-3.415,0l-1.719-3.936	c-1.529-3.503-4.282-6.291-7.716-7.815l-4.73-2.1c-1.504-0.668-1.504-2.855,0-3.523l4.583-2.034	c3.522-1.563,6.324-4.455,7.827-8.077l1.741-4.195c0.646-1.557,2.797-1.557,3.443,0l1.741,4.195	c1.503,3.622,4.305,6.514,7.827,8.077l4.583,2.034c1.504,0.668,1.504,2.855,0,3.523l-4.73,2.1	C27.708,25.62,24.955,28.409,23.426,31.911z"></path>
            <path fill="white" d="M38.423,43.248l-0.493,1.131c-0.361,0.828-1.507,0.828-1.868,0l-0.493-1.131	c-0.879-2.016-2.464-3.621-4.44-4.5l-1.52-0.675c-0.822-0.365-0.822-1.56,0-1.925l1.435-0.638c2.027-0.901,3.64-2.565,4.504-4.65	l0.507-1.222c0.353-0.852,1.531-0.852,1.884,0l0.507,1.222c0.864,2.085,2.477,3.749,4.504,4.65l1.435,0.638	c0.822,0.365,0.822,1.56,0,1.925l-1.52,0.675C40.887,39.627,39.303,41.232,38.423,43.248z"></path>
        </svg>`;
    }

    // Unified process call function
    async function processCall(callSid, recordingSid, btn, options = {}) {
        const {
            onSuccess = null,
            onError = null,
            onComplete = null,
            context = 'unknown',
            metadata = {} // NEW: { company, city, state, contactName, contactTitle }
        } = options;

        if (!callSid || !btn) {
            console.warn(`[SharedCI:${context}] Missing required parameters:`, { callSid, btn });
            return false;
        }

        try {
            // Set loading state
            btn.innerHTML = svgSpinner();
            btn.classList.add('processing');
            btn.disabled = true;

            // Show loading toast
            if (window.ToastManager) {
                const toastTitle = metadata.company || metadata.contactName || 'Call Analysis';
                const toastMessage = metadata.company 
                    ? `Starting AI analysis for ${metadata.company} (${metadata.city}, ${metadata.state})...`
                    : metadata.contactName
                        ? `Starting AI analysis for ${metadata.contactName} (${metadata.contactTitle})...`
                        : 'Starting conversational intelligence analysis...';

                window.ToastManager.showToast({
                    type: 'info',
                    title: toastTitle,
                    message: toastMessage,
                    icon: svgEye(),
                    sound: false
                });
            }

            // Get API base URL
            let base = (window.crm && typeof window.crm.getApiBaseUrl === 'function')
                ? window.crm.getApiBaseUrl()
                : (window.PUBLIC_BASE_URL || window.API_BASE_URL || 'https://power-choosers-crm-792458658491.us-south1.run.app');
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
                
                // Extract error message from multiple possible fields
                const errorMessage = (err && (err.error || err.details || err.message)) 
                    ? String(err.error || err.details || err.message) 
                    : `CI request failed: ${response.status} ${response.statusText}`;

                // Log full error details for debugging
                console.error(`[SharedCI:${context}] Full error details:`, {
                    status: response.status,
                    statusText: response.statusText,
                    error: err,
                    message: errorMessage
                });

                if (window.ToastManager) {
                    window.ToastManager.showToast({
                        type: 'error',
                        title: 'Processing Failed',
                        message: errorMessage,
                        duration: 8000 // Show longer for important errors
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

            // Update button to show processing state
            btn.innerHTML = svgSpinner();
            btn.title = 'Processing call insights...';
            btn.classList.remove('not-processed');
            btn.classList.add('processing');

            // Store transcript SID for status checking
            if (result && result.transcriptSid) {
                btn.setAttribute('data-transcript-sid', result.transcriptSid);
                
                // If transcript already existed and is completed, trigger immediate poll to get results
                if (result.existing && result.status === 'completed') {
                    
                    // Immediately trigger poll to get results
                    try {
                        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm-792458658491.us-south1.run.app';
                        await fetch(`${base}/api/twilio/poll-ci-analysis`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                transcriptSid: result.transcriptSid,
                                callSid: callSid 
                            })
                        }).catch(() => {});
                    } catch(_) {}
                }
            }

            // Start listening/polling for completion
            
            // IMPORTANT: Always trigger background analyzer once to ensure processing is active (H5)
            triggerBackgroundAnalysis(callSid, btn, context).catch(err => {
                console.error(`[SharedCI] Initial triggerBackgroundAnalysis failed for ${callSid}:`, err);
            });

            // NEW: Persistent Poke (H12). Continue to poke the background analyzer every 5s 
            // until processing is complete. This ensures that if the first poke was too 
            // early, a subsequent poke will catch the data once Twilio is ready.
            const pokeInterval = setInterval(() => {
                if (!btn || !btn.classList.contains('processing')) {
                    clearInterval(pokeInterval);
                    return;
                }
                triggerBackgroundAnalysis(callSid, btn, context).catch(() => {});
            }, 5000);

            if (window.firebaseDB) {
                try {
                    listenForCompletion(callSid, btn, { context, onSuccess, onError, onComplete, metadata });
                } catch (e) {
                    console.error(`[SharedCI] listenForCompletion failed for ${callSid}:`, e);
                }
            } else {
                // Start polling for completion
                pollForCompletion(callSid, btn, { context, onSuccess, onError, onComplete, metadata });
            }

            return true;

        } catch (error) {
            console.error(`[SharedCI:${context}] Failed to trigger CI processing:`, error);

            // Extract error message
            const errorMessage = error?.message || error?.error || error?.toString() || 'Unable to start call analysis. Please try again.';

            // Reset button state
            btn.innerHTML = svgEye();
            btn.classList.remove('processing');
            btn.disabled = false;

            // Show error toast with actual error message
            if (window.ToastManager) {
                window.ToastManager.showToast({
                    type: 'error',
                    title: 'Processing Failed',
                    message: errorMessage,
                    duration: 8000 // Show longer for important errors
                });
            }

            if (onError) onError(error);
            return false;
        }
    }

    // Trigger background analysis via API (Fire and forget)
    async function triggerBackgroundAnalysis(callSid, btn, context = 'unknown') {
        const transcriptSid = btn?.getAttribute('data-transcript-sid') || null;
        
        try {
            const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm-792458658491.us-south1.run.app';
            const resp = await fetch(`${base}/api/twilio/poll-ci-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    transcriptSid: transcriptSid,
                    callSid: callSid 
                })
            });
        } catch (error) {
            console.warn(`[SharedCI] Background analysis trigger failed for ${callSid}:`, error.message);
        }
    }

    // Firebase real-time listener for insights completion
    function listenForCompletion(callSid, btn, options = {}) {
        const {
            context = 'unknown',
            onSuccess = null,
            onError = null,
            onComplete = null,
            metadata = {}
        } = options;

        if (!window.firebaseDB) {
            console.warn(`[SharedCI:${context}] Firebase not available, falling back to polling`);
            return pollForCompletion(callSid, btn, options);
        }

        const isReady = (call) => {
            if (!call) return false;
            
            // Status must be completed or failed
            const status = (call.status || '').toLowerCase();
            const isDoneStatus = (status === 'completed' || status === 'failed');

            // CRITICAL: We need both transcript AND insights data
            const hasTranscript = !!(call.transcript || call.formattedTranscript || '').trim();
            
            // Check for insights - could be in aiInsights or conversationalIntelligence
            const insights = call.aiInsights || call.conversationalIntelligence;
            const hasInsights = !!(insights && typeof insights === 'object' && (
                insights.summary || 
                (Array.isArray(insights.keyTopics) && insights.keyTopics.length > 0) || 
                (Array.isArray(insights.nextSteps) && insights.nextSteps.length > 0)
            ));
            
            // If status is completed but data is missing, it's H10 (status set before data)
            // If status is NOT completed/failed, it's definitely not ready.
            return isDoneStatus && hasTranscript && hasInsights;
        };

        const finalizeReady = (call) => {
            // Reset button to ready state
            btn.innerHTML = svgEye();
            btn.classList.remove('processing', 'not-processed');
            btn.classList.add('just-ready'); // Subtle pulse animation
            btn.disabled = false;
            btn.title = 'View AI insights';

            // Remove pulse class after animation finishes
            setTimeout(() => {
                btn.classList.remove('just-ready');
            }, 3000);

            if (window.ToastManager) {
                const toastTitle = metadata.company || metadata.contactName || 'Insights Ready';
                const toastMessage = metadata.company 
                    ? `AI insights are ready for ${metadata.company}. Click the eye to view.`
                    : metadata.contactName
                        ? `AI insights are ready for ${metadata.contactName}. Click the eye to view.`
                        : 'AI call insights are ready for viewing.';

                window.ToastManager.showToast({
                    type: 'success',
                    title: toastTitle,
                    message: toastMessage,
                    icon: svgAIStars()
                });
            }

            // Dispatch event
            try {
                document.dispatchEvent(new CustomEvent('pc:call-insights-ready', {
                    detail: { callSid, call, context }
                }));
            } catch (_) { }

            if (onSuccess) onSuccess(call);
            if (onComplete) onComplete(call, true);
        };

        // Guard against duplicate listeners
        const guardKey = `_sharedCI_${callSid}_Bound`;
        if (document[guardKey]) {
            return;
        }
        document[guardKey] = true;

        const unsubscribe = window.firebaseDB.collection('calls').doc(callSid).onSnapshot((doc) => {
            if (doc.exists) {
                const call = { id: doc.id, ...doc.data() };
                
                if (isReady(call)) {
                    finalizeReady(call);
                    unsubscribe();
                    delete document[guardKey];
                }
            }
        }, (err) => {
            console.error(`[SharedCI] Firebase listener error for ${callSid}:`, err);
            delete document[guardKey];
            // On error, fallback to polling
            pollForCompletion(callSid, btn, options);
        });

        // Safety timeout (5 mins)
        setTimeout(() => {
            if (document[guardKey]) {
                unsubscribe();
                delete document[guardKey];
            }
        }, 5 * 60 * 1000);
    }

    // Polling function for insights completion
    function pollForCompletion(callSid, btn, options = {}) {
        const {
            context = 'unknown',
            onSuccess = null,
            onError = null,
            onComplete = null,
            metadata = {}
        } = options;

        let attempts = 0;
        const maxAttempts = 40; // ~2 minutes at 3s intervals
        const delayMs = 3000;
        const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm-792458658491.us-south1.run.app';

        const isReady = (call) => {
            if (!call) return false;
            const status = (call.status || '').toLowerCase();
            const isDoneStatus = (status === 'completed' || status === 'failed');
            const hasTranscript = !!(call.transcript || call.formattedTranscript || '').trim();
            const insights = call.aiInsights || call.conversationalIntelligence;
            const hasInsights = !!(insights && typeof insights === 'object' && (
                insights.summary || 
                (Array.isArray(insights.keyTopics) && insights.keyTopics.length > 0)
            ));
            return isDoneStatus && hasTranscript && hasInsights;
        };

        const finalizeReady = (call) => {
            // Reset button to ready state
            btn.innerHTML = svgEye();
            btn.classList.remove('processing', 'not-processed');
            btn.classList.add('just-ready'); // Subtle pulse animation
            btn.disabled = false;
            btn.title = 'View AI insights';

            // Remove pulse class after animation finishes
            setTimeout(() => {
                btn.classList.remove('just-ready');
            }, 3000);

            if (window.ToastManager) {
                const toastTitle = metadata.company || metadata.contactName || 'Insights Ready';
                const toastMessage = metadata.company 
                    ? `AI insights are ready for ${metadata.company}. Click the eye to view.`
                    : metadata.contactName
                        ? `AI insights are ready for ${metadata.contactName}. Click the eye to view.`
                        : 'AI call insights are ready for viewing.';

                window.ToastManager.showToast({
                    type: 'success',
                    title: toastTitle,
                    message: toastMessage,
                    icon: svgAIStars()
                });
            }

            // Dispatch event to notify pages that insights are ready
            try {
                document.dispatchEvent(new CustomEvent('pc:call-insights-ready', {
                    detail: { callSid, call, context }
                }));
            } catch (e) {
                console.error(`[SharedCI] Failed to dispatch event for ${callSid}:`, e);
            }

            if (onSuccess) {
                onSuccess(call);
            }
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

        // Get transcriptSid from button attribute if available (more reliable than callSid alone)
        const transcriptSid = btn?.getAttribute('data-transcript-sid') || null;

        // First try to trigger background processing
        try {
            const base = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '') || 'https://power-choosers-crm-792458658491.us-south1.run.app';
            
            if (transcriptSid) {
                // Use transcriptSid for more reliable polling
                await fetch(`${base}/api/twilio/poll-ci-analysis`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        transcriptSid: transcriptSid,
                        callSid: callSid 
                    })
                }).catch(() => {}); // Fire and forget
            } else {
                // Fallback to callSid only (poll-ci-analysis will need to resolve transcriptSid)
            await fetch(`${base}/api/twilio/poll-ci-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid })
                }).catch(() => {});
            }
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
            if (!call) return false;
            const status = (call.status || '').toLowerCase();
            const isDoneStatus = (status === 'completed' || status === 'failed');
            const hasTranscript = !!(call.transcript || call.formattedTranscript || '').trim();
            const insights = call.aiInsights || call.conversationalIntelligence;
            const hasInsights = !!(insights && typeof insights === 'object' && (
                insights.summary || 
                (Array.isArray(insights.keyTopics) && insights.keyTopics.length > 0)
            ));
            return isDoneStatus && hasTranscript && hasInsights;
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