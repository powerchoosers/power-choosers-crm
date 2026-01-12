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
        // Use enriched data from event if available
        if (e.detail && e.detail.contactName) {
            updateUIFromEvent(e.detail);
        } else {
            updateContactInfo();
        }
    }

    function handleCallDuration(e) {
        if (!isVisible) showDisplay();

        const durationFormatted = e.detail.durationFormatted;
        const timerEl = document.getElementById(timerId);
        if (timerEl && durationFormatted) {
            timerEl.textContent = durationFormatted;
        }

        // Update name and navigation targets from duration event
        updateUIFromEvent(e.detail);
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
                // CRITICAL: Prevent flickering by checking if logo URL hasn't changed
                const existingImg = avatarEl.querySelector('.company-favicon');
                const existingSrc = existingImg ? existingImg.src : '';
                const newSrc = logoUrl || '';

                // Only update if the logo URL has actually changed
                // If newSrc is empty but we have an existing logo, preserve it (prevents flickering on call connect)
                if (newSrc && existingSrc !== newSrc) {
                    // Absolute priority: explicit logoUrl provided by the page/widget
                    if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
                        avatarEl.innerHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: newSrc, domain: d, size: 24 });
                    } else {
                        avatarEl.innerHTML = `<img class="company-favicon" src="${newSrc}" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:cover;">`;
                    }
                } else if (!newSrc && existingImg && existingSrc) {
                    // New logoUrl is empty but we have an existing logo - preserve it to prevent flickering
                } else if (!newSrc && !existingImg) {
                    // No logo and no existing image - try fallbacks
                    if (window.__pcFaviconHelper && typeof window.__pcFaviconHelper.generateCompanyIconHTML === 'function') {
                        // Helper will try multiple favicon sources; fallback to accounts icon if it fails
                        avatarEl.innerHTML = window.__pcFaviconHelper.generateCompanyIconHTML({ logoUrl: '', domain: d, size: 24 });
                    } else if (typeof window.__pcAccountsIcon === 'function') {
                        avatarEl.innerHTML = window.__pcAccountsIcon(24);
                    } else {
                        // Final fallback to a building SVG if nothing else works
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
                avatarEl.innerHTML = `<div class="avatar-initials" style="width:24px;height:24px;border-radius:50%;background:var(--orange-primary, #f18335);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${initials}</div>`;
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
            const btn = document.getElementById(dialpadBtnId);
            if (btn) {
                const rect = btn.getBoundingClientRect();
                const width = popover.offsetWidth || 240;
                const leftRaw = rect.left + rect.width / 2 - width / 2;
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
            display.classList.remove('visible');
            const popover = document.getElementById(dialpadPopoverId);
            if (popover) closeDialpadPopover(popover, true);
            // Wait for transition to finish before setting display:none
            setTimeout(() => {
                if (!display.classList.contains('visible')) {
                    display.style.display = 'none';
                    // Reset timer
                    const timerEl = document.getElementById(timerId);
                    if (timerEl) timerEl.textContent = '00:00';
                }
            }, 400); // Match transition duration
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
