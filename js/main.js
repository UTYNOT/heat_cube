import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { OrbitControls } from './OrbitControls.js';

// ============ VISUALIZATION CONFIG ============
// Change these values to adjust colors and opacity across the entire application
const VIZ_CONFIG = {
    // Temperature range in Celsius
    tempMin: 20,
    tempMax: 35,
    
    // Colors (hex values)
    coldColor: 0xAF0000,  // Green for cold
    hotColor: 0xffff00,   // Yellow for hot
    
    // Opacity range (0.0 to 1.0)
    opacityMin: 0.3,  // Cold/transparent
    opacityMax: 1.0,  // Hot/opaque
    
    // Cube size
    cubeSize: 0.5
};

// Helper function to format time with zero-padding
function formatTime(timeString) {
    if (!timeString || timeString === '--:--:--') return timeString;
    const parts = timeString.split(':');
    if (parts.length !== 3) return timeString;
    return parts.map(part => part.padStart(2, '0')).join(':');
}

const output = document.getElementById('status-output');
const choosePortBtn = document.getElementById('choose-port');
const sendSelectionBtn = document.getElementById('send-selection-btn');
const selectedTc = document.getElementById('selected-tc');
const tcData = document.getElementById('tc-data');
const finishedCalibrationBtn = document.getElementById('finished-calibration-btn');
const statusBtn = document.getElementById('status-btn');
const fileDropdown = document.getElementById('file-dropdown');
const selectFileBtn = document.getElementById('select-file-btn');
const recordVideoBtn = document.getElementById('record-video-btn');
const exportViewerBtn = document.getElementById('export-viewer-btn');
const timeSlider = document.getElementById('time-slider');
const timeLabel = document.getElementById('time-label');

const selector = document.getElementById('active-tcs-dropdown');

// Storage for file data
let fileDataArray = []; // Array of {time: "15:36:03", temps: [2047.75, 22.75, ...]}
let isLoadingFile = false; // Flag to track if we're actively loading a file
let fileLoadTimeout = null; // Timeout to detect when file loading completes
let loggedSyncMeshesOnce = false; // Log sync message only once
let filesReceived = false; // Flag to track if FILES list has been received

const positionOutput = document.getElementById('position-tc');


const savePositionBtn = document.getElementById('save-position-btn');
const uploadPositionBtn = document.getElementById('upload-position-btn');

const setPositionBtn = document.getElementById('set-position-btn');
const posXInput = document.getElementById('pos-x');
const posYInput = document.getElementById('pos-y');
const posZInput = document.getElementById('pos-z');

const fullscreenBtn = document.getElementById('fullscreen-btn');
const viewerPanel = document.getElementById('viewer-panel');

let port = null;
let writer = null;
let reader = null;
// Three.js globals
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
const tcObjects = {};
const coldColor = new THREE.Color(0x00ff00);
const hotColor = new THREE.Color(0xffff00);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredCube = null;

async function closeCurrentPort(sendRefresh = false) {

    if (reader) {
        try {
            await reader.cancel();
        } catch (_) {}
        try {
            reader.releaseLock();
        } catch (_) {}
        reader = null;
    }

    if (writer) {
        try {
            await writer.releaseLock();
        } catch (_) {}
        writer = null;
    }

    if (port) {
        try {
            await port.close();
        } catch (_) {}
        port = null;
    }
    
    // Give OS time to fully release the port
    await sleep(500);
}

class Thermocouple {
    constructor(id) {
        this.id = id;          // TC number (1, 2, 3, ...)
        this.tcTemp = null;    // probe temperature
        this.refTemp = null;   // reference temperature
        this.x = 0;
        this.y = 0;
        this.z = 0;
    }

    update(tcTemp, refTemp) {
        this.tcTemp = tcTemp;
        this.refTemp = refTemp;
    }
}

let activeTcsArray = []; // will store MCU active TCs

function populateActiveTcsArray() {
    selector.innerHTML = '';
    for(const tc of activeTcsArray) {
        const option = document.createElement('option');
        option.value = tc.id;
        option.textContent = `TC ${tc.id}`;
        selector.appendChild(option);
    }
    
}


