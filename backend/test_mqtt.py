"""Check MQTT connection and data flow."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from pymammotion.mammotion.devices.mammotion import Mammotion


async def check():
    m = Mammotion()
    await m.login_and_initiate_cloud("54222421", "0Nlyhum@n")

    devices = m.device_manager.devices
    name = next(iter(devices))
    dev = devices[name]

    print(f"Device: {name}")
    print(f"Has cloud: {dev.cloud is not None}")
    if dev.cloud:
        print(f"Cloud type: {type(dev.cloud).__name__}")
        attrs = [a for a in dir(dev.cloud) if "mqtt" in a.lower() or "connect" in a.lower()]
        print(f"Cloud attrs (mqtt/connect): {attrs}")

    # Check MQTT connection
    if dev.cloud and dev.cloud._mqtt:
        mqtt = dev.cloud._mqtt
        print(f"\nMQTT client type: {type(mqtt).__name__}")
        print(f"MQTT is_connected: {mqtt.is_connected}")
        
        # Try to connect if not connected
        if not mqtt.is_connected:
            print("MQTT not connected, trying connect_async...")
            try:
                await mqtt.connect_async()
                await asyncio.sleep(5)
                print(f"MQTT is_connected after connect: {mqtt.is_connected}")
            except Exception as e:
                print(f"Connect failed: {e}")
    
    # Try requesting telemetry
    try:
        print("\nSending request_iot_sys...")
        await m.send_command_with_args(
            name,
            "request_iot_sys",
            rpt_act=1,
            rpt_info_type=[0, 1, 2, 3, 4, 5],
            timeout=10000,
            period=3000,
            no_change_period=4000,
            count=0,
        )
        print("request_iot_sys sent successfully")
    except Exception as e:
        print(f"request_iot_sys failed: {e}")

    # Wait for MQTT data
    print("\nWaiting 15s for MQTT telemetry...")
    await asyncio.sleep(15)

    state = dev.state
    print(f"\n--- State after wait ---")
    print(f"Battery: {state.report_data.dev.battery_val}")
    print(f"Sys status: {state.report_data.dev.sys_status}")
    print(f"Charge state: {state.report_data.dev.charge_state}")
    print(f"Online: {state.online}")
    print(f"Device lat: {state.location.device.latitude}")
    print(f"Device lng: {state.location.device.longitude}")
    print(f"RTK lat: {state.location.RTK.latitude}")
    print(f"RTK lng: {state.location.RTK.longitude}")
    print(f"Dock lat: {state.location.dock.latitude}")
    print(f"Dock lng: {state.location.dock.longitude}")
    print(f"Satellites: {state.mowing_state.satellites_total}")

    await m.stop()


asyncio.run(check())
