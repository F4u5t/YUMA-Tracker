"""Check MQTT connection details."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from pymammotion.mammotion.devices.mammotion import Mammotion


async def check():
    m = Mammotion()
    await m.login_and_initiate_cloud("54222421", "0Nlyhum@n")
    name = next(iter(m.device_manager.devices))
    dev = m.device_manager.devices[name]
    mqtt = dev.cloud._mqtt
    print(f"is_connected(): {mqtt.is_connected()}")

    # All non-callable MQTT attrs
    for attr in sorted(dir(mqtt)):
        if not attr.startswith("__"):
            try:
                val = getattr(mqtt, attr)
                if not callable(val):
                    val_str = str(val)[:200]
                    print(f"  mqtt.{attr} = {val_str}")
            except Exception:
                pass

    # Check the inner mqtt client
    if hasattr(mqtt, "_mammotion_mqtt"):
        mm = mqtt._mammotion_mqtt
        print(f"\nmammotion_mqtt type: {type(mm).__name__}")
        print(f"mammotion_mqtt.is_connected: {mm.is_connected if hasattr(mm, 'is_connected') else 'N/A'}")

    if hasattr(mqtt, "_mqtt_client"):
        mc = mqtt._mqtt_client
        print(f"\nmqtt_client type: {type(mc).__name__}")
        
    await m.stop()

asyncio.run(check())
