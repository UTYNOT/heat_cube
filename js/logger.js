/**
 * Logger System - Centralized logging with configurable levels
 * Usage: window.setLogLevel('DEBUG') in console to change level
 */

class Logger {
    constructor() {
        // Log levels: DEBUG < INFO < WARN < ERROR
        this.levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
        this.currentLevel = this.getLogLevel();
    }

    getLogLevel() {
        const stored = localStorage.getItem('logLevel');
        return stored || 'WARN';
    }

    setLogLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.currentLevel = level;
            localStorage.setItem('logLevel', level);
            console.log(`%c[Logger] Log level set to: ${level}`, 'color: #0d9488; font-weight: bold;');
        } else {
            console.error(`Invalid log level: ${level}. Use one of:`, Object.keys(this.levels));
        }
    }

    shouldLog(level) {
        return this.levels[level] >= this.levels[this.currentLevel];
    }

    debug(...args) {
        if (this.shouldLog('DEBUG')) {
            console.log('%c[DEBUG]', 'color: #888; font-weight: bold;', ...args);
        }
    }

    info(...args) {
        if (this.shouldLog('INFO')) {
            console.log('%c[INFO]', 'color: #0d9488; font-weight: bold;', ...args);
        }
    }

    warn(...args) {
        if (this.shouldLog('WARN')) {
            console.warn('%c[WARN]', 'color: #ff9800; font-weight: bold;', ...args);
        }
    }

    error(...args) {
        if (this.shouldLog('ERROR')) {
            console.error('%c[ERROR]', 'color: #f44336; font-weight: bold;', ...args);
        }
    }

    mcu(...args) {
        this.debug('MCU:', ...args);
    }

    section(title) {
        console.log(`%c=== ${title} ===`, 'color: #0d9488; font-weight: bold; font-size: 12px;');
    }
}

// Global logger instance
const logger = new Logger();

// Expose to window for easy console access
window.logger = logger;
window.setLogLevel = (level) => logger.setLogLevel(level);
window.getLogger = () => logger;

// Quick reference commands for console
window.logDebug = () => window.setLogLevel('DEBUG');
window.logInfo = () => window.setLogLevel('INFO');
window.logWarn = () => window.setLogLevel('WARN');
window.logError = () => window.setLogLevel('ERROR');

export { Logger, logger };