// Utility sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the reader loop
async function startReaderLoop() {
    console.log("Starting reader loop...");
    await loadSaveStates();
    if (!port) return;

    const textStream = port.readable.pipeThrough(new TextDecoderStream());
    const localReader = textStream.getReader();
    reader = localReader;

    let buffer = '';
    while (true) {
        try {
            const { value, done } = await localReader.read();
            if (done) break;

            buffer += value;
            let lines = buffer.split('\n');
            buffer = lines.pop();

            for (let line of lines) {
                line = line.trim();
                // Skip logging FILE_DATA and TC streaming lines to avoid console spam
                if(!line.startsWith("FILE_DATA:") && !line.startsWith("TC:")) {
                    console.log("MCU:", line);
                }
                // output.textContent = line; // simple output display
                
                if(line.startsWith("Active TCs:")) {
                    console.log("Detected Active TCs line.");
                    // Parse active TC IDs
                    const numbersString = line.substring(line.indexOf('[') + 1, line.indexOf(']'));
                    const numberStringsArray = numbersString.split(',');
                    const incomingIds = numberStringsArray.map(numStr => parseInt(numStr.trim()));
                    
                    // Update activeTcsArray and removes inactive TCs
                    activeTcsArray = activeTcsArray.filter(tc => incomingIds.includes(tc.id));

                    // Add new active TCs
                    for(let id of incomingIds) {
                        if(!activeTcsArray.some(tc => tc.id === id)) {
                            activeTcsArray.push(new Thermocouple(id));
                        }
                    }
                    console.log("Active TCs Array:", activeTcsArray);
                    localStorage.setItem('thermocouples', JSON.stringify(activeTcsArray));
                    populateActiveTcsArray();
                    syncTcMeshes();
                    output.textContent = line; 
                }

                if(line.startsWith("CalibrationState") || line.startsWith("MeasureState")) {
                    console.log("Received state from MCU:", line);
                    // CalibrationState = in calibration mode
                    // MeasureState = in measuring mode (calibration finished)
                    if(line.startsWith("MeasureState")) {
                        calibrationFinished = true;
                        finishedCalibrationBtn.textContent = "Enter Calibration Mode";
                    } else {
                        calibrationFinished = false;
                        finishedCalibrationBtn.textContent = "Finish Calibration";
                    }
                    localStorage.setItem('calibrationFinished', JSON.stringify(calibrationFinished));
                    console.log("Updated calibration state:", calibrationFinished);
                }

                if(line.startsWith("FILES:")) {
                    console.log("Received FILEs from MCU:", line);
                    const filesData = line.substring(6); // Get everything after "FILES:"
                    
                    if(filesData && filesData !== "ERROR") {
                        // Split by comma to get individual files
                        const files = filesData.split(',').map(f => f.trim()).filter(f => f.length > 0);
                        
                        console.log("Files received:", files);
                        
                        // Populate dropdown
                        fileDropdown.innerHTML = '<option value="" disabled selected>Select a file...</option>';
                        files.forEach(file => {
                            const option = document.createElement('option');
                            option.value = file;
                            option.textContent = file;
                            fileDropdown.appendChild(option);
                        });
                        
                        // Mark that FILES have been successfully received
                        filesReceived = true;
                        selectFileBtn.disabled = false;
                        console.log("✓ filesReceived flag set to true, Select File button enabled");
                        
                        output.textContent = `Found ${files.length} file(s)`;
                    } else {
                        fileDropdown.innerHTML = '<option value="" disabled selected>No files available</option>';
                        output.textContent = "No files found on device";
                    }
                }

                if(line.startsWith("SOFTWARE_INIT")) {
                    console.log("MCU software initialized");
                    // MCU is already connected and sending this message
                    // No need to close/reconnect - just initialize UI
                    loadSaveStates();
                    initThreeScene();
                    syncTcMeshes();
                }

                if(line.startsWith("FILE_DATA:")) {
                    // Only process FILE_DATA if we're actively loading a file
                    if(!isLoadingFile) {
                        
                        continue;
                    }
                    
                    const data = line.substring(10); // Get everything after "FILE_DATA:"
                    const parts = data.split(',');
                    
                    if(parts.length > 1) {
                        const time = parts[0];
                        const temps = parts.slice(1).map(t => parseFloat(t));
                        
                        fileDataArray.push({ time, temps });
                        
                        // Log progress every 50 data points
                        if(fileDataArray.length % 50 === 0) {
                            console.log(`Loading file... ${fileDataArray.length} data points loaded`);
                        }
                        
                        // Clear previous timeout and set new one to detect end of file transmission
                        // Use longer timeout (2000ms) to account for delays between data packets
                        if(fileLoadTimeout) clearTimeout(fileLoadTimeout);
                        fileLoadTimeout = setTimeout(() => {
                            console.log(`✓ File loading complete: ${fileDataArray.length} total data points`);
                            isLoadingFile = false;
                            fileLoadTimeout = null;
                            // Persist file data to localStorage
                            localStorage.setItem('fileDataArray', JSON.stringify(fileDataArray));
                        }, 2000); // 2s after last data point (increased from 500ms)
                        
                        // Update slider range
                        timeSlider.max = fileDataArray.length - 1;
                        timeSlider.value = fileDataArray.length - 1;
                        timeSlider.disabled = false;
                        timeLabel.textContent = `Time: ${formatTime(time)}`;
                        
                        output.textContent = `Loaded ${fileDataArray.length} data points`;
                    }
                }

                if(line.startsWith("TC_Probe")) {
                    tcData.textContent = line
                    console.log(line);
                    
                    // Extract temperature from TC_Probe line and update selected TC
                    // Format might be: TC_Probe: 25.5 or similar
                    const tempMatch = line.match(/[\d.]+/);
                    if(tempMatch && selector.value) {
                        const temp = parseFloat(tempMatch[0]);
                        const selectedId = parseInt(selector.value);
                        const tc = activeTcsArray.find(t => t.id === selectedId);
                        if(tc) {
                            tc.tcTemp = temp;
                            updateTcVisual(selectedId);
                            syncTcMeshes();
                        }
                    }
                }

                if(line.startsWith("TC: ")) {
                    tcData.textContent = line
                    const temps = line.substring(3).split(',').map(s => parseFloat(s.trim()));
                    
                    temps.forEach((temp, index) => {
                    // TC id is index + 1
                    const tcId = index + 1;

                    const tcObj = activeTcsArray.find(tc => tc.id === tcId);
                    if (!tcObj) {
                        console.warn("TC object not found for ID:", tcId);
                        return;
                    }

                    // Update only tcTemp
                    tcObj.update(temp, tcObj.refTemp);
                    updateTcVisual(tcId);
                    
                    });
                    syncTcMeshes();
                }

                if(line.startsWith("LOAD_POSITIONS:")) {
                    console.log("Received LOAD_POSITIONS data from MCU");
                    // Parse: LOAD_POSITIONS:1,0.0,0.0,0.0;2,1.0,0.0,0.0;...
                    const data = line.substring(15); // Get everything after "LOAD_POSITIONS:"
                    
                    if(data.startsWith("ERROR")) {
                        console.warn("MCU returned error:", data);
                        positionOutput.textContent = `Error loading positions: ${data}`;
                        return;
                    }

                    const positions = data.split(';');
                    let successCount = 0;

                    for(let pos of positions) {
                        const parts = pos.trim().split(',');
                        if(parts.length === 4) {
                            const tcId = parseInt(parts[0]);
                            const x = parseFloat(parts[1]);
                            const y = parseFloat(parts[2]);
                            const z = parseFloat(parts[3]);

                            const tc = activeTcsArray.find(tc => tc.id === tcId);
                            if(tc) {
                                tc.x = x;
                                tc.y = y;
                                tc.z = z;
                                successCount++;
                                console.log(`Updated TC ${tcId}: x=${x}, y=${y}, z=${z}`);
                            }
                        }
                    }

                    localStorage.setItem('thermocouples', JSON.stringify(activeTcsArray));
                    syncTcMeshes();
                    positionOutput.textContent = `Loaded ${successCount} positions from MCU`;
                    console.log("Position data updated from MCU");
                    console.log("activeTcsArray:", activeTcsArray);
                }

            }
        } catch (err) {
            console.log("Reader stopped:", err);
            break;
        }
    }

    try {
        localReader.releaseLock();
    } catch (_) {}
    reader = null;
}

