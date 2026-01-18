/**
 * Configuration - Centralized settings for visualization and calibration
 */

export const VIZ_CONFIG = {
    tempMin: 20,
    tempMax: 35,
    coldColor: 0xAF0000,
    hotColor: 0xffff00,
    opacityMin: 0.3,
    opacityMax: 1.0,
    cubeSize: 0.5
};

export const CalibrationConfig = {
    THRESHOLD_MIN: 2.0,
    THRESHOLD_MAX: 15.0,
    VALID_TEMP_MAX: 2000,
    NUM_TCS: 8,
    REFERENCE_UPDATE_INTERVAL: 20000,
    TEMP_DROP_THRESHOLD: 0.75
};

export const UART_CONFIG = {
    BAUDRATE: 115200,
    TIMEOUT: 2000  // 2 second timeout for file loading
};
