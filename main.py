"""
Heat Cube State Machine
Main system controller for thermocouple management and state transitions.
"""

import machine
import time
import os

from shift_register import SR74HC595_BITBANG
from thermocouple import MAX31855
from tc_manager import TC_MANAGER


# ============ CONFIGURATION ============
POSITION_FILE = "position.csv"
USER_BTN_PIN = "PC13"
VBUS_PIN = "PA9"


# ============ UART HELPER CLASS ============
class Helper:
    """
    Helper class for UART communication.
    Handles reading and writing messages over serial.
    """
    
    def __init__(self, uart):
        self.uart = uart
        self.buffer = b''

    def read_uart(self):
        """
        Read a line from UART.
        
        Returns:
            Decoded command string, or None if no data available
        """
        if self.uart and self.uart.any():
            data = self.uart.read()
            if data:
                self.buffer += data
                while b'\n' in self.buffer:
                    line, self.buffer = self.buffer.split(b'\n', 1)
                    cmd = line.decode('utf-8').strip()
                    return cmd
        return None

    def write_uart(self, message):
        """Write message over UART."""
        self.uart.write((message + "\n").encode())


# ============ STATE MACHINE BASE CLASS ============
class State:
    """
    Base class for all states in the state machine.
    All states must implement handle() and handle_command() methods.
    """
    
    def handle(self, context):
        """Handle state logic - called every loop iteration."""
        raise NotImplementedError("Subclasses must implement this method")
    
    def handle_command(self, context, cmd):
        """Handle incoming UART commands."""
        raise NotImplementedError("Subclasses must implement this method")


# ============ INIT STATE ============
class InitState(State):
    """
    Initialization state.
    Sets up hardware, software, and thermocouple manager.
    """
    
    def __init__(self, context):
        print("Init state initializing...")
        
        # Initialize hardware
        context.init_hardware()
        
        # Initialize software
        context.init_software()
        
        # Initialize thermocouple manager
        context.tc_manager = TC_MANAGER(
            total_tc=256,
            sr1_bit_bang=context.sr1_bit_bang,
            spi_bus=context.spi_bus,
            MAX31855=MAX31855,
            uart=context.uart
        )
    
    def handle(self, context):
        """Check for USB connection and transition to calibration state."""
        if context.vbus_pin.value():
            print("USB connected")
            context.state = CalibrationState(context)
    
    def handle_command(self, context, cmd):
        """Init state doesn't handle commands."""
        pass


# ============ IDLE STATE ============
class IdleState(State):
    """
    Idle state (currently unused but kept for future use).
    """
    
    def __init__(self, context):
        print("Idle Init")
        self.last_toggle = time.ticks_ms()
        
    def handle(self, context):
        """Idle state logic."""
        pass
    
    def handle_command(self, context, cmd):
        """Idle state command handling."""
        pass


