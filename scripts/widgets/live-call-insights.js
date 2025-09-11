// Live Call Insights Widget
// Displays real-time transcription and AI tips during active calls

class LiveCallInsights {
    constructor() {
        this.isActive = false;
        this.currentCallSid = null;
        this.insightsContainer = null;
        this.transcriptContainer = null;
        this.tipsContainer = null;
        this.pollingInterval = null;
        this.lastUpdateTime = null;
        this.lastPollOk = null;        // null | boolean
        this.lastHadMatch = null;      // null | boolean
    }

    init() {
        this.createWidget();
        this.bindEvents();
    }

    createWidget() {
        // Create the live insights widget
        const widget = document.createElement('div');
        widget.id = 'live-call-insights';
        // Use shared widget container class for consistent padding and theme
        widget.className = 'live-call-insights-widget widget-card';
        widget.innerHTML = `
            <div class="live-insights-header widget-card-header">
                <h3 class="widget-title">Live Call Insights</h3>
                <div class="live-status">
                    <span class="status-indicator"></span>
                    <span class="status-text">Inactive</span>
                </div>
            </div>
            <div class="live-insights-content">
                <div class="live-transcript-section">
                    <h4>Live Transcript</h4>
                    <div class="transcript-container" id="live-transcript-container">
                        <div class="transcript-placeholder">Start a call to see live transcription...</div>
                    </div>
                </div>
                <div class="live-tips-section">
                    <h4>AI Tips</h4>
                    <div class="tips-container" id="live-tips-container">
                        <div class="tips-placeholder">AI tips will appear here during your call...</div>
                    </div>
                </div>
            </div>
        `;

        // Add to the widget panel, preferring the inner `.widget-content` container for consistent padding
        const widgetContainer = document.querySelector('.widget-panel .widget-content') || document.querySelector('.widget-panel');
        if (widgetContainer) {
            widgetContainer.appendChild(widget);
        }

        this.insightsContainer = widget;
        this.transcriptContainer = document.getElementById('live-transcript-container');
        this.tipsContainer = document.getElementById('live-tips-container');
    }

    bindEvents() {
        // Listen for call events
        document.addEventListener('callStarted', (e) => {
            this.startLiveInsights(e.detail.callSid);
        });

        document.addEventListener('callEnded', () => {
            this.stopLiveInsights();
        });

        // Listen for phone widget events
        const phoneWidget = document.getElementById('phone-widget');
        if (phoneWidget) {
            phoneWidget.addEventListener('callStateChanged', (e) => {
                if (e.detail.state === 'in-call') {
                    this.startLiveInsights(e.detail.callSid);
                } else if (e.detail.state === 'idle') {
                    this.stopLiveInsights();
                }
            });
        }
    }

    startLiveInsights(callSid) {
        this.isActive = true;
        this.currentCallSid = callSid;
        this.lastUpdateTime = new Date().toISOString();

        // Update UI
        this.updateStatus('active', 'Live');
        this.transcriptContainer.innerHTML = '<div class="transcript-loading">Listening for conversation...</div>';
        this.tipsContainer.innerHTML = '<div class="tips-loading">Analyzing conversation...</div>';

        // Start polling for updates
        this.startPolling();

        console.log('[Live Insights] Started for call:', callSid);
    }

    stopLiveInsights() {
        this.isActive = false;
        this.currentCallSid = null;

        // Stop polling
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }

        // Update UI
        this.updateStatus('inactive', 'Inactive');
        this.transcriptContainer.innerHTML = '<div class="transcript-placeholder">Start a call to see live transcription...</div>';
        this.tipsContainer.innerHTML = '<div class="tips-placeholder">AI tips will appear here during your call...</div>';

