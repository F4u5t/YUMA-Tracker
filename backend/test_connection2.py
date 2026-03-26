"""Deep diagnostic for Mammotion device discovery."""

import asyncio
import logging
import os

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

async def test():
    email = os.getenv("MAMMOTION_EMAIL", "")
    password = os.getenv("MAMMOTION_PASSWORD", "")

    from pymammotion.http.http import MammotionHTTP

    print(f"=== Deep Device Discovery ===")
    print(f"Account: {email}")
    print()

    http = MammotionHTTP()

    # Step 1: Login
    print("[1] Login (v2)...")
    login_resp = await http.login_v2(email, password)
    print(f"    Login response type: {type(login_resp)}")
    if hasattr(http, 'login_info') and http.login_info:
        info = http.login_info
        print(f"    User info: {info}")
        if hasattr(info, 'userInformation'):
            ui = info.userInformation
            print(f"    userId: {getattr(ui, 'userId', 'N/A')}")
            print(f"    email: {getattr(ui, 'email', 'N/A')}")
            print(f"    domainAbbreviation: {getattr(ui, 'domainAbbreviation', 'N/A')}")
            print(f"    areaCode: {getattr(ui, 'areaCode', 'N/A')}")
    
    # Step 2: Get user device page
    print("\n[2] Get user device page...")
    try:
        page_resp = await http.get_user_device_page()
        print(f"    Response: {page_resp}")
    except Exception as e:
        print(f"    Error: {e}")

    # Step 3: Get user device list
    print("\n[3] Get user device list...")
    try:
        list_resp = await http.get_user_device_list()
        print(f"    Response: {list_resp}")
    except Exception as e:
        print(f"    Error: {e}")

    # Step 4: Check device_records
    print("\n[4] Device records:")
    if hasattr(http, 'device_records'):
        dr = http.device_records
        print(f"    Type: {type(dr)}")
        print(f"    Content: {dr}")
        if hasattr(dr, 'records'):
            print(f"    Records count: {len(dr.records)}")
            for r in dr.records:
                print(f"    - {r}")
    
    # Step 5: Get MQTT credentials
    print("\n[5] MQTT credentials...")
    try:
        mqtt_resp = await http.get_mqtt_credentials()
        print(f"    Response: {mqtt_resp}")
        if hasattr(http, 'mqtt_credentials') and http.mqtt_credentials:
            mc = http.mqtt_credentials
            print(f"    Hostname: {getattr(mc, 'hostname', 'N/A')}")
            print(f"    Client ID: {getattr(mc, 'client_id', 'N/A')}")
    except Exception as e:
        print(f"    Error: {e}")

    # Step 6: Try full Mammotion flow with cloud gateway
    print("\n[6] Full CloudIOTGateway flow...")
    from pymammotion.aliyun.cloud_gateway import CloudIOTGateway
    
    cloud_client = CloudIOTGateway(http)
    
    try:
        country = "US"
        if hasattr(http, 'login_info') and http.login_info and hasattr(http.login_info, 'userInformation'):
            country = http.login_info.userInformation.domainAbbreviation or "US"
        print(f"    Country code: {country}")
        
        print("    Getting region...")
        await cloud_client.get_region(country)
        print(f"    Region: {cloud_client.region_response}")
        
        print("    Connecting to Aliyun...")
        await cloud_client.connect()
        
        print("    OAuth login...")
        await cloud_client.login_by_oauth(country)
        
        print("    AEP handle...")
        await cloud_client.aep_handle()
        
        print("    Session by auth code...")
        await cloud_client.session_by_auth_code()
        
        print("    List binding by account...")
        await cloud_client.list_binding_by_account()
        
        if cloud_client.devices_by_account_response:
            devs = cloud_client.devices_by_account_response.data.data
            print(f"    Found {len(devs)} devices:")
            for d in devs:
                print(f"      - {d.device_name} ({d.product_name}) iot_id={d.iot_id}")
        else:
            print("    No devices found via Aliyun gateway")
            
    except Exception as e:
        print(f"    Error in cloud gateway: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
