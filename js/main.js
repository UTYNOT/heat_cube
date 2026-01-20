import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js';
import { OrbitControls } from './OrbitControls.js';
import { logger } from './logger.js';
import { VIZ_CONFIG, CalibrationConfig, UART_CONFIG } from './config.js';
import { formatTime, sleep, throttle } from './utils.js';
import { Thermocouple } from './thermocouple.js';
import { UARTHelper } from './uart-helper.js';


// ============ LOGGING SYSTEM ============
// Logger is now imported from logger.js
// Expose logger to window for quick console commands
window.setLogLevel = (level) => logger.setLogLevel(level);
window.getLogger = () => logger;
window.logDebug = (...args) => logger.debug(...args);
window.logInfo = (...args) => logger.info(...args);
window.logWarn = (...args) => logger.warn(...args);
window.logError = (...args) => logger.error(...args);

// ============ SERIAL COMMUNICATION ============


// ============ 3D VISUALIZATION CLASS ============
class Visualization3D {
    constructor(containerId, config) {
        this.config = config;
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.tcObjects = {};
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredCube = null;
        this.lastMeshSyncTime = 0;
        this.MESH_SYNC_THROTTLE_MS = 100;
        this.lastActiveTcsArray = [];
        this.lastSelectedTcId = null;
        this.lastCalibrationMode = true;
    }

