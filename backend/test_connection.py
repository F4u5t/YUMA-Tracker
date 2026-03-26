"""Test connection to Mammotion cloud and dump device info."""

import asyncio
import logging
import os
import sys

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

async def test():
    email = os.getenv("MAMMOTION_EMAIL", "")
    password = os.getenv("MAMMOTION_PASSWORD", "")
    print(f"\n=== Testing Mammotion Cloud Connection ===")
    print(f"Account: {email}")
    print()

    try:
        from pymammotion.mammotion.devices.mammotion import Mammotion
        mammotion = Mammotion()
        
        print("[1] Logging in...")
        cloud_client = await mammotion.login(email, password)
        print(f"    Login successful!")
        
        # Check HTTP device records
        http = cloud_client.mammotion_http
        print(f"\n[2] Device records from HTTP:")
        if hasattr(http, 'device_records') and http.device_records:
            for rec in http.device_records.records:
                print(f"    - {rec.device_name} (iot_id={rec.iot_id}, product_key={rec.product_key})")
        else:
            print("    No device records found via HTTP")

        # Check cloud devices by account
        print(f"\n[3] Devices by account (Aliyun):")
        if hasattr(cloud_client, 'devices_by_account_response') and cloud_client.devices_by_account_response:
            devs = cloud_client.devices_by_account_response.data.data
            for d in devs:
                print(f"    - {d.device_name} (iot_id={d.iot_id}, product={d.product_name}, model={getattr(d, 'product_model', 'N/A')})")
        else:
            print("    No devices by account response")

        print(f"\n[4] Initiating cloud connection...")
        await mammotion.initiate_cloud_connection(email, cloud_client)
        print(f"    Cloud connection initiated!")

        print(f"\n[5] Device manager state:")
        devices = mammotion.device_manager.devices
        print(f"    Mower devices: {list(devices.keys())}")
        rtk = mammotion.device_manager.rtk_devices
        print(f"    RTK devices: {list(rtk.keys())}")

        if devices:
            name = next(iter(devices))
            dev = devices[name]
            state = dev.state
            print(f"\n[6] Mower '{name}' state:")
            print(f"    Online: {state.online}")
            print(f"    Battery: {state.report_data.dev.battery_val}")
            print(f"    Sys status: {state.report_data.dev.sys_status}")
            print(f"    RTK lat/lon: {state.location.RTK.latitude}, {state.location.RTK.longitude}")
            print(f"    Device lat/lon: {state.location.device.latitude}, {state.location.device.longitude}")
            print(f"    Satellites: {state.mowing_state.satellites_total}")
            print(f"    RTK status: {state.mowing_state.rtk_status}")
            print(f"    Plans: {list(state.map.plan.keys())}")
            print(f"    Areas: {list(state.map.area.keys())}")
            print(f"    Area names: {[(a.hash, a.name) for a in state.map.area_name]}")
            
            # Try requesting telemetry
            print(f"\n[7] Requesting telemetry report...")
            try:
                if dev.cloud:
                    await dev.cloud.command("request_iot_sys",
                        rpt_act=1,
                        rpt_info_type=[0, 1, 2, 3, 4, 5],
                        timeout=10000,
                        period=3000,
                        no_change_period=4000,
                        count=0,
                    )
                    print("    Telemetry request sent!")
                    print("    Waiting 10 seconds for data...")
                    await asyncio.sleep(10)
                    
                    print(f"\n[8] Updated state after waiting:")
                    print(f"    Battery: {state.report_data.dev.battery_val}")
                    print(f"    RTK lat/lon: {state.location.RTK.latitude}, {state.location.RTK.longitude}")
                    print(f"    Device lat/lon: {state.location.device.latitude}, {state.location.device.longitude}")
                    print(f"    Satellites: {state.mowing_state.satellites_total}")
                else:
                    print("    No cloud connection on device")
            except Exception as e:
                print(f"    Telemetry request failed: {e}")

        print("\n[9] Stopping...")
        await mammotion.stop()
        print("    Done!")

    except Exception as e:
        print(f"\n!!! Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
