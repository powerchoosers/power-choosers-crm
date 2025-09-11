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
    }

    init() {
        this.createWidget();
        this.bindEvents();
    }

    createWidget() {
        // Create the live insights widget
        const widget = document.createElement('div');
        widget.id = 'live-call-insights';
        widget.className = 'live-call-insights-widget';
        widget.innerHTML = `
            <div class="live-insights-header">
                <h3>Live Call Insights</h3>
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

        // Add to the widget panel
        const widgetPanel = document.querySelector('.widget-panel');
        if (widgetPanel) {
            widgetPanel.appendChild(widget);
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

            if (data.ok && data.calls && data.calls.length > 0) {
                const call = data.calls[0];
                this.updateLiveData(call);
            }
        } catch (error) {
            console.warn('[Live Insights] Failed to fetch insights:', error);
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
            statusIndicator.className = `status-indicator sentiment-${sentiment}`;
        }
    }

    updateStatus(status, text) {
        const statusIndicator = this.insightsContainer.querySelector('.status-indicator');
        const statusText = this.insightsContainer.querySelector('.status-text');
        
        if (statusIndicator) {
            statusIndicator.className = `status-indicator status-${status}`;
        }
        if (statusText) {
            statusText.textContent = text;
        }
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
