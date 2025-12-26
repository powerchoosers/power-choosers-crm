(function() {
    // Only initialize once
    if (window.__debugBridgeInitialized) return;
    window.__debugBridgeInitialized = true;

    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
    };

    function sendToDebug(type, args) {
        try {
            // Avoid logging our own network requests to prevent infinite loops
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try { return JSON.stringify(arg); } catch(e) { return '[Circular or Non-Serializable Object]'; }
                }
                return String(arg);
            }).join(' ');

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

    console.log = function() {
        originalConsole.log.apply(console, arguments);
        sendToDebug('log', Array.from(arguments));
    };

    console.warn = function() {
        originalConsole.warn.apply(console, arguments);
        sendToDebug('warn', Array.from(arguments));
    };

    console.error = function() {
        originalConsole.error.apply(console, arguments);
        sendToDebug('error', Array.from(arguments));
    };

    window.addEventListener('error', function(event) {
        sendToDebug('uncaught-error', [event.message, event.filename, event.lineno]);
    });

    window.addEventListener('unhandledrejection', function(event) {
        sendToDebug('unhandled-rejection', [event.reason]);
    });

    originalConsole.log('[Debug Bridge] Initialized - Logs are being mirrored to .cursor/debug.log');
})();
