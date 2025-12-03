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
        if (!document._liveCallInsightsCallStartedBound) {
            document.addEventListener('callStarted', (e) => {
                this.startLiveInsights(e.detail.callSid);
            });
            document._liveCallInsightsCallStartedBound = true;
        }

        if (!document._liveCallInsightsCallEndedBound) {
            document.addEventListener('callEnded', () => {
                this.stopLiveInsights();
            });
            document._liveCallInsightsCallEndedBound = true;
        }

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
        // OPTIMIZED: Increased from 3 to 5 seconds to reduce Cloud Run costs
        // Live insights don't need sub-5-second updates for good UX
        this.pollingInterval = setInterval(() => {
            if (this.isActive && this.currentCallSid) {
                this.fetchLiveInsights();
            }
        }, 5000); // 5 seconds (increased from 3 seconds)
    }

    async fetchLiveInsights() {
        try {
            const base = (window.crm && typeof window.crm.getApiBaseUrl === 'function')
              ? window.crm.getApiBaseUrl()
              : (window.PUBLIC_BASE_URL || window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
            const response = await fetch(`${base}/api/calls?callSid=${this.currentCallSid}`);
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
            this.updateTranscript(call.transcript, call.aiInsights || {});
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

    updateTranscript(transcript, ai = {}) {
        // Format transcript with speaker labels and timestamps
        const formattedTranscript = this.formatTranscript(transcript, ai);
        this.transcriptContainer.innerHTML = `
            <div class="transcript-content">
                ${formattedTranscript}
            </div>
        `;
    }

    // Helpers to align with Calls/Contact pages
    toMMSS(seconds) {
        const s = Number(seconds) || 0; const m = Math.floor(s/60); const ss = s % 60; return `${m}:${String(ss).padStart(2,'0')}`;
    }
    parseSpeakerTranscript(text) {
        const out = []; if (!text) return out; const lines = String(text).split(/\r?\n/);
        for (const raw of lines) {
            const line = raw.trim(); if (!line) continue;
            // "Speaker 0:03: ..." or "Agent 1:23: ..."
            let m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+(\d+):(\d{2}):\s*(.*)$/);
            // "Speaker 1 0:45: ..." (optional id before time)
            if (!m) { m = line.match(/^([A-Za-z][A-Za-z0-9 ]{0,30})\s+\d+\s+(\d+):(\d{2}):\s*(.*)$/); if (m) { m = [m[0], m[1], m[2], m[3], m[4]]; } }
            if (m) { const label = m[1].trim(); const mm = parseInt(m[2],10)||0; const ss = parseInt(m[3],10)||0; const txt = m[4]||''; out.push({ label, t:mm*60+ss, text:txt }); continue; }
            out.push({ label:'', t:null, text:line });
        }
        return out;
    }
    formatTranscript(transcript, ai = {}) {
        // Prefer structured speakerTurns when available
        const turns = Array.isArray(ai.speakerTurns) ? ai.speakerTurns : [];
        if (turns.length) {
            return turns.map(t => {
                const role = t.role === 'agent' ? 'Agent' : (t.role === 'customer' ? 'Customer' : 'Speaker');
                return `<div class="transcript-line ${t.role||''}"><span class="speaker">${role} ${this.toMMSS(Number(t.t)||0)}:</span> <span class="text">${(t.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span></div>`;
            }).join('');
        }
        // Parse labeled lines with timestamps if present
        const parsed = this.parseSpeakerTranscript(transcript || '');
        if (parsed.some(p => p.label && p.t != null)) {
            return parsed.map(p => p.label ? `<div class="transcript-line"><span class="speaker">${p.label} ${this.toMMSS(p.t)}:</span> <span class="text">${(p.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span></div>` : `<div class="transcript-line"><span class="text">${(p.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span></div>`).join('');
        }
        // Fallback: simple line-by-line
        const lines = String(transcript||'').split('\n').filter(line => line.trim());
        return lines.map(line => `<div class="transcript-line">${line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('');
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

