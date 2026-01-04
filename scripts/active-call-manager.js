(function () {
    'use strict';

    // Active Call Display Manager
    // Manages the top bar call indicator, timer, and end-call functionality

    const displayId = 'active-call-display';
    const contactId = 'active-call-contact-text';
    const timerId = 'active-call-timer';
    const endBtnId = 'active-call-end-btn';

    let isVisible = false;
    let currentLinkTarget = { contactId: null, accountId: null };

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

        // Contact Click (Navigation)
        const contactEl = document.getElementById(contactId);
        if (contactEl) {
            contactEl.addEventListener('click', handleContactClick);
        }

        // Check initial state (in case of page reload during call)
        checkInitialState();
    }

    function handleContactClick(e) {
        // Prevent default if it's a link (it's a span, but good practice)
        e.preventDefault();
        e.stopPropagation();

        if (currentLinkTarget.contactId) {
            console.log('[ActiveCallManager] Navigating to contact:', currentLinkTarget.contactId);
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
            console.log('[ActiveCallManager] Navigating to account:', currentLinkTarget.accountId);
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
        // Try to get contact info from global context if available
        updateContactInfo();
    }

    function handleCallDuration(e) {
        if (!isVisible) showDisplay();

        // Debug logging
        // console.log('[ActiveCallManager] Duration event:', e.detail);

        const durationFormatted = e.detail.durationFormatted;
        const timerEl = document.getElementById(timerId);
        if (timerEl && durationFormatted) {
            timerEl.textContent = durationFormatted;
        }

        // Save IDs for navigation
        if (e.detail.contactId || e.detail.accountId) {
            currentLinkTarget.contactId = e.detail.contactId;
            currentLinkTarget.accountId = e.detail.accountId;

            // Update cursor style
            const contactEl = document.getElementById(contactId);
            if (contactEl) {
                contactEl.style.cursor = 'pointer';
                contactEl.style.textDecoration = 'underline';
            }
        }

        // Use contact name from event if available, otherwise fallback to DOM scraping
        if (e.detail.contactName) {
            const contactEl = document.getElementById(contactId);
            if (contactEl && contactEl.textContent !== e.detail.contactName) {
                contactEl.textContent = e.detail.contactName;
                contactEl.title = e.detail.contactName;
            }
        } else {
            // Continuously ensure contact info is up to date (fallback)
            updateContactInfo();
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
    }

    function handleEndCall() {
        console.log('[ActiveCallManager] End call requested');

        // 1. Try global method
        if (window.Widgets && typeof window.Widgets.hangup === 'function') {
            console.log('[ActiveCallManager] Using window.Widgets.hangup()');
            window.Widgets.hangup();
            return;
        }

        // 2. Fallback: Simulate click on the main widget's hangup button
        const widgetStartBtn = document.querySelector('#phone-widget .call-btn-start');
        if (widgetStartBtn) {
            console.log('[ActiveCallManager] Clicking widget button fallback');
            widgetStartBtn.click();
            return;
        }

        console.warn('[ActiveCallManager] Could not find a way to end the call');
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