async function openPort(p) {
    console.log("Opening port...");
    try {
        await sleep(200);

        // Close old port if exists
        if (port && port !== p) {
            console.log("Closing previous port...");
            await closeCurrentPort();
        }

        // Check if port is already open; if so, close it first
        if (p.readable || p.writable) {
            console.log("Port has open streams, closing...");
            try {
                await p.close();
            } catch (_) {}
            await sleep(300);
        }

        // Retry logic for opening port
        let retries = 3;
        let lastErr = null;
        while (retries > 0) {
            try {
                console.log(`Attempting to open port with baudRate 115200... (attempt ${4 - retries}/3)`);
                await p.open({ baudRate: 115200 });
                console.log("✓ Port opened successfully");
                break;
            } catch (err) {
                console.error(`Attempt ${4 - retries} failed:`, err.message);
                lastErr = err;
                retries--;
                if (retries > 0) {
                    console.warn(`Port open failed, retrying in 1s...`);
                    await sleep(1000);
                }
            }
        }

        if (retries === 0) {
            throw lastErr;
        }

        writer = p.writable.getWriter();
        output.textContent = "Port opened! Sending status command...";

        await sleep(200);
        await writer.write(new TextEncoder().encode("status\n"));
        console.log("✓ Sent status command");

        port = p;  // Assign the current port
        startReaderLoop();

    } catch (err) {
        console.error("Error opening port:", err.message);
        output.textContent = "Error opening port: " + err.message + ". Try again or check if MCU is connected.";
        port = null;
        writer = null;
    }
}


// Attempt auto-connect to last used port
async function tryAutoConnect() {
    const lastPortInfo = JSON.parse(localStorage.getItem('lastPort') || '{}');
    if (!lastPortInfo.usbVendorId || !lastPortInfo.usbProductId) {
        console.log("No previously used port stored");
        return;
    }

    try {
        // First try to get previously-granted ports
        let ports = await navigator.serial.getPorts();
        console.log(`Found ${ports.length} previously-granted ports`);
        
        // If no ports found, request access to the previous port
        if (ports.length === 0) {
            console.log("No previously-granted ports. Requesting access...");
            try {
                const requestedPort = await navigator.serial.requestPort({
                    filters: [
                        { usbVendorId: lastPortInfo.usbVendorId, usbProductId: lastPortInfo.usbProductId }
                    ]
                });
                ports = [requestedPort];
                console.log("User granted access to port");
            } catch (err) {
                console.log("User denied port access or port not found:", err.message);
                return;
            }
        }
        
        // Now find and connect to the matching port
        for (let p of ports) {
            const info = p.getInfo();
            if (info.usbVendorId === lastPortInfo.usbVendorId &&
                info.usbProductId === lastPortInfo.usbProductId) {
                
                port = p;
                output.textContent = "Previously used port detected. Auto-connecting...";
                await sleep(200);
                await openPort(port);
                return;
            }
        }
        
        console.log("No matching port found among available ports");
    } catch (err) {
        console.error("Auto-connect error:", err);
    }
}

function loadSaveStates() {
    // 1️ Load calibrationFinished state
    calibrationFinished = JSON.parse(localStorage.getItem('calibrationFinished') || 'false');
    finishedCalibrationBtn.textContent = calibrationFinished
        ? "Enter Calibration Mode"
        : "Finish Calibration";

    // 2️ Load thermocouples
    const storedTcs = JSON.parse(localStorage.getItem('thermocouples') || '[]');
    activeTcsArray = storedTcs.map(tcData => {
        const tc = new Thermocouple(tcData.id);
        tc.tcTemp = tcData.tcTemp;
        tc.refTemp = tcData.refTemp;
        tc.x = tcData.x || 0;
        tc.y = tcData.y || 0;
        tc.z = tcData.z || 0;
        return tc;
    });

    // 3️ Update dropdown
    populateActiveTcsArray();

    // 4️ Sync 3D meshes if scene is ready
    if (scene) {
        syncTcMeshes();
    }

    console.log("Loaded saved states:", { calibrationFinished, activeTcsArray });
}

// Disable Select File button initially until FILES are received
selectFileBtn.disabled = true;

// User selects a new port
choosePortBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        output.textContent = "Port selected!";

        const info = port.getInfo();
        localStorage.setItem('lastPort', JSON.stringify(info));

        await sleep(200);
        await openPort(port);

    } catch (err) {
        console.error("Error selecting port:", err);
        output.textContent = "Error selecting port: " + err;
    }
});



savePositionBtn.addEventListener('click', async () => {
    if(!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before saving position.";
        return;
    }
    
    if (activeTcsArray.length === 0) {
        console.warn('No thermocouples to save');
        positionOutput.textContent = 'No thermocouples to save';
        return;
    }
    
    console.log("Save Position clicked, sending positions over UART");
    
    // Build all positions into one line: SAVE_POSITIONS:id,x,y,z;id,x,y,z;...
    const positionData = activeTcsArray.map(tc => 
        `${tc.id},${tc.x || 0},${tc.y || 0},${tc.z || 0}`
    ).join(';');

    console.log("Position data to send:", positionData + "\\n");

    // Single-line command with CRLF; ensure payload is a string
    const message = 'SAVE_POSITIONS:' + String(positionData) + '\r\n';
    try {
        await writer.write(new TextEncoder().encode(message));
        console.log("Sent all positions:", message.trim());
    } catch (err) {
        console.error("Failed to write SAVE_POSITIONS over UART:", err);
        output.textContent = "UART write failed; reopen port and try again.";
        return;
    }
    
    positionOutput.textContent = `Sent ${activeTcsArray.length} positions to MCU`;
    console.log("All positions sent over UART");
});

setPositionBtn.addEventListener('click', async () => {
    if(!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before setting position.";
        return;
    }

    console.log("Set Position clicked");
    const x = parseFloat(posXInput.value) || 0;
    const y = parseFloat(posYInput.value) || 0;
    const z = parseFloat(posZInput.value) || 0;

    const selectedIdText = selectedTc.textContent.split(': ')[1];
    const tcId = parseInt(selectedIdText, 10);

    if(!tcId) {
        console.warn("No TC selected; cannot set position.");
        positionOutput.textContent = "Select a TC before setting position.";
        return;
    }

    const tc = activeTcsArray.find(tc => tc.id === tcId);

    if(tc) {
        tc.x = x;
        tc.y = y;
        tc.z = z;
        localStorage.setItem('thermocouples', JSON.stringify(activeTcsArray));
        positionOutput.textContent = `Saved position for TC ${tcId} with X:${x}, Y:${y}, Z:${z}`;
        console.log(`Updated TC ${tcId}:`, tc);
        syncTcMeshes();
    } else {
        console.log("Thermocouple not found!");
        positionOutput.textContent = "Thermocouple not found.";
    }

});

uploadPositionBtn.addEventListener('click', async () => {
    if(!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before uploading positions.";
        return;
    }   
    
    console.log("Upload Position clicked, sending LOAD_POSITIONS command to MCU");
    
    // Send the LOAD_POSITIONS command to request position data from MCU
    const message = `LOAD_POSITIONS\n`;
    await writer.write(new TextEncoder().encode(message));
    console.log("Sent LOAD_POSITIONS command to MCU");
    
    positionOutput.textContent = `Sent load positions request to MCU`;
});



