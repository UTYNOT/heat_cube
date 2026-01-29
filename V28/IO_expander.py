import pyb
import machine
import time

# Class for the I/O expander
class MCP23S17:
    # Addressing for IO expander
    # Using IOCON.BANK = 0 (Default)

    IOCON 	= 0x05	#Address of the configuration register
    IODIRA 	= 0x00	#Address of the register that defines the direction of the port bits for port A
    IODIRB 	= 0x01	#Address of the register that defines the direction of the port bits for port B
    GPIOA 	= 0x12	#Address of the register that controls the GPIO pins for port A
    GPIOB 	= 0x13	#Address of the register that controls the GPIO pins for port B
    OLATA 	= 0x14	#Address of the register that controls the output latch for port A
    OLATB 	= 0x15	#Address of the register that controls the output latch for port B
    
    WRITE_OPCODE 	= 0x40			#Write opcode
    READ_OPCODE 	= 0x41			#Read opcode
    write_buffer 	= bytearray(3)	#Creates a three byte array for writing
    read_buffer 	= bytearray(3)	#Creates a three byte array for reading
    
    #0x00 defines IODIRX as all outputs and 0xFF defines IODIRX as all inputs
    IODIR_OUTPUT_CONFIG = 0x00	#IODIRX Configuration
    ALL_PINS_HIGH 		= 0xFF #All pins are high
    
    
    def __init__(self, cs_pin_name, spi_bus):
        self.spi_bus = spi_bus	#Spi bus creation
        self.cs = machine.Pin(cs_pin_name, machine.Pin.OUT)	#Sets own chip select pin register for the I/O expander to be an output
        self.cs.high()	#Pulls up CS to ensure no communication is active
        
        self.write_register(self.IODIRA, self.IODIR_OUTPUT_CONFIG)	#Writing port A as outputs
        self.write_register(self.IODIRB, self.IODIR_OUTPUT_CONFIG)	#Writing port B as outputs
        self.write_register(self.OLATA, self.ALL_PINS_HIGH)			#Sets all pins high for the OLATA port
    
    
    def write_register(self, reg, value):
        # Function to write a value to a register, 0x40 is the write opcode, reg is the desired register to write to, and value is the value to write to the register 
        self.cs.low()	#Pulls down chip select signal for 1st IO expander to initiate communication
        
        self.write_buffer[0] = self.WRITE_OPCODE	#Writes OPCODE
        self.write_buffer[1] = reg					#Writes desired register value to write to
        self.write_buffer[2] = value				#Writes desired value to register
        self.spi_bus.write(self.write_buffer)		#Writes 3 bytes on the SPI bus
        self.cs.high()								#Pulls up chip select signal for 1st IO expander to end communication
    
    def write_OLATA(self, value):
        self.write_register(self.OLATA, value)		#Writes value to OLATA register
        
    def write_OLATB(self, value):
        self.write_register(self.OLATB, value)		#Writes value to OLATB register



if __name__ == "__main__":
    print("IO Expander Module File")
    spi_bus = machine.SPI(1, baudrate=10000000)	#Initialising SPI bus 1
    io_expander1 = MCP23S17("PD14", spi_bus)
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    