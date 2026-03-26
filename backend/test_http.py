"""Check MammotionHTTP API."""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from pymammotion.http.http import MammotionHTTP


async def test():
    http = MammotionHTTP()
    print("Has cloud_service:", hasattr(http, "cloud_service"))
    attrs = [a for a in dir(http) if not a.startswith("_")]
    print("Attrs:", attrs)

    # Try fetching device list - this should work if login was done previously
    try:
        resp = await http.cloud_service.get_user_device_list()
        print("Device list response:", resp)
    except Exception as e:
        print("Error:", e)

asyncio.run(test())