statusBtn.addEventListener('click', async () => {
    if(writer) {
        await writer.write(new TextEncoder().encode("status\n"));
        console.log("Sent status command");
        console.log("activeTcsArray:", activeTcsArray); 
    }
});

selectFileBtn.addEventListener('click', async () => {
    if(!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before selecting a file.";
        return;
    }
    
    // Wait for FILES list to be received from MCU before allowing file selection
    console.log("Select File clicked. filesReceived flag:", filesReceived);
    if(!filesReceived) {
        console.warn("FILES list not yet received from MCU; please wait.");
        output.textContent = "Waiting for file list from MCU...";
        return;
    }
    
    // Get the currently selected file from dropdown
    const selectedFile = fileDropdown.value;
    console.log("Dropdown value at click time:", selectedFile);
    
    if(!selectedFile) {
        console.warn("No file selected in dropdown");
        output.textContent = "Please select a file from the dropdown.";
        return;
    }
    
    // Wait a bit to ensure no other UART commands are queued
    await sleep(100);
    
    // Clear any pending file load timeout from previous file load
    if(fileLoadTimeout) {
        clearTimeout(fileLoadTimeout);
        fileLoadTimeout = null;
    }
    
    // Clear previous file data and set loading flag
    fileDataArray = [];
    isLoadingFile = true;
    timeSlider.value = 0;
    timeSlider.max = 0;
    timeSlider.disabled = true;
    timeLabel.textContent = "Time: --:--:--";
    
    const message = `FILE_SELECTED:${selectedFile}\r\n`;
    await writer.write(new TextEncoder().encode(message));
    console.log("Sent FILE_SELECTED command:", message.trim());
    output.textContent = `Loading file: ${selectedFile}`;
});

fullscreenBtn.addEventListener('click', async () => {
    if (!viewerPanel) return;
    
    if (!document.fullscreenElement) {
        // Enter fullscreen
        viewerPanel.requestFullscreen().catch(err => {
            console.error('Fullscreen request failed:', err);
        });
    } else {
        // Exit fullscreen
        document.exitFullscreen();
    }
});

timeSlider.addEventListener('input', () => {
    const index = parseInt(timeSlider.value);
    if(index >= 0 && index < fileDataArray.length) {
        const dataPoint = fileDataArray[index];
        timeLabel.textContent = `Time: ${formatTime(dataPoint.time)}`;
        
        // Update thermocouple temperatures
        dataPoint.temps.forEach((temp, i) => {
            const tcId = i + 1;
            const tc = activeTcsArray.find(t => t.id === tcId);
            if(tc) {
                tc.tcTemp = temp;
                updateTcVisual(tcId);
            }
        });
        
        syncTcMeshes();
        const selectedSidebarId = tcSelectSidebar ? parseInt(tcSelectSidebar.value) : NaN;
        if (!isNaN(selectedSidebarId)) {
            updateTcSidebarInfo(selectedSidebarId);
        }
        console.log(`Updated to time ${dataPoint.time}`);
    }
});

sendSelectionBtn.addEventListener('click', async () => {
    const selector = document.getElementById('active-tcs-dropdown');
    const selectedId = parseInt(selector.value);
    if (isNaN(selectedId)) {
        console.warn("No TC selected in dropdown");
        return;
    }
    selectThermocouple(selectedId);
});

let calibrationFinished = false;

finishedCalibrationBtn.addEventListener('click', async () => {
    console.log("Toggling calibration mode");

    if(!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before changing calibration mode.";
        return;
    }

    // Flip local state and persist
    calibrationFinished = !calibrationFinished;
    localStorage.setItem('calibrationFinished', JSON.stringify(calibrationFinished));

    if (calibrationFinished) {
        // Finished calibration -> enter measurement mode on MCU
        console.log("Calibration finished; sending 'measure' to MCU");
        await writer.write(new TextEncoder().encode("measure\n"));
        finishedCalibrationBtn.textContent = "Enter Calibration Mode";
    } else {
        // Enter calibration mode on MCU
        console.log("Entering calibration; sending 'calibrate' to MCU");
        await writer.write(new TextEncoder().encode("calibrate\n"));
        finishedCalibrationBtn.textContent = "Finish Calibration";
    }

    syncTcMeshes();
});

// On load, attempt auto-connect
window.addEventListener('load', async () => {
    console.log("=== Window Load Event Fired ===");
    
    // Load persisted file data
    const storedFileData = localStorage.getItem('fileDataArray');
    if (storedFileData) {
        try {
            fileDataArray = JSON.parse(storedFileData);
            console.log(`Restored ${fileDataArray.length} data points from localStorage`);
            
            // Restore slider state
            if (fileDataArray.length > 0) {
                timeSlider.max = fileDataArray.length - 1;
                timeSlider.value = fileDataArray.length - 1;
                timeSlider.disabled = false;
                timeLabel.textContent = `Time: ${formatTime(fileDataArray[fileDataArray.length - 1].time)}`;
                output.textContent = `Loaded ${fileDataArray.length} data points (restored)`;
            }
        } catch (err) {
            console.warn('Failed to restore file data:', err);
            fileDataArray = [];
        }
    } else {
        fileDataArray = [];
    }
    
    isLoadingFile = false;
    
    console.log("Loading saved states...");
    loadSaveStates();
    console.log("Initializing Three.js scene...");
    initThreeScene();
    console.log("Syncing TC meshes...");
    syncTcMeshes();
    
    // Give UI time to render before trying to connect
    await sleep(500);
    
    console.log("Page loaded. Attempting auto-connect...");
    try {
        await tryAutoConnect();
    } catch (err) {
        console.error("Auto-connect failed:", err);
    }
 
});



// ============ THREE.JS SCENE SETUP ============

function initThreeScene() {
    const container = document.getElementById('three-container');
    if (!container) {
        console.error('three-container not found!');
        return;
    }

    console.log('Initializing Three.js scene...');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d0f);

    const { clientWidth, clientHeight } = container;
    console.log('Container dimensions:', clientWidth, clientHeight);
    camera = new THREE.PerspectiveCamera(45, clientWidth / clientHeight, 0.1, 100);
    camera.position.set(5, 5, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(clientWidth, clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.update();

    // Restore camera and controls state from localStorage
    restoreCameraState();

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);  // Increased from 0.6
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);  // Increased from 0.6
    dir.position.set(5, 10, 7);
    scene.add(dir);

    scene.add(new THREE.GridHelper(10, 10));
    scene.add(new THREE.AxesHelper(1.5));

    // Add click event listener for cube selection
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
    renderer.domElement.style.cursor = 'default';

    // Save camera state whenever controls change
    controls.addEventListener('change', saveCameraState);

    window.addEventListener('resize', onWindowResize);
    console.log('Scene initialized successfully, starting animation loop');
    animate();
}

