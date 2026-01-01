(function() {
    // Only initialize once
    if (window.__debugBridgeInitialized) return;
    window.__debugBridgeInitialized = true;

    // Only enable in localhost as per user request to save cloudrun costs
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (!isLocalhost) {
        return;
    }

    console.log('[Debug Bridge] Attempting to initialize on localhost...');

    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
    };

    const debugEnabled = (
        window.VERBOSE_LOGS === true ||
        window.PC_DEBUG === true ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('pc-debug-logs') === 'true')
    );

    function shouldSendLog(args) {
        try {
            return debugEnabled;
        } catch (_) {
            return debugEnabled;
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
            }).catch(() => {
                // Silently fail if server is down
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
        window.PCDebug.enabled = debugEnabled;
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
        if (debugEnabled) {
            originalConsole.log('[Debug Bridge] Initialized - Logs are being mirrored to .cursor/debug.log', {
                debugEnabled,
                href: window.location.href
            });
            sendToDebug('log', ['[Debug Bridge] Initialized - Logs are being mirrored to .cursor/debug.log', { debugEnabled, href: window.location.href }]);
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
