/**
 * Live Reload - Auto-reload on file changes (development only)
 * 
 * Watches for changes to JS, CSS, and HTML files.
 * Disables when localStorage key 'liveReloadDisabled' is set to 'true'
 * or when not running on localhost.
 * 
 * To disable: localStorage.setItem('liveReloadDisabled', 'true')
 * To re-enable: localStorage.removeItem('liveReloadDisabled')
 */

const RELOAD_CHECK_INTERVAL = 1000; // Check every 1 second
const FILES_TO_WATCH = [
    'index.html',
    'style.css',
    'js/main.js',
    'js/config.js',
    'js/logger.js',
    'js/utils.js',
    'js/uart-helper.js',
    'js/thermocouple.js'
];

let fileTimestamps = {};

function enableLiveReload() {
    // Check if disabled via localStorage
    if (localStorage.getItem('liveReloadDisabled') === 'true') {
        console.log('[LiveReload] Disabled via localStorage');
        return;
    }
    
    // Check if we're in development mode (localhost or file://)
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' ||
                  window.location.protocol === 'file:';
    
    if (!isDev) {
        console.log('[LiveReload] Disabled - not in development mode');
        return;
    }

    console.log('%c[LiveReload] Enabled - watching for changes...', 'color: #0d9488; font-weight: bold;');
    console.log('[LiveReload] To disable: localStorage.setItem("liveReloadDisabled", "true")');
    console.log('[LiveReload] Watching files:', FILES_TO_WATCH.join(', '));

    // Initial timestamp check
    checkFilesForChanges();

    // Check for changes periodically
    setInterval(checkFilesForChanges, RELOAD_CHECK_INTERVAL);
}

async function checkFilesForChanges() {
    for (const file of FILES_TO_WATCH) {
        try {
            const url = file.startsWith('http') ? file : new URL(file, window.location.href).href;
            const response = await fetch(url, {
                cache: 'no-store',
                method: 'HEAD',
                // Add a cache-busting query param to ensure fresh check
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!response.ok) continue;
            
            const lastModifiedHeader = response.headers.get('last-modified');
            if (lastModifiedHeader) {
                const fileModified = new Date(lastModifiedHeader).getTime();
                const lastKnown = fileTimestamps[file] || 0;
                
                if (fileModified > lastKnown && lastKnown > 0) {
                    console.log(`%c[LiveReload] Changes detected in ${file} - reloading...`, 
                        'color: #0d9488; font-weight: bold;');
                    setTimeout(() => window.location.reload(), 500);
                    return;
                }
                
                fileTimestamps[file] = fileModified;
            }
        } catch (error) {
            // Ignore errors (file might not exist, network issues, etc.)
            // Only log in development
            if (window.location.hostname === 'localhost') {
                // Silent fail for file:// protocol or other issues
            }
        }
    }
}

// Debug mode indicator - shows in console on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('%c🔧 Debug Mode Active', 'color: #0d9488; font-size: 14px; font-weight: bold;');
        console.log('%cNote: main.py is on the MCU (SD card), not in this workspace', 'color: #888; font-style: italic;');
        enableLiveReload();
    });
} else {
    console.log('%c🔧 Debug Mode Active', 'color: #0d9488; font-size: 14px; font-weight: bold;');
    console.log('%cNote: main.py is on the MCU (SD card), not in this workspace', 'color: #888; font-style: italic;');
    enableLiveReload();
}
