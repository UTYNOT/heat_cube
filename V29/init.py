"""
Init Module
Manages thermocouple readings and communication for the Heat Cube system.
"""
import machine
import time

from shift_register import SR74HC595_BITBANG
from thermocouple import MAX31855
    

# ============ CONFIGURATION ============
DEBUG_PIN = machine.Pin("PD14", machine.Pin.OUT)  # Debug pin for timing measurements


PCB_ENABLE1 = machine.Pin("PG0", machine.Pin.OUT)  # Debug pin for timing measurements
PCB_ENABLE2 = machine.Pin("PG1", machine.Pin.OUT)  # Debug pin for timing measurements
PCB_ARRAY = [PCB_ENABLE1, PCB_ENABLE2]

DEBUG_PIN1 = machine.Pin("PE9", machine.Pin.OUT)  # Debug pin for timing measurements
DEBUG_PIN2 = machine.Pin("PE11", machine.Pin.OUT)  # Debug pin for timing measurements
DEBUG_PIN3 = machine.Pin("PE13", machine.Pin.OUT)  # Debug pin for timing measurements
# ============ THERMOCOUPLE MANAGER CLASS ============
class TC_MANAGER:
    """
    Manages thermocouple readings for the Heat Cube system.
    
    Handles initialization, selection, and measurement of up to 256 thermocouples
    using shift registers and SPI communication.
    """
    
    def __init__(self, total_tc, sr1_bit_bang, spi_bus, MAX31855, uart):
        """
        Initialize the thermocouple manager.
        
        Args:
            total_tc: Total number of thermocouples to scan (e.g., 256)
            sr1_bit_bang: Instance of shift register class
            spi_bus: SPI bus for communication
            MAX31855: MAX31855 thermocouple class instance
            uart: UART interface for serial communication
        """
        self.total_tc = total_tc
        self.num_tcs = 0
        self.tcs_array = []
        self.tcs_active = []
        self.sr1_bit_bang = sr1_bit_bang
        self.spi_bus = spi_bus
        self.MAX31855 = MAX31855
        self.uart = uart
        
        self.PCB_ENABLE1 = machine.Pin("PG0", machine.Pin.OUT)  # Pin for enabling the 1st PCB
        self.PCB_ENABLE2 = machine.Pin("PG1", machine.Pin.OUT)  # Pin for enabling the 2nd PCB
        self.PCB_ARRAY = [PCB_ENABLE1, PCB_ENABLE2]
        
        self.pcb_tc_count = 16 #Number of thermocouples for each PCB
        
        self.init_tc()
        
    
    def init_tc(self):
        """
        Initialize and detect all active thermocouples.
        
        Scans through all possible thermocouple positions and detects
        which ones are actually connected and responding.
        """
        # Clear all registers and disable output
        self.sr1_bit_bang.clear()
        self.sr1_bit_bang.enable(False)

        # Pull all !CS high on TC chips (active low, so 1 = high = inactive)
        for _ in range(self.total_tc):
            time.sleep_ms(10)
            self.sr1_bit_bang.bit(1, False)

        # Enable output to send the high signals
        self.sr1_bit_bang.enable(True)
        self.sr1_bit_bang.enable(False)

        # Load shift register with 0 initially (first TC will be active)
        self.sr1_bit_bang.bit(0, True)
        time.sleep_ms(10)

        # Scan for active thermocouples
        for i in range(self.total_tc):
            
            pcb_num = i // self.pcb_tc_count # Each PCB has 16 thermocouples 
            self.pcb_select(pcb_num)
            
            time.sleep_ms(10)
            self.sr1_bit_bang.enable(True)
            data = self.spi_bus.read(4)
            self.sr1_bit_bang.enable(False)
            self.sr1_bit_bang.bit(1, True)  # Pull CS high again
        
            # Check for valid thermocouple data
            # If data is all zeros, no MAX31855 chip is present
            if data != b'\x00\x00\x00\x00':
                tc_obj = self.MAX31855(i + 1, self.spi_bus, data)
                self.tcs_array.append(tc_obj)

        # Update active thermocouple count
        self.num_tcs = len(self.tcs_array)

        # Populate active thermocouple CS pin list
        for tc in self.tcs_array:
            self.tcs_active.append(tc.cs_pin)
    
    def tc_select_singular(self, tc_selected):
        """
        Select and read a single thermocouple.
        
        Args:
            tc_selected: Index of thermocouple to select (1-based)
            
        Returns:
            String with probe and reference temperature data, or None if invalid
        """
        if tc_selected > self.num_tcs or tc_selected < 1:
            print(f"Invalid TC selected: {tc_selected} (valid range: 1-{self.num_tcs})")
            return None
        
        try:
            #Ensures the correct pcb is select to read off MISO line
            pcb_num = (tc_selected - 1) // self.pcb_tc_count
            self.pcb_select(pcb_num)            
            
            # Create bit pattern: all 1s except for selected TC (active low)
            pattern = (1 << self.num_tcs) - 1
            pattern &= ~(1 << (self.num_tcs - tc_selected))
            
            # Apply pattern to shift register
            self.sr1_bit_bang.enable(False)
            time.sleep_ms(100)
            self.sr1_bit_bang.bits(pattern, self.num_tcs, True)
            time.sleep_ms(100)
            
            self.sr1_bit_bang.enable(True)
            # Read thermocouple data
            self.tcs_array[tc_selected - 1].read_thermocouple()
        
            time.sleep_ms(100)
            self.sr1_bit_bang.enable(False)
            self.tcs_array[tc_selected - 1].convert_temp()
            print(self.tcs_array[tc_selected - 1].convert_temp())
            
            # Format and return data string
            data_str = "Probe_Data{}, Ref Data: {},{}".format(
                tc_selected,
                self.tcs_array[tc_selected - 1].tc_c,
                self.tcs_array[tc_selected - 1].cj_c
            )
            
            return data_str
            
        except (ValueError, IndexError) as e:
            print(f"Error selecting TC {tc_selected}: {e}")
            return None
    
    def tc_set(self):
        """
        Set all active thermocouples to inactive state (CS high).
        
        Used to prepare for measurement mode where all TCs are scanned.
        """
        self.sr1_bit_bang.clear()
        self.sr1_bit_bang.enable(False)
        
        for i in range(self.num_tcs):
            time.sleep_ms(10)
            self.sr1_bit_bang.bit(1, True)
    
    def tc_measure(self):
        """
        Measure all active thermocouples sequentially.
        
        Scans through all active thermocouples and reads their temperatures.
        
        Returns:
            Comma-separated string of probe temperatures for all active TCs
        """
        data_str = ''
        
        # Start with first TC active (0 = active low)
        self.sr1_bit_bang.bit(0, True)

        for i in range(self.num_tcs):
            time.sleep_ms(10)
            
            pcb_num = i//self.pcb_tc_count
            self.pcb_select(pcb_num)
            
            # Enable current TC (!CS Pulled Low)
            self.sr1_bit_bang.enable(True)
            # Read thermocouple
            self.tcs_array[i].read_thermocouple()
      
            #Disable current TC (!CS Pulled High)
            self.sr1_bit_bang.enable(False)
            
            # Prepare next TC (if not last)
            if i < self.num_tcs - 1:
                self.sr1_bit_bang.bit(1, True)  # Shift in 1 to deactivate previous TC
        
        
        for i in range(self.num_tcs):
            # Convert temperature after reading
            self.tcs_array[i].convert_temp()
            
            # Append temperature to data string
            data_str += f"{self.tcs_array[i].tc_c},"

        # Remove trailing comma
        data_str = data_str.rstrip(',')
        return data_str
    
    
    #Pulls the selected pcb's 125 pin low so MISO line can be read
    def pcb_select(self, pcb_num):
        
        #Iterates through all pcb's and pulls the selected one low and the other ones high
        for i, pcb in enumerate(self.PCB_ARRAY):
            if i == pcb_num:
                pcb.low()
            else:
                pcb.high()
        