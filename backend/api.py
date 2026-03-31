"""REST API endpoints for Faust Lawn Maintenance."""

import asyncio
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from mower_client import MowerClient

router = APIRouter(prefix="/api")
client = MowerClient()

# Overlay alignment persisted server-side so all browsers share the same settings
_OVERLAY_FILE = Path(__file__).parent / "overlay_settings.json"
_OVERLAY_DEFAULTS: dict = {"mirrorEW": False, "mirrorNS": False, "rot": 0.0, "eastM": 0.0, "northM": 0.0}


def _load_overlay() -> dict:
    try:
        if _OVERLAY_FILE.exists():
            return {**_OVERLAY_DEFAULTS, **json.loads(_OVERLAY_FILE.read_text())}
    except Exception:
        pass
    return dict(_OVERLAY_DEFAULTS)


def _save_overlay(data: dict) -> None:
    try:
        _OVERLAY_FILE.write_text(json.dumps(data))
    except Exception:
        pass


class OverlaySettings(BaseModel):
    mirrorEW: bool = False
    mirrorNS: bool = False
    rot: float = 0.0
    eastM: float = 0.0
    northM: float = 0.0
    # Independent alignment for trail/track points (real GPS, separate from zone projection)
    trailRot: float = 0.0
    trailEastM: float = 0.0
    trailNorthM: float = 0.0


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
        asyncio.create_task(client.sync_plans())
        if not plans:
            # First time ever — wait briefly so we have something to show
            for _ in range(20):  # up to 10 s
                await asyncio.sleep(0.5)
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
    asyncio.create_task(client.request_telemetry())
    return {"status": "paused"}


@router.post("/command/resume")
async def resume():
    ok = await client.resume()
    if not ok:
        raise HTTPException(502, "Failed to resume")
    asyncio.create_task(client.request_telemetry())
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
    """Force re-request telemetry from mower via MQTT, then wait for a fresh response."""
    await client.request_telemetry()
    # Wait up to 4 s for the mower to deliver a fresh MQTT report
    await asyncio.sleep(4)
    return client.get_telemetry()


@router.post("/reconnect")
async def reconnect():
    """Disconnect and reconnect the mower client (resets MQTT + token)."""
    asyncio.create_task(client.reconnect())
    return {"status": "reconnecting"}


@router.get("/settings/overlay")
async def get_overlay_settings():
    """Return persisted overlay alignment (shared across all browsers)."""
    return _load_overlay()


@router.put("/settings/overlay")
async def put_overlay_settings(settings: OverlaySettings):
    """Save overlay alignment server-side so all browsers share it."""
    data = settings.model_dump()
    _save_overlay(data)
    return data


@router.get("/camera/token")
async def get_camera_token():
    """Agora stream subscription for camera."""
    token = await client.get_camera_token()
    if token is None:
        raise HTTPException(502, "Failed to get camera token")
    return token
