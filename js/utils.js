/**
 * Utility Functions
 */

// Format time string to ensure two digits for hours, minutes, and seconds
export function formatTime(timeString) {
    if (!timeString || timeString === '--:--:--') return timeString;
    const parts = timeString.split(':');
    if (parts.length !== 3) return timeString;
    return parts.map(part => part.padStart(2, '0')).join(':');
}

// Sleep for a specified number of milliseconds does not stop the whole program execution only the current async function
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Throttle function execution to limit how often a function can be called
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