function onWindowResize() {
    const container = document.getElementById('three-container');
    if (!container || !camera || !renderer) return;

    const { clientWidth, clientHeight } = container;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
}

function onCanvasMouseMove(event) {
    if (!camera || !scene || !renderer) return;

    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    
    // Calculate mouse position in normalized device coordinates
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    raycaster.setFromCamera(mouse, camera);

    // Get all TC cubes
    const cubes = Object.values(tcObjects);
    
    // Check for intersections
    const intersects = raycaster.intersectObjects(cubes);

    // Reset previous hovered cube
    if (hoveredCube) {
        hoveredCube.scale.set(1, 1, 1);
        hoveredCube = null;
        renderer.domElement.style.cursor = 'default';
    }

    // Apply hover effect to new cube
    if (intersects.length > 0) {
        hoveredCube = intersects[0].object;
        hoveredCube.scale.set(1.15, 1.15, 1.15);
        renderer.domElement.style.cursor = 'pointer';
    }
}

function onCanvasClick(event) {
    if (!camera || !scene) return;

    const container = document.getElementById('three-container');
    const rect = container.getBoundingClientRect();
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster with camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Get all TC cubes as an array
    const cubes = Object.values(tcObjects);
    
    // Check for intersections
    const intersects = raycaster.intersectObjects(cubes);

    if (intersects.length > 0) {
        // Find which TC this cube belongs to
        const clickedCube = intersects[0].object;
        
        // Find TC ID by matching the cube object
        let clickedTcId = null;
        for (const [id, cube] of Object.entries(tcObjects)) {
            if (cube === clickedCube) {
                clickedTcId = parseInt(id);
                break;
            }
        }

        if (clickedTcId !== null) {
            console.log('Clicked on TC cube:', clickedTcId);
            selectThermocouple(clickedTcId);
        }
    }
}

//Function to select a thermocouple
async function selectThermocouple(tcId) {
    if (!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before sending a TC.";
        return;
    }

    console.log("Selecting TC ID:", tcId);
    
    // Update UI
    selectedTc.textContent = `Selected TC: ${tcId}`;
    const selector = document.getElementById('active-tcs-dropdown');
    selector.value = tcId;
    
    // Update visual immediately when TC is selected
    updateTcVisual(tcId);
    syncTcMeshes();
    
    // Send to MCU via UART
    await writer.write(new TextEncoder().encode(`${tcId}\n`));
}

function syncTcMeshes() {
    if (!scene) {
        console.warn('Scene not initialized, skipping mesh sync');
        return;
    }

    if (!loggedSyncMeshesOnce) {
        console.log('Syncing TC meshes. Active TCs:', activeTcsArray.length);
        console.log('Scene:', scene, 'Camera:', camera, 'Renderer:', renderer);
        loggedSyncMeshesOnce = true;
    }
    const width = 0.5;
    const depth = 0.5;

    for (let tc of activeTcsArray) {
        const key = tc.id;
        let cube = tcObjects[key];

        if (!cube) {
            console.log('Creating cube for TC', key, 'at position', tc.x, tc.y, tc.z);
            const geometry = new THREE.BoxGeometry(VIZ_CONFIG.cubeSize, VIZ_CONFIG.cubeSize, VIZ_CONFIG.cubeSize);
            // Use MeshBasicMaterial for guaranteed visibility (doesn't need lighting)
            const material = new THREE.MeshBasicMaterial({ 
                color: VIZ_CONFIG.coldColor,  // Start with cold color
            });
            cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
            console.log('Cube added to scene, total objects:', scene.children.length);
            tcObjects[key] = cube;
        }

        cube.position.set(tc.x || 0, tc.y || 0, tc.z || 0);
        updateTcVisual(key);
    }
}

function updateTcVisual(tcId) {
    const cube = tcObjects[tcId];
    const tc = activeTcsArray.find(t => t.id === tcId);
    if (!cube || !tc) return;

    const temp = tc.tcTemp;
    if (typeof temp === 'number') {
        const tempRange = VIZ_CONFIG.tempMax - VIZ_CONFIG.tempMin;
        const t = Math.min(1, Math.max(0, (temp - VIZ_CONFIG.tempMin) / tempRange));

        // Color interpolation using config
        const coldColor = new THREE.Color(VIZ_CONFIG.coldColor);
        const hotColor = new THREE.Color(VIZ_CONFIG.hotColor);
        
        const displayColor = new THREE.Color().lerpColors(coldColor, hotColor, t);
        cube.material.color.copy(displayColor);
        
        // Opacity using config
        const opacityRange = VIZ_CONFIG.opacityMax - VIZ_CONFIG.opacityMin;
        cube.material.opacity = VIZ_CONFIG.opacityMin + t * opacityRange;
        cube.material.transparent = true;
    }
    
}

function updateTcSidebarInfo(tcId) {
    const infoDiv = document.getElementById('tc-sidebar-info');
    const tc = activeTcsArray.find(t => t.id === tcId);
    
    if (!tc) {
        infoDiv.innerHTML = '<p style="color: #aaa; font-size: 12px;">TC not found</p>';
        return;
    }
    
    // Safe toFixed that handles null and undefined
    const safeFixed = (val, digits) => {
        if (val === null || val === undefined || isNaN(val)) return 'N/A';
        return parseFloat(val).toFixed(digits);
    };
    
    const temp = safeFixed(tc.tcTemp, 2);
    const refTemp = safeFixed(tc.refTemp, 2);
    const x = safeFixed(tc.x, 2);
    const y = safeFixed(tc.y, 2);
    const z = safeFixed(tc.z, 2);
    
    // Calculate color based on temperature using config
    const tempNum = parseFloat(temp);
    let colorHex = '#00ff00'; // Default green
    if (!isNaN(tempNum)) {
        const tempRange = VIZ_CONFIG.tempMax - VIZ_CONFIG.tempMin;
        const t = Math.min(1, Math.max(0, (tempNum - VIZ_CONFIG.tempMin) / tempRange));
        
        // Convert hex colors to RGB for interpolation
        const coldR = (VIZ_CONFIG.coldColor >> 16) & 0xFF;
        const coldG = (VIZ_CONFIG.coldColor >> 8) & 0xFF;
        const coldB = VIZ_CONFIG.coldColor & 0xFF;
        
        const hotR = (VIZ_CONFIG.hotColor >> 16) & 0xFF;
        const hotG = (VIZ_CONFIG.hotColor >> 8) & 0xFF;
        const hotB = VIZ_CONFIG.hotColor & 0xFF;
        
        const r = Math.round(coldR + (hotR - coldR) * t);
        const g = Math.round(coldG + (hotG - coldG) * t);
        const b = Math.round(coldB + (hotB - coldB) * t);
        
        colorHex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    
    infoDiv.innerHTML = `
        <div class="tc-info-card" style="border-left-color: ${colorHex}">
            <strong>🌡️ TC #${tcId}</strong>
            <div class="tc-info-field">
                <span class="label">Temp</span>
                <span class="value">${temp}°C</span>
            </div>
            <div class="tc-info-field">
                <span class="label">X</span>
                <span class="value">${x}mm</span>
            </div>
            <div class="tc-info-field">
                <span class="label">Y</span>
                <span class="value">${y}mm</span>
            </div>
            <div class="tc-info-field">
                <span class="label">Z</span>
                <span class="value">${z}mm</span>
            </div>
        </div>
    `;
}

function saveCameraState() {
    if (!camera || !controls) return;
    
    const state = {
        camera: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        },
        target: {
            x: controls.target.x,
            y: controls.target.y,
            z: controls.target.z
        },
        zoom: camera.zoom
    };
    
    localStorage.setItem('cameraState', JSON.stringify(state));

}

