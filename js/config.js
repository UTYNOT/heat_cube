/**
 * Configuration - Centralized settings for visualization and calibration
 */

export const VIZ_CONFIG = {
    tempMin: 23,
    tempMax: 30,
    coldColor: 0x0077BE,
    hotColor: 0xE53935,
    opacityMin: 0.1,
    opacityMax: 2,
    cubeSize: 0.5,
    // Global scale factor applied to cube geometry size
    cubeScale: 1.0,
    // Global multiplier applied to all cube.scale() values
    scaleFactor: 1.0,
    // Outline appearance for cubes
    outlineColor: 0xffffff,
    outlineOpacity: 0.8
};

export const CalibrationConfig = {
    THRESHOLD_MIN: 2.0,
    THRESHOLD_MAX: 15.0,
    VALID_TEMP_MAX: 2000,
    NUM_TCS: 8,
    REFERENCE_UPDATE_INTERVAL: 20000,
    TEMP_DROP_THRESHOLD: 0.75,
    // Treat very large immediate drops as noise/ignore condition (°C)
    DROP_LARGE_THRESHOLD: 3.0,
    // Spike detection window: compare the first sample in this window to subsequent seconds
    SPIKE_WINDOW_SECONDS: 6,
    // Minimum cooldown between auto-selects for the same TC (ms)
    SPIKE_COOLDOWN_MS: 1500
};

export const UART_CONFIG = {
    BAUDRATE: 115200,
    TIMEOUT: 2000,  // 2 second timeout for file loading
    // When clearing selection, consider probe "gone" if none seen for this long (ms)
    PROBE_SILENCE_MS: 1500,
    // How often to resend '0' when clearing selection (ms)
    ZERO_RESEND_INTERVAL_MS: 500,
    // Safety timeout while attempting to clear selection (ms)
    ZERO_RESEND_TIMEOUT_MS: 10000
};
