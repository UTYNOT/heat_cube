import machine
from machine import Timer, RTC
import time

# Flag to indicate a timer tick
scan_pending = False

# Initialize RTC
rtc = RTC()
# Timer callback - only sets a flag
def tc_scan(timer):
    global scan_pending
    scan_pending = True

# Set up a periodic timer (every 1 second here)
scan_timer = Timer(-1)
scan_timer.init(period=2000, mode=Timer.PERIODIC, callback=tc_scan)  # 1000ms = 1s

# Main loop
while True:
    if scan_pending:
        scan_pending = False
        dt = rtc.datetime()
        # Format: YYYY-MM-DD HH:MM:SS
        date_str = "{:04d}-{:02d}-{:02d}".format(dt[0], dt[1], dt[2])
        time_str = "{:02d}:{:02d}:{:02d}".format(dt[4], dt[5], dt[6])
        print(f"RTC Time: {date_str} {time_str}")
    
    else:
        print("helllllllllllllllllllllaaaifnai")
        for i in range(10000):
            pass
    time.sleep_ms(10)  # small sleep to avoid busy-looping
