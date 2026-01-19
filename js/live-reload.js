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
// Explicitly ignore data files like CSV to avoid refreshes during backups
const IGNORED_EXTENSIONS = ['.csv'];

// Optional global suppression for external reload triggers (e.g., Live Server)
// Use localStorage key 'suppressAllReloads' ("true"/"false") to control behavior at runtime
// Default to suppression if not previously set
try { if (localStorage.getItem('suppressAllReloads') === null) localStorage.setItem('suppressAllReloads', 'true'); } catch (_) {}
let ORIGINAL_RELOAD = null;
let ORIGINAL_ASSIGN = null;
let ORIGINAL_REPLACE = null;
let ORIGINAL_WS = null;
let ORIGINAL_ES = null;
function applyReloadSuppression(suppress) {
    try {
        if (!ORIGINAL_RELOAD && window.location.reload) {
            ORIGINAL_RELOAD = window.location.reload.bind(window.location);
        }
        if (!ORIGINAL_ASSIGN && window.location.assign) {
            ORIGINAL_ASSIGN = window.location.assign.bind(window.location);
        }
        if (!ORIGINAL_REPLACE && window.location.replace) {
            ORIGINAL_REPLACE = window.location.replace.bind(window.location);
        }
        if (!ORIGINAL_WS && window.WebSocket) {
            ORIGINAL_WS = window.WebSocket;
        }
        if (!ORIGINAL_ES && window.EventSource) {
            ORIGINAL_ES = window.EventSource;
        }
        window.__ORIGINAL_RELOAD__ = ORIGINAL_RELOAD;
        if (suppress) {
            window.location.reload = function () {
                console.log('[LiveReload] Suppressed external reload');
            };
            // Prevent navigation-based reloads commonly used by live-reload clients
            window.location.assign = function () {
                console.log('[LiveReload] Suppressed location.assign');
            };
            window.location.replace = function () {
                console.log('[LiveReload] Suppressed location.replace');
            };
            // Mute Live Server/Livereload websocket and SSE clients
            if (window.WebSocket) {
                window.WebSocket = function () {
                    console.log('[LiveReload] Suppressed WebSocket connection');
                    return {
                        close() {},
                        addEventListener() {},
                        removeEventListener() {},
                        send() {},
                        onopen: null,
                        onmessage: null,
                        onerror: null,
                        onclose: null
                    };
                };
            }
            if (window.EventSource) {
                window.EventSource = function () {
                    console.log('[LiveReload] Suppressed EventSource connection');
                    return {
                        close() {},
                        addEventListener() {},
                        removeEventListener() {},
                        onopen: null,
                        onmessage: null,
                        onerror: null
                    };
                };
            }
        } else if (ORIGINAL_RELOAD) {
            window.location.reload = ORIGINAL_RELOAD;
            if (ORIGINAL_ASSIGN) window.location.assign = ORIGINAL_ASSIGN;
            if (ORIGINAL_REPLACE) window.location.replace = ORIGINAL_REPLACE;
            if (ORIGINAL_WS) window.WebSocket = ORIGINAL_WS;
            if (ORIGINAL_ES) window.EventSource = ORIGINAL_ES;
        }
    } catch (_) { /* no-op */ }
}

// Apply suppression based on saved preference on load
try {
    const suppress = localStorage.getItem('suppressAllReloads') === 'true';
    applyReloadSuppression(suppress);
    // Expose runtime toggles
    window.enableReloadSuppression = function () {
        localStorage.setItem('suppressAllReloads', 'true');
        applyReloadSuppression(true);
        console.log('[LiveReload] External reload suppression enabled');
    };
    window.disableReloadSuppression = function () {
        localStorage.setItem('suppressAllReloads', 'false');
        applyReloadSuppression(false);
        console.log('[LiveReload] External reload suppression disabled');
    };
    window.toggleReloadSuppression = function () {
        const current = localStorage.getItem('suppressAllReloads') === 'true';
        const next = !current;
        localStorage.setItem('suppressAllReloads', next ? 'true' : 'false');
        applyReloadSuppression(next);
        console.log(`[LiveReload] External reload suppression ${next ? 'enabled' : 'disabled'}`);
        return next;
    };
    window.isReloadSuppressed = function () {
        return localStorage.getItem('suppressAllReloads') === 'true';
    };
} catch (_) { /* no-op */ }
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
        // Safety guard: never reload on ignored extensions (e.g., .csv)
        const lower = file.toLowerCase();
        if (IGNORED_EXTENSIONS.some(ext => lower.endsWith(ext))) {
            continue;
        }
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
                    const doReload = () => {
                        if (window.__ORIGINAL_RELOAD__) {
                            window.__ORIGINAL_RELOAD__();
                        } else {
                            window.location.reload();
                        }
                    };
                    setTimeout(doReload, 500);
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
