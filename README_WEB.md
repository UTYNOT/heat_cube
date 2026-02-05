# Heat Cube Web App (HTML/CSS/JS) README

## Overview
The web app is a static, browser-run UI that connects to the MCU via the Web Serial API, visualizes thermocouple data in 3D (Three.js), and supports calibration, live monitoring, and data playback.

## How the web app starts
- Open `index.html` in Chrome or Edge (Web Serial required).
- `index.html` loads `style.css` and JavaScript modules from the js folder.
- The 3D renderer is initialized after the MCU sends `SOFTWARE_INIT`.

## Main files and how they connect
- `index.html`
  - Defines all UI controls and panels.
  - Loads JS modules and the landing animation.
- `style.css`
  - Complete UI styling for landing overlay, control panel, and 3D viewer.
- `js/main.js`
  - Orchestrates UI events, serial communication, state handling, and rendering updates.
  - Parses UART messages from the MCU and updates UI + 3D scene.
- `js/uart-helper.js`
  - Thin Web Serial wrapper for reading lines and writing commands.
- `js/thermocouple.js`
  - Client-side thermocouple data model (id, temp, ref, x/y/z).
- `js/config.js`
  - Centralized visualization and UART parameters.
- `js/utils.js`
  - Helper utilities (time formatting, sleep, throttling).
- `js/logger.js`
  - Configurable log levels and filtered MCU logging.
- `js/OrbitControls.js`, `js/three.module.js`
  - Three.js dependencies (local copies).
- `js/animation.js`
  - Landing/logo animation helpers.
- `js/server.js`
  - Optional Node.js script to copy MCU CSV files from an SD card into TemperatureData.

## Data flow (MCU ↔ Web)
1. **Connect**
   - The user selects a serial port in the browser.
   - The UI waits for `SOFTWARE_INIT` before starting the 3D scene.
2. **Status & active thermocouples**
   - The UI sends `status` and waits for `Active TCs:[...]`.
   - Active TCs are added to the dropdown and 3D scene.
3. **Calibration**
   - The UI sends a selected TC id (as a number) to request probe data.
   - The MCU responds with `Probe_Data<id>, Ref Data: <probeTemp>,<refTemp>`.
   - The UI updates the selection panel and cube visuals.
4. **Measurement**
   - The UI receives `TC<id>: <temp>` for live data.
   - Visual updates are throttled in the render loop for performance.
5. **Positions**
   - The UI sends `SAVE_POSITIONS_*` messages.
   - The MCU replies with `REQUEST_ALL_POSITIONS` or `REQUEST_POSITIONS:<ids>` when resends are needed.
6. **Playback**
   - The UI loads local CSV data from TemperatureData and provides a timeline slider.

## Playback data source
The web UI uses local CSV files in the TemperatureData folder for playback. The MCU’s `FILES:` list is ignored in the UI, so you can refresh playback data by copying new CSV files into TemperatureData.

## Optional: SD card backup script
`js/server.js` can copy CSVs from an SD card to TemperatureData:
- It expects a Windows drive letter (default `E:\`).
- It copies files that match `YYYY-MM-DD.csv` or `YYYY-MM-DD_HH-MM.csv`.

## Browser requirements
- Chromium-based browser with Web Serial API support (Chrome/Edge).
- HTTPS or localhost context may be required for Web Serial in some setups.

## Where this links to the MCU code
- UART message parsing lives in `processLine` in `js/main.js`.
- The string formats must match the MCU’s output in `state_machine.py`.
- Thermocouple position data maps directly to `position.csv` on the MCU.
