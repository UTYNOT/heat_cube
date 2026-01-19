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
        try {
            if (this.writer) {
                try {
                    await this.writer.close();
                    await this.writer.releaseLock();
                } catch (err) {
                    logger.debug("Error closing writer:", err);
                }
                this.writer = null;
            }
            if (this.reader) {
                try {
                    await this.reader.cancel();
                    await this.reader.releaseLock();
                } catch (err) {
                    logger.debug("Error closing reader:", err);
                }
                this.reader = null;
            }
            if (this.port) {
                try {
                    await this.port.close();
                } catch (err) {
                    logger.debug("Error closing port:", err);
                }
            }
            logger.info("UART connection closed");
        } catch (err) {
            logger.warn("Error during UART close:", err);
        }
    }
}
