/**
 * Thermocouple Class - Represents a single thermocouple
 */

export class Thermocouple {
    constructor(id) {
        this.id = id;
        this.tcTemp = 0;
        this.refTemp = 0;
        this.x = 0;
        this.y = 0;
        this.z = 0;
    }

    update(tcTemp, refTemp) {
        this.tcTemp = tcTemp;
        this.refTemp = refTemp;
    }

    toJSON() {
        return {
            id: this.id,
            tcTemp: this.tcTemp,
            refTemp: this.refTemp,
            x: this.x,
            y: this.y,
            z: this.z
        };
    }

    static fromJSON(data) {
        const tc = new Thermocouple(data.id);
        tc.tcTemp = data.tcTemp || 0;
        tc.refTemp = data.refTemp || 0;
        tc.x = data.x || 0;
        tc.y = data.y || 0;
        tc.z = data.z || 0;
        return tc;
    }
}