        console.log('[Live Insights] Stopped');
    }

    startPolling() {
        // Poll for updates every 3 seconds
        this.pollingInterval = setInterval(() => {
            if (this.isActive && this.currentCallSid) {
                this.fetchLiveInsights();
            }
        }, 3000);
    }

    async fetchLiveInsights() {
        try {
            const response = await fetch(`/api/calls?callSid=${this.currentCallSid}`);
            const data = await response.json();

            if (data && data.ok && Array.isArray(data.calls)) {
                const calls = data.calls;
                // Try to find the exact call by twilioSid or id
                let call = null;
                if (this.currentCallSid) {
                    call = calls.find(c => c.twilioSid === this.currentCallSid || c.id === this.currentCallSid) || null;
                }
                // Fallback to most recent if not found
                if (!call && calls.length > 0) {
                    call = calls[0];
                }
                // Update status indicator based on match
                this.lastPollOk = true;
                this.lastHadMatch = !!call;
                this.renderStatusBadge();

                if (call) {
                    this.updateLiveData(call);
                }
            } else {
                // Unexpected payload shape
                this.lastPollOk = false;
                this.renderStatusBadge('error');
            }
        } catch (error) {
            console.warn('[Live Insights] Failed to fetch insights:', error);
            this.lastPollOk = false;
            this.renderStatusBadge('error');
        }
    }

    updateLiveData(call) {
        // Update transcript
        if (call.transcript && call.transcript.length > 0) {
            this.updateTranscript(call.transcript);
        }

        // Update AI tips
        if (call.aiInsights && call.aiInsights.liveTips) {
            this.updateTips(call.aiInsights.liveTips);
        }

        // Update sentiment indicator
        if (call.aiInsights && call.aiInsights.sentiment) {
            this.updateSentiment(call.aiInsights.sentiment);
        }
    }

    updateTranscript(transcript) {
        // Format transcript with speaker labels
        const formattedTranscript = this.formatTranscript(transcript);
        this.transcriptContainer.innerHTML = `
            <div class="transcript-content">
                ${formattedTranscript}
            </div>
        `;
    }

    formatTranscript(transcript) {
        // Simple formatting - in a real implementation, you'd want more sophisticated speaker diarization
        const lines = transcript.split('\n').filter(line => line.trim());
        return lines.map(line => {
            if (line.includes(':')) {
                const [speaker, ...text] = line.split(':');
                const isAgent = speaker.toLowerCase().includes('agent') || speaker.toLowerCase().includes('rep');
                return `
                    <div class="transcript-line ${isAgent ? 'agent' : 'customer'}">
                        <span class="speaker">${speaker.trim()}:</span>
                        <span class="text">${text.join(':').trim()}</span>
                    </div>
                `;
            } else {
                return `<div class="transcript-line">${line}</div>`;
            }
        }).join('');
    }

    updateTips(tips) {
        if (!tips || tips.length === 0) {
            this.tipsContainer.innerHTML = '<div class="tips-placeholder">No tips available yet...</div>';
            return;
        }

        const tipsHtml = tips.map(tip => `
            <div class="tip-item tip-${tip.type} tip-priority-${tip.priority}">
                <div class="tip-icon">
                    ${this.getTipIcon(tip.type)}
                </div>
                <div class="tip-content">
                    <div class="tip-message">${tip.message}</div>
                    <div class="tip-priority">${tip.priority.toUpperCase()}</div>
                </div>
            </div>
        `).join('');

        this.tipsContainer.innerHTML = tipsHtml;
    }

    getTipIcon(type) {
        const icons = {
            'info': 'ℹ️',
            'warning': '⚠️',
            'success': '✅',
            'opportunity': '🎯'
        };
        return icons[type] || 'ℹ️';
    }

    updateSentiment(sentiment) {
        const statusIndicator = this.insightsContainer.querySelector('.status-indicator');
        if (statusIndicator) {
            // Preserve existing classes (like status-*) and only update sentiment-*
            const classes = Array.from(statusIndicator.classList);
            classes.filter(c => c.startsWith('sentiment-')).forEach(c => statusIndicator.classList.remove(c));
            statusIndicator.classList.add(`sentiment-${sentiment}`);
        }
    }

    updateStatus(status, text) {
        const statusIndicator = this.insightsContainer.querySelector('.status-indicator');
        const statusText = this.insightsContainer.querySelector('.status-text');
        
        if (statusIndicator) {
            // Preserve existing sentiment-* while toggling status-*
            const toRemove = Array.from(statusIndicator.classList).filter(c => c.startsWith('status-'));
            toRemove.forEach(c => statusIndicator.classList.remove(c));
            statusIndicator.classList.add(`status-${status}`);
        }
        if (statusText) {
            statusText.textContent = text;
        }
    }

    // Derive a human-readable status from polling and match states
    renderStatusBadge(forceStatus = null) {
        if (!this.insightsContainer) return;
        if (!this.isActive) { this.updateStatus('inactive', 'Inactive'); return; }

        // Allow forcing explicit error state from catch
        if (forceStatus === 'error') { this.updateStatus('error', 'Offline'); return; }

        // Evaluate from latest polling
        if (this.lastPollOk === false) {
            this.updateStatus('error', 'Offline');
            return;
        }
        if (this.lastPollOk === true && this.lastHadMatch === true) {
            this.updateStatus('active', 'Live');
            return;
        }
        if (this.lastPollOk === true && this.lastHadMatch === false) {
            this.updateStatus('waiting', 'Waiting');
            return;
        }
        // Unknown state
        this.updateStatus('inactive', 'Inactive');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.LiveCallInsights = new LiveCallInsights();
    window.LiveCallInsights.init();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LiveCallInsights;
}

