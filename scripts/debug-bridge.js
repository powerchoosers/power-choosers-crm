(function() {
    // Only initialize once
    if (window.__debugBridgeInitialized) return;
    window.__debugBridgeInitialized = true;

    const allowRemote = (function () {
        try {
            return (typeof localStorage !== 'undefined' && localStorage.getItem('pc-debug-allow-remote') === 'true');
        } catch (_) {
            return false;
        }
    })();

    const isLocalhost = true; // FORCE LOCALHOST FOR DEBUGGING
    
    if (!isLocalhost) {
        return;
    }

    // Immediate heartbeat to confirm bridge is alive
    try {
        fetch('/api/debug/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'log',
                message: '[Debug Bridge] Heartbeat - Bridge initialized and forcing logs. UA: ' + navigator.userAgent,
                url: window.location.href,
                timestamp: new Date().toISOString()
            }),
            keepalive: true
        });
    } catch(e) {}

    console.log('[Debug Bridge] Attempting to initialize on localhost...');

    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
    };

    function isDebugEnabled() {
        try {
            return (
                window.VERBOSE_LOGS === true ||
                window.PC_DEBUG === true ||
                (typeof localStorage !== 'undefined' && localStorage.getItem('pc-debug-logs') === 'true')
            );
        } catch (_) {
            return (window.VERBOSE_LOGS === true || window.PC_DEBUG === true);
        }
    }

    function shouldSendLog(args) {
        try {
            return isDebugEnabled();
        } catch (_) {
            return isDebugEnabled();
        }
    }

    function sendToDebug(type, args) {
        try {
            const formatArg = (arg) => {
                try {
                    if (arg instanceof Error) {
                        return JSON.stringify({
                            name: arg.name,
                            message: arg.message,
                            stack: arg.stack
                        });
                    }
                } catch (_) { }

                if (arg && typeof arg === 'object') {
                    try { return JSON.stringify(arg); } catch (e) { return '[Circular or Non-Serializable Object]'; }
                }
                return String(arg);
            };

            // Avoid logging our own network requests to prevent infinite loops
            const message = args.map(formatArg).join(' ');

            // Don't send logs that are just the bridge heartbeat or the bridge itself
            if (message.includes('/api/debug/log')) return;

            fetch('/api/debug/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: type,
                    message: message,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                }),
                keepalive: true
            }).then(response => {
                if (!response.ok) {
                    originalConsole.warn('[Debug Bridge] Failed to send log to server:', response.status);
                }
            }).catch((err) => {
                originalConsole.error('[Debug Bridge] Fetch error sending log:', err);
            });
        } catch (e) {
            // Fallback to original console if everything fails
            originalConsole.error('[Debug Bridge Error]', e);
        }
    }

    function bridgeSend(type, args, opts) {
        const force = !!(opts && opts.force === true);
        if (!force && !shouldSendLog(args)) return;
        sendToDebug(type, args);
    }

    try {
        window.PCDebug = window.PCDebug || {};
        window.PCDebug.enabled = isDebugEnabled();
        window.PCDebug.isEnabled = function () {
            return isDebugEnabled();
        };
        window.PCDebug.enable = function () {
            try { window.PC_DEBUG = true; } catch (_) { }
            try { localStorage.setItem('pc-debug-logs', 'true'); } catch (_) { }
            try { window.PCDebug.enabled = true; } catch (_) { }
            try { sendToDebug('log', ['[Debug Bridge] Debug enabled', { href: window.location && window.location.href }]); } catch (_) { }
        };
        window.PCDebug.disable = function () {
            try { window.PC_DEBUG = false; } catch (_) { }
            try { localStorage.removeItem('pc-debug-logs'); } catch (_) { }
            try { window.PCDebug.enabled = false; } catch (_) { }
            try { sendToDebug('log', ['[Debug Bridge] Debug disabled', { href: window.location && window.location.href }]); } catch (_) { }
        };
        window.PCDebug.send = function(type) {
            const args = Array.prototype.slice.call(arguments, 1);
            bridgeSend(type, args, { force: true });
        };
        window.PCDebug.log = function(label, data) {
            bridgeSend('log', [label, data], { force: true });
        };
        window.PCDebug.warn = function(label, data) {
            bridgeSend('warn', [label, data], { force: true });
        };
        window.PCDebug.error = function(label, data) {
            bridgeSend('error', [label, data], { force: true });
        };
    } catch (_) { }

    try {
        // Suppress initialization log unless verbose mode is explicitly on
        if (isDebugEnabled()) {
            originalConsole.log('[Debug Bridge] Initialized - Logs are being mirrored to .cursor/debug.log', {
                debugEnabled: isDebugEnabled(),
                href: window.location.href,
                time: new Date().toISOString()
            });
            sendToDebug('log', ['[Debug Bridge] Heartbeat - Bridge is active', { 
                debugEnabled: isDebugEnabled(), 
                href: window.location.href,
                ua: navigator.userAgent
            }]);
        }
    } catch (_) { }

    console.log = function() {
        originalConsole.log.apply(console, arguments);
        bridgeSend('log', Array.from(arguments));
    };

    console.warn = function() {
        originalConsole.warn.apply(console, arguments);
        bridgeSend('warn', Array.from(arguments));
    };

    console.error = function() {
        originalConsole.error.apply(console, arguments);
        bridgeSend('error', Array.from(arguments), { force: true });
    };

    window.addEventListener('error', function(event) {
        sendToDebug('uncaught-error', [event.message, event.filename, event.lineno]);
    });

    window.addEventListener('unhandledrejection', function(event) {
        sendToDebug('unhandled-rejection', [event.reason]);
    });

})();
