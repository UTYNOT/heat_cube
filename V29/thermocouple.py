import pyb
import machine
import time

#Class for thermocouple chip (MAX31855)
class MAX31855:
    size = 8						#Array size variable
    
    #Initiliase the thermocouple
    def __init__(self, cs_pin, spi_bus, raw_data):
        self.cs_pin = cs_pin		#Chip select pin for the IO expander
        self.spi_bus = spi_bus		#Spi bus lane
        self.raw_tc_data = raw_data	#Raw data from the thermocouple
        self.raw_tc_integer = 0		#Raw data from the thermocouple as an integer
        self.tc_data = 0			#Thermocouple probe data in binary
        self.tc_ref_data = 0		#Thermocouple reference data in binary
        self.tc_c = 0				#Thermocouple probe temperature in celcius
        self.cj_c = 0				#Thermocouple reference temperature in celcius
        self.tc_buf = [0] * self.size	#Thermocouple probe temperature array
        self.error_flag = False	#Thermocouple error flag
        self.error_data = 0	#Thermocouple error data
        self.tc_total = 0 #Thermocouple probe total temperature value
        self.tc_avg = 0	#Thermocouple probe temperature average
            
        self.counter = 0			#Array counter used to fill temperature array
        
        # Position data of the thermocouple
        self.x = 0
        self.y = 0
        self.z = 0

        self.convert_temp()
        
    def read_thermocouple(self):
        self.raw_tc_data = self.spi_bus.read(4)    #Read the thermocouple value from spi bus
    
    #Converts temperature of data recived from thermocouple into degrees
    def convert_temp(self):
        self.raw_tc_integer = int.from_bytes(self.raw_tc_data, 'big') #Converts raw thermocouple data from hex using big indiannes to a binary integer
        self.error_data = self.raw_tc_integer & 0xF	#Stores the error data
        
        #Checks if there is error in the thermocouple and turns a flag true or false
        if(self.error_data != 0):
            self.error_flag = True
        else:
            self.error_flag = False
            
        self.tc_data = self.raw_tc_integer >> 18		#Shifting value by 18 since thermocouple data is only bits [31:18]
        self.tc_ref_data = (self.raw_tc_integer >> 4) & 0xFFF	#Bit masking for the reference temperature data since [15:4] is the reference temp data
          
        self.tc_c = self.tc_data * 0.25		#Each bit represents 0.25 degrees celcius of probe temperature 
        self.cj_c = self.tc_ref_data * 0.0625	#Each bit represents 0.0625 degrees celcius of reference temperature
        #self.fill_array_tc_probe()				#Calls function to fill up thermocouple probe array
    
    def fill_array_tc_probe(self):
        #When counter is 0 initally populates buffer with first temperature value from probe else just populate one index
        if(self.counter == 0):
            # Fills buffer up with first value obtained from temperature probe
            for i in range(self.size):
                self.tc_buf[i] = self.tc_c
            self.tc_total = self.tc_c * self.size	#Obtains total of tc_buf 
            self.counter = self.counter + 1			#Exits initialisation
        else:
            old_value = self.tc_buf[self.counter - 1]				#Obtains "old" value of array	
            self.tc_buf[self.counter - 1] = self.tc_c				#Populates index counter - 1 with temperature probe value
            self.tc_total = self.tc_total + (self.tc_c - old_value)	#Adds difference between new reading and old reading
            self.tc_avg = self.tc_total >> 3 						#Bit shift by 3 to divide by 8
            self.counter = (self.counter % 8) + 1					#Increments counter by 1 and resets at counter = 8
            
    def print_temp(self, index = None):
        label = f"Thermocouple {index}" if index is not None else "Thermocouple" #Gives the thermocouple an index label if one is assigned 
        print(f'{label} temp: {self.tc_c} °C')	#Prints current probe temp
        print(f'{label} Ref temp: {self.cj_c} °C\n')	#Prints current ref temp
        
    def average_info(self, index = None):
        label = f"Thermocouple {index}" if index is not None else "Thermocouple"
        print(f'{label} average temp: {self.tc_avg} °C')
        


if __name__ == "__main__":
    print("Thermocouple Module File")
#     spi_bus = 