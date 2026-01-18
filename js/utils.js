/**
 * Utility Functions
 */

export function formatTime(timeString) {
    if (!timeString || timeString === '--:--:--') return timeString;
    const parts = timeString.split(':');
    if (parts.length !== 3) return timeString;
    return parts.map(part => part.padStart(2, '0')).join(':');
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
