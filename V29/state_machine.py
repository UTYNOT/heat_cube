"""
Heat Cube State Machine
Main system controller for thermocouple management and state transitions.
"""

import machine
import time
import os

from shift_register import SR74HC595_BITBANG
from thermocouple import MAX31855
from init import TC_MANAGER

# ============ CONFIGURATION ============
POSITION_FILE = "position.csv"
USER_BTN_PIN = "PA0"
VBUS_PIN = "PA9"

scan_pending = False  # Global flag 
DEBUG_PIN1 = machine.Pin("PE9", machine.Pin.OUT)  # Debug pin for timing measurements
DEBUG_PIN2 = machine.Pin("PE11", machine.Pin.OUT)  # Debug pin for timing measurements
DEBUG_PIN3 = machine.Pin("PE13", machine.Pin.OUT)  # Debug pin for timing measurements


PCB_ENABLE1 = machine.Pin("PG0", machine.Pin.OUT)	#PCB 1 Pin
PCB_ENABLE2 = machine.Pin("PG1", machine.Pin.OUT)	#PCB 2 Pin

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
                time.sleep_ms(10)
                self.buffer += data
                while b'\n' in self.buffer:
                    line, self.buffer = self.buffer.split(b'\n', 1)	#Splits buffer by first '\n' into line and self.buffer
                    cmd = line.decode('utf-8').strip()	#Decode the line into utf-8
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
            total_tc=256,	#Total Thermocouple Amount Avaliable
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
#Not being used right now
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
    #Initliase Calibration State
    def __init__(self, context):
        print("Calibration init")
        self.tc_selected = 0
        self.pending_positions = {}  # Dictionary to store positions: {tc_id: (x, y, z)}
        self.expected_position_count = 0  # Expected number of positions
        self.expected_tc_ids = []  # List of expected TC IDs
        self.receiving_positions = False
        
    def handle(self, context):
        """Main calibration loop - measures or selects thermocouples."""
        
        
        if(self.receiving_positions):
            time.sleep_ms(10)
            return
        
        time.sleep_ms(10)
        
        if self.tc_selected != 0:
            
            # A TC is selected - read only that one
            data_str = context.tc_manager.tc_select_singular(self.tc_selected)
            print(data_str)
            if data_str:
                context.helper.write_uart(data_str)
#         else:
#         
#             # No TC selected - measure all TCs
#             data_str = context.tc_manager.tc_measure()
#             data_array = data_str.split(",")
#             
#             for i, value in enumerate(data_array):
#                 context.helper.write_uart(f"TC_CALIBRATE{i + 1}: {value}")
#             time.sleep_ms(20)
    
    def reset_tc_selected(self):
        """Reset selected thermocouple."""
        self.tc_selected = 0
        
    def handle_command(self, context, cmd):
        """Handle calibration state commands."""
        # Try to parse as TC selection number
        try:
            tc_id = int(cmd)
            # Check if it's a valid TC ID (1 to num_tcs)
            if 1 <= tc_id <= context.tc_manager.num_tcs:
                self.tc_selected = tc_id  # Set the selected TC to the received command
                print(f"Selected TC: {self.tc_selected}")
                return  # Exit early after setting TC selection
            else:
                # Invalid range, reset selection
                self.tc_selected = 0
        except ValueError:
            # Not a number - handle as command string
            self.reset_tc_selected()
        
        # Handle string commands (only reached if cmd wasn't a valid TC ID)
        if cmd == "measure":
            time.sleep_ms(200)
            context.state = MeasureState(context)
            return
        
        # Handle position saving - check for DONE and START first (they don't start with "SAVE_POSITION:")
        if cmd == "SAVE_POSITIONS_DONE":
            print("Received SAVE_POSITIONS_DONE")
            self._handle_save_positions(context, cmd)
            return
        
        if cmd.startswith("SAVE_POSITIONS_START:"):
            print("Received SAVE_POSITIONS_START")
            self.receiving_positions = True  # Set flag to disable measurement loop
            self._handle_save_positions(context, cmd)
            return
        
        # Handle single position (SAVE_POSITION:1,0,0,0)
        if cmd.startswith("SAVE_POSITION:"):
            print("Saving positions")
            self._handle_save_positions(context, cmd)
            return
        
        # Handle position loading
        if cmd.startswith("LOAD_POSITIONS"):
            self._handle_load_positions(context)
            return
        
        # Handle file selection
