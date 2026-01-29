# main.py -- put your code here!
print("Hello from the SD-Card2")

import pyb
import machine
import time

from shift_register import SR74HC595_BITBANG
from thermocouple import MAX31855






spi_bus = machine.SPI(1, baudrate=1000000, phase = 0, polarity = 0)
rclk = machine.Pin("PD14", machine.Pin.OUT)
srclk = machine.Pin("PG3", machine.Pin.OUT)
ser = machine.Pin("PF12", machine.Pin.OUT)
oe = machine.Pin("PF13", machine.Pin.OUT)
srclr = machine.Pin("PF14", machine.Pin.OUT)


sr1_bit_bang = SR74HC595_BITBANG(rclk_pin = "PD14", ser_pin = "PF12", oe_pin = "PF13", srclk_pin = "PG3", srclr_pin = "PF14")

dp1 = machine.Pin('PF15', machine.Pin.OUT)	#I/O Reigster PF12
dp2 = machine.Pin('PE14', machine.Pin.OUT)	#I/O Reigster PF12


counter = 0

tcs = [
    MAX31855(0, spi_bus),
    MAX31855(1, spi_bus),
    MAX31855(2, spi_bus),
    MAX31855(3, spi_bus),
    MAX31855(4, spi_bus),
    MAX31855(5, spi_bus),
]



def main():
    global counter
    sr1_bit_bang.clear()
    sr1_bit_bang.enable(False)
    
    for i in range(6):
        sr1_bit_bang.bit(1, True)
    sr1_bit_bang.enable(True)
    
    
    sr1_bit_bang.bit(0, True)
    
    while(1):
      

        if(counter == 6):
            counter = 0
            sr1_bit_bang.enable(False)
            sr1_bit_bang.bit(0, True)
            time.sleep_ms(100)
            sr1_bit_bang.enable(True)
        else:
            sr1_bit_bang.enable(False)
            sr1_bit_bang.bit(1, True)
            time.sleep_ms(100)
            sr1_bit_bang.enable(True)
#             
#         dp1.high()
  
        tcs[counter].read_thermocouple()
        time.sleep_ms(100)
        data = spi_bus.read(4) 
#         dp1.low()
        
        time.sleep_ms(100)
        tcs[counter].convert_temp()
        tcs[counter].print_temp(counter)
        counter = counter + 1
           
def write_csv(file, data):
    with open(file, "w") as f:
        f.writelines(data)

def read_csv(file):
    with open(file, "r") as f:
        data = f.readlines()
    return data





if __name__ == "__main__":
    print("Main File")

# sr1 = SR74HC595(spi_bus, "PD14", oe_pin = "PF12", srclr_pin = "PG3")			#Initialising the shift registers

# def callback(timer):
#     global read_flag	#Creates global instance of read flag in the interrupt
#     read_flag = True	#Read flag is set to true
#     
#     #Loops through thermocouples array and reads the temperature at the probe for each
#     for i, tc in enumerate(tcs):
#         
#         sr1.pin(i, 0)
#         