# ============ CALIBRATION STATE ============
class CalibrationState(State):
    """
    Calibration state.
    Handles thermocouple selection and position calibration.
    """
    
    def __init__(self, context):
        print("Calibration init")
        self.tc_selected = 0
        
    def handle(self, context):
        """Main calibration loop - measures or selects thermocouples."""
        time.sleep_ms(10)
        
        if self.tc_selected != 0:
            # A TC is selected - read only that one
            data_str = context.tc_manager.tc_select_singular(self.tc_selected)
            if data_str:
                context.helper.write_uart(data_str)
        else:
            # No TC selected - measure all TCs
            data_str = context.tc_manager.tc_measure()
            data_array = data_str.split(",")
            
            for i, value in enumerate(data_array):
                context.helper.write_uart(f"TC_CALIBRATE{i + 1}: {value}")
                time.sleep_ms(20)
    
    def reset_tc_selected(self):
        """Reset selected thermocouple."""
        self.tc_selected = 0
        
    def handle_command(self, context, cmd):
        """Handle calibration state commands."""
        # Try to parse as TC selection number
        try:
            tc_id = int(cmd)
            if 1 <= tc_id <= context.tc_manager.num_tcs:
                self.tc_selected = tc_id
                print(f"Selected TC: {self.tc_selected}")
                return
        except ValueError:
            pass
        
        # Not a number - handle as command string
        self.reset_tc_selected()
        
        if cmd == "measure":
            context.state = MeasureState(context)
            return
        
        # Handle position saving
        if cmd.startswith("SAVE_POSITIONS:"):
            self._handle_save_positions(context, cmd)
            return
        
        # Handle position loading
        if cmd.startswith("LOAD_POSITIONS"):
            self._handle_load_positions(context)
            return
        
        # Handle file selection
        if cmd.startswith("FILE_SELECTED:"):
            self._handle_file_selected(context, cmd)
            return
    
    def _handle_save_positions(self, context, cmd):
        """Save thermocouple positions to CSV file."""
        data = cmd.split(":", 1)[1]
        tc_positions = data.split(";")
        
        try:
            with open(POSITION_FILE, 'w') as f:
                for pos in tc_positions:
                    parts = pos.split(",")
                    if len(parts) == 4:
                        tc_id = int(parts[0])
                        x = float(parts[1])
                        y = float(parts[2])
                        z = float(parts[3])
                        
                        # Update TC object
                        if 1 <= tc_id <= len(context.tc_manager.tcs_array):
                            tc = context.tc_manager.tcs_array[tc_id - 1]
                            tc.x = x
                            tc.y = y
                            tc.z = z
                            
                            # Write to CSV
                            f.write(f"{tc_id},{x},{y},{z}\n")
            
            print(f"Saved {len(tc_positions)} positions to {POSITION_FILE}")
        except Exception as e:
            print(f"Error saving positions: {e}")
    
    def _handle_load_positions(self, context):
        """Load thermocouple positions from CSV file."""
        try:
            with open(POSITION_FILE, 'r') as f:
                lines = f.readlines()
            
            position_data = []
            for line in lines:
                line = line.strip()
                if line:
                    parts = line.split(',')
                    if len(parts) == 4:
                        position_data.append(f"{parts[0]},{parts[1]},{parts[2]},{parts[3]}")
            
            if position_data:
                message = f"LOAD_POSITIONS:{';'.join(position_data)}\n"
                context.uart.write(message.encode())
                print(f"Sent {len(position_data)} positions")
            else:
                context.uart.write("LOAD_POSITIONS:ERROR_NO_DATA\n".encode())
                print("No position data found in CSV")
                
        except OSError:
            context.uart.write("LOAD_POSITIONS:ERROR_FILE_NOT_FOUND\n".encode())
            print("position.csv file not found")
        except Exception as e:
            context.uart.write(f"LOAD_POSITIONS:ERROR_{str(e)}\n".encode())
            print(f"Error reading position file: {e}")
    
    def _handle_file_selected(self, context, cmd):
        """Handle file selection and send file data over UART."""
        filename = cmd.split(":", 1)[1].strip()
        print(f"File selected: {filename}")
        
        try:
            with open(filename, 'r') as f:
                lines = f.readlines()
            
            # Send each line as FILE_DATA message
            for line in lines:
                line = line.strip()
                if line:
                    context.helper.write_uart(f"FILE_DATA:{line}")
            
            print(f"Sent {len(lines)} lines from {filename}")
            
        except OSError:
            context.helper.write_uart("FILE_ERROR:File not found")
            print(f"File {filename} not found")
        except Exception as e:
            context.helper.write_uart(f"FILE_ERROR:{str(e)}")
            print(f"Error reading file {filename}: {e}")


# ============ MEASURE STATE ============
class MeasureState(State):
    """
    Measurement state.
    Continuously measures all active thermocouples.
    """
    
    def __init__(self, context):
        print("Measure init")
        context.tc_manager.sr1_bit_bang.clear()
        context.tc_manager.sr1_bit_bang.enable(False)
        context.tc_manager.tc_set()
    
    def handle(self, context):
        """Measure all thermocouples, send data over UART, and save to CSV file."""
        data_str = context.tc_manager.tc_measure()
        data_array = data_str.split(",")
        
        # Send temperature data over UART
        for i, value in enumerate(data_array):
            context.helper.write_uart(f"TC{i + 1}: {value}")
            time.sleep_ms(20)
        
        # Write to CSV file with timestamp
        context.dt = context.rtc.datetime()
        year, month, day = context.dt[0], context.dt[1], context.dt[2]
        hour, minute, second = context.dt[4], context.dt[5], context.dt[6]
        
        date_str = "{:04d}-{:02d}-{:02d}".format(year, month, day)
        time_str = "{:02d}:{:02d}:{:02d}".format(hour, minute, second)
        
        filename = "{}.csv".format(date_str)
        
        try:
            with open(filename, "a") as f:
                f.write("{},{}\n".format(time_str, data_str))
        except Exception as e:
            print(f"Error writing to CSV file {filename}: {e}")
    
    def handle_command(self, context, cmd):
        """Handle measurement state commands."""
        if cmd == "calibrate":
            context.state = CalibrationState(context)


