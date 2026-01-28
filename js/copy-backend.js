// copy-backend.js - minimal HTTP endpoint to trigger the copy script without extra dependencies
// Run with: node copy-backend.js (from the js folder)

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Adjust default SD path if needed; can also be overridden via ?sd=E:\\ style query
const DEFAULT_SD_PATH = 'E:\\';
const PORT = 3001;

let isRunning = false;
let lastRunInfo = { startedAt: null, endedAt: null, exitCode: null };

function parseQuery(url) {
    const out = {};
    const [, query] = url.split('?');
    if (!query) return out;
    for (const pair of query.split('&')) {
        const [k, v] = pair.split('=');
        if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
    return out;
}

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(body);
}

function handleCopy(req, res) {
    if (isRunning) {
        return sendJson(res, 202, { message: 'Copy already running', lastRunInfo });
    }

    const query = parseQuery(req.url);
    const sdPath = query.sd && query.sd.trim() ? query.sd.trim() : DEFAULT_SD_PATH;

    const scriptPath = path.join(__dirname, 'server.js');
    const child = spawn('node', [scriptPath, sdPath], { stdio: 'inherit' });

    isRunning = true;
    lastRunInfo.startedAt = new Date().toISOString();
    lastRunInfo.endedAt = null;
    lastRunInfo.exitCode = null;

    child.on('close', (code) => {
        isRunning = false;
        lastRunInfo.endedAt = new Date().toISOString();
        lastRunInfo.exitCode = code;
    });

    return sendJson(res, 200, { message: `Copy started from ${sdPath}` });
}

const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    if (req.method === 'GET' && req.url.startsWith('/copy')) {
        return handleCopy(req, res);
    }

    // List files in TemperatureData folder (CSV only)
    if (req.method === 'GET' && req.url.startsWith('/temperature-data/list')) {
        try {
            const dataDir = path.join(__dirname, '..', 'TemperatureData');
            if (!fs.existsSync(dataDir)) {
                return sendJson(res, 404, { message: 'TemperatureData folder not found' });
            }
            const entries = fs.readdirSync(dataDir, { withFileTypes: true });
            const csvRegex = /^\d{4}-\d{2}-\d{2}(_\d{2}-\d{2})?\.csv$/;
            const files = entries
                .filter(d => d.isFile() && csvRegex.test(d.name))
                .map(d => d.name)
                .sort();
            return sendJson(res, 200, { files });
        } catch (err) {
            return sendJson(res, 500, { message: 'Error listing TemperatureData', error: String(err) });
        }
    }

    sendJson(res, 404, { message: 'Not found' });
});

server.listen(PORT, () => {
    console.log(`Copy backend listening on http://localhost:${PORT}`);
});
