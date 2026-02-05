# Heat Cube MCU (Python) README

## Overview
The MCU-side code in the V29 folder runs on a MicroPython-compatible board (uses `pyb` and `machine`). It scans MAX31855 thermocouples through shift registers, maintains a calibration/measurement state machine, stores CSV logs on the SD card, and communicates with the web UI over UART.

## How the MCU code boots
- `boot.py` sets the main script to `state_machine.py` via `pyb.main('state_machine.py')`.
- `state_machine.py` instantiates the system and runs the main loop forever.

## Key files and responsibilities
- `state_machine.py`
  - Defines the `System` class, UART helper, and the main state machine (`InitState`, `CalibrationState`, `MeasureState`).
  - Sets up SPI, UART, RTC, shift-register pins, and a timer interrupt for periodic scanning.
  - Sends and receives UART messages used by the browser UI.
  - Handles CSV logging for measurement mode.
- `init.py`
  - Implements `TC_MANAGER`, which discovers active thermocouples and performs single or bulk scans.
  - Handles PCB selection and shift-register bit patterns for chip select lines.
- `thermocouple.py`
  - MAX31855 driver: raw SPI reads, temperature conversion, and error handling.
- `shift_register.py`
  - Drivers for 74HC595 shift registers (SPI and bit-bang variants).
- `IO_expander.py`
  - MCP23S17 I/O expander driver (not required for basic runtime flow).
- `rtc.py`, `testing.py`
  - Standalone RTC and timer tests (not used by the main app flow).
- `main.py`
  - Legacy test script for basic scan loop (not used by boot sequence).

## Data flow
1. **Init**
   - Hardware init → `TC_MANAGER` scans and records active thermocouples.
   - MCU sends `SOFTWARE_INIT` over UART.
2. **Calibration**
   - MCU reads a single selected thermocouple and sends:
     - `Probe_Data<id>, Ref Data: <probeTemp>,<refTemp>`
   - Positions are accepted over UART and written to `position.csv`.
3. **Measurement**
   - Periodic timer sets `scan_pending`.
   - MCU reads all active TCs and sends:
     - `TC<id>: <temp>`
   - Also logs to time-stamped CSV files on the SD card.

## UART message map
**MCU → Web UI**
- `SOFTWARE_INIT`
- `CalibrationState` or `MeasureState`
- `Active TCs:[...]`
- `Probe_Data<id>, Ref Data: <probeTemp>,<refTemp>`
- `TC<id>: <temp>`
- `LOAD_POSITIONS:<tcId,x,y,z;...>`
- `REQUEST_ALL_POSITIONS` or `REQUEST_POSITIONS:<id1,id2,...>`

**Web UI → MCU**
- `status` (request state + active TCs)
- `RESET`
- `<id>` (select TC in calibration mode)
- `measure` / `calibrate`
- `SAVE_POSITIONS_START:<count>:<id1,id2,...>`
- `SAVE_POSITION:<id>,<x>,<y>,<z>`
- `SAVE_POSITIONS_DONE`
- `LOAD_POSITIONS`

## Storage files on the MCU
- `position.csv` — saved thermocouple positions.
- `YYYY-MM-DD_HH-MM.csv` — measurement logs created every 30-minute block in measurement mode.

## Hardware assumptions
- SPI bus 1 is used for MAX31855 reads.
- Shift-register pins and PCB enable pins match those set in `state_machine.py` and `init.py`.
- UART2 at 115200 baud is used for communication with the browser.

## Where this links to the web UI
- The web UI listens for the exact UART message formats above (see `processLine` in the web code).
- Any changes to UART strings in Python must be mirrored in the web code’s parsing logic.