# ============ SYSTEM CLASS ============
class System:
    """
    Main system class.
    Manages hardware initialization and state machine execution.
    """
    
    def __init__(self):
        self.tc_manager = None
        self.init_hardware()
        self.state = InitState(self)
    
    def init_hardware(self):
        """Initialize all hardware components."""
        # SPI bus
        self.spi_bus = machine.SPI(1, baudrate=1000000, phase=0, polarity=0)

        # Shift register pins
        self.rclk = machine.Pin("PF15", machine.Pin.OUT)
        self.srclk = machine.Pin("PG3", machine.Pin.OUT)
        self.ser = machine.Pin("PF12", machine.Pin.OUT)
        self.oe = machine.Pin("PF13", machine.Pin.OUT)
        self.srclr = machine.Pin("PF14", machine.Pin.OUT)

        # Shift register driver
        self.sr1_bit_bang = SR74HC595_BITBANG(
            rclk_pin="PF15",
            ser_pin="PF12",
            oe_pin="PF13",
            srclk_pin="PG3",
            srclr_pin="PF14"
        )

        # User button
        self.user_btn = machine.Pin(USER_BTN_PIN, machine.Pin.IN, machine.Pin.PULL_DOWN)

        # UART
        self.uart = machine.UART(2, baudrate=115200)

        # UART helper
        self.helper = Helper(self.uart)
        
        # VBUS pin (USB connection detection)
        self.vbus_pin = machine.Pin(VBUS_PIN, machine.Pin.IN)
        
        # RTC
        self.rtc = machine.RTC()
        self.dt = self.rtc.datetime()
        
        print("Hardware initialised")
    
    def init_software(self):
        """Initialize software components."""
        self.helper.write_uart("SOFTWARE_INIT")
        print("Software initialised")
    
    def run(self):
        """Main loop - handle state and process UART."""
        self.state.handle(self)
        self.process_uart()
    
    def process_uart(self):
        """Process incoming UART commands."""
        cmd = self.helper.read_uart()
        
        if cmd:
            # Handle status command
            if cmd == "status":
                state_name = type(self.state).__name__
                time.sleep_ms(10)
                self.helper.write_uart(state_name)
                time.sleep_ms(10)
                self.helper.write_uart(f"Active TCs:{self.tc_manager.tcs_active}")
                
                # Send file list
                self._send_file_list()
            
            # Forward command to current state
            self.state.handle_command(self, cmd)
    
    def _send_file_list(self):
        """Send list of available CSV files over UART."""
        try:
            files = os.listdir()
            csv_files = []
            
            for filename in files:
                if filename.endswith('.csv'):
                    # Validate filename format (should start with integer)
                    name_without_ext = filename[:-4]
                    first_part = name_without_ext.split('-')[0] if '-' in name_without_ext else name_without_ext
                    try:
                        int(first_part)
                        csv_files.append(filename)
                    except ValueError:
                        pass  # Skip invalid filenames
            
            if csv_files:
                file_list = ','.join(csv_files)
                self.helper.write_uart(f"FILES:{file_list}")
                print(f"Sent file list: {file_list}")
            else:
                self.helper.write_uart("FILES:")
                print("No CSV files found")
                
        except Exception as e:
            print(f"Error listing files: {e}")
            self.helper.write_uart("FILES:ERROR")


# ============ MAIN ENTRY POINT ============
system = System()

def main():
    """Main execution loop."""
    while True:
        system.run()

if __name__ == "__main__":
    main()
