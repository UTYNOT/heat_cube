// server.js - copy all SD card files into a timestamped folder under heat_cube/sd_backup
const fs = require('fs');
const path = require('path');

// Optional: pass source path as first CLI arg; defaults to E:\
const sdCardPath = process.argv[2] || 'E:\\';

// Destination folder = heat_cube/sd_backup (sibling of js)
// Files are copied directly into this single folder (no per-run subfolders)
const destFolder = path.join(__dirname, '..', 'TemperatureData');

async function ensureDir(dirPath) {
    await fs.promises.mkdir(dirPath, { recursive: true });
}

function isTargetFile(fileName) {
    // Match files like 2026-01-13.csv or 2026-01-13_12-34.csv
    return /^\d{4}-\d{2}-\d{2}(_\d{2}-\d{2})?\.csv$/i.test(fileName);
}

async function copyRecursive(src, dest) {
    let stats;
    try {
        stats = await fs.promises.stat(src);
    } catch (e) {
        console.warn(`Skipping unreadable: ${src}`);
        return;
    }

    if (stats.isDirectory()) {
        let entries;
        try {
            entries = await fs.promises.readdir(src);
        } catch (e) {
            console.warn(`Cannot read directory: ${src}`);
            return;
        }

        for (const entry of entries) {
            await copyRecursive(
                path.join(src, entry),
                path.join(dest, entry)
            );
        }
    } else if (stats.isFile()) {
        if (!isTargetFile(path.basename(src))) return;
        await ensureDir(path.dirname(dest));
        await fs.promises.copyFile(src, dest);
        console.log(`Copied ${src} -> ${dest}`);
    }
}


async function main() {
    try {
        await new Promise(r => setTimeout(r, 3000));
        if (!fs.existsSync(sdCardPath)) {
            console.error('Source path not found:', sdCardPath);
            process.exit(1);
        }

        await ensureDir(destFolder);
        console.log(`Backing up files from ${sdCardPath} to ${destFolder}`);

        await copyRecursive(sdCardPath, destFolder);

        console.log('Backup complete.');
    } catch (err) {
        console.error('Backup failed:', err.message);
        process.exit(1);
    }
}

main();
