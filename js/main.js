// Power Choosers CRM Dashboard - Main Module Loader
// This file loads all CRM modules in the correct order

(function() {
    console.log('Starting CRM module loader...');
    
    // List of modules to load in order
    const modules = [
        'js/modules/core.js',
        'js/modules/utils.js',
        'js/modules/dashboard.js',
        'js/modules/modals.js',
        'js/modules/contacts.js',
        'js/modules/accounts.js',
        'js/modules/gmail.js',
        'js/modules/emails.js',
        'js/modules/tasks.js',
        'js/modules/sequences-new.js',
        'js/modules/activities.js',
        'js/modules/calls.js',
        'js/modules/call-scripts.js'
    ];
    
    let loadedModules = 0;
    
    // Function to load a single module
    function loadModule(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(`Loaded module: ${src}`);
                loadedModules++;
                resolve();
            };
            script.onerror = () => {
                console.error(`Failed to load module: ${src}`);
                reject(new Error(`Failed to load ${src}`));
            };
            document.head.appendChild(script);
        });
    }
    
    // Load all modules sequentially
    async function loadAllModules() {
        try {
            for (const module of modules) {
                await loadModule(module);
            }
            
            console.log(`All ${loadedModules} modules loaded successfully`);
            
            // Temporarily disable Gmail initialization to troubleshoot connection error
            /*
            if (typeof GmailModule !== 'undefined' && GmailModule.init) {
                try {
                    await GmailModule.init();
                } catch (e) {
                    console.warn('GmailModule initialization failed:', e);
                }
            }
            */

            // Initialize the CRM app after all modules are loaded
            if (typeof CRMApp !== 'undefined' && CRMApp.init) {
                console.log('Initializing CRM App...');
                await CRMApp.init();
            } else {
                console.error('CRMApp not found or init method missing');
            }
            
        } catch (error) {
            console.error('Error loading modules:', error);
        }
    }
    
    // Start loading modules when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAllModules);
    } else {
        loadAllModules();
    }
})();
