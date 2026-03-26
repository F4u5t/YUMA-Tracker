"""REST API endpoints for Faust Lawn Maintenance."""

from fastapi import APIRouter, HTTPException

from mower_client import MowerClient

router = APIRouter(prefix="/api")
client = MowerClient()


@router.get("/status")
async def get_status():
    """Current mower telemetry snapshot."""
    return client.get_telemetry()


@router.get("/debug")
async def debug():
    """Debug info about MQTT connections."""
    info = {"device": client._device_name}
    if client._mammotion:
        mqtt_info = {}
        for key, mqtt in client._mammotion.mqtt_list.items():
            mqtt_info[key] = {
                "connected": mqtt.is_connected(),
                "ready": mqtt.is_ready,
            }
        info["mqtt_connections"] = mqtt_info
        device = client._mammotion.get_device_by_name(client._device_name)
        if device and device.cloud:
            info["cloud_mqtt_type"] = type(device.cloud._mqtt._mqtt_client).__name__
    return info


@router.get("/debug/position")
async def debug_position():
    """Raw position values from PyMammotion state."""
    state = client.state
    if state is None:
        return {"error": "not connected"}
    from mower_client import _to_degrees
    loc = state.location
    rapid = state.mowing_state
    tel = client.get_telemetry()
    return {
        "rtk_base": {
            "latitude_raw": loc.RTK.latitude,
            "longitude_raw": loc.RTK.longitude,
            "latitude_deg": _to_degrees(loc.RTK.latitude),
            "longitude_deg": _to_degrees(loc.RTK.longitude),
        },
        "dock": {
            "latitude_deg": _to_degrees(loc.dock.latitude),
            "longitude_deg": _to_degrees(loc.dock.longitude),
            "rotation": loc.dock.rotation,
        },
        "device": {
            "latitude": loc.device.latitude,
            "longitude": loc.device.longitude,
        },
        "mowing_state": {
            "pos_x": rapid.pos_x,
            "pos_y": rapid.pos_y,
            "toward": rapid.toward,
            "rtk_status": rapid.rtk_status.name if rapid.rtk_status else "NONE",
            "satellites_total": rapid.satellites_total,
        },
        "report_locations": [
            {"real_pos_x": l.real_pos_x, "real_pos_y": l.real_pos_y, "pos_type": l.pos_type}
            for l in state.report_data.locations
        ],
        "final_position": tel.get("position"),
        "sys_status": state.report_data.dev.sys_status,
    }


@router.get("/debug/map")
async def debug_map():
    """Dump raw map object to diagnose missing plans/zones."""
    state = client.state
    if state is None:
        return {"error": "not connected"}
    map_obj = state.map
    result = {}
    for attr in dir(map_obj):
        if attr.startswith("_"):
            continue
        try:
            val = getattr(map_obj, attr)
            if callable(val):
                continue
            if isinstance(val, (str, int, float, bool)):
                result[attr] = val
            elif isinstance(val, dict):
                result[attr] = {str(k): repr(v) for k, v in list(val.items())[:20]}
            elif isinstance(val, (list, tuple)):
                result[attr] = [repr(i) for i in list(val)[:20]]
            else:
                result[attr] = repr(val)[:300]
        except Exception as e:
            result[attr] = f"<error: {e}>"
    return result


@router.get("/plans")
async def get_plans():
    """List saved task plans from mobile app."""
    plans = client.get_plans()
    # If incomplete, kick off a background sync and return what we have.
    # The frontend can call /api/plans/sync or refresh to get the full list.
    if not plans or client.plans_incomplete():
        import asyncio
        asyncio.create_task(client.sync_plans())
        if not plans:
            # First time ever — wait briefly so we have something to show
            import asyncio as _asyncio
            for _ in range(20):  # up to 10 s
                await _asyncio.sleep(0.5)
                plans = client.get_plans()
                if plans and not client.plans_incomplete():
                    break
    return plans


@router.post("/plans/sync")
async def sync_plans():
    """Force re-sync of task plans from mower."""
    ok = await client.sync_plans()
    return {"status": "syncing" if ok else "failed"}


@router.post("/plans/{plan_id}/start")
async def start_plan(plan_id: str):
    """Start a saved task plan."""
    ok = await client.start_task(plan_id)
    if not ok:
        raise HTTPException(502, "Failed to start task")
    return {"status": "started", "plan_id": plan_id}


@router.post("/command/pause")
async def pause():
    ok = await client.pause()
    if not ok:
        raise HTTPException(502, "Failed to pause")
    return {"status": "paused"}


@router.post("/command/resume")
async def resume():
    ok = await client.resume()
    if not ok:
        raise HTTPException(502, "Failed to resume")
    return {"status": "resumed"}


@router.post("/command/dock")
async def dock():
    ok = await client.return_to_dock()
    if not ok:
        raise HTTPException(502, "Failed to send dock command")
    return {"status": "returning_to_dock"}


@router.post("/command/cancel")
async def cancel():
    ok = await client.cancel_job()
    if not ok:
        raise HTTPException(502, "Failed to cancel job")
    return {"status": "cancelled"}


@router.get("/map/boundaries")
async def get_boundaries():
    """GeoJSON with individual zone/obstacle features."""
    return client.get_boundaries_geojson()


@router.get("/map/zones")
async def get_zones():
    """Zone list for cross-referencing with task plans."""
    return client.get_zones()


@router.get("/map/mow-path")
async def get_mow_path():
    """GeoJSON of current/last mowing path."""
    return client.get_mow_path_geojson()


@router.post("/refresh")
async def refresh_telemetry():
    """Force re-request telemetry from mower via MQTT."""
    ok = await client.request_telemetry()
    return {"status": "requested" if ok else "failed"}


@router.post("/reconnect")
async def reconnect():
    """Disconnect and reconnect the mower client (resets MQTT + token)."""
    import asyncio
    asyncio.create_task(client.reconnect())
    return {"status": "reconnecting"}


@router.get("/camera/token")
async def get_camera_token():
    """Agora stream subscription for camera."""
    token = await client.get_camera_token()
    if token is None:
        raise HTTPException(502, "Failed to get camera token")
    return token