#         if cmd.startswith("FILE_SELECTED:"):
#             self._handle_file_selected(context, cmd)
#             return
        
        # Handle "0" as position acknowledgment
        if cmd == "0":
            self.tc_selected = 0
            # Position set acknowledgment - do nothing or log
            print("Position set acknowledged")
            return
    
    def _handle_save_positions(self, context, cmd):
        """Save thermocouple positions to CSV file."""
        
        # Handle position saving start
        if cmd.startswith("SAVE_POSITIONS_START:"):
            parts = cmd.split(":", 2)  # Split into: SAVE_POSITIONS_START, count, tc_ids
            if len(parts) >= 2:
                incoming_count = int(parts[1])
                
                # Parse TC IDs if provided
                if len(parts) >= 3:
                    incoming_tc_ids = [int(tc_id) for tc_id in parts[2].split(',') if tc_id.strip()]
                else:
                    incoming_tc_ids = []
                
                # Check if this is a resend of missing positions (we already have some positions)
                if len(self.pending_positions) > 0 and self.expected_position_count > 0:
                    # This is a resend of missing positions - don't clear existing ones
                    
                    print(f"Resend of missing positions: {incoming_count} positions, keeping {len(self.pending_positions)} existing")
                    # Don't change expected_position_count or clear pending_positions
                    # Just let the missing positions be added
                else:
                    # Fresh start - clear everything
                    self.pending_positions = {}
                    self.expected_position_count = incoming_count
                    self.expected_tc_ids = incoming_tc_ids
                    print(f"Starting position save: expecting {self.expected_position_count} positions")
                    if self.expected_tc_ids:
                        print(f"Expected TC IDs: {self.expected_tc_ids}")
            return

        # Handle single position (SAVE_POSITION:1,0,0,0)
        if cmd.startswith("SAVE_POSITION:"):
            print(cmd, "Saving positioning data")
            data = cmd.split(":", 1)[1]
            parts = data.split(",")
            if len(parts) == 4:
                tc_id = int(parts[0])
                x = float(parts[1])
                y = float(parts[2])
                z = float(parts[3])
                self.pending_positions[tc_id] = (x, y, z)  # This will add or update the position
                print(f"Received position for TC {tc_id}: X={x}, Y={y}, Z={z}")
                print(f"Total positions received so far: {len(self.pending_positions)}")
            return

        # Handle position saving done - write all to CSV
        if cmd == "SAVE_POSITIONS_DONE":
            print("Done - writing positions to CSV")
            self._write_positions_to_csv(context)
            return


    def _write_positions_to_csv(self, context):
        """Write all accumulated positions to CSV file."""
        # Check if we received the expected number of positions
        received_count = len(self.pending_positions)
        received_tc_ids = set(self.pending_positions.keys())
        
        if received_count != self.expected_position_count:
            print(f"Position count mismatch! Expected {self.expected_position_count}, received {received_count}")
            
            # Calculate missing TC IDs if we have the expected list
            if self.expected_tc_ids:
                expected_set = set(self.expected_tc_ids)
                missing_ids = sorted(list(expected_set - received_tc_ids))
                
                if missing_ids:
                    # Request only the missing positions
                    missing_str = ','.join([str(tc_id) for tc_id in missing_ids])
                    print(f"Missing TC IDs: {missing_ids}")
                    print(f"Keeping {received_count} positions already received, requesting {len(missing_ids)} missing")
                    context.helper.write_uart(f"REQUEST_POSITIONS:{missing_str}")
                    # DON'T clear pending_positions - keep the ones we already have!
                    # The missing ones will be added when they arrive, then we'll check again
                    return  # Exit early, wait for missing positions to arrive
                else:
                    # Count mismatch but all expected IDs received (duplicates?)
                    print("Count mismatch but all expected IDs received - requesting all positions")
                    context.helper.write_uart("REQUEST_ALL_POSITIONS")
            else:
                # No expected list - request all positions
                print("No expected TC ID list - requesting all positions")
                context.helper.write_uart("REQUEST_ALL_POSITIONS")
            
            # Only clear if we're requesting ALL positions (complete resend)
            self.pending_positions = {}  # Clear and wait for complete resend
            self.expected_position_count = 0
            self.expected_tc_ids = []
            return
        
        # All positions received - write to CSV
        try:
            with open(POSITION_FILE, 'w') as f:
                # Write all positions sorted by TC ID
                for tc_id in sorted(self.pending_positions.keys()):
                    x, y, z = self.pending_positions[tc_id]
                    
                    # Update TC object (MCU uses 0-based indexing, TC IDs are 1-based)
                    if 1 <= tc_id <= len(context.tc_manager.tcs_array):
                        tc = context.tc_manager.tcs_array[tc_id - 1]
                        tc.x = x
                        tc.y = y
                        tc.z = z
                    
                    
                    # Write to CSV
                    f.write(f"{tc_id},{x},{y},{z}\n")
                    f.flush()
        except OSError as e:
            print("Error Occured: ", e)
            
                    
                    
            
            print(f"Saved {len(self.pending_positions)} positions to {POSITION_FILE}")
            self.receiving_positions = False
            self.pending_positions = {}  # Clear after writing
            self.expected_position_count = 0
            self.expected_tc_ids = []
            
        except Exception as e:
            print(f"Error writing positions to CSV: {e}")
    
    #Send thermocouple position list over UART by reading CSV file
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
    
