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
- Smart calibration that detects temperature changes
- Configurable thresholds for temperature change detection
- Baseline reference temperature tracking

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
- Selected thermocouple scaling (1.3x)

## Project Structure

```
heat_cube/
├── index.html              # Main HTML file with landing page and UI structure
├── style.css              # Stylesheet for UI components
├── README.md              # This file
├── position.csv           # Empty placeholder for position data
├── js/
│   ├── main.js           # Main application logic (1785 lines)
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

### Visualisation Settings

Located at the top of `js/main.js`:

```javascript
const VIZ_CONFIG = {
    tempMin: 20,           // Minimum temperature for colour scale (°C)
    tempMax: 35,           // Maximum temperature for colour scale (°C)
    coldColor: 0xAF0000,   // Colour for cold temperatures (dark red)
    hotColor: 0xffff00,    // Colour for hot temperatures (yellow)
    opacityMin: 0.3,       // Minimum cube opacity
    opacityMax: 1.0,       // Maximum cube opacity
    cubeSize: 0.5          // Size of TC cubes in 3D space
};
```

### Calibration Settings

```javascript
const CalibrationConfig = {
    THRESHOLD_MIN: 2.0,              // Minimum temp change to trigger (°C)
    THRESHOLD_MAX: 15.0,             // Maximum temp change to consider (°C)
    VALID_TEMP_MAX: 2000,            // Maximum valid temperature (°C)
    NUM_TCS: 8,                      // Expected number of thermocouples
    REFERENCE_UPDATE_INTERVAL: 20000, // Baseline update interval (ms)
    TEMP_DROP_THRESHOLD: 0.75        // Temp drop to ignore (°C)
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
- `TC_Probe<id>, Ref Data: <probe_temp>,<ref_temp>` - Selected TC details
  - Example: `TC_Probe1, Ref Data: 25.5,23.2`
- `FILE_DATA:<line>` - File data line (CSV row)
- `LOAD_POSITIONS:<data>` - Position data from CSV
  - Format: `LOAD_POSITIONS:1,0,0,0;2,1,0,0;3,2,0,0`

### Message Processing

The application uses a queue-based processing system to handle high-frequency messages:

1. **Reader Loop**: Continuously reads from serial port
2. **Line Parsing**: Splits incoming data by newlines
3. **Queue System**: Adds lines to processing queue (max 1000 items)
4. **Batch Processing**: Processes 50 lines at a time with yield to event loop
5. **Overflow Protection**: Drops oldest messages if queue exceeds limit
6. **Error Recovery**: Attempts to recover from buffer overruns

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

- **Three.js v0.159.0**: 3D graphics library (loaded via CDN)
- **OrbitControls**: Camera controls (included in repository)
- **Web Serial API**: Native browser API (no library needed)

## Development Notes

### Code Organisation

The codebase follows a modular structure:
- Classes are organised by functionality
- Clear separation between UI, 3D visualisation, and communication
- Event-driven architecture with centralised message routing

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
- Check that browser supports Web Serial API
- Try refreshing the page and reconnecting

### Buffer Overrun Errors
- These are automatically handled by the queue system
- If persistent, check MCU message frequency
- Consider adjusting `MAX_QUEUE_SIZE` in code

### 3D Viewer Not Displaying
- Check browser console for WebGL errors
- Verify Three.js library loaded correctly
- Ensure active thermocouples have position data

### File Loading Issues
- Verify file exists on MCU SD card
- Check file format matches expected CSV structure
- Ensure MCU is in correct state for file operations

---

**Note:** The MCU-side code (`main.py`, `tc_manager.py`) runs on the microcontroller's SD card and is not part of this repository. This web application communicates with the MCU via Web Serial API.
