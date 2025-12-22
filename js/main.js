import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { OrbitControls } from './OrbitControls.js';

const choosePortBtn = document.getElementById('choose-port');
const output = document.getElementById('output');
const selectedTcOutput = document.getElementById('selected-tc-output');
const tcDataOutput = document.getElementById('tc-data');

const activeTcsDiv = document.getElementById('active-tcs');
const activeTcsInput = document.getElementById('active-tcs-input');
const sendSelectionBtn = document.getElementById('send-selection-btn');
const errorMsgDiv = document.getElementById('error-msg');

const tcXInput = document.getElementById('tc-x');
const tcYInput = document.getElementById('tc-y');
const tcZInput = document.getElementById('tc-z');
const saveTcPosBtn = document.getElementById('save-tc-pos');

const finishedCalibrationBtn = document.getElementById('finished-calibration-btn');
const tcDataAll = document.getElementById('tc-data-all');

let selectedTc = null;



let initExecuted = false; // track if init function has run

let port;
let writer;

let therocouples = {}; // array to hold Thermocouple objects

// Three.js globals
let scene;
let camera;
let renderer;
let controls;
const tcObjects = {}; // map TC number to THREE.Mesh
const coldColor = new THREE.Color(0x0000ff);
const hotColor = new THREE.Color(0xff0000);


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


// Delay fcn  
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


choosePortBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        output.textContent = "Port selected!";

        // Save USB info in localStorage
        const info = port.getInfo();
        localStorage.setItem('lastPort', JSON.stringify(info));

    } catch (err) {
        output.textContent = "Error selecting port: " + err;
    }
});



window.addEventListener('load', async () => {
    // Step 1: Restore thermocouples
    const savedTcs = localStorage.getItem('thermocouples');
    if (savedTcs) {
        const parsed = JSON.parse(savedTcs);
        for (const tcNum in parsed) {
            therocouples[tcNum] = Object.assign(
                new Thermocouple(tcNum),
                parsed[tcNum]
            );
        }
        console.log("Restored thermocouples from storage:", therocouples);
    }

    initThreeScene();
    syncTcMeshes();

    // Step 2: Get previously granted ports
    const lastPortInfo = JSON.parse(localStorage.getItem('lastPort') || '{}');
    const ports = await navigator.serial.getPorts();

    for (let p of ports) {
        const info = p.getInfo();
        if (info.usbVendorId === lastPortInfo.usbVendorId &&
            info.usbProductId === lastPortInfo.usbProductId) {
            
            port = p;
            output.textContent = "Previously used port detected. Auto-connecting...";

            try {
                // Small delay before opening
                await sleep(100);

                // Open the port
                await port.open({ baudRate: 115200 });
                writer = port.writable.getWriter();

                // Small delay after opening
                await sleep(100);

                // Send reset to clear init flag
                await writer.write(new TextEncoder().encode("reset\n"));
                console.log("Sent reset command to MCU");

                // Small delay before init
                await sleep(100);

                // Send init
                await writer.write(new TextEncoder().encode("init\n"));
                console.log("Sent init command to MCU");

                output.textContent = "Connected and MCU initialized!";

                // Start the reader loop
                startReaderLoop();

            } catch (err) {
                output.textContent = "Error auto-connecting: " + err;
                console.error(err);
            }

            break;
        }
    }
});


// Refactor your reader loop into a function so you can call it on connect or auto-connect
async function startReaderLoop() {
    const textStream = port.readable.pipeThrough(new TextDecoderStream());
    const reader = textStream.getReader();

    let buffer = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        let lines = buffer.split('\n');
        buffer = lines.pop();

        for (let line of lines) {
            line = line.trim();

            if (line === "init_executed") initExecuted = true;

            if (initExecuted && line.startsWith("Active TCs:")) {
                const numbers = line.match(/\d+/g);
                if (numbers) {
                    activeTcsArray = numbers.map(n => n.trim());
                    activeTcsDiv.textContent = activeTcsArray.join(', ');

                    for (let tcNum of activeTcsArray) {
                        if (!therocouples[tcNum]) {
                            therocouples[tcNum] = new Thermocouple(tcNum);
                        }
                    }

                    //syncTcMeshes();
                }
            }

            if (line.startsWith("TC_Probe") && initExecuted) {
                tcDataOutput.textContent = line;
            }


            console.log("Received line:", line);
            if(line.startsWith("TC")) {
              // Example line: "TC 1: 26.25"
              const match = line.match(/TC (\d+): ([\d.]+)/);
              if(match) {
                  const tcNum = parseInt(match[1]);
                  const temp = parseFloat(match[2]);


                  therocouples[tcNum].update(temp);
                  updateTcVisual(tcNum);

                  // Optional: update UI
                  const tcDiv = document.getElementById(`tc${tcNum}`);
                  if(tcDiv) {
                      tcDiv.textContent = `TC ${tcNum}: ${temp} °C`;
                  }

                  console.log(`Updated TC ${tcNum}: ${temp}`);
              }

              // Update all TC data display
              let allData = '';     
              for (const tcNum in therocouples) {
                  const tc = therocouples[tcNum];
                  allData += `TC ${tcNum}: ${tc.tcTemp} °C\n`;
              }
              tcDataAll.textContent = allData;
            }
        }

        if (initExecuted) {
            output.textContent = `✅ Thermocouples initialized!\nActive TCs: ${activeTcsArray.join(', ')}`;
        } else {
            output.textContent = "Not initialized";
        }
    }

    reader.releaseLock();
}