function restoreCameraState() {
    if (!camera || !controls) return;
    
    const saved = localStorage.getItem('cameraState');
    if (!saved) return;
    
    try {
        const state = JSON.parse(saved);
        
        // Restore camera position
        camera.position.set(state.camera.x, state.camera.y, state.camera.z);
        
        // Restore controls target
        controls.target.set(state.target.x, state.target.y, state.target.z);
        
        // Restore zoom
        camera.zoom = state.zoom;
        
        // Update camera matrices
        camera.updateProjectionMatrix();
        controls.update();
        
        console.log('✓ Camera state restored from localStorage');
    } catch (err) {
        console.warn('Failed to restore camera state:', err);
    }
}

function generateStandaloneHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Heat Cube Viewer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1115; color: #fff; overflow: hidden; }
        .container { display: flex; height: 100vh; }
        #canvas { flex: 1; display: block; }
        /* Sidebar look aligned with main app */
        .panel {
            width: 320px;
            background: #1a1a1a;
            border-left: 1px solid #444;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3);
        }
        .panel-header {
            padding: 16px;
            border-bottom: 1px solid #333;
            background: #111;
        }
        .panel-header h3 {
            margin: 0;
            font-size: 16px;
            color: #0d9488;
            font-weight: 600;
        }
        .panel-section {
            padding: 16px;
            border-bottom: 1px solid #333;
        }
        .panel-section label {
            font-size: 14px;
            color: #fff;
            font-weight: 600;
            display: block;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .panel-section input[type="range"] {
            width: 100%;
            cursor: pointer;
            margin-bottom: 8px;
        }
        .panel-section .time-display {
            font-size: 16px;
            padding: 12px 14px;
            background: #0a0a0a;
            border: 1px solid #0d9488;
            border-radius: 4px;
            color: #ffffff;
            font-weight: 600;
            text-align: center;
            font-family: 'Courier New', monospace;
            letter-spacing: 1px;
        }
        .tc-select-row {
            display: flex;
            gap: 8px;
        }
        .panel-section select {
            width: 100%;
            padding: 6px;
            background: #222;
            border: 1px solid #444;
            color: #fff;
            font-size: 13px;
            border-radius: 4px;
        }
        .panel-section select:focus {
            outline: none;
            border-color: #0d9488;
            box-shadow: 0 0 8px rgba(13, 148, 136, 0.2);
        }
        .tc-select-btn {
            padding: 6px 16px;
            background: #0d9488;
            border: none;
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
        }
        .tc-select-btn:hover { background: #0f9f8e; box-shadow: 0 0 12px rgba(13, 148, 136, 0.4); }
        .tc-select-btn:active { transform: scale(0.98); }
        .panel-info {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
        }
        .temp-info {
            background: #222;
            border: 1px solid #333;
            border-left: 3px solid #0d9488;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 10px;
            font-size: 14px;
        }
        .temp-info strong {
            color: #0d9488;
            font-size: 16px;
            display: block;
            margin-bottom: 8px;
        }
        .temp-row {
            display: flex;
            justify-content: space-between;
            margin: 6px 0;
            color: #ccc;
        }
        .temp-row .label { color: #aaa; font-weight: 500; }
        .temp-row .value { color: #fff; }
        .panel-footer {
            padding: 12px 16px 16px 16px;
            border-top: 1px solid #333;
            color: #aaa;
            font-size: 12px;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="container">
        <canvas id="canvas"></canvas>
        <div class="panel">
            <div class="panel-header">
                <h3>Viewer Controls</h3>
            </div>
            <div class="panel-section">
                <label for="timeSlider">Timeline</label>
                <input type="range" id="timeSlider" min="0" max="0" value="0">
                <div class="time-display" id="timeDisplay">Time: --:--:--</div>
            </div>
            <div class="panel-section">
                <label for="tcSelect">Select TC</label>
                <div class="tc-select-row">
                    <select id="tcSelect"></select>
                    <button id="tcSelectBtn" class="tc-select-btn">Select</button>
                </div>
            </div>
            <div id="tcInfo" class="panel-info">
                <p style="color: #aaa; font-size: 12px;">No data loaded</p>
            </div>
            <div class="panel-footer">
                <p><strong style="color:#0d9488;">Controls</strong></p>
                <p>Left click + drag → Rotate</p>
                <p>Scroll wheel → Zoom</p>
                <p>Right click + drag → Pan</p>
            </div>
        </div>
    </div>
    <script>
        // ============= CONFIG (matches main.js) =============
        const VIZ_CONFIG = ${JSON.stringify(VIZ_CONFIG)};
        
        // ============= EMBEDDED DATA =============
        const fileData = ${JSON.stringify(fileDataArray)};
        const thermoData = ${JSON.stringify(activeTcsArray)};

        // Helper to pad time components
        function formatTimeStandalone(timeString) {
            if (!timeString) return timeString;
            const parts = timeString.split(':');
            if (parts.length !== 3) return timeString;
            return parts.map(p => p.padStart(2, '0')).join(':');
        }

        // ============= SIMPLE 3D RENDERER =============
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = window.innerWidth - 320;
        canvas.height = window.innerHeight;
        
        let camera = { x: 5, y: 5, z: 5, fov: 45 };
        let cubes = [];
        let rotation = { x: 0.5, y: 0.5 };
        let zoom = 8;
        
        // Create cube data
        thermoData.forEach(tc => {
            cubes.push({
                id: tc.id,
                x: tc.x || 0,
                y: tc.y || 0,
                z: tc.z || 0,
                temp: 25,
                color: '#00ff00'
            });
        });
        
        function rotatePoint(p, rx, ry) {
            // Rotate around X axis
            let y = p.y * Math.cos(rx) - p.z * Math.sin(rx);
            let z = p.y * Math.sin(rx) + p.z * Math.cos(rx);
            
            // Rotate around Y axis
            let x = p.x * Math.cos(ry) + z * Math.sin(ry);
            z = -p.x * Math.sin(ry) + z * Math.cos(ry);
            
            return { x, y, z };
        }
        
        function project(p) {
            const d = Math.max(0.1, p.z + zoom);
            const scale = canvas.height / (2 * d);
            return {
                x: canvas.width / 2 - (p.x * scale),
                y: canvas.height / 2 - (p.y * scale),
                depth: p.z
            };
        }
        
        function drawCube(cube, screenPos) {
            const size = 0.25;
            const scale = canvas.height / (2 * (cube.z + zoom + 0.1));
            const s = size * scale;
            
            ctx.fillStyle = cube.color;
            ctx.fillRect(screenPos.x - s, screenPos.y - s, s * 2, s * 2);
            
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(screenPos.x - s, screenPos.y - s, s * 2, s * 2);
        }
        
        function render() {
            // Clear canvas
            ctx.fillStyle = '#0d0d0f';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw grid
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            const gridSize = 10;
            for (let i = -gridSize; i <= gridSize; i += 2) {
                const p1 = rotatePoint({ x: i, y: 0, z: -gridSize }, rotation.x, rotation.y);
                const p2 = rotatePoint({ x: i, y: 0, z: gridSize }, rotation.x, rotation.y);
                const s1 = project(p1);
                const s2 = project(p2);
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                ctx.stroke();
            }
            
            for (let i = -gridSize; i <= gridSize; i += 2) {
                const p1 = rotatePoint({ x: -gridSize, y: 0, z: i }, rotation.x, rotation.y);
                const p2 = rotatePoint({ x: gridSize, y: 0, z: i }, rotation.x, rotation.y);
                const s1 = project(p1);
                const s2 = project(p2);
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                ctx.stroke();
            }
            
            // Draw axes
            const axisLen = 1;
            const origin = rotatePoint({ x: 0, y: 0, z: 0 }, rotation.x, rotation.y);
            const originS = project(origin);
            
            // X axis (red)
            const xEnd = rotatePoint({ x: axisLen, y: 0, z: 0 }, rotation.x, rotation.y);
            const xEndS = project(xEnd);
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(originS.x, originS.y);
            ctx.lineTo(xEndS.x, xEndS.y);
            ctx.stroke();
            
            // Y axis (green)
            const yEnd = rotatePoint({ x: 0, y: axisLen, z: 0 }, rotation.x, rotation.y);
            const yEndS = project(yEnd);
            ctx.strokeStyle = '#00ff00';
            ctx.beginPath();
            ctx.moveTo(originS.x, originS.y);
            ctx.lineTo(yEndS.x, yEndS.y);
            ctx.stroke();
            
            // Z axis (blue)
            const zEnd = rotatePoint({ x: 0, y: 0, z: axisLen }, rotation.x, rotation.y);
            const zEndS = project(zEnd);
            ctx.strokeStyle = '#0088ff';
            ctx.beginPath();
            ctx.moveTo(originS.x, originS.y);
            ctx.lineTo(zEndS.x, zEndS.y);
            ctx.stroke();
            
            // Draw sorted cubes (painter's algorithm)
            const sorted = cubes.map(cube => {
                const rotated = rotatePoint({ x: cube.x, y: cube.y, z: cube.z }, rotation.x, rotation.y);
                const screen = project(rotated);
                return { ...cube, screen, rotated };
            }).sort((a, b) => a.rotated.z - b.rotated.z);
            
            sorted.forEach(cube => {
                drawCube(cube, cube.screen);
            });
            
            requestAnimationFrame(render);
        }
        
        // ============= INPUT HANDLING =============
        let isDragging = false;
        let lastMousePos = { x: 0, y: 0 };
        
        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = (e.clientX - lastMousePos.x) * 0.01;
            const dy = (e.clientY - lastMousePos.y) * 0.01;
            rotation.y += dx;
            rotation.x -= dy;
            rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, rotation.x));
            lastMousePos = { x: e.clientX, y: e.clientY };
        });
        
        canvas.addEventListener('mouseup', () => { isDragging = false; });
        
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoom = Math.max(1, zoom - e.deltaY * 0.01);
        });
        
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth - 320;
            canvas.height = window.innerHeight;
        });
        
        // ============= UI UPDATES =============
        const timeSliderEl = document.getElementById('timeSlider');
        const tcSelectEl = document.getElementById('tcSelect');
        const tcSelectBtnEl = document.getElementById('tcSelectBtn');

        // Populate TC dropdown (use embedded thermoData IDs or 1-256 fallback)
        function populateExportTcOptions() {
            tcSelectEl.innerHTML = '';
            const ids = thermoData && thermoData.length
                ? thermoData.map(t => t.id).sort((a, b) => a - b)
                : Array.from({ length: 256 }, (_, i) => i + 1);
            ids.forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = 'TC #' + id;
                tcSelectEl.appendChild(opt);
            });
            if (ids.length) tcSelectEl.value = ids[0];
        }

        populateExportTcOptions();
        timeSliderEl.max = Math.max(0, fileData.length - 1);
        timeSliderEl.addEventListener('input', updateVisualization);
        tcSelectBtnEl.addEventListener('click', updateTCHighlight);
        tcSelectEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') updateTCHighlight();
        });
        
        function updateVisualization() {
            const idx = parseInt(timeSliderEl.value);
            if (idx >= fileData.length || !fileData[idx]) return;
            
            const data = fileData[idx];
            document.getElementById('timeDisplay').textContent = 'Time: ' + formatTimeStandalone(data.time);
            
            data.temps.forEach((temp, i) => {
                if (i < cubes.length) {
                    // Use VIZ_CONFIG for consistency
                    const tempRange = VIZ_CONFIG.tempMax - VIZ_CONFIG.tempMin;
                    const t = Math.min(1, Math.max(0, (temp - VIZ_CONFIG.tempMin) / tempRange));
                    
                    // Convert hex colors to RGB
                    const coldR = (VIZ_CONFIG.coldColor >> 16) & 0xFF;
                    const coldG = (VIZ_CONFIG.coldColor >> 8) & 0xFF;
                    const coldB = VIZ_CONFIG.coldColor & 0xFF;
                    
                    const hotR = (VIZ_CONFIG.hotColor >> 16) & 0xFF;
                    const hotG = (VIZ_CONFIG.hotColor >> 8) & 0xFF;
                    const hotB = VIZ_CONFIG.hotColor & 0xFF;
                    
                    const r = Math.round(coldR + (hotR - coldR) * t);
                    const g = Math.round(coldG + (hotG - coldG) * t);
                    const b = Math.round(coldB + (hotB - coldB) * t);
                    
                    // Use VIZ_CONFIG opacity range
                    const opacityRange = VIZ_CONFIG.opacityMax - VIZ_CONFIG.opacityMin;
                    const opacity = VIZ_CONFIG.opacityMin + t * opacityRange;
                    
                    cubes[i].color = \`rgba(\${r}, \${g}, \${b}, \${opacity})\`;
                    cubes[i].temp = temp;
                }
            });
            
            updateTCHighlight();
        }
        
        function updateTCHighlight() {
            const tcId = parseInt(tcSelectEl.value);
            const idx = parseInt(timeSliderEl.value);
            const data = fileData[idx];
            const tc = thermoData.find(t => t.id === tcId);
            const cube = cubes.find(c => c.id === tcId);
            
            if (tc && cube && data && data.temps[tcId - 1] !== undefined) {
                const temp = data.temps[tcId - 1];
                const t = Math.min(1, Math.max(0, (temp - 20) / 15));
                document.getElementById('tcInfo').innerHTML = \`
                    <div class="temp-info" style="border-left-color: \${cube.color}">
                        <strong>TC #\${tcId}</strong><br>
                        <span style="font-size: 13px; color: #0d9488;">\\u{1F321}️ \${temp.toFixed(2)}°C</span><br>
                        <span style="font-size: 11px; color: #aaa;">Position: (\${tc.x.toFixed(1)}, \${tc.y.toFixed(1)}, \${tc.z.toFixed(1)})</span>
                    </div>
                \`;
            }
        }
        
        // Initial render
        render();
        updateVisualization();
    </script>
</body>
</html>`;
}

function exportViewer() {
    if (fileDataArray.length === 0) {
        output.textContent = "No file data loaded. Please select a file first.";
        return;
    }
    
    exportViewerBtn.disabled = true;
    exportViewerBtn.textContent = "📦 Exporting...";
    
    try {
        // Export single self-contained HTML file
        const htmlBlob = new Blob([generateStandaloneHTML()], { type: 'text/html' });
        const htmlUrl = URL.createObjectURL(htmlBlob);
        const htmlLink = document.createElement('a');
        htmlLink.href = htmlUrl;
        htmlLink.download = `heat-cube-viewer-${new Date().toISOString().slice(0, 10)}.html`;
        htmlLink.click();
        URL.revokeObjectURL(htmlUrl);
        
        output.textContent = "✓ Exported: Single interactive HTML file (fully self-contained)";
        exportViewerBtn.textContent = "📦 Export Viewer";
        exportViewerBtn.disabled = false;
        
    } catch (err) {
        console.error('Export failed:', err);
        output.textContent = "Export failed: " + err.message;
        exportViewerBtn.textContent = "📦 Export Viewer";
        exportViewerBtn.disabled = false;
    }
}
exportViewerBtn.addEventListener('click', exportViewer);

async function recordTimeline() {
    if (fileDataArray.length === 0) {
        output.textContent = "No file data loaded. Please select a file first.";
        return;
    }
    
    recordVideoBtn.disabled = true;
    recordVideoBtn.textContent = "⏺️ Recording...";
    
    // Setup video recording
    const canvas = renderer.domElement;
    const stream = canvas.captureStream(30);  // 30 FPS
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    
    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heat-cube-timeline-${new Date().toISOString().slice(0, 10)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        
        recordVideoBtn.disabled = false;
        recordVideoBtn.textContent = "🎬 Record Video";
        output.textContent = "✓ Video exported successfully!";
    };
    
    mediaRecorder.start();
    output.textContent = `Recording... (${fileDataArray.length} frames)`;
    
    // Play through timeline
    for (let i = 0; i < fileDataArray.length; i++) {
        timeSlider.value = i;
        const dataPoint = fileDataArray[i];
        timeLabel.textContent = `Time: ${formatTime(dataPoint.time)}`;
        
        // Update TC temps
        dataPoint.temps.forEach((temp, j) => {
            const tcId = j + 1;
            const tc = activeTcsArray.find(t => t.id === tcId);
            if (tc) {
                tc.tcTemp = temp;
                updateTcVisual(tcId);
            }
        });
        
        syncTcMeshes();
        
        // Wait for render
        await new Promise(resolve => requestAnimationFrame(resolve));
        await sleep(33);  // ~30ms per frame
    }
    
    mediaRecorder.stop();
}

recordVideoBtn.addEventListener('click', recordTimeline);

// ============ TC SIDEBAR FUNCTIONALITY ============
const tcSelectSidebar = document.getElementById('tc-select-sidebar');
const tcSelectBtn = document.getElementById('tc-select-btn');

function populateTcSidebarOptions() {
    if (!tcSelectSidebar) return;
    tcSelectSidebar.innerHTML = '';
    const ids = activeTcsArray.length
        ? activeTcsArray.map(t => t.id).sort((a, b) => a - b)
        : Array.from({ length: 256 }, (_, i) => i + 1);
    ids.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `TC #${id}`;
        tcSelectSidebar.appendChild(opt);
    });
    if (ids.length > 0) {
        tcSelectSidebar.value = ids[0];
    }
}

// Sidebar-only TC selection (UI update, no MCU write)
function selectThermocoupleSidebar() {
    const tcId = parseInt(tcSelectSidebar.value);
    if (tcId >= 1 && tcId <= 256) {
        updateTcSidebarInfo(tcId);
        // If desired later, we can also call selectThermocouple(tcId) to send to MCU
    }
}

// Button click handler
tcSelectBtn.addEventListener('click', selectThermocoupleSidebar);

// Also trigger on Enter key
tcSelectSidebar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        selectThermocoupleSidebar();
    }
});

// Update sidebar when TC data changes
function updateTcSidebarOnDataChange(tcId) {
    if (parseInt(tcSelectSidebar.value) === tcId) {
        updateTcSidebarInfo(tcId);
    }
}

// Initialize sidebar dropdown and info
window.addEventListener('load', () => {
    populateTcSidebarOptions();
    const initialId = parseInt(tcSelectSidebar.value);
    if (!isNaN(initialId)) {
        updateTcSidebarInfo(initialId);
    }
});

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}



