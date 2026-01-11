import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { OrbitControls } from './OrbitControls.js';

const output = document.getElementById('status-output');
const choosePortBtn = document.getElementById('choose-port');
const sendSelectionBtn = document.getElementById('send-selection-btn');
const selectedTc = document.getElementById('selected-tc');
const tcData = document.getElementById('tc-data');
const finishedCalibrationBtn = document.getElementById('finished-calibration-btn');
const statusBtn = document.getElementById('status-btn');

const selector = document.getElementById('active-tcs-dropdown');

const positionOutput = document.getElementById('position-tc');

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
const coldColor = new THREE.Color(0x0000ff);
const hotColor = new THREE.Color(0xff0000);

async function closeCurrentPort(sendRefresh = false) {
    try {
        if (writer && sendRefresh) {
            await writer.write(new TextEncoder().encode("refresh\n"));
        }
    } catch (err) {
        console.warn("Failed to send refresh before closing:", err);
    }

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

                if(line.startsWith("TC_Probe")) {
                    tcData.textContent = line
                    console.log(line);
                }

                if(line.startsWith("TC: ")) {
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



statusBtn.addEventListener('click', async () => {
    if(writer) {
        await writer.write(new TextEncoder().encode("status\n"));
        console.log("Sent status command");
        console.log("activeTcsArray:", activeTcsArray); 
    }
});

sendSelectionBtn.addEventListener('click', async () => {
    if(!writer) {
        console.warn("Writer not ready; connect to the serial port first.");
        output.textContent = "Connect to the serial port before sending a TC.";
        return;
    }
    const selector = document.getElementById('active-tcs-dropdown');
    const selectedId = selector.value; 
    console.log("Selected TC ID:", selectedId);
    selectedTc.textContent = `Selected TC: ${selectedId}`;
    await writer.write(new TextEncoder().encode(`${selectedId}\n`));
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
    console.log("Page loaded. Trying auto-connect...");
    await tryAutoConnect();
 
});

// On unload, send refresh command
window.addEventListener('beforeunload', async () => {
    console.log("Page unloading")
    await closeCurrentPort(true);
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
