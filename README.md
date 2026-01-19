# Heat Cube Visualiser

An interactive 3D web application for real-time thermocouple temperature visualisation and calibration, designed to communicate with a microcontroller unit (MCU) over Web Serial API.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Main Components](#main-components)
- [Usage](#usage)
- [Configuration](#configuration)
- [Technical Details](#technical-details)
- [File Format](#file-format)

## Overview

Heat Cube Visualiser is a web-based application that connects to a microcontroller unit (MCU) via serial communication to monitor and visualize temperature data from up to 256 thermocouples in real-time. The application provides:

- **3D Visualisation**: Interactive Three.js-based 3D rendering of thermocouple positions with temperature-based colour coding
- **Real-time Monitoring**: Live temperature data streaming from the MCU
- **Calibration System**: Automated thermocouple detection and calibration based on temperature changes
- **Data Playback**: Load and replay historical temperature data from CSV files
- **Export Capabilities**: Generate standalone HTML viewers and record video timelines

## Features

### 🔌 Serial Communication
- Web Serial API integration for direct MCU communication
- Auto-connect to previously used serial ports
- Robust buffer management with overflow protection
- Queue-based message processing to prevent data loss

### 🌡️ Real-time Temperature Monitoring
- Live temperature readings from all active thermocouples
- Individual thermocouple selection and detailed data display
- Colour-coded visualisation based on temperature (red = cold, yellow = hot)
- Visual highlighting of selected thermocouples in 3D space

### 📍 Position Management
- 3D coordinate system (X, Y, Z in millimeters)
- Manual position input for each thermocouple
- Save/load positions to/from CSV files on MCU
- Automatic position synchronization between web app and MCU

### ⚙️ Calibration System
- Automatic detection of active thermocouples
- TC_Probe message-driven visual selection (MCU controls which TC lights up)
- Configurable thresholds for temperature monitoring
- Baseline reference temperature tracking
- Automatic spike detection (currently disabled - can be re-enabled in code)

### 📊 Data Playback
- Load historical temperature data from MCU CSV files
- Timeline slider for navigating through recorded data
- Playback visualisation with colour-coded temperature changes
- Support for date-based CSV file naming (`YYYY-MM-DD.csv`)

### 📦 Export Features
- **Standalone HTML Viewer**: Export a self-contained HTML file with embedded data for sharing or offline viewing
- **Video Recording**: Record animated temperature timeline as WebM video
- Exported viewers include interactive 3D scene with timeline controls and TC selection

### 🎨 3D Visualisation
- Three.js-powered interactive 3D scene
- OrbitControls for camera manipulation (rotate, pan, zoom)
- Grid and axes helpers for spatial reference
- Temperature-based colour interpolation
- Opacity variation based on temperature
- Visual "pop" effect for selected thermocouples (controlled by TC_Probe messages from MCU)
- Proportional color boost during selection animation

## Project Structure

```
heat_cube/
├── index.html              # Main HTML file with landing page and UI structure
├── style.css              # Stylesheet for UI components
├── README.md              # This file
├── position.csv           # Empty placeholder for position data
├── js/
│   ├── main.js           # Main application logic
│   ├── config.js         # Configuration settings (visualization, calibration, UART)
│   ├── logger.js         # Logging system with configurable levels
│   ├── utils.js          # Utility functions (formatTime, sleep, throttle)
│   ├── uart-helper.js    # Serial communication wrapper
│   ├── thermocouple.js   # Thermocouple data model
│   ├── animation.js      # Logo animation handling
│   ├── OrbitControls.js  # Three.js orbit controls extension
│   └── three.module.js   # Three.js library (bundled)
```

## Architecture

The application follows a modular, class-based architecture similar to the MCU-side state machine:

```
┌─────────────────────────────────────────────────────────┐
│                     index.html                          │
│  ┌──────────────┐  ┌─────────────────────────────────┐ │
│  │ Control Panel│  │     3D Viewer Panel             │ │
│  │  (Sidebar)   │  │   (Three.js Canvas)             │ │
│  └──────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    js/main.js                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │          HeatCubeSystem (Main Class)             │  │
│  │  - Manages state and UI elements                 │  │
│  │  - Handles serial communication                  │  │
│  │  - Coordinates between components                │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Visualization3D (3D Rendering)           │  │
│  │  - Three.js scene management                     │  │
│  │  - Camera and controls                           │  │
│  │  - TC cube rendering and updates                 │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         UARTHelper (Serial I/O)                  │  │
│  │  - Read/write serial port                        │  │
│  │  - Buffer management                             │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Logger (Logging System)                  │  │
│  │  - Configurable log levels                       │  │
│  │  - Filters high-frequency messages               │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Microcontroller Unit (MCU)                 │
│          (State Machine + TC Manager)                   │
└─────────────────────────────────────────────────────────┘
```

## Main Components

### HeatCubeSystem Class

The main application manager that orchestrates all functionality:

**Key Responsibilities:**
- Initialises UI elements and event listeners
- Manages serial port connection via `UARTHelper`
- Processes incoming MCU messages
- Handles calibration logic and state
- Manages file data loading and playback
- Coordinates UI updates with 3D visualisation

**Key Methods:**
- `init()`: Initialise the application
- `openPort()`: Connect to serial port
- `startReaderLoop()`: Background message reading with queue processing
- `processLine()`: Parse and route MCU messages to handlers
- `handleTCTemperature()`: Update TC data from measurement messages
- `handleTCCalibrate()`: Process calibration data
- `generateStandaloneHTML()`: Create exportable viewer HTML
- `handleExportViewer()`: Export standalone HTML file
- `handleRecordVideo()`: Record temperature timeline as video

### Visualization3D Class

Manages the Three.js 3D scene and rendering:

**Key Responsibilities:**
- Initialise Three.js scene, camera, renderer
- Create and manage thermocouple cube meshes
- Update cube colors based on temperature
- Handle camera controls (OrbitControls)
- Save/restore camera state

**Key Methods:**
- `init()`: Set up Three.js scene
- `syncTcMeshes()`: Create/update TC cubes from data array
- `updateTcVisual()`: Update individual TC cube appearance
- `saveCameraState()`: Store camera position/orientation
- `restoreCameraState()`: Restore saved camera state
- `animate()`: Render loop

### UARTHelper Class

Handles serial port communication:

**Key Responsibilities:**
- Open/close serial port connections
- Read and write messages
- Buffer management for incomplete messages

**Key Methods:**
- `write(message)`: Send message to MCU
- `readLine()`: Read complete line from serial port
- `close()`: Clean up connections

### Logger Class

Configurable logging system to reduce console spam:

**Log Levels:**
- `DEBUG`: All messages (very verbose)
- `INFO`: Informational messages
- `WARN`: Warnings and errors (default)
- `ERROR`: Only errors

**Features:**
- Filters high-frequency messages (`TC_CALIBRATE`, `TC:`, `FILE_DATA:`)
- Persists log level in localStorage
- Exposes `window.setLogLevel()` for runtime changes

### Thermocouple Class

Data model for individual thermocouples:

**Properties:**
- `id`: Thermocouple ID (1-256)
- `tcTemp`: Probe temperature (°C)
- `refTemp`: Reference/junction temperature (°C)
- `x`, `y`, `z`: 3D position coordinates (mm)

## Usage

### Initial Setup

1. **Open the Application**
   - Open `index.html` in a modern web browser (Chrome, Edge, or other Chromium-based browser)
   - The landing page displays the Heat Cube logo with animation

2. **Connect to MCU**
   - Click "Enter Visualiser" from the landing page
   - Click "Choose Serial Port" in the Connection section
   - Select your MCU's serial port from the browser dialog
   - Wait for "SOFTWARE_INIT" message from MCU

3. **Check Status**
   - Click "Check Status" to get current MCU state and active thermocouples
   - The app will automatically populate the thermocouple dropdown

### Calibration Workflow

1. **Automatic Detection**
   - The MCU automatically detects active thermocouples on initialisation
   - Active TCs appear in the dropdown menu

2. **Calibration Mode**
   - The MCU starts in CalibrationState
   - The app continuously receives `TC_CALIBRATE` messages
   - Temperature changes trigger automatic TC selection

3. **Manual Selection**
   - Select a TC from the dropdown
   - Click "Select Thermocouple" to send selection to MCU
   - The selected TC will display detailed probe and reference data

4. **Set Position**
   - Enter X, Y, Z coordinates in millimeters
   - Click "Set Position" to update the selected TC
   - Position updates appear in the 3D viewer immediately

5. **Save Positions**
   - Click "Save Positions To CSV" to send all positions to MCU
   - Positions are saved to `position.csv` on the MCU's SD card

### Measurement Mode

1. **Switch to Measurement**
   - Click "Finish Calibration" to switch MCU to MeasureState
   - The MCU continuously sends `TC: temperature` messages
   - All thermocouples are measured in sequence

2. **Live Visualisation**
   - 3D cubes update colors in real-time based on temperature
   - Selected TC is highlighted with 1.3x scale
   - Temperature data displays in the Live Data section

### Data Playback

1. **Load File**
   - Click "Check Status" to refresh file list
   - Select a CSV file from the dropdown (format: `YYYY-MM-DD.csv`)
   - Click "Select File" to load data
   - File data streams from MCU and displays in viewer

2. **Navigate Timeline**
   - Use the timeline slider to scrub through data
   - Time display shows current timestamp
   - 3D visualisation updates to show temperatures at selected time

3. **Select Thermocouple in Playback**
   - Use the sidebar TC selector
   - View detailed temperature and position data for selected TC
   - Selected TC is highlighted in 3D viewer

### Export Features

1. **Export Standalone Viewer**
   - Load a file first
   - Click "📦 Export Viewer"
   - A self-contained HTML file is downloaded
   - Open the file in any browser to view the data offline

2. **Record Video**
   - Load a file first
   - Click "🎬 Record Video"
   - The app records the temperature timeline animation
   - Video is saved as WebM format when complete

## Configuration

### Configuration Settings

Located in `js/config.js`:

**Visualization Settings:**
```javascript
export const VIZ_CONFIG = {
    tempMin: 20,           // Minimum temperature for colour scale (°C)
    tempMax: 35,           // Maximum temperature for colour scale (°C)
    coldColor: 0xAF0000,   // Colour for cold temperatures (dark red)
    hotColor: 0xffff00,    // Colour for hot temperatures (yellow)
    opacityMin: 0.3,       // Minimum cube opacity
    opacityMax: 1.0,       // Maximum cube opacity
    cubeSize: 0.5          // Size of TC cubes in 3D space
};
```

**Calibration Settings:**
```javascript
export const CalibrationConfig = {
    THRESHOLD_MIN: 2.0,              // Minimum temp change threshold (°C)
    THRESHOLD_MAX: 15.0,             // Maximum temp change to consider (°C)
    DROP_LARGE_THRESHOLD: 3.0,       // Large temperature drop threshold (°C)
    SPIKE_WINDOW_SECONDS: 5,         // Spike detection window (seconds)
    SPIKE_COOLDOWN_MS: 2000,         // Cooldown between spike detections (ms)
    VALID_TEMP_MAX: 2000,            // Maximum valid temperature (°C)
    NUM_TCS: 8,                      // Expected number of thermocouples
    REFERENCE_UPDATE_INTERVAL: 20000, // Baseline update interval (ms)
    TEMP_DROP_THRESHOLD: 0.75        // Minor temp drop to ignore (°C)
};
```

**UART Settings:**
```javascript
export const UART_CONFIG = {
    PROBE_SILENCE_MS: 1500,          // Time before clearing pop effect (ms)
    ZERO_RESEND_INTERVAL_MS: 500,    // Interval for resending '0' (ms)
    ZERO_RESEND_TIMEOUT_MS: 10000    // Timeout for zero-ack loop (ms)
};
```

### Logging

Change log level in browser console:
```javascript
window.setLogLevel('DEBUG');  // Verbose logging
window.setLogLevel('INFO');   // Normal logging
window.setLogLevel('WARN');   // Quiet (default)
window.setLogLevel('ERROR');  // Minimal logging
```

## Technical Details

### Serial Communication Protocol

**Baud Rate:** 115200  
**Line Endings:** `\n` (newline)

#### Outgoing Commands (Web App → MCU)

- `status` - Request MCU state and file list
- `<number>` - Select thermocouple by ID (e.g., `1`, `2`)
- `measure` - Switch to measurement mode
- `calibrate` - Switch to calibration mode
- `SAVE_POSITIONS:<data>` - Save positions to CSV
  - Format: `SAVE_POSITIONS:1,0,0,0;2,1,0,0;3,2,0,0`
- `LOAD_POSITIONS` - Request positions from CSV
- `FILE_SELECTED:<filename>` - Request file data
  - Example: `FILE_SELECTED:2024-01-15.csv`

#### Incoming Messages (MCU → Web App)

- `SOFTWARE_INIT` - MCU initialisation complete
- `Active TCs:[1,2,3,...]` - List of active thermocouple IDs
- `CalibrationState` / `MeasureState` - Current MCU state
- `FILES:file1.csv,file2.csv,...` - Available CSV files
- `TC_CALIBRATE<id>: <temperature>` - Calibration temperature data
  - Example: `TC_CALIBRATE1: 25.5`
- `TC<id>: <temperature>` - Measurement temperature data
  - Example: `TC1: 26.3`
- `TC_Probe(<id>)` - Probe selection notification (triggers visual pop effect)
  - Example: `TC_Probe(1)`
- `TC_Probe<id>, Ref Data: <probe_temp>,<ref_temp>` - Selected TC details (deprecated format)
  - Example: `TC_Probe1, Ref Data: 25.5,23.2`
- `FILE_DATA:<line>` - File data line (CSV row)
- `LOAD_POSITIONS:<data>` - Position data from CSV
  - Format: `LOAD_POSITIONS:1,0,0,0;2,1,0,0;3,2,0,0`

### Message Processing

The application uses a queue-based processing system to handle high-frequency messages:

1. **Reader Loop**: Continuously reads from serial port via UARTHelper
2. **Line Parsing**: Splits incoming data by newlines
3. **Queue System**: Adds lines to processing queue (max 1000 items)
4. **Batch Processing**: Processes 50 lines at a time with yield to event loop
5. **Overflow Protection**: Drops oldest messages if queue exceeds limit
6. **Error Recovery**: Attempts to recover from buffer overruns
7. **TC_Probe Authority**: Only TC_Probe messages from MCU trigger visual selection/pop effects
8. **Probe Silence Monitoring**: Automatically clears pop effects when TC_Probe messages stop
9. **Resend Loops**: Continuously resends selection commands until MCU acknowledges via TC_Probe

### Data Storage

**LocalStorage Keys:**
- `thermocouples`: JSON array of TC objects with positions and temperatures
- `calibrationFinished`: Boolean flag for calibration state
- `fileDataArray`: Historical temperature data for playback
- `lastPort`: USB vendor/product IDs for auto-connect
- `cameraState`: Camera position/orientation for 3D viewer
- `logLevel`: Current logging level setting

### 3D Rendering

**Three.js Setup:**
- Perspective camera (75° FOV)
- WebGL renderer with antialiasing
- Ambient + directional lighting
- Grid and axes helpers
- OrbitControls for interaction

**Colour Interpolation:**
- Linear interpolation between `coldColor` and `hotColor`
- Based on normalised temperature: `(temp - tempMin) / (tempMax - tempMin)`
- Opacity varies linearly with temperature
- Proportional color boost during pop animation for selected TCs

**Visual Selection System:**
- Only TC_Probe messages from MCU trigger visual "pop" effects
- Pop animation: delayed (150ms), one-time scale to 1.3x with brightness increase
- Pop effect cleared automatically when TC_Probe messages stop (configurable silence threshold)
- Dropdown and manual selection update UI but do not trigger pop until MCU confirms via TC_Probe
- No pop animation during TC_CALIBRATE mode to avoid visual clutter

**Performance:**
- Single geometry instance shared by all TC cubes
- Material updates only when temperature changes
- Efficient matrix transformations for positioning

## File Format

### Position CSV (`position.csv`)

Format:
```
TC_ID,X,Y,Z
1,0.0,0.0,0.0
2,10.5,5.2,2.1
3,20.3,10.1,4.5
```

### Temperature Data CSV (`YYYY-MM-DD.csv`)

Format:
```
TIME,TC1_TEMP,TC2_TEMP,TC3_TEMP,...
HH:MM:SS,25.5,26.1,24.8,...
10:30:15,25.7,26.3,25.0,...
10:30:20,26.0,26.5,25.2,...
```

- First column: Time (HH:MM:SS format)
- Subsequent columns: Temperature values for each TC in order
- Comma-separated values
- No header row (time + temperatures only)

## Browser Compatibility

**Required:**
- Web Serial API support (Chrome 89+, Edge 89+)
- WebGL support
- ES6 Modules support

**Recommended:**
- Chrome 89+ or Edge 89+ (best Web Serial API support)
- Modern GPU for smooth 3D rendering

## Dependencies

- **Three.js v0.159.0**: 3D graphics library (loaded via CDN from jsdelivr)
- **OrbitControls**: Camera controls (included in repository)
- **Web Serial API**: Native browser API (no library needed)

## Code Architecture

The application follows a modular ES6 module structure with clear separation of concerns:

### Module Organization

**Core Modules:**
- `main.js` - Application orchestration, UI management, serial communication handling
- `config.js` - Centralized configuration exports (VIZ_CONFIG, CalibrationConfig, UART_CONFIG)
- `logger.js` - Logging system with level filtering and localStorage persistence
- `utils.js` - Shared utilities (formatTime, sleep, throttle)

**Data Models:**
- `thermocouple.js` - Thermocouple class with temperature tracking and update methods

**Communication:**
- `uart-helper.js` - Serial port wrapper with buffer management and line reading

**3D Visualization:**
- Visualization3D class in `main.js` - Three.js scene management and rendering

### Key Design Patterns

**Event-Driven Architecture:**
- UI events trigger async handlers
- Serial messages routed through centralized `processLine()` method
- State changes propagate via method calls and UI updates

**Authority Pattern:**
- MCU has authority over visual selection via TC_Probe messages
- Web app sends commands but waits for MCU confirmation before updating visuals
- Continuous resend loops ensure reliable command acknowledgment

**Throttling and Batching:**
- Visual updates throttled to prevent render lag from high-frequency temperature data
- Message queue batching prevents event loop blocking
- Logger filters high-frequency repeated messages

### Error Handling

- Buffer overrun recovery in reader loop
- Graceful degradation when serial port unavailable
- Try-catch blocks around critical operations
- User-friendly error messages in UI

### Performance Optimisations

- Queue-based message processing prevents blocking
- Batch processing with event loop yielding
- Shared geometries for 3D objects
- Efficient temperature-to-colour calculations
- Debounced file loading completion detection

## Troubleshooting

### Serial Port Not Connecting
- Ensure MCU is powered and connected via USB
- Check that browser supports Web Serial API (Chrome 89+, Edge 89+)
- Try refreshing the page and reconnecting
- Check if another application is using the port

### Visual Selection Not Working
- Verify MCU is sending `TC_Probe(<id>)` messages
- Check browser console for incoming message logs (set log level to DEBUG)
- Ensure calibration mode is active (pop effect disabled in measurement mode by default)
- Try manually selecting TC via dropdown and clicking "Select Thermocouple"

### Pop Effect Not Clearing
- Pop effects automatically clear after PROBE_SILENCE_MS (default 1500ms) of no TC_Probe messages
- Check UART_CONFIG settings in config.js if timeout seems wrong
- Verify TC_Probe messages have stopped in browser console logs

### Buffer Overrun Errors
- These are automatically handled by the queue system
- If persistent, check MCU message frequency
- Consider adjusting `MAX_QUEUE_SIZE` in main.js
- Enable DEBUG logging to see queue statistics

### 3D Viewer Not Displaying
- Check browser console for WebGL errors
- Verify Three.js library loaded correctly from CDN
- Ensure active thermocouples have position data
- Try hard refresh (Ctrl+Shift+R) to clear cache

### File Loading Issues
- Verify file exists on MCU SD card
- Check file format matches expected CSV structure
- Ensure MCU is in correct state for file operations
- Look for FILE_DATA messages in browser console (DEBUG log level)

---

**Note:** The MCU-side code (`main.py`, `tc_manager.py`) runs on the microcontroller's SD card and is not part of this repository. This web application communicates with the MCU via Web Serial API.