// Helper to send reset command
async function sendReset() {
    if (writer) {
        try {
            await writer.write(new TextEncoder().encode("reset\n"));
            console.log("Sent reset command to MCU");
        } catch (err) {
            console.error("Error sending reset:", err);
        }
    }
}


// When user clicks "Send Selection"
sendSelectionBtn.addEventListener('click', async () => {
    const userInput = activeTcsInput.value.trim();
    const userInputNum = parseInt(userInput, 10);
    const activeTcsNums = activeTcsArray.map(n => parseInt(n, 10));

    console.log(`User selected TC: ${userInput}`);
    console.log(`Available TCs: ${activeTcsNums.join(', ')}`);

    // Validate selection
    if (!activeTcsNums.includes(userInputNum)) {
        errorMsgDiv.textContent = `Invalid TC! Choose from: ${activeTcsNums.join(', ')}`;
        return;
    }

    errorMsgDiv.textContent = ''; // clear error

    if (writer) {
        await writer.write(new TextEncoder().encode(`${userInput}\n`));
        console.log(`Sent TC ${userInput} to MCU`);

        // Update output to show the selected thermocouple
        selectedTcOutput.textContent = `Selected: ${userInput}`;
        selectedTc = userInput;
    }
});

saveTcPosBtn.addEventListener('click', () => {
    if (!selectedTc) {
        alert("Select a thermocouple first");
        return;
    }

    const tc = therocouples[selectedTc];
    if (!tc) return;

    tc.x = parseFloat(tcXInput.value);
    tc.y = parseFloat(tcYInput.value);
    tc.z = parseFloat(tcZInput.value);

    // ✅ persist
    localStorage.setItem('thermocouples', JSON.stringify(therocouples));

    syncTcMeshes();

    console.log(`Saved position for TC ${selectedTc}:`, tc);
});

finishedCalibrationBtn.addEventListener('click', async () => {
    if (!writer) {
        output.textContent = "Port not open!";
        return;
    }

    try {
        // Tell MCU to start measuring
        await writer.write(new TextEncoder().encode("measure\n"));
        console.log("Sent 'measure' command to MCU");

        output.textContent = "Calibration finished. MCU measuring temperatures...";
    } catch (err) {
        console.error("Error sending measure command:", err);
        output.textContent = "Error sending measure command: " + err;
    }
});

// On load, restore thermocouples from localStorage

const savedTcs = localStorage.getItem('thermocouples');
if (savedTcs) {
    const parsed = JSON.parse(savedTcs);

    for (const tcNum in parsed) {
        therocouples[tcNum] = Object.assign(
            new Thermocouple(tcNum),
            parsed[tcNum]
        );
    }

    console.log("Restored thermocouples from storage:", thermocouples);
}




function initThreeScene() {
    const container = document.getElementById('three-container');
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d0f);

    const { clientWidth, clientHeight } = container;
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
    if (!scene) return;

    const width = 0.5;
    const depth = 0.5;

    for (let tcNum in therocouples) {
        const tc = therocouples[tcNum];
        let cube = tcObjects[tcNum];

        if (!cube) {
            const geometry = new THREE.BoxGeometry(width, 0.5, depth);
            const material = new THREE.MeshStandardMaterial({ color: coldColor });
            cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
            tcObjects[tcNum] = cube;
        }

        cube.position.set(tc.x || 0, tc.y || 0, tc.z || 0);

        updateTcVisual(tcNum);
    }
}

function updateTcVisual(tcNum) {
    const cube = tcObjects[tcNum];
    const tc = therocouples[tcNum];
    if (!cube || !tc) return;

    const temp = tc.tcTemp;
    if (typeof temp === 'number') {
        const t = Math.min(1, Math.max(0, (temp - 20) / (30 - 20))); // clamp 25-30 °C
        const color = new THREE.Color().lerpColors(coldColor, hotColor, t);
        cube.material.color.copy(color);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}
