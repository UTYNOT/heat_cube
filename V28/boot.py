# boot.py -- run on boot to configure USB and filesystem
# Put app code in main.py

import machine
import pyb
import time
pyb.main('state_machine.py') # main script to run after this one
#pyb.usb_mode('VCP+MSC') # act as a serial and a storage device
#pyb.usb_mode('VCP+HID') # act as a serial device and a mouse
#import network
#network.country('US') # ISO 3166-1 Alpha-2 code, eg US, GB, DE, AU or XX for worldwide
#network.hostname('...') # DHCP/mD