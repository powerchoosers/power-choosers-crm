(function () {
    'use strict';

    // Active Call Display Manager
    // Manages the top bar call indicator, timer, and end-call functionality

    const displayId = 'active-call-display';
    const contactId = 'active-call-contact-text';
    const timerId = 'active-call-timer';
    const endBtnId = 'active-call-end-btn';
    const dialpadBtnId = 'active-call-dialpad-btn';
    const dialpadPopoverId = 'active-call-dialpad-popover';
    const avatarId = 'active-call-avatar';

    let isVisible = false;
    let currentLinkTarget = { contactId: null, accountId: null };
    let portalizedPopover = null;

    let durationSyncSeconds = null;
    let durationSyncAt = 0;
    let durationTicker = null;
    let lastRenderedDuration = '';

    let hideTransitionToken = 0;

    function init() {
        const display = document.getElementById(displayId);
        if (!display) return;

        // Event Listeners
        document.addEventListener('callStarted', handleCallStart);
        document.addEventListener('pc:live-call-duration', handleCallDuration);
        document.addEventListener('callStateChanged', handleCallStateChange);
        document.addEventListener('pc:call-completed', handleCallEnd);

        // End Call Button
        const endBtn = document.getElementById(endBtnId);
        if (endBtn) {
            endBtn.addEventListener('click', handleEndCall);
        }

        // Dial Pad Button
        const dialpadBtn = document.getElementById(dialpadBtnId);
        if (dialpadBtn) {
            dialpadBtn.addEventListener('click', toggleDialpad);
        }

        // Dial Pad Keys
        const popover = document.getElementById(dialpadPopoverId);
        if (popover) {
            portalizedPopover = portalizeDialpadPopover(popover);

            popover.querySelectorAll('.dial-key').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const key = btn.getAttribute('data-key');
                    if (key) sendDTMF(key);
                });
            });

            // Close popover when clicking outside
            document.addEventListener('click', (e) => {
                const btn = document.getElementById(dialpadBtnId);
                if (!popover.classList.contains('visible')) return;
                if (popover.contains(e.target)) return;
                if (btn && btn.contains(e.target)) return;
                closeDialpadPopover(popover);
            });
        }

        // Contact Click (Navigation)
        const contactEl = document.getElementById(contactId);
        if (contactEl) {
            contactEl.addEventListener('click', handleContactClick);
        }

        // Check initial state (in case of page reload during call)
        checkInitialState();
    }

    function portalizeDialpadPopover(popover) {
        try {
            if (!popover || popover.__pcPortalized) return popover;
            document.body.appendChild(popover);
            popover.__pcPortalized = true;
        } catch (_) { }
        return popover;
    }

    function handleContactClick(e) {
        // Prevent default if it's a link (it's a span, but good practice)
        e.preventDefault();
        e.stopPropagation();

        if (currentLinkTarget.contactId) {
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
                window.crm.navigateToPage('contact-detail');
                // Allow a brief moment for page to init before showing data
                setTimeout(() => {
                    if (window.ContactDetail && typeof window.ContactDetail.show === 'function') {
                        window.ContactDetail.show(currentLinkTarget.contactId);
                    }
                }, 100);
            }
        } else if (currentLinkTarget.accountId) {
            if (window.crm && typeof window.crm.navigateToPage === 'function') {
                window.crm.navigateToPage('account-details'); // Try account-details first
                // Helper for account showing usually isn't as standardized as ContactDetail.show(id)
                // But typically accounts module handles id in hash or global state
                if (window.location.hash) {
                    window.location.hash = `#account-detail?id=${currentLinkTarget.accountId}`;
                } else {
                    // Fallback mechanism if hash routing isn't primary
                    // Many setups use AccountDetail.show(id)
                    setTimeout(() => {
                        if (window.AccountDetail && typeof window.AccountDetail.show === 'function') {
                            window.AccountDetail.show(currentLinkTarget.accountId);
                        }
                    }, 100);
                }
            }
        }
    }

    function handleCallStart(e) {
        showDisplay();
        try {
            syncDurationSeconds(0);
            ensureDurationTicker();
            tickDuration();
        } catch (_) { }
        // Use enriched data from event if available
        if (e.detail && e.detail.contactName) {
            updateUIFromEvent(e.detail);
        } else {
            updateContactInfo();
        }
    }

    function handleCallDuration(e) {
        if (!isVisible) showDisplay();

        syncDurationFromDetail(e && e.detail ? e.detail : null);
        ensureDurationTicker();
        tickDuration();

        updateUIFromEvent(e.detail);
    }

    function parseDurationToSeconds(v) {
        try {
            const s = String(v || '').trim();
            if (!s) return null;
            const parts = s.split(':').map(x => parseInt(x, 10));
            if (parts.some(n => isNaN(n))) return null;
            if (parts.length === 2) return (parts[0] * 60) + parts[1];
            if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
            return null;
        } catch (_) {
            return null;
        }
    }

    function formatSecondsAsDuration(totalSeconds) {
        try {
            const s = Math.max(0, Math.floor(totalSeconds || 0));
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) {
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            }
            return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        } catch (_) {
            return '00:00';
        }
    }

    function syncDurationSeconds(seconds) {
        const n = (typeof seconds === 'number' && isFinite(seconds)) ? Math.max(0, Math.floor(seconds)) : null;
        if (n === null) return;
        durationSyncSeconds = n;
        durationSyncAt = Date.now();
    }

    function syncDurationFromDetail(detail) {
        try {
            if (!detail) return;

            if (typeof detail.duration === 'number') {
                syncDurationSeconds(detail.duration);
                return;
            }
            if (typeof detail.durationSeconds === 'number') {
                syncDurationSeconds(detail.durationSeconds);
                return;
            }
            if (typeof detail.seconds === 'number') {
                syncDurationSeconds(detail.seconds);
                return;
            }

            const durationFormatted = detail.durationFormatted || detail.formattedDuration || detail.durationText;
            const seconds = parseDurationToSeconds(durationFormatted);
            if (seconds !== null) syncDurationSeconds(seconds);
        } catch (_) { }
    }

    function getInterpolatedDuration() {
        if (durationSyncSeconds === null) return null;
        const elapsed = Math.floor((Date.now() - durationSyncAt) / 1000);
        return durationSyncSeconds + Math.max(0, elapsed);
    }

    function tickDuration() {
        try {
            const timerEl = document.getElementById(timerId);
            if (!timerEl) return;
            const seconds = getInterpolatedDuration();
            if (seconds === null) return;
            const next = formatSecondsAsDuration(seconds);
            if (next && next !== lastRenderedDuration) {
                timerEl.textContent = next;
                lastRenderedDuration = next;
            }
        } catch (_) { }
    }

    function ensureDurationTicker() {
        if (durationTicker) return;
        durationTicker = setInterval(() => {
            if (!isVisible) return;
            tickDuration();
        }, 1000);
    }

    function stopDurationTicker() {
        if (durationTicker) {
            clearInterval(durationTicker);
            durationTicker = null;
        }
        durationSyncSeconds = null;
        durationSyncAt = 0;
        lastRenderedDuration = '';
    }

    function updateUIFromEvent(data) {
        if (!data) return;

        // Save IDs for navigation
        if (data.contactId || data.accountId) {
            currentLinkTarget.contactId = data.contactId;
            currentLinkTarget.accountId = data.accountId;

            // Update cursor style
            const contactEl = document.getElementById(contactId);
            if (contactEl) {
                contactEl.style.cursor = 'pointer';
                contactEl.style.textDecoration = 'none';
            }
        }

        // Update contact name
        if (data.contactName) {
            const contactEl = document.getElementById(contactId);
            if (contactEl && contactEl.textContent !== data.contactName) {
                contactEl.textContent = data.contactName;
                contactEl.title = data.contactName;
            }
        }

        // Update Avatar/Icon
        const avatarEl = document.getElementById(avatarId);
        if (avatarEl) {
            const isCompanyPhone = !!(data.isCompanyPhone || (data.accountId && !data.contactId));
            const nameLine = data.contactName || '';
            const logoUrl = data.logoUrl || '';
            const domain = data.domain || '';
            const d = domain.replace(/^https?:\/\//, '').replace(/^www\./i, '');

            if (isCompanyPhone) {
                const key = `company|${logoUrl || ''}|${d || ''}`;
                if (avatarEl.dataset.pcAvatarKey !== key || !avatarEl.innerHTML) {
                    avatarEl.dataset.pcAvatarKey = key;
                    if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
                        avatarEl.innerHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: logoUrl || '', domain: d, size: 24 });
                    } else if (logoUrl) {
                        avatarEl.innerHTML = `<img class="company-favicon" src="${logoUrl}" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">`;
                    } else if (typeof window.__pcAccountsIcon === 'function') {
                        avatarEl.innerHTML = window.__pcAccountsIcon(24);
                    } else {
                        avatarEl.innerHTML = `<div class="company-favicon-placeholder" style="width:24px;height:24px;border-radius:4px;background:var(--grey-700,#2f343a);display:flex;align-items:center;justify-content:center;color:#fff;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"></path></svg>
                        </div>`;
                    }
                }
            } else {
                // Individual contact: render initials avatar (letter glyphs)
                const initials = (function () {
                    const n = (nameLine || '').trim();
                    if (!n) return '?';
                    const parts = n.split(/\s+/).filter(Boolean);
                    const a = parts[0] ? parts[0].charAt(0) : '';
                    const b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
                    return (a + b).toUpperCase();
                })();
                const key = `person|${initials}`;
                if (avatarEl.dataset.pcAvatarKey !== key || !avatarEl.innerHTML) {
                    avatarEl.dataset.pcAvatarKey = key;
                    avatarEl.innerHTML = `<div class="avatar-initials" style="width:24px;height:24px;border-radius:50%;background:var(--orange-primary, #f18335);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${initials}</div>`;
                }
            }
        }
    }

    function handleCallStateChange(e) {
        // e.detail.state can be 'in-call', 'ended', etc.
        if (e.detail.state === 'in-call') {
            showDisplay();
        } else {
            hideDisplay();
        }
    }

    function handleCallEnd(e) {
        stopDurationTicker();
        hideDisplay();
        // Reset target
        currentLinkTarget = { contactId: null, accountId: null };
        const contactEl = document.getElementById(contactId);
        if (contactEl) {
            contactEl.style.cursor = 'default';
            contactEl.style.textDecoration = 'none';
        }
        const avatarEl = document.getElementById(avatarId);
        if (avatarEl) {
            avatarEl.innerHTML = '';
            try { delete avatarEl.dataset.pcAvatarKey; } catch (_) { }
        }
        // Hide dial pad popover if open
        const popover = document.getElementById(dialpadPopoverId);
        if (popover) closeDialpadPopover(popover, true);
    }

    function toggleDialpad(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const popover = document.getElementById(dialpadPopoverId);
        if (!popover) return;
        if (popover.classList.contains('visible')) {
            closeDialpadPopover(popover);
        } else {
            openDialpadPopover(popover);
        }
    }

    function openDialpadPopover(popover) {
        try { popover.hidden = false; } catch (_) { }

        try {
            popover = portalizedPopover || popover;
            const display = document.getElementById(displayId);
            const btn = document.getElementById(dialpadBtnId);
            const anchor = display || btn;
            if (anchor) {
                const rect = anchor.getBoundingClientRect();
                const width = popover.offsetWidth || 240;
                const centerX = rect.left + (rect.width / 2);
                const leftRaw = centerX - (width / 2);
                const left = Math.max(8, Math.min(leftRaw, window.innerWidth - width - 8));
                const top = rect.bottom + 12;
                popover.style.left = `${Math.round(left)}px`;
                popover.style.top = `${Math.round(top)}px`;
            }
        } catch (_) { }

        requestAnimationFrame(() => {
            try { popover.classList.add('visible'); } catch (_) { }
        });
    }

    function closeDialpadPopover(popover, immediate) {
        try { popover.classList.remove('visible'); } catch (_) { }
        const delay = immediate ? 0 : 160;
        setTimeout(() => {
            try {
                if (!popover.classList.contains('visible')) {
                    popover.hidden = true;
                }
            } catch (_) { }
        }, delay);
    }

    function sendDTMF(key) {
        document.dispatchEvent(new CustomEvent('pc:send-dtmf', { detail: { key } }));
    }

    function handleEndCall() {
        document.dispatchEvent(new CustomEvent('pc:end-call'));
    }

    function showDisplay() {
        if (isVisible) return;
        const display = document.getElementById(displayId);
        if (display) {
            try { display.classList.remove('hiding'); } catch (_) { }
            display.style.display = 'flex'; // Ensure it's in the layout
            // slight delay to allow display:flex to apply before transition
            requestAnimationFrame(() => {
                display.classList.add('visible');
            });
            isVisible = true;
        }
    }

    function hideDisplay() {
        if (!isVisible) return;
        const display = document.getElementById(displayId);
        if (display) {
            hideTransitionToken++;
            const token = hideTransitionToken;

            try { display.classList.add('hiding'); } catch (_) { }
            display.classList.remove('visible');
            const popover = document.getElementById(dialpadPopoverId);
            if (popover) closeDialpadPopover(popover, true);
            stopDurationTicker();

            const finalizeHide = () => {
                if (token !== hideTransitionToken) return;
                if (!display.classList.contains('visible')) {
                    try { display.classList.remove('hiding'); } catch (_) { }
                    display.style.display = 'none';
                    const timerEl = document.getElementById(timerId);
                    if (timerEl) timerEl.textContent = '00:00';
                }
            };

            const onEnd = (ev) => {
                if (token !== hideTransitionToken) {
                    try { display.removeEventListener('transitionend', onEnd); } catch (_) { }
                    return;
                }
                if (ev && ev.target !== display) return;
                if (ev && ev.propertyName && ev.propertyName !== 'max-width') return;
                try { display.removeEventListener('transitionend', onEnd); } catch (_) { }
                finalizeHide();
            };

            try { display.addEventListener('transitionend', onEnd); } catch (_) { }
            setTimeout(() => {
                try { display.removeEventListener('transitionend', onEnd); } catch (_) { }
                finalizeHide();
            }, 900);
            isVisible = false;
        }
    }

    function updateContactInfo() {
        const contactEl = document.getElementById(contactId);
        if (!contactEl) return;

        // Try to find the active call name from the phone widget input if we can access it,
        // or check if there's a global context variable exposed.
        // phone.js uses a local 'currentCallContext' variable.
        // We might need to rely on the side-effect that the phone widget sets the input value.
        // OR, the 'pc:live-call-duration' event could be enhanced to carry the name.
        // For now, let's look for the phone widget input value as a proxy.

        let headerText = 'Active Call';

        // Method 1: Check the global phone widget input
        const widgetInput = document.querySelector('#phone-widget .phone-display');
        if (widgetInput && widgetInput.value) {
            headerText = widgetInput.value;
        }

        // Method 2: Check for a rich contact display in the widget
        const contactNameEl = document.querySelector('#phone-widget .contact-name');
        if (contactNameEl) {
            headerText = contactNameEl.textContent;
        }

        contactEl.textContent = headerText;
        contactEl.title = headerText; // Tooltip for long names
    }

    function checkInitialState() {
        // If phone widget is open and in-call, show display
        if (window.Widgets && window.Widgets.isPhoneOpen && window.Widgets.isPhoneOpen()) {
            const widget = document.getElementById('phone-widget');
            if (widget && widget.classList.contains('in-call')) {
                showDisplay();
                updateContactInfo();
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
