"""Full integration test - login, wait for MQTT, check telemetry."""
import asyncio
import sys
import math

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

from pymammotion.mammotion.devices.mammotion import Mammotion
from pymammotion.http.http import MammotionHTTP


async def test():
    m = Mammotion()
    print("=== Logging in... ===")
    await m.login_and_initiate_cloud("54222421", "0Nlyhum@n")

    devices = m.device_manager.devices
    name = next(iter(devices))
    dev = devices[name]
    print(f"Device: {name}, iot_id={dev.iot_id}")

    # Wait for MQTT ready via asyncio.Event bridge
    mqtt_ready = asyncio.Event()
    
    async def on_ready():
        print(">>> MQTT on_ready fired!")
        mqtt_ready.set()

    dev.cloud._mqtt.on_ready_event.add_subscribers(on_ready)

    print("=== Waiting for MQTT (30s max)... ===")
    try:
        await asyncio.wait_for(mqtt_ready.wait(), timeout=30)
        print("MQTT is ready!")
    except asyncio.TimeoutError:
        print("MQTT timeout")
    
    print(f"MQTT is_connected: {dev.cloud._mqtt.is_connected()}")
    print(f"MQTT is_ready: {dev.cloud._mqtt.is_ready}")

    # Fetch HTTP location (uses the already-authenticated MammotionHTTP singleton)
    http = MammotionHTTP()
    print(f"HTTP account: {http.account}, has_password: {http._password is not None}")
    try:
        resp = await http.get_user_device_list()
        if resp and resp.data:
            for d in resp.data:
                loc_vo = d.get("locationVo", {})
                loc = loc_vo.get("location")
                if loc:
                    print(f"HTTP location for {d['deviceName']}: lat={loc[1]}, lng={loc[0]}")
    except Exception as e:
        print(f"HTTP device list error: {e}")

    # Request telemetry
    print("\n=== Requesting telemetry... ===")
    try:
        await m.send_command_with_args(
            name, "request_iot_sys",
            rpt_act=1, rpt_info_type=[0, 1, 2, 3, 4, 5],
            timeout=10000, period=3000, no_change_period=4000, count=0,
        )
        print("Telemetry request sent")
    except Exception as e:
        print(f"Telemetry request failed: {e}")

    print("=== Waiting 15s for data... ===")
    await asyncio.sleep(15)

    state = dev.state
    lat = math.degrees(state.location.device.latitude) if state.location.device.latitude else 0
    lng = math.degrees(state.location.device.longitude) if state.location.device.longitude else 0
    print(f"\n--- Telemetry after wait ---")
    print(f"Position: lat={lat}, lng={lng}")
    print(f"Battery: {state.report_data.dev.battery_val}%")
    print(f"Charge state: {state.report_data.dev.charge_state}")
    print(f"Sys status: {state.report_data.dev.sys_status}")
    print(f"Satellites: {state.mowing_state.satellites_total}")
    print(f"RTK status: {state.mowing_state.rtk_status}")
    print(f"WiFi RSSI: {state.report_data.connect.wifi_rssi}")
    print(f"Online: {state.online}")

    await m.stop()

asyncio.run(test())
