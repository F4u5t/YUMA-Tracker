"""Test running inside uvicorn's event loop (simulating backend behavior)."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("pymammotion.mqtt").setLevel(logging.DEBUG)

import math
from pymammotion.mammotion.devices.mammotion import Mammotion


async def test():
    m = Mammotion()
    await m.login_and_initiate_cloud("54222421", "0Nlyhum@n")

    name = next(iter(m.device_manager.devices))
    dev = m.device_manager.devices[name]
    print(f"Device: {name}")

    # Wait for any MQTT ready  
    any_ready = asyncio.Event()
    async def flag():
        any_ready.set()
    for mqtt in m.mqtt_list.values():
        mqtt.on_ready_event.add_subscribers(flag)
    
    print("Waiting for MQTT...")
    try:
        await asyncio.wait_for(any_ready.wait(), timeout=30)
        print("MQTT ready!")
    except asyncio.TimeoutError:
        print("MQTT timeout")
    
    for key, mqtt in m.mqtt_list.items():
        print(f"  {key}: connected={mqtt.is_connected()}, ready={mqtt.is_ready}")

    # Request telemetry
    print("Requesting telemetry...")
    try:
        await m.send_command_with_args(
            name, "request_iot_sys",
            rpt_act=1, rpt_info_type=[0, 1, 2, 3, 4, 5],
            timeout=10000, period=3000, no_change_period=4000, count=0,
        )
        print("Request sent!")
    except Exception as e:
        print(f"Request failed: {e}")

    # Wait and check periodically
    for i in range(12):
        await asyncio.sleep(5)
        state = dev.state
        bat = state.report_data.dev.battery_val
        sats = state.mowing_state.satellites_total
        lat = math.degrees(state.location.device.latitude) if state.location.device.latitude else 0
        print(f"  [{i*5+5}s] Battery={bat}% Sats={sats} Lat={lat:.6f}")
        if bat > 0:
            print("  >>> GOT DATA!")
            break

    await m.stop()

asyncio.run(test())
