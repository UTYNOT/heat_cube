# Heat Cube Visualiser

A web-based 3D thermocouple temperature monitoring and calibration system that connects to a microcontroller via Web Serial API for real-time temperature visualization.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Serial Protocol](#serial-protocol)
- [File Formats](#file-formats)
- [Troubleshooting](#troubleshooting)
- [Browser Compatibility](#browser-compatibility)

## Overview

Heat Cube Visualiser is an interactive web application for monitoring and calibrating thermocouple arrays. It provides real-time 3D visualization of temperature data from up to 256 thermocouples connected to a microcontroller.

### Key Capabilities

- **3D Visualization**: Interactive Three.js rendering with temperature-based color coding
- **Real-time Monitoring**: Live temperature streaming via Web Serial API
- **Calibration Mode**: Automated thermocouple detection and position mapping
- **Data Playback**: Load and replay historical CSV temperature data
- **Export Tools**: Generate standalone HTML viewers and record timeline videos

## Features

### 🔌 Serial Communication
- Web Serial API integration for direct MCU communication
- Auto-reconnect to previously used serial ports
- Robust buffer management with overflow protection
- Queue-based message processing

### 🌡️ Real-time Monitoring
- Live temperature readings from all active thermocouples
- Temperature-based color coding (cold = blue, hot = red)
- Interactive thermocouple selection with detailed data display
- Visual highlighting of selected thermocouples

### 📍 Position Management
- 3D coordinate system (X, Y, Z in millimeters)
- Manual position input for each thermocouple
- Save/load positions to/from CSV files on MCU
- Automatic position synchronization

### ⚙️ Calibration System
- Automatic detection of active thermocouples
- MCU-controlled visual selection via `TC_Probe` messages
- Configurable temperature thresholds
- Baseline reference temperature tracking

### 📊 Data Playback
- Load historical temperature data from MCU CSV files
- Timeline slider for navigating recorded data
- Date-based CSV file naming (`YYYY-MM-DD.csv`)
- Playback visualization with color-coded temperature changes

### 📦 Export Features
- **Standalone HTML Viewer**: Self-contained HTML file with embedded data
- **Video Recording**: Record animated temperature timeline as WebM video
- Interactive 3D scene with timeline controls

### 🎨 3D Visualization
- Three.js-powered interactive 3D scene
- OrbitControls for camera manipulation (rotate, pan, zoom)
- Grid and axes helpers for spatial reference
- Temperature-based color interpolation with opacity variation
- Visual "pop" effect for selected thermocouples

## Getting Started

### Prerequisites

- Modern web browser with Web Serial API support (Chrome 89+, Edge 89+)
- Microcontroller with thermocouple array connected via USB

### Installation

1. Clone or download this repository
2. Open `index.html` in a modern web browser
3. No build process or dependencies to install—runs directly in browser

### First Time Setup

1. **Open the Application**
   - Open `index.html` in Chrome or Edge
   - Click "Enter Visualiser" on the landing page

2. **Connect to MCU**
   - Click "Choose Serial Port"
   - Select your MCU's serial port from the dialog
   - Wait for "SOFTWARE_INIT" confirmation message

3. **Check Status**
   - Click "Check Status" to view MCU state and active thermocouples
   - Active TCs will populate the thermocouple dropdown

## Usage Guide

### Calibration Workflow

The calibration process maps physical thermocouple positions in 3D space:

1. **Automatic Detection**
   - MCU automatically detects active thermocouples on startup
   - Active TCs appear in the dropdown menu

2. **Select Thermocouple**
   - Choose a TC from the dropdown
   - Click "Select Thermocouple" to send selection to MCU
   - MCU confirms with `TC_Probe` message, triggering visual highlight

3. **Set Position**
   - Enter X, Y, Z coordinates in millimeters
   - Click "Set Position" to update the selected TC
   - Position updates appear immediately in 3D viewer

4. **Save Positions**
   - Click "Save Positions To CSV" to store all positions to MCU
   - Positions saved to `position.csv` on MCU's SD card

5. **Load Positions**
   - Click "Upload Positions from CSV" to retrieve saved positions
   - Positions loaded from MCU and stored in browser local storage

### Measurement Mode

Switch to live temperature monitoring:

1. **Enable Measurement**
   - Click "Finish Calibration" to switch MCU to measurement mode
   - MCU streams continuous `TC: temperature` messages
   - All thermocouples measured in sequence

2. **Live Visualization**
   - 3D cubes update colors in real-time based on temperature
   - Temperature data displays in "Live Data" section
   - Click "Enter Calibration" to return to calibration mode

### Data Playback

Review historical temperature data:

1. **Load File**
   - Click "Check Status" to refresh available files
   - Select a CSV file from dropdown (format: `YYYY-MM-DD.csv`)
   - Click "Select File" to load data from MCU

2. **Navigate Timeline**
   - Use timeline slider to scrub through data
   - Time display shows current timestamp
   - 3D visualization updates to show temperatures at selected time

3. **Select Thermocouple**
   - Use sidebar TC selector to view detailed data
   - Selected TC highlighted in 3D viewer

### Export Features

1. **Export Standalone Viewer**
   - Load a file first
   - Click "📦 Export Viewer"
   - Self-contained HTML file downloads
   - Open in any browser for offline viewing

2. **Record Video**
   - Load a file first
   - Click "🎬 Record Video"
   - Timeline animation recorded to WebM format

## Project Structure

```
heat_cube/
├── index.html              # Main HTML file with UI structure
├── style.css              # Stylesheet for UI components
├── README.md              # Documentation (this file)
│
├── js/
│   ├── main.js           # Main application logic and HeatCubeSystem class
│   ├── config.js         # Configuration settings (visualization, calibration, UART)
│   ├── logger.js         # Logging system with configurable levels
│   ├── utils.js          # Utility functions (formatTime, sleep, throttle)
│   ├── uart-helper.js    # Serial communication wrapper
│   ├── thermocouple.js   # Thermocouple data model
│   ├── animation.js      # Logo animation handling
│   ├── server.js         # Node.js script for backing up SD card data
│   ├── OrbitControls.js  # Three.js orbit controls extension
│   └── three.module.js   # Three.js library (v0.159.0)
│
├── TemperatureData/      # CSV files backed up from MCU
│   └── *.csv             # Temperature data files (YYYY-MM-DD.csv format)
│
├── V28/                  # MCU-side code (MicroPython)
│   ├── main.py           # MCU main entry point
│   ├── thermocouple.py   # MAX31855 driver
│   ├── shift_register.py # 74HC595 shift register driver
│   └── *.py              # Additional MCU support files
│
└── Reports/              # (Empty) Reports folder
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

### Core Components

#### HeatCubeSystem Class

Main application manager orchestrating all functionality.

**Responsibilities:**
- Initialize UI elements and event listeners
- Manage serial port connection via UARTHelper
- Process incoming MCU messages
- Handle calibration logic and state
- Manage file data loading and playback
- Coordinate UI updates with 3D visualization

**Key Methods:**
- `init()` - Initialize the application
- `openPort()` - Connect to serial port
- `startReaderLoop()` - Background message reading with queue processing
- `processLine()` - Parse and route MCU messages
- `handleTCTemperature()` - Update TC data from measurements
- `generateStandaloneHTML()` - Create exportable viewer HTML
- `handleRecordVideo()` - Record temperature timeline as video

#### Visualization3D Class

Manages Three.js 3D scene and rendering.

**Responsibilities:**
- Initialize Three.js scene, camera, renderer
- Create and manage thermocouple cube meshes
- Update cube colors based on temperature
- Handle camera controls (OrbitControls)
- Save/restore camera state

**Key Methods:**
- `init()` - Set up Three.js scene
- `syncTcMeshes()` - Create/update TC cubes from data array
- `updateTcVisual()` - Update individual TC cube appearance
- `animate()` - Render loop

#### UARTHelper Class

Handles serial port communication.

**Responsibilities:**
- Open/close serial port connections
- Read and write messages
- Buffer management for incomplete messages

**Key Methods:**
- `write(message)` - Send message to MCU
- `readLine()` - Read complete line from serial port
- `close()` - Clean up connections

#### Logger Class

Configurable logging system with message filtering.

**Log Levels:**
- `DEBUG` - All messages (verbose)
- `INFO` - Informational messages
- `WARN` - Warnings and errors (default)
- `ERROR` - Only errors

**Features:**
- Filters high-frequency messages (TC_CALIBRATE, TC:, FILE_DATA:)
- Persists log level in localStorage
- Runtime control via `window.setLogLevel()`

#### Thermocouple Class

Data model for individual thermocouples.

**Properties:**
- `id` - Thermocouple ID (1-256)
- `tcTemp` - Probe temperature (°C)
- `refTemp` - Reference/junction temperature (°C)
- `x`, `y`, `z` - 3D position coordinates (mm)

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

6. **Load Positions**
   - Click "Upload Positions from CSV" to request all positions stored in 'position.csv' on the MCU's SD card to be loaded
   - Positions are then stored in the local storage

### Measurement Mode

1. **Switch to Measurement**
   - Click "Finish Calibration" to switch MCU to MeasureState
   - The MCU continuously sends `TC: temperature` messages
   - All thermocouples are measured in sequence
   - Can click "Enter Calibration" to switch MCU to CalibrationState

2. **Live Visualisation**
   - 3D cubes update colors in real-time based on temperature
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

### Visualization Settings

Edit `js/config.js` to customize visualization parameters:

```javascript
export const VIZ_CONFIG = {
    tempMin: 20,           // Minimum temperature for color scale (°C)
    tempMax: 35,           // Maximum temperature for color scale (°C)
    coldColor: 0x00AAFF,   // Color for cold temperatures (blue)
    midColor: 0x00FF00,    // Color for mid temperatures (green)
    hotColor: 0xFF2222,    // Color for hot temperatures (red)
    opacityMin: 0.5,       // Minimum cube opacity
    opacityMax: 0.85,      // Maximum cube opacity
    cubeSize: 0.5,         // Size of TC cubes in 3D space
    cubeScale: 2.0,        // Scale factor for cube geometry
    scaleFactor: 1.0,      // Global multiplier for cube.scale()
    outlineColor: 0xffffff,// Outline color
    outlineOpacity: 2      // Outline opacity
};
```

### UART Settings

```javascript
export const UART_CONFIG = {
    BAUDRATE: 115200,              // Serial baud rate
    TIMEOUT: 2000,                 // File loading timeout (ms)
    PROBE_SILENCE_MS: 1500,        // Time before clearing pop effect (ms)
    ZERO_RESEND_INTERVAL_MS: 300,  // Interval for resending '0' (ms)
    ZERO_RESEND_TIMEOUT_MS: 3000   // Timeout for zero-ack loop (ms)
};
```

### Logging Configuration

Change log level in browser console:

```javascript
window.setLogLevel('DEBUG');  // Verbose logging
window.setLogLevel('INFO');   // Normal logging
window.setLogLevel('WARN');   // Quiet (default)
window.setLogLevel('ERROR');  // Minimal logging
```

## Serial Protocol

### Communication Settings

- **Baud Rate:** 115200
- **Line Endings:** `\n` (newline)

### Outgoing Commands (Web App → MCU)

| Command | Description | Example |
|---------|-------------|---------|
| `status` | Request MCU state and file list | `status` |
| `<number>` | Select thermocouple by ID | `1`, `25` |
| `measure` | Switch to measurement mode | `measure` |
| `calibrate` | Switch to calibration mode | `calibrate` |
| `SAVE_POSITIONS:<data>` | Save positions to CSV | `SAVE_POSITIONS:1,0,0,0;2,1,0,0` |
| `LOAD_POSITIONS` | Request positions from CSV | `LOAD_POSITIONS` |
| `FILE_SELECTED:<filename>` | Request file data | `FILE_SELECTED:2024-01-15.csv` |

### Incoming Messages (MCU → Web App)

| Message | Description | Example |
|---------|-------------|---------|
| `SOFTWARE_INIT` | MCU initialization complete | `SOFTWARE_INIT` |
| `Active TCs:[...]` | List of active thermocouple IDs | `Active TCs:[1,2,3,4,5]` |
| `CalibrationState` | MCU in calibration mode | `CalibrationState` |
| `MeasureState` | MCU in measurement mode | `MeasureState` |
| `FILES:...` | Available CSV files | `FILES:file1.csv,file2.csv` |
| `TC_CALIBRATE<id>: <temp>` | Calibration temperature data | `TC_CALIBRATE1: 25.5` |
| `TC<id>: <temp>` | Measurement temperature data | `TC1: 26.3` |
| `TC_Probe(<id>)` | Probe selection notification | `TC_Probe(1)` |
| `FILE_DATA:<line>` | File data line (CSV row) | `FILE_DATA:10:30:15,25.5,26.1` |
| `LOAD_POSITIONS:<data>` | Position data from CSV | `LOAD_POSITIONS:1,0,0,0;2,1,0,0` |

### Message Processing

The application uses a queue-based system for reliable message handling:

1. **Reader Loop** - Continuously reads from serial port
2. **Line Parsing** - Splits incoming data by newlines
3. **Queue System** - Adds lines to processing queue (max 1000 items)
4. **Batch Processing** - Processes 50 lines at a time
5. **Overflow Protection** - Drops oldest messages if queue exceeds limit
6. **TC_Probe Authority** - Only TC_Probe messages trigger visual effects
7. **Auto-clear** - Pop effects clear automatically after silence timeout

## File Formats

### Position CSV (`position.csv`)

Stored on MCU SD card. Format:

```
TC_ID,X,Y,Z
1,0.0,0.0,0.0
2,10.5,5.2,2.1
3,20.3,10.1,4.5
```

### Temperature Data CSV (`YYYY-MM-DD.csv`)

Historical temperature recordings. Format:

```
TIME,TC1_TEMP,TC2_TEMP,TC3_TEMP,...
10:30:15,25.5,26.1,24.8,...
10:30:20,25.7,26.3,25.0,...
10:30:25,26.0,26.5,25.2,...
```

- **First column:** Time (HH:MM:SS format)
- **Subsequent columns:** Temperature values for each TC in order
- **Format:** Comma-separated values
- **Header:** No header row (time + temperatures only)

## Troubleshooting

### Serial Port Issues

**Problem:** Serial port not connecting

**Solutions:**
- Ensure MCU is powered and connected via USB
- Check browser supports Web Serial API (Chrome 89+, Edge 89+)
- Try refreshing page and reconnecting
- Verify no other application is using the port

### Visual Selection Issues

**Problem:** Visual selection not working

**Solutions:**
- Verify MCU is sending `TC_Probe(<id>)` messages
- Check browser console for incoming messages (set log level to DEBUG)
- Ensure calibration mode is active
- Try manual selection via dropdown

**Problem:** Pop effect not clearing

**Solutions:**
- Wait for PROBE_SILENCE_MS timeout (default 1500ms)
- Check UART_CONFIG settings in config.js
- Verify TC_Probe messages have stopped in console logs

### 3D Viewer Issues

**Problem:** 3D viewer not displaying

**Solutions:**
- Check browser console for WebGL errors
- Verify Three.js library loaded correctly from CDN
- Ensure active thermocouples have position data
- Try hard refresh (Ctrl+Shift+R)

### Buffer Issues

**Problem:** Buffer overrun errors

**Solutions:**
- Queue system handles these automatically
- Check MCU message frequency if persistent
- Consider adjusting MAX_QUEUE_SIZE in main.js
- Enable DEBUG logging to see queue statistics

### File Loading Issues

**Problem:** Files not loading

**Solutions:**
- Verify file exists on MCU SD card
- Check file format matches expected CSV structure
- Ensure MCU is in correct state for file operations
- Look for FILE_DATA messages in console (DEBUG level)

## Browser Compatibility

### Requirements

- **Web Serial API:** Chrome 89+, Edge 89+ (required)
- **WebGL:** Modern GPU for 3D rendering
- **ES6 Modules:** All modern browsers

### Recommended

- Chrome 89+ or Edge 89+ for best Web Serial API support
- Dedicated GPU for smooth 3D rendering
- 1920x1080 or higher resolution display

## Dependencies

| Dependency | Version | Source | Purpose |
|------------|---------|--------|---------|
| Three.js | v0.159.0 | CDN (jsdelivr) | 3D graphics library |
| OrbitControls | - | Local (js/OrbitControls.js) | Camera controls |
| Web Serial API | Native | Browser API | Serial communication |

## Technical Details

### Data Storage (LocalStorage)

- `thermocouples` - TC objects with positions and temperatures
- `calibrationFinished` - Calibration state flag
- `fileDataArray` - Historical temperature data
- `lastPort` - USB vendor/product IDs for auto-connect
- `cameraState` - Camera position/orientation
- `logLevel` - Current logging level

### 3D Rendering Details

**Scene Setup:**
- Perspective camera (45° FOV)
- WebGL renderer with antialiasing
- Ambient + directional lighting
- Grid and axes helpers
- OrbitControls for interaction

**Color Interpolation:**
- Multi-stop gradient (cold → mid → hot)
- Normalized temperature mapping
- Opacity variation with temperature
- Color boost during selection animation

**Performance Optimizations:**
- Shared geometry instances
- Throttled visual updates
- Efficient matrix transformations
- Batch processing

---

**Note:** MCU-side code in `V28/` folder runs on the microcontroller. This web application communicates with the MCU via Web Serial API.
