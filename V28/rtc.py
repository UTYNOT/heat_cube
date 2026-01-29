import machine
import pyb
import time

rtc = machine.RTC()

user_btn = machine.Pin("PC13", machine.Pin.IN, machine.Pin.PULL_DOWN)

def user_btn_clicked(): 
    if(user_btn.value()): 
        dt = rtc.datetime() 
        formatted = "{:04}-{:02}-{:02} {:02}:{:02}:{:02}".format( dt[0], dt[1], dt[2], dt[4], dt[5], dt[6] ) 
        print("Current RTC time:", formatted)


def main():
    while(1):
        user_btn_clicked()

main()