"""Check MQTT connection details and subscribe to events."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# Enable pymammotion debug for MQTT messages
logging.getLogger("pymammotion.mqtt").setLevel(logging.DEBUG)

from pymammotion.mammotion.devices.mammotion import Mammotion


async def test():
    m = Mammotion()
    await m.login_and_initiate_cloud("54222421", "0Nlyhum@n")

    print(f"\n=== MQTT connections ===")
    for key, mqtt in m.mqtt_list.items():
        print(f"  {key}: connected={mqtt.is_connected()}, ready={mqtt.is_ready}")

    name = next(iter(m.device_manager.devices))
    dev = m.device_manager.devices[name]
    print(f"\nDevice: {name}")
    print(f"  cloud type: {type(dev.cloud).__name__ if dev.cloud else 'None'}")
    print(f"  cloud._mqtt type: {type(dev.cloud._mqtt).__name__ if dev.cloud else 'None'}")
    print(f"  cloud._mqtt._mqtt_client type: {type(dev.cloud._mqtt._mqtt_client).__name__ if dev.cloud else 'None'}")

    # Wait for MQTT
    mqtt_ready = asyncio.Event()
    async def on_ready():
        mqtt_ready.set()
    dev.cloud._mqtt.on_ready_event.add_subscribers(on_ready)
    
    try:
        await asyncio.wait_for(mqtt_ready.wait(), timeout=30)
        print("\nMQTT ready!")
    except asyncio.TimeoutError:
        print("\nMQTT timeout")

    # Subscribe to notification events to see what data arrives
    received_data = []
    
    async def on_notification(data):
        print(f"\n>>> NOTIFICATION: {str(data)[:200]}")
        received_data.append(data)

    # Listen for state changes
    dev.cloud.set_notification_callback(on_notification)

    print("\nWaiting 20s for any data...")
    await asyncio.sleep(20)
    
    print(f"\nReceived {len(received_data)} notifications")
    
    state = dev.state
    print(f"Battery: {state.report_data.dev.battery_val}%")
    print(f"Online: {state.online}")

    await m.stop()

asyncio.run(test())