#     def _handle_file_selected(self, context, cmd):
#         """Handle file selection and send file data over UART."""
#         filename = cmd.split(":", 1)[1].strip()
#         print(f"File selected: {filename}")
#         
#         #Need to fix this to store one line at a time and not all at once!!!
#         try:
#             count = 0
#             with open(filename, 'r') as f:
#                 for line in f:
#                     line = line.strip()
#                     if line:
#                         context.helper.write_uart(f"FILE_DATA:{line}")
#                         count += 1
# 
#             print(f"Sent {count} lines from {filename}")
#             
#         except OSError:
#             context.helper.write_uart("FILE_ERROR:File not found")
#             print(f"File {filename} not found")
#         except Exception as e:
#             context.helper.write_uart(f"FILE_ERROR:{str(e)}")
#             print(f"Error reading file {filename}: {e}")

counter = 0
# ============ MEASURE STATE ============
class MeasureState(State):
    """
    Measurement state.
    Continuously measures all active thermocouples.
    """
    
    #Initliase Measurement State
    def __init__(self, context):
        print("Measure init")
        context.tc_manager.sr1_bit_bang.clear()
        context.tc_manager.sr1_bit_bang.enable(False)
        context.tc_manager.tc_set()
    
    def handle(self, context):
        """Measure all thermocouples and send data over UART."""
        global scan_pending
        global counter
        
        context.dt = context.rtc.datetime()
        
        if scan_pending:
      
            #counter += 1
        
            scan_pending = False
            data_str = context.tc_manager.tc_measure()
         
            data_array = data_str.split(",")
            year, month, day, hour, minute, second = context.dt[0], context.dt[1], context.dt[2], context.dt[4], context.dt[5], context.dt[6]
            #print("Seconds: ", context.dt[6], "Milliseconds: ", context.dt[7])
            
            minute_block = (minute // 30) * 30 #Ensures every 15 minutes new file can be made
            
            date_str = "{:04d}-{:02d}-{:02d}_{:02d}-{:02d}".format(year, month, day, hour, minute_block)
            
            time_str = "{:02d}:{:02d}:{:02d}".format(hour, minute, second)
            
            #print(time_str)
            
            filename = "{}.csv".format(date_str)
            
            #if counter == 10:
            
            try:
                with open(filename, "a") as f:
                    f.write("{},{}\n".format(time_str, data_str))
                    f.flush()
            except OSError as e:
                print("Error Occured: ", e)
                
                #counter = 0              
            for i, value in enumerate(data_array):
                context.helper.write_uart(f"TC{i + 1}: {value}")
       
    
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
    
    #Initliase systme
    def __init__(self):
        self.tc_manager = None
        self.state = InitState(self)
    
    #Initlaise hardware
    def init_hardware(self):
        """Initialize all hardware components."""
        # SPI bus
        self.spi_bus = machine.SPI(1, baudrate=1000000, phase=0, polarity=0)

        # Shift register pins
        self.rclk = machine.Pin("PF15", machine.Pin.OUT)
        self.srclk = machine.Pin("PE14", machine.Pin.OUT)
        self.ser = machine.Pin("PF12", machine.Pin.OUT)
        self.oe = machine.Pin("PF13", machine.Pin.OUT)
        self.srclr = machine.Pin("PF14", machine.Pin.OUT)

        # Shift register driver
        self.sr1_bit_bang = SR74HC595_BITBANG(
            rclk_pin="PF15",
            ser_pin="PF12",
            oe_pin="PF13",
            srclk_pin="PE14",
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
   
   #Sends uart cmd to initialise software
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
            if not isinstance(self.state, MeasureState):
                #On recieving a reset command reset machine like pressing reset button
                if cmd == "RESET":
                    time.sleep_ms(1000)
                    machine.reset()
                
                #On recieving "status" command send back state of system, and provide it with "Active TCs:" list
                if cmd == "status":
                    state_name = type(self.state).__name__
                    time.sleep_ms(5)
                    self.helper.write_uart(state_name)
                    time.sleep_ms(5)
                    print(f"Active TCs:{self.tc_manager.tcs_active}")
                    self.helper.write_uart(f"Active TCs:{self.tc_manager.tcs_active}")
     
                # Send file list
                #self._send_file_list()
            
            # Forward command to current state
            self.state.handle_command(self, cmd)
    
#     def _send_file_list(self):
#         """Send list of available CSV files over UART."""
#         try:
#             files = os.listdir()
#             csv_files = []
#             
#             for filename in files:
#                 if filename.endswith('.csv'):
#                     # Validate filename format (should start with integer)
#                     name_without_ext = filename[:-4]
#                     first_part = name_without_ext.split('-')[0] if '-' in name_without_ext else name_without_ext
#                     try:
#                         int(first_part)
#                         csv_files.append(filename)
#                     except ValueError:
#                         pass  # Skip invalid filenames
#             
#             if csv_files:
#                 file_list = ','.join(csv_files)
#                 self.helper.write_uart(f"FILES:{file_list}")
#                 print(f"Sent file list: {file_list}")
#             else:
#                 self.helper.write_uart("FILES:")
#                 print("No CSV files found")
#                 
#         except Exception as e:
#             print(f"Error listing files: {e}")
#             self.helper.write_uart("FILES:ERROR")


# ============ MAIN ENTRY POINT ============

#Function for switching flag to allow thermocouple measurements to be read on set interval
def trigger_tc_scan(timer):
    global scan_pending
    scan_pending = True  # ISR sets the flag
    
tc_timer = machine.Timer(-1)
tc_timer.init(period=1000, mode=machine.Timer.PERIODIC, callback=trigger_tc_scan)

system = System()

def main():
    """Main execution loop."""
    while True:
        system.run()

if __name__ == "__main__":
    main()
    