    init() {
        if (!this.container) {
            logger.error('Container not found!');
            return;
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d0d0f);

        const { clientWidth, clientHeight } = this.container;
        this.camera = new THREE.PerspectiveCamera(45, clientWidth / clientHeight, 0.1, 100);
        this.camera.position.set(5, 5, 5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(clientWidth, clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 0.5, 0);
        this.controls.update();

        this.restoreCameraState();

        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambient);

        const dir = new THREE.DirectionalLight(0xffffff, 1.0);
        dir.position.set(5, 10, 7);
        this.scene.add(dir);

        this.scene.add(new THREE.GridHelper(10, 10));
        this.scene.add(new THREE.AxesHelper(1.5));

        this.renderer.domElement.addEventListener('click', (e) => this.onCanvasClick(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.renderer.domElement.style.cursor = 'default';

        this.controls.addEventListener('change', () => this.saveCameraState());
        window.addEventListener('resize', () => this.onWindowResize());

        this.animate();
    }

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        const { clientWidth, clientHeight } = this.container;
        this.camera.aspect = clientWidth / clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(clientWidth, clientHeight);
    }

    onCanvasMouseMove(event) {
        if (!this.camera || !this.scene || !this.renderer) return;

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const cubes = Object.values(this.tcObjects);
        const intersects = this.raycaster.intersectObjects(cubes);

        if (this.hoveredCube) {
            this.hoveredCube.scale.set(1, 1, 1);
            this.hoveredCube = null;
            this.renderer.domElement.style.cursor = 'default';
        }

        if (intersects.length > 0) {
            this.hoveredCube = intersects[0].object;
            this.hoveredCube.scale.set(1.15, 1.15, 1.15);
            this.renderer.domElement.style.cursor = 'pointer';
        }
    }

    onCanvasClick(event) {
        if (!this.camera || !this.scene) return;

        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const cubes = Object.values(this.tcObjects);
        const intersects = this.raycaster.intersectObjects(cubes);

        if (intersects.length > 0) {
            const clickedCube = intersects[0].object;
            for (const [id, cube] of Object.entries(this.tcObjects)) {
                if (cube === clickedCube) {
                    return parseInt(id);
                }
            }
        }
        return null;
    }

    syncTcMeshes(activeTcsArray, selectedTcId, isCalibrationMode = true) {
        if (!this.scene) return;

        // Cache for animate loop to use
        this.updateActiveTcsCached(activeTcsArray, selectedTcId, isCalibrationMode);

        for (const tc of activeTcsArray) {
            let cube = this.tcObjects[tc.id];
            if (!cube) {
                const geometry = new THREE.BoxGeometry(
                    this.config.cubeSize, 
                    this.config.cubeSize, 
                    this.config.cubeSize
                );
                const material = new THREE.MeshBasicMaterial({ 
                    color: this.config.coldColor 
                });
                cube = new THREE.Mesh(geometry, material);
                this.scene.add(cube);
                this.tcObjects[tc.id] = cube;
            }

            cube.position.set(tc.x || 0, tc.y || 0, tc.z || 0);
            this.updateTcVisual(tc, selectedTcId, isCalibrationMode);
        }
    }

    updateTcVisual(tc, selectedTcId, isCalibrationMode = true) {
        const cube = this.tcObjects[tc.id];
        if (!cube || !tc || !cube.material) return;

        const isSelected = selectedTcId === tc.id;
        const isHovered = cube === this.hoveredCube;
        const temp = tc.tcTemp;
        
        if (typeof temp !== 'number') return;

        const tempRange = this.config.tempMax - this.config.tempMin;
        const t = Math.min(1, Math.max(0, (temp - this.config.tempMin) / tempRange));

        const coldColor = new THREE.Color(this.config.coldColor);
        const hotColor = new THREE.Color(this.config.hotColor);
        const displayColor = new THREE.Color().lerpColors(coldColor, hotColor, t);

        cube.material.color.copy(displayColor);
        cube.material.transparent = true;

        const opacityRange = this.config.opacityMax - this.config.opacityMin;
        
        if (isSelected && isCalibrationMode) {
            // Only scale up, pop, and brighten in calibration mode
            cube.material.opacity = 1.0;
            cube.scale.set(1.3, 1.3, 1.3);
        } else if (isHovered) {
            // Preserve hover effect
            cube.scale.set(1.15, 1.15, 1.15);
            cube.material.opacity = this.config.opacityMin + t * opacityRange;
        } else {
            // In measurement mode or not selected, use normal scale and opacity based on temp only
            cube.material.opacity = this.config.opacityMin + t * opacityRange;
            cube.scale.set(1.0, 1.0, 1.0);
        }
    }

    saveCameraState() {
        if (!this.camera || !this.controls) return;
        const state = {
            camera: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
            target: { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z },
            zoom: this.camera.zoom
        };
        localStorage.setItem('cameraState', JSON.stringify(state));
    }

    restoreCameraState() {
        if (!this.camera || !this.controls) return;
        const saved = localStorage.getItem('cameraState');
        if (!saved) return;
        
        try {
            const state = JSON.parse(saved);
            this.camera.position.set(state.camera.x, state.camera.y, state.camera.z);
            this.controls.target.set(state.target.x, state.target.y, state.target.z);
            this.camera.zoom = state.zoom;
            this.camera.updateProjectionMatrix();
            this.controls.update();
        } catch (err) {
            logger.warn('Failed to restore camera state:', err);
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.controls) this.controls.update();
        
        // Throttle visual updates to prevent lag from high-frequency temp data
        const now = Date.now();
        if (now - this.lastMeshSyncTime >= this.MESH_SYNC_THROTTLE_MS) {
            this.lastMeshSyncTime = now;
            // Update all TC visuals in a batch once per throttle interval
            for (const tc of this.lastActiveTcsArray) {
                if (this.tcObjects[tc.id]) {
                    this.updateTcVisual(tc, this.lastSelectedTcId, this.lastCalibrationMode);
                }
            }
        }
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    updateActiveTcsCached(activeTcsArray, selectedTcId, isCalibrationMode) {
        this.lastActiveTcsArray = activeTcsArray;
        this.lastSelectedTcId = selectedTcId;
        this.lastCalibrationMode = isCalibrationMode;
    }
}

// ============ SYSTEM CLASS (Main Application) ============
class HeatCubeSystem {
    constructor() {
        this.helper = null;
        this.activeTcsArray = [];
        this.calibrationFinished = false;
        this.fileDataArray = [];
        this.isLoadingFile = false;
        this.fileLoadTimeout = null;
        this.filesReceived = false;
        
        // Calibration state
        this.referenceBaseline = null;
        this.referenceTimestamp = 0;
        this.currentCalibrateBatch = {};
        this.previousTcTemps = {};
        
        // User interaction tracking
        this.userSelectedTc = false; // Track if user manually selected a TC
        this.lastSentTcId = null; // Track the last TC ID sent over UART to prevent duplicates
        this.waitingForProbeId = null; // TC ID we're waiting for a probe response for
        this.probeRequestInterval = null; // Interval for repeatedly sending TC ID until probe received
        this.waitingForPositionAck = false; // Track if we're waiting for position ack (TC_Probe after Set Position)
        this.positionAckInterval = null; // Interval for repeatedly sending '0' until TC_Probe received
        this.positionAckTimeoutId = null; // Timeout ID for stopping position ack when TC_Probe stops
        this.connectionHealthCheckInterval = null; // Interval for checking connection health
        this.lastDataReceivedTime = null; // Timestamp of last data received

        // UI Elements
        this.initUIElements();
        
        // 3D Visualization
        this.viz3D = new Visualization3D('three-container', VIZ_CONFIG);
        
        // Event listeners
        this.setupEventListeners();
    }

    initUIElements() {
        this.elements = {
            output: document.getElementById('status-output'),
            choosePortBtn: document.getElementById('choose-port'),
            sendSelectionBtn: document.getElementById('send-selection-btn'),
            selectedTc: document.getElementById('selected-tc'),
            tcData: document.getElementById('tc-data'),
            finishedCalibrationBtn: document.getElementById('finished-calibration-btn'),
            statusBtn: document.getElementById('status-btn'),
            fileDropdown: document.getElementById('file-dropdown'),
            selectFileBtn: document.getElementById('select-file-btn'),
            recordVideoBtn: document.getElementById('record-video-btn'),
            exportViewerBtn: document.getElementById('export-viewer-btn'),
            timeSlider: document.getElementById('time-slider'),
            timeLabel: document.getElementById('time-label'),
            selector: document.getElementById('active-tcs-dropdown'),
            positionOutput: document.getElementById('position-tc'),
            savePositionBtn: document.getElementById('save-position-btn'),
            uploadPositionBtn: document.getElementById('upload-position-btn'),
            setPositionBtn: document.getElementById('set-position-btn'),
            posXInput: document.getElementById('pos-x'),
            posYInput: document.getElementById('pos-y'),
            posZInput: document.getElementById('pos-z'),
            fullscreenBtn: document.getElementById('fullscreen-btn'),
            viewerPanel: document.getElementById('viewer-panel'),
            tcSelectSidebar: document.getElementById('tc-select-sidebar'),
            tcSelectBtn: document.getElementById('tc-select-btn')
        };
        
        this.elements.selectFileBtn.disabled = true;
    }

    setupEventListeners() {
        this.elements.choosePortBtn.addEventListener('click', () => this.handleChoosePort());
        this.elements.statusBtn.addEventListener('click', () => this.handleStatus());
        // No UI wiring for reload suppression per request
        this.elements.sendSelectionBtn.addEventListener('click', () => this.handleSendSelection());
        this.elements.finishedCalibrationBtn.addEventListener('click', () => this.handleToggleCalibration());
        this.elements.selectFileBtn.addEventListener('click', () => this.handleSelectFile());
        this.elements.savePositionBtn.addEventListener('click', () => this.handleSavePosition());
        this.elements.uploadPositionBtn.addEventListener('click', () => this.handleUploadPosition());
        this.elements.setPositionBtn.addEventListener('click', () => this.handleSetPosition());
        this.elements.timeSlider.addEventListener('input', () => this.handleTimeSlider());
        this.elements.fullscreenBtn.addEventListener('click', () => this.handleFullscreen());
        this.elements.exportViewerBtn.addEventListener('click', () => this.handleExportViewer());
        this.elements.recordVideoBtn.addEventListener('click', () => this.handleRecordVideo());
        this.elements.tcSelectBtn.addEventListener('click', () => this.handleTcSelectSidebar());
        
        // Track if we're programmatically changing the dropdown (to prevent change event from interfering)
        this.isProgrammaticDropdownChange = false;
        
        // Dropdown change event - only update UI, don't send over UART (button click sends it)
        this.elements.selector.addEventListener('change', (e) => {
            // Skip if this is a programmatic change from cube click
            if (this.isProgrammaticDropdownChange) {
                this.isProgrammaticDropdownChange = false;
                return;
            }
            
            const tcId = parseInt(e.target.value);
            if (!isNaN(tcId)) {
                this.userSelectedTc = true;
                // Update UI elements only - don't send over UART
                this.elements.selectedTc.textContent = `Selected TC: ${tcId}`;
                
                const tc = this.activeTcsArray.find(t => t.id === tcId);
                if (tc) {
                    this.elements.posXInput.value = tc.x || 0;
                    this.elements.posYInput.value = tc.y || 0;
                    this.elements.posZInput.value = tc.z || 0;
                }
                
                this.viz3D.syncTcMeshes(this.activeTcsArray, tcId, !this.calibrationFinished);
            }
        });
        
        // Canvas click handler will be set up after viz3D is initialised
    }

    async init() {
        this.loadReferenceBaseline();
        this.loadFileData();
        this.loadSaveStates();
        this.viz3D.init();
        
        // Set up canvas click handler after initialisation
        if (this.viz3D.renderer) {
            this.viz3D.renderer.domElement.addEventListener('click', async (e) => {
                const tcId = this.viz3D.onCanvasClick(e);
                if (tcId) {
                    // Mark as programmatic change to prevent dropdown change event from interfering
                    this.isProgrammaticDropdownChange = true;
                    // Set dropdown to reflect clicked cube
                    this.elements.selector.value = tcId;
                    this.userSelectedTc = true;
                    // Update display, visuals, and send to MCU (selectThermocouple handles UART send)
                    // Use the actual clicked tcId, not the dropdown value
                    await this.selectThermocouple(tcId, true);
                }
            });
        }
        
        this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
        
        await sleep(500);
        await this.tryAutoConnect();

        // Populate local TemperatureData files instead of requesting from MCU
        await this.loadLocalTemperatureFiles();
    }

    // ============ SERIAL PORT MANAGEMENT ============
    // Allows you to select the port from the dropdown menu (UART connection with MCU)
    async handleChoosePort() {
        try {
            const port = await navigator.serial.requestPort(); // Opens the port selection dialog
            const info = port.getInfo(); // Stores the port information
            localStorage.setItem('lastPort', JSON.stringify(info)); // Stores the port information in local storage
            await this.openPort(port); // Opens the port and starts the reader loop..
        } catch (err) { // If an error occurs, log the error and display a message to the user
            logger.error("Error selecting port:", err);
            this.elements.output.textContent = "Error selecting port: " + err;
        }
    }

    async openPort(port) {
        try {
            // Stop health check
            //this.stopConnectionHealthCheck();
            
            // Properly close existing connection first
            if (this.helper) {
                try {
                    await this.helper.close();
                } catch (err) {
                    logger.warn("Error closing existing helper:", err);
                }
                this.helper = null;
            }

            // Ensure port is closed before opening
            try {
                if (port.readable) {
                    // Release any existing reader lock
                    const reader = port.readable.getReader();
                    try {
                        await reader.cancel();
                        await reader.releaseLock();
                    } catch (_) {}
                }
                if (port.writable) {
                    // Release any existing writer lock
                    const writer = port.writable.getWriter();
                    try {
                        await writer.close();
                        await writer.releaseLock();
                    } catch (_) {}
                }
                // Close port if it's already open
                await port.close();
            } catch (err) {
                // Port might not be open, which is fine
                logger.debug("Port close attempt (may not have been open):", err.message);
            }

            // Wait a bit for port to fully close
            await sleep(500);

            // Open port with retries
            let retries = 5;
            let lastError = null;
            while (retries > 0) {
                try {
                    await port.open({ baudRate: 115200 });
                    logger.info(`Port opened successfully (${6 - retries} attempt)`);
                    break;
                } catch (err) {
                    lastError = err;
                    retries--;
                    if (retries > 0) {
                        logger.warn(`Port open attempt failed, retrying in 1s... (${retries} attempts left)`);
                        await sleep(1000);
                    }
                }
            }

            if (retries === 0) {
                throw lastError || new Error("Failed to open port after multiple attempts");
            }

            // Create new helper and writer
            this.helper = new UARTHelper(port);
            this.helper.writer = port.writable.getWriter();
            this.elements.output.textContent = "Port opened! Sending status command...";

            // Wait a bit for port to stabilise
            await sleep(300);
            
            // Send status command to verify connection
            await this.helper.write("status");


            // Start reader loop
            this.startReaderLoop();
            
            // Start connection health monitoring
            //this.startConnectionHealthCheck(); // Start monitoring connection health
            
            logger.info("Serial port connection established successfully");
        } catch (err) {
            logger.error("Error opening port:", err.message);
            this.elements.output.textContent = `Error opening port: ${err.message}. Try clicking "Choose Serial Port" again.`;
            this.helper = null;
            
            // Clean up on error
            try {
                if (port.readable) {
                    const reader = port.readable.getReader();
                    await reader.cancel();
                    await reader.releaseLock();
                }
                if (port.writable) {
                    const writer = port.writable.getWriter();
                    await writer.close();
                    await writer.releaseLock();
                }
                await port.close();
            } catch (cleanupErr) {
                logger.warn("Error during cleanup:", cleanupErr);
            }
        }
    }

    async startReaderLoop() {
        if (!this.helper || !this.helper.port) return;

        // Stop any existing reader loop
        if (this.helper.reader) {
            try {
                await this.helper.reader.cancel();
                await this.helper.reader.releaseLock();
            } catch (err) {
                logger.debug("Error stopping existing reader:", err);
            }
            this.helper.reader = null;
        }

        try {
            const textStream = this.helper.port.readable.pipeThrough(new TextDecoderStream());
            this.helper.reader = textStream.getReader();
        } catch (err) {
            logger.error("Error creating reader:", err);
            return;
        }

        let buffer = '';
        let processingQueue = [];
        let isProcessing = false;
        const MAX_QUEUE_SIZE = 1000; // Prevent memory issues

        // Process queue without blocking
        const processQueue = async () => {
            if (isProcessing || processingQueue.length === 0) return;
            isProcessing = true;
            
            // Process in batches to avoid blocking too long
            const batchSize = 50;
            while (processingQueue.length > 0) {
                const batch = processingQueue.splice(0, batchSize);
                for (const line of batch) {
                    if (line && line.trim()) {
                        this.processLine(line.trim()); // Processes the line of data from the MCU by calling the processLine function
                    }
                }
                // Yield to event loop after each batch
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            isProcessing = false;
        };

        while (true) {
            try {
                const { value, done } = await this.helper.reader.read();
                if (done) break;
                
                buffer += value;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                // Add all lines to queue for batch processing
                for (const line of lines) {
                    if (line.trim()) {
                        // Prevent queue from growing too large
                        if (processingQueue.length >= MAX_QUEUE_SIZE) {
                            logger.warn(`Queue overflow: ${processingQueue.length} items, dropping oldest`);
                            processingQueue.shift(); // Remove oldest
                        }
                        processingQueue.push(line);
                    }
                }

                // Process queue asynchronously (non-blocking)
                if (!isProcessing) {
                    processQueue().catch(err => {
                        logger.warn("Error processing queue:", err);
                    });
                }

            } catch (err) {
                // Handle buffer overrun gracefully - try to recover
                if (err.name === 'BufferOverrunError' || err.message?.includes('overrun')) {
                    logger.warn("Buffer overrun detected, attempting to recover...");
                    // Try to read remaining data
                    try {
                        const { value } = await this.helper.reader.read();
                        if (value) {
                            buffer += value;
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';
                            for (const line of lines) {
                                if (line.trim()) {
                                    processingQueue.push(line);
                                }
                            }
                        }
                    } catch (recoverErr) {
                        logger.error("Recovery failed, restarting reader:", recoverErr);
                        // Restart the reader loop
                        await sleep(100);
                        this.startReaderLoop();
                        return;
                    }
                } else if (err.name === 'NetworkError' || err.message?.includes('device') || err.message?.includes('disconnected')) {
                    // Connection lost - try to reconnect
                    logger.error("Serial port connection lost:", err);
                    this.elements.output.textContent = "Connection lost. Attempting to reconnect...";
                    try {
                        await sleep(1000);
                        // Try to reconnect if we have port info
                        await this.tryAutoConnect();
                    } catch (reconnectErr) {
                        logger.error("Reconnection failed:", reconnectErr);
                        this.elements.output.textContent = "Connection lost. Please click 'Choose Serial Port' to reconnect.";
                    }
                    break;
                } else {
                    logger.debug("Reader stopped:", err);
                    break;
                }
            }
        }

        try {
            this.helper.reader.releaseLock();
        } catch (_) {}
        this.helper.reader = null;
    }

    // startConnectionHealthCheck() {
    //     // Stop any existing health check
    //     if (this.connectionHealthCheckInterval) {
    //         clearInterval(this.connectionHealthCheckInterval);
    //     }
        
    //     this.lastDataReceivedTime = Date.now();
        
    //     // Check connection health every 5 seconds
    //     this.connectionHealthCheckInterval = setInterval(() => {
    //         if (!this.helper || !this.helper.port) {
    //             return;
    //         }
            
    //         const timeSinceLastData = Date.now() - (this.lastDataReceivedTime || 0);
    //         const HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds without data = unhealthy
            
    //         if (timeSinceLastData > HEALTH_CHECK_TIMEOUT) {
    //             logger.warn("Connection appears stale (no data for 10s), attempting to verify...");
    //             // Try to send a status command to verify connection
    //             if (this.helper && this.helper.writer) {
    //                 this.helper.write("status").catch(err => {
    //                     logger.error("Health check failed - connection may be lost:", err);
    //                     this.elements.output.textContent = "Connection appears lost. Please reconnect.";
    //                 });
    //             }
    //         }
    //     }, 5000);
    // }

    // stopConnectionHealthCheck() {
    //     if (this.connectionHealthCheckInterval) {
    //         clearInterval(this.connectionHealthCheckInterval);
    //         this.connectionHealthCheckInterval = null;
    //     }
    // }

    processLine(line) {
        if (!line) return;
        
        // Update last data received time for health check
        this.lastDataReceivedTime = Date.now();
        
        console.log('=== Processing line: ===', line);
        // High-frequency messages that should NOT be logged (even in DEBUG mode)
        const highFrequencyPatterns = [
            "FILE_DATA:",
            "TC_CALIBRATE",
            "TC_Probe",
            /^TC\d+:/,  // TC1:, TC2:, etc.
        ];

        // Check if this is a high-frequency message
        const isHighFrequency = highFrequencyPatterns.some(pattern => {
            if (typeof pattern === 'string') {
                return line.startsWith(pattern);
            } else if (pattern instanceof RegExp) {
                return pattern.test(line);
            }
            return false;
        });

        // Only log non-handled, non-high-frequency messages in DEBUG mode
        if (!isHighFrequency) {
            logger.mcu(line);
        }

        // Process different message types
        if (line.startsWith("Active TCs:")) {
            console.log('=== Active TCs: ===', line);
            this.handleActiveTCs(line);
        } else if (line.startsWith("CalibrationState") || line.startsWith("MeasureState")) {
            this.handleStateChange(line);
        } else if (line.startsWith("FILES:")) {
            // Ignore MCU file listing; we use local TemperatureData
            logger.debug('Ignoring MCU FILES list; using local TemperatureData');
        } else if (line.startsWith("SOFTWARE_INIT")) {
            this.handleSoftwareInit();
        } else if (line.toUpperCase().startsWith("SOFTWARE_RESET")) {
            this.handleSoftwareReset();
        } else if (line.startsWith("FILE_DATA:")) {
            this.handleFileData(line);
        } else if (line.startsWith("TC_Probe")) {
            this.handleTCProbe(line);
        } else if (line.startsWith("TC") && line.includes(":")) {
            this.handleTCTemperature(line);
        } else if (line.startsWith("LOAD_POSITIONS:")) {
            this.handleLoadPositions(line);
        } else if (line === "POSITION_ACK") {
            this.handlePositionAck();
        } else if (line === "REQUEST_ALL_POSITIONS") {
            this.handleRequestAllPositions();
        } else if (line.startsWith("REQUEST_POSITIONS:")) {
            this.handleRequestSpecificPositions(line);
        } else if (line.startsWith("TC_CALIBRATE") && line.includes(":")) {
            this.handleTCCalibrate(line);
        } 
    }

    // ============ MESSAGE HANDLERS ============
    handleActiveTCs(line) {
        const numbersString = line.substring(line.indexOf('[') + 1, line.indexOf(']'));
        const incomingIds = numbersString.split(',').map(s => parseInt(s.trim()));

        this.activeTcsArray = this.activeTcsArray.filter(tc => incomingIds.includes(tc.id));
        for (const id of incomingIds) {
            if (!this.activeTcsArray.some(tc => tc.id === id)) {
                this.activeTcsArray.push(new Thermocouple(id));
            }
        }
        
        localStorage.setItem('thermocouples', JSON.stringify(this.activeTcsArray));
        console.log('=== activeTcsArray after handleActiveTCs ===', this.activeTcsArray);
        this.populateActiveTcsDropdown();
        this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
        this.elements.output.textContent = line;
    }

    handleStateChange(line) {
        this.calibrationFinished = line.startsWith("MeasureState");
        this.elements.finishedCalibrationBtn.textContent = this.calibrationFinished
            ? "Enter Calibration Mode"
            : "Finish Calibration";
        localStorage.setItem('calibrationFinished', JSON.stringify(this.calibrationFinished));
    }

    handleFilesList(line) {
        // No-op: we no longer use MCU file lists
    }

    handleSoftwareInit() {
        this.loadSaveStates();
        this.viz3D.init();
        this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
    }

    handleSoftwareReset() {
        this.calibrationFinished = false;
        this.elements.finishedCalibrationBtn.textContent = "Finish Calibration";
        localStorage.setItem('calibrationFinished', JSON.stringify(this.calibrationFinished));
    }

    handleFileData(line) {
        if (!this.isLoadingFile) return;

        const data = line.substring(10);
        const parts = data.split(',');

        if (parts.length > 1) {
            const time = parts[0];
            const temps = parts.slice(1).map(t => parseFloat(t));
            this.fileDataArray.push({ time, temps });

            if (this.fileDataArray.length % 50 === 0) {
                logger.info(`Loading file... ${this.fileDataArray.length} data points loaded`);
            }

            if (this.fileLoadTimeout) clearTimeout(this.fileLoadTimeout);
            this.fileLoadTimeout = setTimeout(() => {
                logger.info(`✓ File loading complete: ${this.fileDataArray.length} total data points`);
                this.isLoadingFile = false;
                this.fileLoadTimeout = null;
                localStorage.setItem('fileDataArray', JSON.stringify(this.fileDataArray));
            }, 2000);

            this.elements.timeSlider.max = this.fileDataArray.length - 1;
            this.elements.timeSlider.value = this.fileDataArray.length - 1;
            this.elements.timeSlider.disabled = false;
            this.elements.timeLabel.textContent = `Time: ${formatTime(time)}`;
            this.elements.output.textContent = `Loaded ${this.fileDataArray.length} data points`;
        }
    }

    handleTCProbe(line) {
        const probeMatch = line.match(/TC_Probe(\d+),\s*Ref\s+Data:\s*([\d.]+),([\d.]+)/);
        
        if (probeMatch) {
            const tcId = parseInt(probeMatch[1]);
            const probeTemp = parseFloat(probeMatch[2]);
            const refTemp = parseFloat(probeMatch[3]);

            // Stop sending if we received the probe we were waiting for
            if (this.waitingForProbeId === tcId) {
                this.stopProbeRequest();
                logger.debug(`Received TC_Probe${tcId} - stopping repeated send`);
            }

            // Reset timeout when TC_Probe is received - keep sending '0' as long as TC_Probe keeps coming
            if (this.waitingForPositionAck) {
                this.resetPositionAckTimeout();
                logger.debug(`Received TC_Probe${tcId} - resetting position ack timeout`);
            }

            const tc = this.activeTcsArray.find(t => t.id === tcId);
            if (tc) {
                tc.update(probeTemp, refTemp);
                this.elements.selectedTc.textContent = `Selected TC: ${tcId}`;
                
                // Don't touch the dropdown - let user control it independently
                
                // Always update position inputs for the probe TC
                this.elements.posXInput.value = tc.x || 0;
                this.elements.posYInput.value = tc.y || 0;
                this.elements.posZInput.value = tc.z || 0;
                this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
                
                // Display formatted probe data in Live Data section (compact layout)
                this.elements.tcData.innerHTML = `
                    <div style="background: #f8f9fa; padding: 8px 10px; border-radius: 6px; border-left: 3px solid var(--primary-blue, #0f5495);">
                        <strong style="color: #0f5495; display: block; margin-bottom: 6px; font-size: 13px;">🌡️ TC #${tcId}</strong>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0; font-family: 'Courier New', monospace; font-size: 12px;">
                            <span style="color: #666;">Probe: <strong style="color: #000;">${probeTemp.toFixed(2)}°C</strong></span>
                            <span style="color: #666; margin-left: 12px;">Ref: <strong style="color: #000;">${refTemp.toFixed(2)}°C</strong></span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin: 4px 0; font-family: 'Courier New', monospace; font-size: 12px;">
                            <span style="color: #666;">Position: <strong style="color: #000;">X:${(tc.x || 0).toFixed(2)} Y:${(tc.y || 0).toFixed(2)} Z:${(tc.z || 0).toFixed(2)} mm</strong></span>
                        </div>
                    </div>
                `;
            }
        } else {
            // Fallback: show raw message if parsing fails
            this.elements.tcData.textContent = line;
        }
    }

    handleTCCalibrate(line) {
        const match = line.match(/TC_CALIBRATE(\d+):\s*([\d.]+)/);
        if (match) {
            const tcId = parseInt(match[1]);
            const temp = parseFloat(match[2]);
            
            this.currentCalibrateBatch[tcId] = temp;
            
            const tcObj = this.activeTcsArray.find(tc => tc.id === tcId);
            if (tcObj) {
                tcObj.update(temp, tcObj.refTemp);
                // Don't call updateTcVisual here - let the render loop handle it
            }
            
            const receivedTCs = Object.keys(this.currentCalibrateBatch)
                .filter(id => parseInt(id) <= CalibrationConfig.NUM_TCS);
            
            if (receivedTCs.length >= CalibrationConfig.NUM_TCS) {
                this.analyzeCalibrationData();
                this.currentCalibrateBatch = {};
            }
        }
    }

    
    handleTCTemperature(line) {
        const match = line.match(/TC(\d+):\s*([\d.]+)/);
        if (match) {
            const tcId = parseInt(match[1]);
            const temp = parseFloat(match[2]);
            
            const tcObj = this.activeTcsArray.find(tc => tc.id === tcId);
            if (tcObj) {
                // HIDDEN: Auto-detection of temperature spikes
                /*
                // Check for high temperature change
                const previousTemp = this.previousTcTemps[tcId];
                if (previousTemp !== undefined) {
                    const tempChange = Math.abs(temp - previousTemp);
                    
                    // If temperature change is above threshold (e.g., 4°C), send TC ID over UART
                    if (tempChange >= CalibrationConfig.THRESHOLD_MIN) {
                        if (this.helper && this.helper.writer) {
                            try {
                                this.helper.write(String(tcId));
                                logger.debug(`High temp change detected on TC ${tcId}: ${tempChange.toFixed(2)}°C - sent to MCU`);
                            } catch (err) {
                                logger.warn(`Failed to send high temp change notification for TC ${tcId}: ${err}`);
                            }
                        }
                    }
                }
                */
                
                // Store previous temp and update
                this.previousTcTemps[tcId] = temp;
                tcObj.update(temp, tcObj.refTemp);
                // Don't call updateTcVisual here - let the render loop handle it
                // This prevents lag from high-frequency temperature updates
            }
        }
    }

    handleLoadPositions(line) {
        const data = line.substring(15);
        
        if (data.startsWith("ERROR")) {
            this.elements.positionOutput.textContent = `Error loading positions: ${data}`;
            return;
        }

        const positions = data.split(';');
        let successCount = 0;

        for (const pos of positions) {
            const parts = pos.trim().split(',');
            if (parts.length === 4) {
                const tcId = parseInt(parts[0]);
                const x = parseFloat(parts[1]);
                const y = parseFloat(parts[2]);
                const z = parseFloat(parts[3]);

                const tc = this.activeTcsArray.find(tc => tc.id === tcId);
                if (tc) {
                    tc.x = x;
                    tc.y = y;
                    tc.z = z;
                    successCount++;
                }
            }
        }

        localStorage.setItem('thermocouples', JSON.stringify(this.activeTcsArray));
        this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
        this.elements.positionOutput.textContent = `Loaded ${successCount} positions from MCU`;
    }

    handlePositionAck() {
        // MCU acknowledged the position-set command
        logger.debug('MCU acknowledged position set');
        // Optionally update UI to show acknowledgment
        if (this.elements.positionOutput) {
            const currentText = this.elements.positionOutput.textContent;
            if (currentText && !currentText.includes('✓')) {
                this.elements.positionOutput.textContent = currentText + ' (✓ MCU acknowledged)';
            }
        }
    }

    async handleRequestAllPositions() {
        // MCU is requesting all positions (count mismatch or missing data)
        logger.warn('MCU requested all positions - resending...');
        this.elements.positionOutput.textContent = 'MCU requested all positions - resending...';
        // Automatically resend all positions
        await this.handleSavePosition();
    }

    async handleRequestSpecificPositions(line) {
        // MCU is requesting specific missing positions
        // Format: REQUEST_POSITIONS:16 or REQUEST_POSITIONS:16,17,18
        const missingIdsStr = line.substring(18); // Get everything after "REQUEST_POSITIONS:"
        const missingIds = missingIdsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        
        if (missingIds.length === 0) {
            logger.warn('MCU requested positions but no valid IDs found');
            return;
        }
        
        logger.warn(`MCU requested specific positions: ${missingIds.join(', ')} - resending...`);
        this.elements.positionOutput.textContent = `MCU requested positions ${missingIds.join(', ')} - resending...`;
        
        // Resend only the requested positions
        if (!this.helper || !this.helper.writer) {
            this.elements.positionOutput.textContent = "Cannot resend: not connected";
            return;
        }
        
        try {
            // Send start command with count and list of missing TC IDs
            const missingIdsStr = missingIds.map(id => String(id)).join(',');
            await this.helper.write(`SAVE_POSITIONS_START:${missingIds.length}:${missingIdsStr}`);
            await sleep(100);
            
            for (const tcId of missingIds) {
                const tc = this.activeTcsArray.find(t => t.id === tcId);
                if (tc) {
                    const positionLine = `SAVE_POSITION:${String(tc.id)},${String(tc.x || 0)},${String(tc.y || 0)},${String(tc.z || 0)}`;
                    console.log(`Resending position for TC ${tcId}:`, positionLine);
                    await this.helper.write(positionLine);
                    logger.debug(`Resent: ${positionLine}`);
                    await sleep(50); // Reduced delay for faster resending
                } else {
                    logger.warn(`TC ${tcId} not found in activeTcsArray`);
                }
            }
            
            // Send done command
            await this.helper.write('SAVE_POSITIONS_DONE');
            await sleep(100);
            
            this.elements.positionOutput.textContent = `Resent ${missingIds.length} missing positions to MCU`;
            logger.info(`Resent ${missingIds.length} missing positions to MCU`);
        } catch (err) {
            logger.error('Error resending positions:', err);
            this.elements.positionOutput.textContent = `Error resending positions: ${err.message}`;
        }
    }

    // ============ CALIBRATION LOGIC ============
    getMostCommonTemp(batch) {
        const validTemps = [];
        for (let tcId = 1; tcId <= CalibrationConfig.NUM_TCS; tcId++) {
            const temp = batch[tcId];
            if (temp !== undefined && temp < CalibrationConfig.VALID_TEMP_MAX) {
                validTemps.push(temp);
            }
        }
        
        if (validTemps.length === 0) return null;
        return validTemps.reduce((acc, temp) => acc + temp, 0) / validTemps.length;
    }

    analyzeCalibrationData() {
        const now = Date.now();
        
        if (!this.referenceBaseline) {
            this.referenceBaseline = this.getMostCommonTemp(this.currentCalibrateBatch);
            if (this.referenceBaseline === null) return;
            this.referenceTimestamp = now;
            this.saveReferenceBaseline();
            return;
        }
        
        const timeSinceRef = (now - this.referenceTimestamp) / 1000;
        const deltas = [];
        
        for (let tcId = 1; tcId <= CalibrationConfig.NUM_TCS; tcId++) {
            const temp = this.currentCalibrateBatch[tcId];
            
            if (temp !== undefined && temp < CalibrationConfig.VALID_TEMP_MAX) {
                const delta = temp - this.referenceBaseline;
                
                if (delta > 0) {
                    const prevTemp = this.previousTcTemps[tcId];
                    if (prevTemp !== undefined) {
                        const tempDrop = prevTemp - temp;
                        if (tempDrop > CalibrationConfig.TEMP_DROP_THRESHOLD) {
                            this.previousTcTemps[tcId] = temp;
                            continue;
                        }
                    }
                    
                    deltas.push({ tcId, delta, temp: temp.toFixed(2) });
                    this.previousTcTemps[tcId] = temp;
                }
            }
        }
        
        const maxChange = deltas.reduce((max, item) => 
            item.delta > max.delta ? item : max, 
            { tcId: 0, delta: -999 }
        );
        
        if (maxChange.tcId > 0) {
            if (maxChange.delta >= CalibrationConfig.THRESHOLD_MIN && 
                maxChange.delta <= CalibrationConfig.THRESHOLD_MAX) {
                // selectThermocouple is async and will send TC ID over UART if changed
                this.selectThermocouple(maxChange.tcId).catch(err => {
                    logger.warn(`Failed to select thermocouple ${maxChange.tcId}:`, err);
                });
            }
        }
        
        if (timeSinceRef >= CalibrationConfig.REFERENCE_UPDATE_INTERVAL / 1000) {
            const newBaseline = this.getMostCommonTemp(this.currentCalibrateBatch);
            this.referenceBaseline = newBaseline;
            this.referenceTimestamp = now;
            this.saveReferenceBaseline();
        }
    }

    loadReferenceBaseline() {
        try {
            const stored = localStorage.getItem('calibrationBaseline');
            const storedTime = localStorage.getItem('calibrationBaselineTime');
            if (stored !== null) {
                this.referenceBaseline = parseFloat(stored);
                this.referenceTimestamp = parseInt(storedTime) || Date.now();
            }
        } catch (err) {
            logger.warn("Failed to load baseline:", err);
        }
    }

    saveReferenceBaseline() {
        try {
            if (this.referenceBaseline !== null && this.referenceBaseline !== undefined) {
                localStorage.setItem('calibrationBaseline', this.referenceBaseline.toString());
                localStorage.setItem('calibrationBaselineTime', this.referenceTimestamp.toString());
            }
        } catch (err) {
            logger.warn("Failed to save baseline:", err);
        }
    }

    // ============ UI HANDLERS ============
    async handleStatus() {
        if (this.helper && this.helper.writer) {

            await this.helper.write("RESET");
            await sleep(1000);

            await this.helper.write("status");

            // Also trigger the local backup endpoint (runs server.js on the backend)
            try {
                this.elements.output.textContent = "Status sent. Triggering SD copy...";
                const resp = await fetch('http://localhost:3001/copy');
                const data = await resp.json().catch(() => null);
                const message = data?.message || `Copy trigger responded with status ${resp.status}`;
                this.elements.output.textContent = message;
                logger.info(message);
            } catch (err) {
                logger.warn('Failed to trigger SD copy backend:', err);
                this.elements.output.textContent = "Status sent. Backup trigger failed (is backend running?)";
            }
        }
    }

    async handleSendSelection() {
        const selectedId = parseInt(this.elements.selector.value);
        if (isNaN(selectedId)) {
            this.elements.output.textContent = "Please select a thermocouple from the dropdown first.";
            return;
        }
        
        // Use selectThermocouple which handles all UI updates and UART sending
        this.userSelectedTc = true;
        await this.selectThermocouple(selectedId, true);
        this.elements.output.textContent = `Sent TC ${selectedId}`;
    }

    stopProbeRequest() {
        // Stop repeatedly sending TC ID when probe is received
        if (this.probeRequestInterval) {
            clearInterval(this.probeRequestInterval);
            this.probeRequestInterval = null;
        }
        this.waitingForProbeId = null;
    }

    stopPositionAck() {
        // Stop repeatedly sending '0' when TC_Probe stops coming
        if (this.positionAckInterval) {
            clearInterval(this.positionAckInterval);
            this.positionAckInterval = null;
        }
        if (this.positionAckTimeoutId) {
            clearTimeout(this.positionAckTimeoutId);
            this.positionAckTimeoutId = null;
        }
        this.waitingForPositionAck = false;
        logger.debug('Stopped position ack - no TC_Probe received');
    }

    resetPositionAckTimeout() {
        // Reset the timeout - TC_Probe was received, so keep sending '0'
        if (this.positionAckTimeoutId) {
            clearTimeout(this.positionAckTimeoutId);
        }
        
        // Set timeout to stop sending if no TC_Probe received for 2 seconds
        this.positionAckTimeoutId = setTimeout(() => {
            logger.debug('No TC_Probe received for 2s - stopping position ack');
            this.stopPositionAck();
        }, 2000); // Stop if no TC_Probe for 2 seconds
    }

    startPositionAck() {
        // Stop any existing position ack sending
        this.stopPositionAck();
        
        if (!this.helper || !this.helper.writer) {
            return;
        }
        
        // Set the flag that we're waiting for position ack
        this.waitingForPositionAck = true;
        
        // Send '0' immediately
        this.helper.write('0').catch(err => {
            logger.warn('Failed to send position ack (0) over UART:', err);
        });
        logger.debug('Sent position ack: 0');
        
        // Start timeout - will stop if no TC_Probe received
        this.resetPositionAckTimeout();
        
        // Set up interval to send repeatedly every 2000ms while TC_Probe keeps coming
        this.positionAckInterval = setInterval(() => {
            if (this.helper && this.helper.writer && this.waitingForPositionAck) {
                this.helper.write('0').catch(err => {
                    logger.warn('Failed to send position ack (0) over UART:', err);
                });
                logger.debug('Repeatedly sending position ack: 0');
            } else {
                // Stop if connection lost
                this.stopPositionAck();
            }
        }, 2000); // Send every 2000ms
    }

    startProbeRequest(tcId) {
        // Stop any existing probe request
        this.stopProbeRequest();
        
        if (!this.helper || !this.helper.writer) {
            return;
        }
        
        // Set the TC ID we're waiting for
        this.waitingForProbeId = tcId;
        
        // Send immediately
        this.helper.write(String(tcId)).catch(err => {
            logger.warn(`Failed to send TC ${tcId} over UART:`, err);
        });
        this.lastSentTcId = tcId;
        
        // Set up interval to send repeatedly every 500ms until probe received
        this.probeRequestInterval = setInterval(() => {
            if (this.helper && this.helper.writer && this.waitingForProbeId === tcId) {
                this.helper.write(String(tcId)).catch(err => {
                    logger.warn(`Failed to send TC ${tcId} over UART:`, err);
                });
                logger.debug(`Repeatedly sending TC selection: ${tcId}`);
            } else {
                // Stop if connection lost or TC changed
                this.stopProbeRequest();
            }
        }, 500); // Send every 500ms
    }

    async selectThermocouple(tcId, forceSend = false) {
        // Updates the "Selected TC:" display and sends TC ID over UART if changed
        this.elements.selectedTc.textContent = `Selected TC: ${tcId}`;
        
        const tc = this.activeTcsArray.find(t => t.id === tcId);
        if (tc) {
            this.elements.posXInput.value = tc.x || 0;
            this.elements.posYInput.value = tc.y || 0;
            this.elements.posZInput.value = tc.z || 0;
        }
        
        this.viz3D.syncTcMeshes(this.activeTcsArray, tcId, !this.calibrationFinished);
        
        // If forceSend is true, start repeatedly sending until probe received
        if (forceSend && this.helper && this.helper.writer) {
            this.startProbeRequest(tcId);
        } else {
            // Send TC ID over UART if it changed and we have a connection (one-time send)
            const shouldSend = this.lastSentTcId !== tcId;
            if (this.helper && this.helper.writer && shouldSend) {
                try {
                    await this.helper.write(String(tcId));
                    this.lastSentTcId = tcId;
                    logger.debug(`Sent TC selection over UART: ${tcId}`);
                } catch (err) {
                    logger.warn(`Failed to send TC ${tcId} over UART:`, err);
                }
            }
        }
    }

    getSelectedTcId() {
        return parseInt(this.elements.selector.value) || 0;
    }

    async handleToggleCalibration() {
        if (!this.helper || !this.helper.writer) {
            this.elements.output.textContent = "Connect to the serial port before changing calibration mode.";
            return;
        }

        this.calibrationFinished = !this.calibrationFinished;
        localStorage.setItem('calibrationFinished', JSON.stringify(this.calibrationFinished));

        if (this.calibrationFinished) {
            await this.helper.write("measure");
            this.elements.finishedCalibrationBtn.textContent = "Enter Calibration Mode";
        } else {
            await this.helper.write("calibrate");
            this.elements.finishedCalibrationBtn.textContent = "Finish Calibration";
        }

        // Refresh visualization with correct calibration mode state
        this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
    }

    async handleSelectFile() {
        const selectedFile = this.elements.fileDropdown.value;
        if (!selectedFile) {
            this.elements.output.textContent = "Please select a file from the dropdown.";
            return;
        }

        if (this.fileLoadTimeout) {
            clearTimeout(this.fileLoadTimeout);
            this.fileLoadTimeout = null;
        }

        this.fileDataArray = [];
        this.isLoadingFile = true;
        this.elements.timeSlider.value = 0;
        this.elements.timeSlider.max = 0;
        this.elements.timeSlider.disabled = true;
        this.elements.timeLabel.textContent = "Time: --:--:--";

        try {
            // Fetch CSV from local TemperatureData folder
            const url = new URL(`../TemperatureData/${selectedFile}`, window.location.href).href;
            const resp = await fetch(url, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`Failed to fetch ${selectedFile} (${resp.status})`);
            const text = await resp.text();

            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            for (const line of lines) {
                const parts = line.split(',').map(s => s.trim());
                if (parts.length > 1) {
                    const time = parts[0];
                    const temps = parts.slice(1).map(t => {
                        const num = parseFloat(t);
                        return isNaN(num) ? null : num;
                    });
                    this.fileDataArray.push({ time, temps });
                }
            }

            // Finalise
            this.isLoadingFile = false;
            localStorage.setItem('fileDataArray', JSON.stringify(this.fileDataArray));
            if (this.fileDataArray.length > 0) {
                this.elements.timeSlider.max = this.fileDataArray.length - 1;
                this.elements.timeSlider.value = this.fileDataArray.length - 1;
                this.elements.timeSlider.disabled = false;
                this.elements.timeLabel.textContent = `Time: ${formatTime(this.fileDataArray[this.fileDataArray.length - 1].time)}`;
                this.elements.output.textContent = `Loaded ${this.fileDataArray.length} data points from ${selectedFile}`;
            } else {
                this.elements.output.textContent = `No data rows found in ${selectedFile}`;
            }
        } catch (err) {
            this.isLoadingFile = false;
            logger.error('Error loading local CSV:', err);
            this.elements.output.textContent = `Error loading file: ${err.message}`;
        }
    }

    async handleSavePosition() {
        if (!this.helper || !this.helper.writer) {
            this.elements.positionOutput.textContent = "Connect to the serial port before saving position.";
            logger.warn('Cannot save positions: helper or writer not available');
            return;
        }
        
        if (this.activeTcsArray.length === 0) {
            this.elements.positionOutput.textContent = 'No thermocouples to save';
            logger.warn('Cannot save positions: activeTcsArray is empty');
            return;
        }
        
        logger.info(`Saving ${this.activeTcsArray.length} positions to MCU...`);
        
        // Send each position line by line with longer delay between sends
        try {
            // Send start command with count and list of expected TC IDs
            const tcIds = this.activeTcsArray.map(tc => String(tc.id)).join(',');
            await this.helper.write(`SAVE_POSITIONS_START:${this.activeTcsArray.length}:${tcIds}`);
            await sleep(100);
            
            for (let i = 0; i < this.activeTcsArray.length; i++) {
                const tc = this.activeTcsArray[i];
                const positionLine = `SAVE_POSITION:${String(tc.id)},${String(tc.x || 0)},${String(tc.y || 0)},${String(tc.z || 0)}`;
                console.log(`Sending position line ${i + 1}/${this.activeTcsArray.length}:`, positionLine);
                await this.helper.write(positionLine);
                logger.debug(`Sent: ${positionLine}`);
                // Reduced delay since MCU now properly handles position saving without interference
                await sleep(50); // 50ms delay - fast enough but gives MCU time to process
            }
            
            // Send done command to signal all positions have been sent
            await this.helper.write('SAVE_POSITIONS_DONE');
            await sleep(100);
            
            this.elements.positionOutput.textContent = `Sent ${this.activeTcsArray.length} positions to MCU (line by line)`;
            logger.info(`Successfully sent ${this.activeTcsArray.length} positions to MCU`);
        } catch (err) {
            logger.error('Error sending positions:', err);
            this.elements.positionOutput.textContent = `Error sending positions: ${err.message}`;
        }
    }

    async loadLocalTemperatureFiles() {
        try {
            this.elements.fileDropdown.innerHTML = '<option value="" disabled selected>Loading files...</option>';
            const resp = await fetch('http://localhost:3001/temperature-data/list');
            const data = await resp.json();
            const files = Array.isArray(data.files) ? data.files : [];
            if (files.length === 0) {
                this.elements.fileDropdown.innerHTML = '<option value="" disabled selected>No files available</option>';
                this.elements.selectFileBtn.disabled = true;
                return;
            }
            this.elements.fileDropdown.innerHTML = '<option value="" disabled selected>Select a file...</option>';
            for (const file of files) {
                const opt = document.createElement('option');
                opt.value = file;
                opt.textContent = file;
                this.elements.fileDropdown.appendChild(opt);
            }
            this.filesReceived = true;
            this.elements.selectFileBtn.disabled = false;
            this.elements.output.textContent = `Found ${files.length} local file(s)`;
        } catch (err) {
            logger.warn('Failed to load local TemperatureData list:', err);
            this.elements.fileDropdown.innerHTML = '<option value="" disabled selected>No files available</option>';
            this.elements.selectFileBtn.disabled = true;
        }
    }

    async handleUploadPosition() {
        if (!this.helper || !this.helper.writer) {
            this.elements.output.textContent = "Connect to the serial port before uploading positions.";
            return;
        }
        
        await this.helper.write(`LOAD_POSITIONS`);
        this.elements.positionOutput.textContent = `Sent load positions request to MCU`;
    }

    async handleSetPosition() {
        if (!this.helper || !this.helper.writer) {
            this.elements.output.textContent = "Connect to the serial port before setting position.";
            return;
        }

        const x = parseFloat(this.elements.posXInput.value) || 0;
        const y = parseFloat(this.elements.posYInput.value) || 0;
        const z = parseFloat(this.elements.posZInput.value) || 0;

        const selectedIdText = this.elements.selectedTc.textContent.split(': ')[1];
        const tcId = parseInt(selectedIdText, 10);

        if (!tcId) {
            this.elements.positionOutput.textContent = "Select a TC before setting position.";
            return;
        }

        const tc = this.activeTcsArray.find(tc => tc.id === tcId);
        if (tc) {
            tc.x = x;
            tc.y = y;
            tc.z = z;
            localStorage.setItem('thermocouples', JSON.stringify(this.activeTcsArray));
            this.elements.positionOutput.textContent = `Saved position for TC ${tcId} with X:${x}, Y:${y}, Z:${z}`;
            this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
        } else {
            this.elements.positionOutput.textContent = "Thermocouple not found.";
        }

        // Send '0' repeatedly over UART until TC_Probe is received
        this.startPositionAck();
    }

    handleTimeSlider() {
        const index = parseInt(this.elements.timeSlider.value);
        if (index >= 0 && index < this.fileDataArray.length) {
            const dataPoint = this.fileDataArray[index];
            this.elements.timeLabel.textContent = `Time: ${formatTime(dataPoint.time)}`;
            
            dataPoint.temps.forEach((temp, i) => {
                const tcId = i + 1;
                const tc = this.activeTcsArray.find(t => t.id === tcId);
                if (tc) {
                    tc.tcTemp = temp;
                }
            });
            
            this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
            const selectedSidebarId = this.elements.tcSelectSidebar ? 
                parseInt(this.elements.tcSelectSidebar.value) : NaN;
            if (!isNaN(selectedSidebarId)) {
                this.updateTcSidebarInfo(selectedSidebarId);
            }
        }
    }

    handleFullscreen() {
        if (!this.elements.viewerPanel) return;
        
        if (!document.fullscreenElement) {
            this.elements.viewerPanel.requestFullscreen().catch(err => {
                logger.error('Fullscreen request failed:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    handleTcSelectSidebar() {
        const tcId = parseInt(this.elements.tcSelectSidebar.value);
        if (tcId >= 1 && tcId <= 256) {
            this.updateTcSidebarInfo(tcId);
        }
    }

    // ============ STATE MANAGEMENT ============
    loadSaveStates() {
        this.calibrationFinished = JSON.parse(localStorage.getItem('calibrationFinished') || 'false');
        this.elements.finishedCalibrationBtn.textContent = this.calibrationFinished
            ? "Enter Calibration Mode"
            : "Finish Calibration";

        const storedTcs = JSON.parse(localStorage.getItem('thermocouples') || '[]');
        this.activeTcsArray = storedTcs.map(tcData => {
            const tc = new Thermocouple(tcData.id);
            tc.tcTemp = tcData.tcTemp;
            tc.refTemp = tcData.refTemp;
            tc.x = tcData.x || 0;
            tc.y = tcData.y || 0;
            tc.z = tcData.z || 0;
            return tc;
        });
        console.log('=== activeTcsArray after loadSaveStates ===', this.activeTcsArray);

        this.populateActiveTcsDropdown();
        if (this.viz3D.scene) {
            this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
        }
    }

    loadFileData() {
        const storedFileData = localStorage.getItem('fileDataArray');
        if (storedFileData) {
            try {
                this.fileDataArray = JSON.parse(storedFileData);
                if (this.fileDataArray.length > 0) {
                    this.elements.timeSlider.max = this.fileDataArray.length - 1;
                    this.elements.timeSlider.value = this.fileDataArray.length - 1;
                    this.elements.timeSlider.disabled = false;
                    this.elements.timeLabel.textContent = `Time: ${formatTime(
                        this.fileDataArray[this.fileDataArray.length - 1].time
                    )}`;
                    this.elements.output.textContent = `Loaded ${this.fileDataArray.length} data points (restored)`;
                }
            } catch (err) {
                logger.warn('Failed to restore file data:', err);
                this.fileDataArray = [];
            }
        } else {
            this.fileDataArray = [];
        }
        this.isLoadingFile = false;
    }

    populateActiveTcsDropdown() {
        // Preserve current selection
        const currentSelection = this.elements.selector.value;
        const currentOptions = new Set(Array.from(this.elements.selector.options).filter(o => o).map(o => o.value));
        const incomingIds = new Set(this.activeTcsArray.filter(tc => tc && tc.id != null).map(tc => tc.id.toString()));
        
        // Only rebuild if the list of TCs actually changed
        if (currentOptions.size === incomingIds.size && 
            Array.from(currentOptions).every(id => incomingIds.has(id))) {
            return; // No change needed
        }
        
        this.elements.selector.innerHTML = '';
        for (const tc of this.activeTcsArray) {
            if (!tc || tc.id == null) continue; // Skip invalid TCs
            const option = document.createElement('option');
            option.value = tc.id;
            option.textContent = `TC ${tc.id}`;
            this.elements.selector.appendChild(option);
        }
        
        // Restore selection if it still exists in the new list
        if (currentSelection && this.activeTcsArray.some(tc => tc.id.toString() === currentSelection)) {
            this.elements.selector.value = currentSelection;
        } else if (this.activeTcsArray.length > 0 && !this.userSelectedTc) {
            // Only auto-select first TC if user hasn't manually selected
            this.elements.selector.value = this.activeTcsArray[0].id;
        }
    }

    // ============ AUTO-CONNECT ============
    async tryAutoConnect() {
        const lastPortInfo = JSON.parse(localStorage.getItem('lastPort') || '{}');
        if (!lastPortInfo.usbVendorId || !lastPortInfo.usbProductId) {
            logger.debug("No previous port info found for auto-connect");
            return;
        }

        // Retry auto-connect with exponential backoff
        const maxRetries = 3;
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                let ports = await navigator.serial.getPorts();
                
                if (ports.length === 0) {
                    // No ports available yet, wait and retry
                    if (retryCount < maxRetries - 1) {
                        logger.debug(`No ports available, retrying auto-connect in ${(retryCount + 1) * 1000}ms...`);
                        await sleep((retryCount + 1) * 1000);
                        retryCount++;
                        continue;
                    } else {
                        logger.debug("No serial ports available for auto-connect");
                        return;
                    }
                }
                
                // Find matching port
                for (const p of ports) {
                    const info = p.getInfo();
                    if (info.usbVendorId === lastPortInfo.usbVendorId &&
                        info.usbProductId === lastPortInfo.usbProductId) {
                        this.elements.output.textContent = "Previously used port detected. Auto-connecting...";
                        await sleep(500); // Give more time before connecting
                        await this.openPort(p);
                        return;
                    }
                }
                
                // Port not found in available ports
                logger.debug("Matching port not found in available ports");
                return;
                
            } catch (err) {
                logger.warn(`Auto-connect attempt ${retryCount + 1} failed:`, err);
                if (retryCount < maxRetries - 1) {
                    await sleep((retryCount + 1) * 1000);
                    retryCount++;
                } else {
                    logger.error("Auto-connect failed after all retries:", err);
                    return;
                }
            }
        }
    }

    // ============ EXPORT FUNCTIONS ============
    updateTcSidebarInfo(tcId) {
        const infoDiv = document.getElementById('tc-sidebar-info');
        const tc = this.activeTcsArray.find(t => t.id === tcId);
        
        if (!tc) {
            infoDiv.innerHTML = '<p style="color: #aaa; font-size: 12px;">TC not found</p>';
            return;
        }
        
        const safeFixed = (val, digits) => {
            if (val === null || val === undefined || isNaN(val)) return 'N/A';
            return parseFloat(val).toFixed(digits);
        };
        
        const temp = safeFixed(tc.tcTemp, 2);
        const refTemp = safeFixed(tc.refTemp, 2);
        const x = safeFixed(tc.x, 2);
        const y = safeFixed(tc.y, 2);
        const z = safeFixed(tc.z, 2);
        
        const tempNum = parseFloat(temp);
        let colorHex = '#00ff00';
        if (!isNaN(tempNum)) {
            const tempRange = VIZ_CONFIG.tempMax - VIZ_CONFIG.tempMin;
            const t = Math.min(1, Math.max(0, (tempNum - VIZ_CONFIG.tempMin) / tempRange));
            
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

    generateStandaloneHTML() {
        // Prepare thermocouple data - extract only serializable properties
        const thermoDataForExport = this.activeTcsArray.map(tc => ({
            id: tc.id,
            x: tc.x || 0,
            y: tc.y || 0,
            z: tc.z || 0,
            tcTemp: tc.tcTemp || null,
            refTemp: tc.refTemp || null
        }));
        
        // Escape backticks and prepare data
        const vizConfigJson = JSON.stringify(VIZ_CONFIG).replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        const fileDataJson = JSON.stringify(this.fileDataArray).replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        const thermoDataJson = JSON.stringify(thermoDataForExport).replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        
        const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Heat Cube Viewer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1115; color: #fff; overflow: hidden; }
        .container { display: flex; height: 100vh; }
        #three-container { flex: 1; height: 100%; background: #0d0d0f; }
        .panel { width: 320px; background: #1a1a1a; border-left: 1px solid #444; display: flex; flex-direction: column; overflow-y: auto; box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3); }
        .panel-header { padding: 16px; border-bottom: 1px solid #333; background: #111; }
        .panel-header h3 { margin: 0; font-size: 16px; color: #0d9488; font-weight: 600; }
        .panel-section { padding: 16px; border-bottom: 1px solid #333; }
        .panel-section label { font-size: 14px; color: #fff; font-weight: 600; display: block; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .panel-section input[type="range"] { width: 100%; cursor: pointer; margin-bottom: 8px; }
        .panel-section .time-display { font-size: 16px; padding: 12px 14px; background: #0a0a0a; border: 1px solid #0d9488; border-radius: 4px; color: #ffffff; font-weight: 600; text-align: center; font-family: 'Courier New', monospace; letter-spacing: 1px; }
        .tc-select-row { display: flex; gap: 8px; }
        .panel-section select { width: 100%; padding: 6px; background: #222; border: 1px solid #444; color: #fff; font-size: 13px; border-radius: 4px; }
        .tc-select-btn { padding: 6px 16px; background: #0d9488; border: none; color: #fff; font-size: 13px; font-weight: 600; border-radius: 4px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .tc-select-btn:hover { background: #0f9f8e; box-shadow: 0 0 12px rgba(13, 148, 136, 0.4); }
        .panel-info { flex: 1; padding: 16px; overflow-y: auto; }
        .tc-info-card { background: #222; border: 1px solid #333; border-left: 3px solid #0d9488; border-radius: 4px; padding: 10px; margin-bottom: 10px; font-size: 14px; }
        .tc-info-card strong { color: #0d9488; font-size: 16px; display: block; margin-bottom: 8px; }
        .tc-info-field { display: flex; justify-content: space-between; margin: 6px 0; color: #ccc; }
        .tc-info-field .label { color: #aaa; font-weight: 500; }
        .tc-info-field .value { color: #fff; font-family: 'Courier New', monospace; }
    </style>
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/"
        }
    }
    </script>
</head>
<body>
    <div class="container">
        <div id="three-container"></div>
        <div class="panel">
            <div class="panel-header"><h3>Viewer Controls</h3></div>
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
        </div>
    </div>
    <script type="module">
        import * as THREE from 'three';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        
        const VIZ_CONFIG = ${vizConfigJson};
        const fileData = ${fileDataJson};
        const thermoData = ${thermoDataJson};
        
        function formatTimeStandalone(timeString) {
            if (!timeString) return timeString;
            const parts = timeString.split(':');
            if (parts.length !== 3) return timeString;
            return parts.map(p => p.padStart(2, '0')).join(':');
        }
        
        // Three.js 3D Visualization Setup
        const container = document.getElementById('three-container');
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0d0d0f);
        
        const { clientWidth, clientHeight } = container;
        const camera = new THREE.PerspectiveCamera(45, clientWidth / clientHeight, 0.1, 100);
        camera.position.set(5, 5, 5);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(clientWidth, clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0.5, 0);
        controls.update();
        
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambient);
        
        const dir = new THREE.DirectionalLight(0xffffff, 1.0);
        dir.position.set(5, 10, 7);
        scene.add(dir);
        
        scene.add(new THREE.GridHelper(10, 10));
        scene.add(new THREE.AxesHelper(1.5));
        
        const tcObjects = {};
        let hoveredCube = null;
        
        // Color mapping helper
        function colorFromTemp(temp) {
            if (temp == null || isNaN(temp)) return new THREE.Color(VIZ_CONFIG.coldColor);
            const tempRange = VIZ_CONFIG.tempMax - VIZ_CONFIG.tempMin;
            const t = Math.min(1, Math.max(0, (temp - VIZ_CONFIG.tempMin) / tempRange));
            const coldColor = new THREE.Color(VIZ_CONFIG.coldColor);
            const hotColor = new THREE.Color(VIZ_CONFIG.hotColor);
            return new THREE.Color().lerpColors(coldColor, hotColor, t);
        }
        
        // Update TC visual
        function updateTcVisual(tc, selectedTcId) {
            const cube = tcObjects[tc.id];
            if (!cube || !tc || !cube.material) return;
            
            const isSelected = selectedTcId === tc.id;
            const isHovered = cube === hoveredCube;
            const temp = tc.tcTemp;
            
            if (typeof temp !== 'number') return;
            
            const tempRange = VIZ_CONFIG.tempMax - VIZ_CONFIG.tempMin;
            const t = Math.min(1, Math.max(0, (temp - VIZ_CONFIG.tempMin) / tempRange));
            
            const displayColor = colorFromTemp(temp);
            cube.material.color.copy(displayColor);
            cube.material.transparent = true;
            
            const opacityRange = VIZ_CONFIG.opacityMax - VIZ_CONFIG.opacityMin;
            
            if (isSelected) {
                cube.material.opacity = 1.0;
                cube.scale.set(1.3, 1.3, 1.3);
            } else if (isHovered) {
                cube.scale.set(1.15, 1.15, 1.15);
                cube.material.opacity = VIZ_CONFIG.opacityMin + t * opacityRange;
            } else {
                cube.material.opacity = VIZ_CONFIG.opacityMin + t * opacityRange;
                cube.scale.set(1.0, 1.0, 1.0);
            }
        }
        
        // Sync TC meshes
        function syncTcMeshes() {
            for (const tc of thermoData) {
                let cube = tcObjects[tc.id];
                if (!cube) {
                    const geometry = new THREE.BoxGeometry(
                        VIZ_CONFIG.cubeSize,
                        VIZ_CONFIG.cubeSize,
                        VIZ_CONFIG.cubeSize
                    );
                    const material = new THREE.MeshBasicMaterial({
                        color: VIZ_CONFIG.coldColor
                    });
                    cube = new THREE.Mesh(geometry, material);
                    scene.add(cube);
                    tcObjects[tc.id] = cube;
                }
                cube.position.set(tc.x || 0, tc.y || 0, tc.z || 0);
                updateTcVisual(tc, selectedTcId);
            }
        }
        
        // Temps update from timeline
        let currentIndex = fileData.length > 0 ? Math.max(0, fileData.length - 1) : 0;
        function applyTempsForIndex(idx) {
            if (idx < 0 || idx >= fileData.length) return;
            const temps = fileData[idx].temps || [];
            for (let i = 0; i < temps.length; i++) {
                const tcId = i + 1;
                const tc = thermoData.find(t => t.id === tcId);
                if (tc) {
                    const temp = temps[i];
                    tc.tcTemp = (temp != null && !isNaN(temp)) ? temp : null;
                }
            }
            syncTcMeshes();
        }
        
        // Mouse hover detection
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        renderer.domElement.addEventListener('mousemove', (event) => {
            const rect = container.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            const cubes = Object.values(tcObjects);
            const intersects = raycaster.intersectObjects(cubes);
            
            if (hoveredCube) {
                hoveredCube = null;
            }
            
            if (intersects.length > 0) {
                hoveredCube = intersects[0].object;
                renderer.domElement.style.cursor = 'pointer';
            } else {
                renderer.domElement.style.cursor = 'default';
            }
            syncTcMeshes();
        });
        
        // Resize handler
        function onWindowResize() {
            const { clientWidth, clientHeight } = container;
            camera.aspect = clientWidth / clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(clientWidth, clientHeight);
        }
        window.addEventListener('resize', onWindowResize);
        
        // Animation loop
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();
        
        // Controls wiring
        const timeSliderEl = document.getElementById('timeSlider');
        const timeDisplayEl = document.getElementById('timeDisplay');
        if (fileData.length > 0) {
            timeSliderEl.max = Math.max(0, fileData.length - 1);
            timeSliderEl.value = currentIndex;
            timeSliderEl.disabled = false;
        } else {
            timeSliderEl.max = 0;
            timeSliderEl.value = 0;
            timeSliderEl.disabled = true;
        }
        
        function updateTimeDisplay() {
            if (fileData.length === 0) {
                timeDisplayEl.textContent = 'Time: --:--:--';
            } else if (currentIndex >= 0 && currentIndex < fileData.length) {
                timeDisplayEl.textContent = 'Time: ' + formatTimeStandalone(fileData[currentIndex].time);
            } else {
                timeDisplayEl.textContent = 'Time: --:--:--';
            }
        }
        
        timeSliderEl.addEventListener('input', () => {
            const newIndex = parseInt(timeSliderEl.value);
            if (newIndex !== currentIndex && newIndex >= 0 && newIndex < fileData.length) {
                currentIndex = newIndex;
                updateTimeDisplay();
                applyTempsForIndex(currentIndex);
                updateTcInfo(selectedTcId);
            }
        });
        
        // TC Select
        const tcSelectEl = document.getElementById('tcSelect');
        const tcSelectBtn = document.getElementById('tcSelectBtn');
        const tcInfoEl = document.getElementById('tcInfo');
        tcSelectEl.innerHTML = '';
        thermoData.forEach(tc => {
            const opt = document.createElement('option');
            opt.value = tc.id;
            opt.textContent = 'TC ' + tc.id;
            tcSelectEl.appendChild(opt);
        });
        let selectedTcId = thermoData.length ? thermoData[0].id : 0;
        if (tcSelectEl.options.length > 0) tcSelectEl.value = selectedTcId;
        
        function updateTcInfo(tcId) {
            const tc = thermoData.find(t => t.id === Number(tcId));
            if (!tc) {
                tcInfoEl.innerHTML = '<p style="color: #aaa; font-size: 12px;">TC not found</p>';
                return;
            }
            const fmt = (v) => (v == null || isNaN(v)) ? '--' : parseFloat(v).toFixed(2);
            const temp = fmt(tc.tcTemp);
            const x = fmt(tc.x);
            const y = fmt(tc.y);
            const z = fmt(tc.z);
            const colorObj = colorFromTemp(parseFloat(tc.tcTemp));
            const colorHex = '#' + Math.round(colorObj.r * 255).toString(16).padStart(2, '0') +
                           Math.round(colorObj.g * 255).toString(16).padStart(2, '0') +
                           Math.round(colorObj.b * 255).toString(16).padStart(2, '0');
            tcInfoEl.innerHTML = '<div class="tc-info-card" style="border-left-color: ' + colorHex + '"><strong>🌡️ TC #' + tcId + '</strong><div class="tc-info-field"><span class="label">Temp</span><span class="value">' + temp + '°C</span></div><div class="tc-info-field"><span class="label">X</span><span class="value">' + x + 'mm</span></div><div class="tc-info-field"><span class="label">Y</span><span class="value">' + y + 'mm</span></div><div class="tc-info-field"><span class="label">Z</span><span class="value">' + z + 'mm</span></div></div>';
        }
        
        tcSelectBtn.addEventListener('click', () => {
            selectedTcId = Number(tcSelectEl.value);
            updateTcInfo(selectedTcId);
            syncTcMeshes();
        });
        
        // Initial state - apply temps and sync
        if (fileData.length > 0 && currentIndex >= 0 && currentIndex < fileData.length) {
            applyTempsForIndex(currentIndex);
        }
        updateTimeDisplay();
        if (thermoData.length > 0) {
            updateTcInfo(selectedTcId);
            syncTcMeshes();
        }
    </script>
</body>
</html>`;
        return htmlTemplate;
    }

    handleExportViewer() {
        if (this.fileDataArray.length === 0) {
            this.elements.output.textContent = "No file data loaded. Please select a file first.";
            return;
        }
        
        this.elements.exportViewerBtn.disabled = true;
        this.elements.exportViewerBtn.textContent = "📦 Exporting...";
        
        try {
            const htmlBlob = new Blob([this.generateStandaloneHTML()], { type: 'text/html' });
            const htmlUrl = URL.createObjectURL(htmlBlob);
            const htmlLink = document.createElement('a');
            htmlLink.href = htmlUrl;
            htmlLink.download = `heat-cube-viewer-${new Date().toISOString().slice(0, 10)}.html`;
            htmlLink.click();
            URL.revokeObjectURL(htmlUrl);
            
            this.elements.output.textContent = "✓ Exported: Single interactive HTML file (fully self-contained)";
            this.elements.exportViewerBtn.textContent = "📦 Export Viewer";
            this.elements.exportViewerBtn.disabled = false;
        } catch (err) {
            logger.error('Export failed:', err);
            this.elements.output.textContent = "Export failed: " + err.message;
            this.elements.exportViewerBtn.textContent = "📦 Export Viewer";
            this.elements.exportViewerBtn.disabled = false;
        }
    }

    async handleRecordVideo() {
        if (this.fileDataArray.length === 0) {
            this.elements.output.textContent = "No file data loaded. Please select a file first.";
            return;
        }
        
        this.elements.recordVideoBtn.disabled = true;
        this.elements.recordVideoBtn.textContent = "⏺️ Recording...";
        
        const canvas = this.viz3D.renderer.domElement;
        const stream = canvas.captureStream(30);
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
            
            this.elements.recordVideoBtn.disabled = false;
            this.elements.recordVideoBtn.textContent = "🎬 Record Video";
            this.elements.output.textContent = "✓ Video exported successfully!";
        };
        
        mediaRecorder.start();
        this.elements.output.textContent = `Recording... (${this.fileDataArray.length} frames)`;
        
        for (let i = 0; i < this.fileDataArray.length; i++) {
            this.elements.timeSlider.value = i;
            const dataPoint = this.fileDataArray[i];
            this.elements.timeLabel.textContent = `Time: ${formatTime(dataPoint.time)}`;
            
            dataPoint.temps.forEach((temp, j) => {
                const tcId = j + 1;
                const tc = this.activeTcsArray.find(t => t.id === tcId);
                if (tc) {
                    tc.tcTemp = temp;
                }
            });
            
            this.viz3D.syncTcMeshes(this.activeTcsArray, this.getSelectedTcId(), !this.calibrationFinished);
            await new Promise(resolve => requestAnimationFrame(resolve));
            await sleep(33);
        }
        
        mediaRecorder.stop();
    }
}

// ============ INITIALISATION ============
const system = new HeatCubeSystem();

window.addEventListener('load', async () => {
    logger.info("=== Window Load Event Fired ===");
    await system.init();
});

// Initialise sidebar dropdown
window.addEventListener('load', () => {
    if (system.elements.tcSelectSidebar) {
        system.elements.tcSelectSidebar.innerHTML = '';
        const ids = system.activeTcsArray.length
            ? system.activeTcsArray.map(t => t.id).sort((a, b) => a - b)
            : Array.from({ length: 256 }, (_, i) => i + 1);
        ids.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `TC #${id}`;
            system.elements.tcSelectSidebar.appendChild(opt);
        });
        if (ids.length > 0) {
            system.elements.tcSelectSidebar.value = ids[0];
            system.updateTcSidebarInfo(ids[0]);
        }
    }
});
