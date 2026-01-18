/**
 * UART Helper - Serial communication with MCU
 */

import { logger } from './logger.js';

export class UARTHelper {
    constructor(port) {
        this.port = port;
        this.writer = null;
        this.reader = null;
        this.buffer = '';
    }

    async write(message) {
        if (!this.writer) {
            throw new Error("Writer not ready");
        }
        await this.writer.write(new TextEncoder().encode(message + "\n"));
        logger.mcu(`Sent: ${message}`);
    }

    async readLine() {
        if (!this.reader) return null;
        
        try {
            const result = await this.reader.read();
            if (result.done) return null;
            
            const text = new TextDecoder().decode(result.value);
            this.buffer += text;
            
            if (this.buffer.includes('\n')) {
                const [line, rest] = this.buffer.split('\n', 1);
                this.buffer = this.buffer.substring(line.length + 1);
                return line.trim();
            }
        } catch (error) {
            logger.error("Error reading from UART:", error);
        }
        
        return null;
    }

    async close() {
        if (this.writer) await this.writer.close();
        if (this.reader) await this.reader.cancel();
        logger.info("UART connection closed");
    }
}
