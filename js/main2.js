import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { OrbitControls } from './OrbitControls.js';

const output = document.getElementById('status-output');
const choosePortBtn = document.getElementById('choose-port');
const sendSelectionBtn = document.getElementById('send-selection-btn');
const selectedTc = document.getElementById('selected-tc');
const tcData = document.getElementById('tc-data');
const finishedCalibrationBtn = document.getElementById('finished-calibration-btn');
const statusBtn = document.getElementById('status-btn');
const fileDropdown = document.getElementById('file-dropdown');
const selectFileBtn = document.getElementById('select-file-btn');
const timeSlider = document.getElementById('time-slider');
const timeLabel = document.getElementById('time-label');

const selector = document.getElementById('active-tcs-dropdown');

// Storage for file data
let fileDataArray = []; // Array of {time: "15:36:03", temps: [2047.75, 22.75, ...]}

const positionOutput = document.getElementById('position-tc');


const savePositionBtn = document.getElementById('save-position-btn');
const uploadPositionBtn = document.getElementById('upload-position-btn');

const setPositionBtn = document.getElementById('set-position-btn');
const posXInput = document.getElementById('pos-x');
const posYInput = document.getElementById('pos-y');
const posZInput = document.getElementById('pos-z');


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
            writer.releaseLock();
        } catch (_) {}
        writer = null;
    }

    if (port) {
        try {
            await port.close();
        } catch (_) {}
        port = null;
    }
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
                console.log("MCU:", line);
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
                    console.log("Received FILES data from MCU:", line);
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
                        
                        output.textContent = `Found ${files.length} file(s)`;
                    } else {
                        fileDropdown.innerHTML = '<option value="" disabled selected>No files available</option>';
                        output.textContent = "No files found on device";
                    }
                }

                if(line.startsWith("FILE_DATA:")) {
                    const data = line.substring(10); // Get everything after "FILE_DATA:"
                    const parts = data.split(',');
                    
                    if(parts.length > 1) {
                        const time = parts[0];
                        const temps = parts.slice(1).map(t => parseFloat(t));
                        
                        fileDataArray.push({ time, temps });
                        console.log(`Stored data point: ${time}, temps:`, temps);
                        
                        // Update slider range
                        timeSlider.max = fileDataArray.length - 1;
                        timeSlider.value = fileDataArray.length - 1;
                        timeSlider.disabled = false;
                        timeLabel.textContent = `Time: ${time}`;
                        
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
            await sleep(100);
        }

        console.log("Attempting to open port with baudRate 115200...");
        await p.open({ baudRate: 115200 });
        console.log("Port opened successfully");

        writer = p.writable.getWriter();
        output.textContent = "Port opened! Sending status command...";

        await sleep(200);
        await writer.write(new TextEncoder().encode("status\n"));
        console.log("Sent status command");

        port = p;  // Assign the current port
        startReaderLoop();

    } catch (err) {
        console.error("Error opening port:", err.message);
        output.textContent = "Error opening port: " + err.message;
    }
}


// Attempt auto-connect to last used port
async function tryAutoConnect() {
    const lastPortInfo = JSON.parse(localStorage.getItem('lastPort') || '{}');
    if (!lastPortInfo.usbVendorId || !lastPortInfo.usbProductId) return;

    const ports = await navigator.serial.getPorts();
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
}

function loadSaveStates() {
    // 1️⃣ Load calibrationFinished state
    calibrationFinished = JSON.parse(localStorage.getItem('calibrationFinished') || 'false');
    finishedCalibrationBtn.textContent = calibrationFinished
        ? "Enter Calibration Mode"
        : "Finish Calibration";

    // 2️⃣ Load thermocouples
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

    // 3️⃣ Update dropdown
    populateActiveTcsArray();

    // 4️⃣ Sync 3D meshes if scene is ready
    if (scene) {
        syncTcMeshes();
    }

    console.log("Loaded saved states:", { calibrationFinished, activeTcsArray });
}


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
    
    const message = `SAVE_POSITIONS:${positionData}\n`;
    await writer.write(new TextEncoder().encode(message));
    console.log("Sent all positions:", message.trim());
    
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
    
    const selectedFile = fileDropdown.value;
    if(!selectedFile) {
        console.warn("No file selected in dropdown");
        output.textContent = "Please select a file from the dropdown.";
        return;
    }
    
    // Clear previous file data
    fileDataArray = [];
    timeSlider.value = 0;
    timeSlider.max = 0;
    timeSlider.disabled = true;
    timeLabel.textContent = "Time: --:--:--";
    
    const message = `FILE_SELECTED:${selectedFile}\n`;
    await writer.write(new TextEncoder().encode(message));
    console.log("Sent FILE_SELECTED:", selectedFile);
    output.textContent = `Loading file: ${selectedFile}`;
});

timeSlider.addEventListener('input', () => {
    const index = parseInt(timeSlider.value);
    if(index >= 0 && index < fileDataArray.length) {
        const dataPoint = fileDataArray[index];
        timeLabel.textContent = `Time: ${dataPoint.time}`;
        
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
    console.log("Finished Calibration clicked, sending 'measure' to MCU");

    if(!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before changing calibration mode.";
        return;
    }

    calibrationFinished = !calibrationFinished;
    localStorage.setItem('calibrationFinished', JSON.stringify(calibrationFinished));

    if(calibrationFinished) {
        console.log("Calibration finished, sending 'measure' command");
        await writer.write(new TextEncoder().encode("calibrate\n"));
        finishedCalibrationBtn.textContent = "Finish Calibration";
    } else {
        await writer.write(new TextEncoder().encode("measure\n"));
        finishedCalibrationBtn.textContent = "Enter Calibration Mode";
    }
    
    syncTcMeshes();

});

// On load, attempt auto-connect
window.addEventListener('load', async () => {
    loadSaveStates();
    initThreeScene();
    syncTcMeshes();
    await sleep(200);
    await closeCurrentPort();
    console.log("Page loaded. Trying auto-connect...");
    await tryAutoConnect();
 
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

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    scene.add(new THREE.GridHelper(10, 10));
    scene.add(new THREE.AxesHelper(1.5));

    // Add click event listener for cube selection
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
    renderer.domElement.style.cursor = 'default';

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
        // Reset emissive to remove brightness
        hoveredCube.material.emissive.setHex(0x000000);
        hoveredCube.material.emissiveIntensity = 0;
        hoveredCube = null;
        renderer.domElement.style.cursor = 'default';
    }

    // Apply hover effect to new cube
    if (intersects.length > 0) {
        hoveredCube = intersects[0].object;
        hoveredCube.scale.set(1.15, 1.15, 1.15);
        // Add brightness by setting emissive color
        hoveredCube.material.emissive.copy(hoveredCube.material.color);
        hoveredCube.material.emissiveIntensity = 0.3;
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

    console.log('Syncing TC meshes. Active TCs:', activeTcsArray.length);
    const width = 0.5;
    const depth = 0.5;

    for (let tc of activeTcsArray) {
        const key = tc.id;
        let cube = tcObjects[key];

        if (!cube) {
            console.log('Creating cube for TC', key);
            const geometry = new THREE.BoxGeometry(width, 0.5, depth);
            const material = new THREE.MeshStandardMaterial({ color: coldColor });
            cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
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
        const t = Math.min(1, Math.max(0, (temp - 20) / (30 - 20)));
        const color = new THREE.Color().lerpColors(coldColor, hotColor, t);
        cube.material.color.copy(color);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}


