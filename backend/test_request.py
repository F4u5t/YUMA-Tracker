"""Request telemetry after MQTT is ready and watch for data."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("pymammotion.mqtt").setLevel(logging.DEBUG)
logging.getLogger("pymammotion.mammotion.devices").setLevel(logging.DEBUG)

from pymammotion.mammotion.devices.mammotion import Mammotion


async def test():
    m = Mammotion()
    await m.login_and_initiate_cloud("54222421", "0Nlyhum@n")

    name = next(iter(m.device_manager.devices))
    dev = m.device_manager.devices[name]
    print(f"Device: {name}")

    # Wait for BOTH MQTT connections
    for key, mqtt in m.mqtt_list.items():
        ready = asyncio.Event()
        async def on_rdy(k=key, e=ready):
            print(f"  >>> {k} ready!")
            e.set()
        mqtt.on_ready_event.add_subscribers(on_rdy)
        try:
            await asyncio.wait_for(ready.wait(), timeout=15)
        except asyncio.TimeoutError:
            print(f"  {key}: timed out waiting for ready")
        print(f"  {key}: connected={mqtt.is_connected()}, ready={mqtt.is_ready}")

    # Check what MQTT topics are subscribed
    print(f"\n=== MQTT client info ===")
    mm_mqtt = dev.cloud._mqtt._mqtt_client
    print(f"MammotionMQTT type: {type(mm_mqtt).__name__}")
    for attr in dir(mm_mqtt):
        if "topic" in attr.lower() or "sub" in attr.lower():
            print(f"  .{attr}")

    # Try to send commands through the Mammotion wrapper
    print("\n=== Requesting data ===")
    
    # Try request_iot_sys
    try:
        result = await m.send_command_with_args(
            name, "request_iot_sys",
            rpt_act=1, rpt_info_type=[0, 1, 2, 3, 4, 5],
            timeout=10000, period=3000, no_change_period=4000, count=0,
        )
        print(f"request_iot_sys result: {str(result)[:200]}")
    except Exception as e:
        print(f"request_iot_sys error: {e}")

    # Try get_report_cfg
    try:
        result = await m.send_command_with_args(name, "get_report_cfg")
        print(f"get_report_cfg result: {str(result)[:200]}")
    except Exception as e:
        print(f"get_report_cfg error: {e}")

    print("\n=== Waiting 15s... ===")
    await asyncio.sleep(15)

    state = dev.state
    print(f"Battery: {state.report_data.dev.battery_val}")
    print(f"Sys status: {state.report_data.dev.sys_status}")
    print(f"Online: {state.online}")

    await m.stop()

asyncio.run(test())
