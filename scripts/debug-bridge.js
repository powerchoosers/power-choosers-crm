(function() {
    // Only initialize once
    if (window.__debugBridgeInitialized) return;
    window.__debugBridgeInitialized = true;

    // Only enable in localhost:3000 as per user request to save cloudrun costs
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isPort3000 = window.location.port === '3000';
    
    if (!(isLocalhost && isPort3000)) {
        return;
    }

    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
    };

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

    console.log = function() {
        if (window.VERBOSE_LOGS === true) {
            originalConsole.log.apply(console, arguments);
            sendToDebug('log', Array.from(arguments));
        }
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

})();
