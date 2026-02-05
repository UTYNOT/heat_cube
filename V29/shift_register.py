import pyb
import machine
import time

class SR74HC595:
    #Initiiliases the shift register/s
    def __init__(self, spi_bus, rclk_pin, length = 1, srclr_pin = None, oe_pin = None):
        
        self.spi_bus = spi_bus	#SPI bus lane      
        self.buf = bytearray(length)	#Creates a byte buffer array depending on how many shift registers           
        self.rclk = machine.Pin(rclk_pin, machine.Pin.OUT)	#Sets own register clock/latch pin to be an output
        
        #Initiliases srclr (Shift register clear)
        if srclr_pin == None:
            self.srclr = None
        
        else:
            self.srclr = machine.Pin(srclr_pin, machine.Pin.OUT)	#Sets own srclr register to be an output
            self.srclr.high()	#Initilises srclr (shift register clear) pin to high for normal operation
        
        #Initilises oe output enable
        if oe_pin == None:
            self.oe = None
        else:
            self.oe = machine.Pin(oe_pin, machine.Pin.OUT)
            self.oe.low()	#Activates output enable (active low)
        
        #Initliases all the shift register pins to high first
        for i in range(length * 8):
            self.pin(i, 1, latch=False)   # set all pins HIGH
        self._write(latch=True)  
        
    
    #Writes the buffer value into the shift register
    def _write(self, latch = False):
        self.spi_bus.write(self.buf)	#Writes over the spi the buffer
        if(latch):
            self.latch()
    
    
    #Can read value of a pin, write value to a pin and
    def pin(self, pin, value = None, latch = True):
        if value is None:
            return (self.buf[pin // 8] >> (pin % 8)) & 1 # If no value is set return the state of the current pin
        elif value:	#If value is set high, set that pin high
            self.buf[pin//8] |= 1 << (pin % 8)
        else:
            self.buf[pin // 8] &= ~(1 << (pin % 8))
        self._write(latch)
         
    #Flips the logic recorded on the current pin
    def toggle(self, pin, latch = True):
        self.buf[pin//8] ^= 1 << (pin % 8)
        self._write(latch)
    
    def clear(self, latch = True):
        #Ff there is no srclr pin configured then raise runtime error
        if self.srclr is None:
            raise RuntimeError("no srclr pin")
        #Clears the shift register and sets all pins low
        self.srclr(0)
        self.srclr(1)
        
        #Latches the register/sends the write fully over
        if latch:
            self.latch()
        
    #Pulse the RCLK (latch) pin to copy the current shift register contents to the output pins (Q0–Q7). This updates all outputs simultaneously
    def latch(self):
        self.rclk.high()
        self.rclk.low()

class SR74HC595_BITBANG:
    
    #Initiliases the shift register (bit bang version)
    def __init__(self, rclk_pin, ser_pin, srclk_pin, srclr_pin, oe_pin):
         
        self.rclk = machine.Pin(rclk_pin, machine.Pin.OUT)
        self.ser = machine.Pin(ser_pin, machine.Pin.OUT)
        self.srclk = machine.Pin(srclk_pin, machine.Pin.OUT)
        
        self.oe = machine.Pin(oe_pin, machine.Pin.OUT)
        self.srclr = machine.Pin(srclr_pin, machine.Pin.OUT)
            
        self.enable()	#Initiliases output enable
    
    #Triggers a clk pulse to write ser value to the register
    def _clock(self):
        self.srclk(1)
        self.srclk(0)
    
    #Writes a bit to the shift register depending on value
    def bit(self, value, latch = False):
        if value:
            self.ser.high()
        else:
            self.ser.low()
        #Triggers a clock pulse in order to write that bit the shift register
        self._clock()
        
        #Latches contents onto output registers 
        if latch:
            self.latch()
            
    def bits(self, value, num_bits, latch=False):
        for i in range(num_bits):
            self.bit((value >> i) & 1)
        if latch:
            self.latch()
    
            
    #Pulse the RCLK (latch) pin to copy the current shift register contents to the output pins (Q0–Q7). This updates all outputs simultaneously
    def latch(self):
        self.rclk.high()
        self.rclk.low()
    
    #Clears the contents of the shift register
    def clear(self, latch = True):
        self.srclr.low()
        self.srclr.high()
        if latch:
            self.latch()
    
    #Enables the shift register 
    def enable(self, enabled = True):
        self.oe.value(not enabled)

if __name__ == "__main__":
    print("Shift register File")
