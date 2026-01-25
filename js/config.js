/**
 * Configuration - Centralized settings for visualization and calibration
 */

export const VIZ_CONFIG = {
    tempMin: 20,
    tempMax: 70,
    coldColor: 0x00AAFF,  // Bright vibrant blue
    midColor: 0x00FF00,   // Bright green
    hotColor: 0xFF5722,   // Bright orange-red
    opacityMin: 0.2,
    opacityMax: 1,
    cubeSize: 0.5,
    // Global scale factor applied to cube geometry size
    cubeScale: 2.0,
    // Global multiplier applied to all cube.scale() values
    scaleFactor: 1.0,
    // Outline appearance for cubes
    outlineColor: 0xffffff,
    outlineOpacity: 2
};
export const UART_CONFIG = {
    BAUDRATE: 115200,
    TIMEOUT: 2000,  // 2 second timeout for file loading
    // When clearing selection, consider probe "gone" if none seen for this long (ms)
    PROBE_SILENCE_MS: 1500,
    // How often to resend '0' when clearing selection (ms)
    ZERO_RESEND_INTERVAL_MS: 300,
    // Safety timeout while attempting to clear selection (ms)
    ZERO_RESEND_TIMEOUT_MS: 3000
};
