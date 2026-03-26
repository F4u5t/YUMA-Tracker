"""Mammotion mower client — slim wrapper around PyMammotion."""

from __future__ import annotations

import asyncio
import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

_LOGGER = logging.getLogger(__name__)


def _patch_geojson_lon_lat_delta() -> None:
    """Map frame x/y match report real_pos_x/real_pos_y; lon_lat_delta expects east,north = y,x.

    Without swapping, zones and mow paths appear rotated vs satellite and vs device position.
    Set MAMMOTION_MAP_XY_SWAP=1 in backend/.env to enable if zones look rotated vs mower.
    Default is off (0) — matches upstream PyMammotion.
    """
    if os.getenv("MAMMOTION_MAP_XY_SWAP", "0").strip().lower() not in ("1", "true", "yes"):
        return
    from pymammotion.data.model.generate_geojson import GeojsonGenerator

    _orig = GeojsonGenerator.lon_lat_delta

    def _swapped(rtk, x, y):
        return _orig(rtk, y, x)

    GeojsonGenerator.lon_lat_delta = staticmethod(_swapped)
    _LOGGER.info("GeojsonGenerator.lon_lat_delta: x/y swap active (MAMMOTION_MAP_XY_SWAP=1)")


_patch_geojson_lon_lat_delta()


def _to_degrees(raw: float) -> float:
    """Convert a raw lat/lng value to degrees.

    PyMammotion stores RTK/dock positions in radians internally.
    Values outside [-pi, pi] are already in degrees (older firmware path).
    """
    if raw == 0.0:
        return 0.0
    return raw if abs(raw) > math.pi else math.degrees(raw)


def _wgs84_rtk_dock(loc):
    """RTK anchor + dock in WGS84 and dock rotation — same as MowerStateManager.generate_geojson.

    `loc.dock.latitude` / `longitude` are ENU east/north in meters (misnamed); not map degrees.
    """
    from pymammotion.utility.map import CoordinateConverter

    coord = CoordinateConverter(loc.RTK.latitude, loc.RTK.longitude)
    rtk_lla = coord.enu_to_lla(0, 0)
    dock_lla = coord.enu_to_lla(loc.dock.latitude, loc.dock.longitude)
    dock_rot = int(coord.get_transform_yaw_with_yaw(loc.dock.rotation) + 180)
    return rtk_lla, dock_lla, dock_rot


def _device_position_wgs84(loc, report_data, rapid) -> tuple[float, float]:
    """Same WGS84 as boundaries + purple path: ``GeojsonGenerator.lon_lat_delta``.

    PyMammotion's ``location.device`` uses ``enu_to_lla`` (ellipsoid). GeoJSON uses
    flat ``lon_lat_delta`` at the RTK point — different math, so the icon used to drift.
    We always use ``lon_lat_delta`` here (including the optional ``MAMMOTION_MAP_XY_SWAP``
    patch on that function) so mower + lines + zones share one projection.

    ENU: prefer ``mowing_state`` (rapid) — it updates every MQTT rapid packet. Using
    ``report_data.locations[0]`` first can freeze the icon: that entry may stay stale
    with non-zero ``real_pos_y`` while rapid keeps moving.

    If no ENU, fall back to ``loc.device``.
    """
    from shapely.geometry import Point

    from pymammotion.data.model.generate_geojson import GeojsonGenerator
    from pymammotion.utility.conversions import parse_double

    rtk_lla, _, _ = _wgs84_rtk_dock(loc)
    rtk_point = Point(rtk_lla.latitude, rtk_lla.longitude)

    locs = getattr(report_data, "locations", None) or []
    ry = rx = None
    # Same order as device.py: run_state_update (rapid) overwrites device often; prefer it.
    if rapid is not None and getattr(rapid, "pos_y", 0) != 0:
        ry = parse_double(rapid.pos_y, 4.0)
        rx = parse_double(rapid.pos_x, 4.0)
    elif locs and locs[0].real_pos_y != 0:
        ry = parse_double(locs[0].real_pos_y, 4.0)
        rx = parse_double(locs[0].real_pos_x, 4.0)

    if ry is None or rx is None:
        return loc.device.latitude, loc.device.longitude

    lng, lat = GeojsonGenerator.lon_lat_delta(rtk_point, ry, rx)
    if not math.isfinite(lat) or not math.isfinite(lng):
        return loc.device.latitude, loc.device.longitude
    return lat, lng


class MowerClient:
    """Singleton wrapper around PyMammotion for cloud-connected mower access."""

    _instance: MowerClient | None = None

    def __new__(cls) -> MowerClient:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self._mammotion = None
        self._device_name: str = ""
        self._iot_id: str = ""
        self._account: str = ""
        self._ws_clients: list[Any] = []
        self._telemetry_task: asyncio.Task | None = None
        self._last_state: dict = {}

    # -- Connection lifecycle --------------------------------------------------

    async def connect(self) -> None:
        """Login and connect to Mammotion cloud."""
        from pymammotion.mammotion.devices.mammotion import Mammotion

        email = os.getenv("MAMMOTION_EMAIL", "")
        password = os.getenv("MAMMOTION_PASSWORD", "")
        if not email or not password:
            raise ValueError("MAMMOTION_EMAIL and MAMMOTION_PASSWORD must be set in .env")

        self._account = email
        self._mammotion = Mammotion()
        _LOGGER.info("Logging into Mammotion cloud...")
        await self._mammotion.login_and_initiate_cloud(email, password)
        _LOGGER.info("Cloud login complete.")

        devices = self._mammotion.device_manager.devices
        if not devices:
            raise RuntimeError("No mower devices found on this account")

        preferred = os.getenv("MAMMOTION_DEVICE_NAME", "").strip()
        if preferred and preferred in devices:
            self._device_name = preferred
        elif preferred:
            first = next(iter(devices))
            _LOGGER.warning(
                "MAMMOTION_DEVICE_NAME=%r not found on account (have: %s); using %s",
                preferred,
                ", ".join(devices),
                first,
            )
            self._device_name = first
        else:
            self._device_name = next(iter(devices))
        device = devices[self._device_name]
        self._iot_id = device.iot_id
        _LOGGER.info("Found mower: %s (iot_id=%s)", self._device_name, self._iot_id)

        # Give MQTT connections a moment to establish
        _LOGGER.info("Waiting for MQTT connections (5s)...")
        await asyncio.sleep(5)

        # Ask the mower to start streaming telemetry
        await self._request_reporting()

        # Sync map/schedule data in background (non-blocking)
        asyncio.create_task(self._background_sync())

        # Register for push notifications so telemetry is broadcast instantly
        if device.cloud:
            device.cloud.set_notification_callback(self._on_mqtt_notification)
            _LOGGER.info("MQTT notification callback registered")

        # Start the periodic broadcast loop
        self._telemetry_task = asyncio.create_task(self._telemetry_loop())

    async def disconnect(self) -> None:
        """Disconnect from cloud."""
        if self._telemetry_task:
            self._telemetry_task.cancel()
            self._telemetry_task = None
        if self._mammotion:
            await self._mammotion.stop()
            _LOGGER.info("Disconnected from Mammotion cloud.")

    async def reconnect(self) -> None:
        """Disconnect then reconnect — resets the MQTT session."""
        _LOGGER.info("Reconnecting...")
        await self.disconnect()
        self._mammotion = None
        self._device_name = ""
        self._iot_id = ""
        self._last_state = {}
        try:
            await self.connect()
            _LOGGER.info("Reconnected successfully")
        except Exception:
            _LOGGER.exception("Reconnect failed")

    # -- Internal helpers ------------------------------------------------------

    async def _request_reporting(self) -> None:
        """Ask the mower to start streaming telemetry reports."""
        try:
            await self._mammotion.send_command_with_args(
                self._device_name, "request_iot_sys",
                rpt_act=0, rpt_info_type=[0, 1, 2, 3, 4, 5],
                timeout=10000, period=3000, no_change_period=4000, count=0,
            )
            _LOGGER.info("Telemetry reporting requested")
        except Exception:
            _LOGGER.warning("Failed to request telemetry reporting", exc_info=True)

    async def _background_sync(self) -> None:
        """Sync map and schedule data after connect (runs as a background task)."""
        try:
            await self._mammotion.start_map_sync(self._device_name)
            _LOGGER.info("Map sync complete")
        except Exception:
            _LOGGER.warning("Map sync failed", exc_info=True)

        for attempt in range(3):
            try:
                await self._mammotion.start_schedule_sync(self._device_name)
                _LOGGER.info("Schedule sync requested (attempt %d)", attempt + 1)
                break
            except Exception:
                _LOGGER.warning("Schedule sync failed (attempt %d/3)", attempt + 1)
                if attempt < 2:
                    await asyncio.sleep(30)
        else:
            return

        # Wait up to 30 s for all plans to arrive via plan_callback chain
        state = self.state
        if state is None:
            return
        for _ in range(240):  # up to 120 s (docked mower responds slowly)
            await asyncio.sleep(0.5)
            plan_map = state.map.plan
            if not plan_map:
                continue
            total = getattr(next(iter(plan_map.values())), "total_plan_num", 1)
            if len(plan_map) >= total:
                _LOGGER.info("Startup plan sync complete: %d/%d plan(s)", len(plan_map), total)
                return
        plan_map = state.map.plan
        _LOGGER.warning(
            "Startup plan sync timed out — got %d/%d",
            len(plan_map),
            getattr(next(iter(plan_map.values())), "total_plan_num", "?") if plan_map else "?",
        )

    async def _on_mqtt_notification(self, res: tuple) -> None:
        """Push update from PyMammotion — broadcast state immediately."""
        try:
            telemetry = self.get_telemetry()
            await self._broadcast(telemetry)
            pos = telemetry.get("position", {})
            if pos.get("lat") and pos.get("lng"):
                await self._broadcast({
                    "type": "sat_sample",
                    "lat": pos["lat"],
                    "lng": pos["lng"],
                    "satellites": telemetry["satellites_total"],
                    "rtk_status": telemetry["rtk_status"],
                })
            self._last_state = telemetry
        except Exception:
            _LOGGER.exception("Error in MQTT notification callback")

    async def _telemetry_loop(self) -> None:
        """Broadcast telemetry every 2 s and keep MQTT data flowing."""
        _tick = 0
        while True:
            try:
                telemetry = self.get_telemetry()
                # Always broadcast — timestamp changes each tick so the UI
                # can detect a live connection, and field values update when
                # MQTT delivers new reports.
                await self._broadcast(telemetry)
                pos = telemetry.get("position", {})
                if pos.get("lat") and pos.get("lng"):
                    await self._broadcast({
                        "type": "sat_sample",
                        "lat": pos["lat"],
                        "lng": pos["lng"],
                        "satellites": telemetry["satellites_total"],
                        "rtk_status": telemetry["rtk_status"],
                    })
                self._last_state = telemetry

                # Re-request reporting every 30 s so the mower keeps sending
                # telemetry even when docked / idle (it stops after a while).
                _tick += 1
                if _tick >= 15:
                    _tick = 0
                    await self._request_reporting()

            except Exception:
                _LOGGER.exception("Error in telemetry loop")
            await asyncio.sleep(2)

    # -- State accessors -------------------------------------------------------

    @property
    def state(self):
        """Return the MowingDevice state from PyMammotion, or None if disconnected."""
        if self._mammotion is None:
            return None
        return self._mammotion.mower(self._device_name)

    def get_telemetry(self) -> dict:
        """Return current telemetry as a JSON-serialisable dict."""
        state = self.state
        if state is None:
            return {"error": "Not connected"}

        loc = state.location
        rapid = state.mowing_state
        dev = state.report_data.dev
        rtk = state.report_data.rtk

        rtk_lla, dock_lla, dock_rot = _wgs84_rtk_dock(loc)

        lat, lng = _device_position_wgs84(loc, state.report_data, rapid)

        # Sanity check — out-of-range or NaN means no fix yet
        if (
            not math.isfinite(lat)
            or not math.isfinite(lng)
            or abs(lat) > 90
            or abs(lng) > 180
        ):
            lat, lng = 0.0, 0.0

        return {
            "type": "telemetry",
            "position": {"lat": lat, "lng": lng},
            "dock": {"lat": dock_lla.latitude, "lng": dock_lla.longitude, "rotation": dock_rot},
            "rtk_base": {"lat": rtk_lla.latitude, "lng": rtk_lla.longitude},
            "battery": dev.battery_val,
            "charge_state": dev.charge_state,
            "satellites_total": rapid.satellites_total,
            "satellites_l2": rapid.satellites_l2,
            "rtk_status": rapid.rtk_status.name if rapid.rtk_status else "NONE",
            "sys_status": dev.sys_status,
            "orientation": loc.orientation,
            "position_type": loc.position_type,
            "work_zone": loc.work_zone,
            "rtk_age": rapid.rtk_age,
            "pos_level": rapid.pos_level,
            "gps_stars": rtk.gps_stars,
            "co_view_stars": rtk.co_view_stars,
            "wifi_rssi": state.report_data.connect.wifi_rssi,
            "device_name": self._device_name,
            "online": state.online,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_plans(self) -> list[dict]:
        """Return saved task plans from the mower."""
        state = self.state
        if state is None:
            return []

        zone_names = self._get_zone_name_map()
        result = []
        for idx, (plan_id, plan) in enumerate(state.map.plan.items()):
            zone_labels = [
                zone_names.get(h, f"Zone {i + 1}")
                for i, h in enumerate(plan.zone_hashs or [])
            ]
            name_str = (
                getattr(plan, "task_name", "")
                or getattr(plan, "job_name", "")
                or f"Task {idx + 1}"
            )
            result.append({
                "plan_id": str(plan_id),
                "task_name": name_str,
                "job_id": str(getattr(plan, "job_id", "") or ""),
                "zone_hashs": list(plan.zone_hashs) if plan.zone_hashs else [],
                "zone_names": zone_labels,
                "job_mode": getattr(plan, "model", 0),
                "speed": getattr(plan, "speed", 0.0),
                "knife_height": getattr(plan, "knife_height", 0),
                "channel_width": getattr(plan, "route_spacing", 0),
                "channel_mode": getattr(plan, "route_model", 0),
                "edge_mode": getattr(plan, "edge_mode", 0),
                "toward": getattr(plan, "route_angle", 0),
            })
        return result

    async def sync_plans(self) -> bool:
        """Re-sync task plans from the mower."""
        state = self.state
        if state is None:
            return False
        try:
            await self._mammotion.start_schedule_sync(self._device_name)
        except Exception:
            _LOGGER.warning("Schedule sync failed", exc_info=True)
            return False

        for _ in range(240):  # wait up to 120 s (docked mower responds slowly)
            await asyncio.sleep(0.5)
            plan_map = state.map.plan
            if not plan_map:
                continue
            total = getattr(next(iter(plan_map.values())), "total_plan_num", 1)
            if len(plan_map) >= total:
                _LOGGER.info("Sync complete: %d plan(s)", len(plan_map))
                return True

        count = len(state.map.plan)
        _LOGGER.warning("Plan sync timed out — got %d", count)
        return count > 0

    def plans_incomplete(self) -> bool:
        """Return True if we have fewer plans than total_plan_num indicates."""
        state = self.state
        if state is None:
            return True
        plan_map = state.map.plan
        if not plan_map:
            return True
        total = getattr(next(iter(plan_map.values())), "total_plan_num", 1)
        return len(plan_map) < total

    def get_boundaries_geojson(self) -> dict:
        """Return map boundaries as GeoJSON."""
        state = self.state
        if state is None:
            return {"type": "FeatureCollection", "features": []}
        try:
            from pymammotion.data.model.generate_geojson import GeojsonGenerator
            from shapely.geometry import Point

            loc = state.location
            rtk_lla, dock_lla, dock_rot = _wgs84_rtk_dock(loc)
            # Point(x=lat°, y=lon°) per GeojsonGenerator.lon_lat_delta — matches
            # pymammotion.data.mower_state_manager.MowerStateManager.generate_geojson
            return GeojsonGenerator.generate_geojson(
                state.map,
                Point(rtk_lla.latitude, rtk_lla.longitude),
                Point(dock_lla.latitude, dock_lla.longitude),
                dock_rot,
            )
        except Exception:
            _LOGGER.exception("Failed to generate boundary GeoJSON")
            return {"type": "FeatureCollection", "features": []}

    def get_zones(self) -> list[dict]:
        """Return zone list for cross-referencing with plans."""
        state = self.state
        if state is None:
            return []
        zone_names = self._get_zone_name_map()
        result = [
            {"hash": h, "name": zone_names.get(h, f"Zone {h}"), "type": "area"}
            for h in state.map.area
        ]
        result += [
            {"hash": h, "name": zone_names.get(h, f"Obstacle {h}"), "type": "obstacle"}
            for h in state.map.obstacle
        ]
        return result

    def get_mow_path_geojson(self) -> dict:
        """Return current or last mowing path as GeoJSON.

        Regenerates from map data with the same lon_lat_delta convention as boundaries
        (cached generated_mow_path_geojson may predate the x/y swap patch).
        """
        state = self.state
        if state is None:
            return {"type": "FeatureCollection", "features": []}
        try:
            from pymammotion.data.model.generate_geojson import GeojsonGenerator
            from shapely.geometry import Point

            loc = state.location
            rtk_lla, _, _ = _wgs84_rtk_dock(loc)
            geo = GeojsonGenerator.generate_mow_path_geojson(
                state.map,
                Point(rtk_lla.latitude, rtk_lla.longitude),
            )
            return geo
        except Exception:
            _LOGGER.exception("Failed to generate mow path GeoJSON")
            if state.map.generated_mow_path_geojson:
                return {
                    "type": "FeatureCollection",
                    "features": list(state.map.generated_mow_path_geojson.values()),
                }
            return {"type": "FeatureCollection", "features": []}

    def _get_zone_name_map(self) -> dict[int, str]:
        state = self.state
        if state is None:
            return {}
        return {item.hash: item.name for item in state.map.area_name if item.name}

    # -- Commands --------------------------------------------------------------

    async def start_task(self, plan_id: str) -> bool:
        return await self._send_command("single_schedule", plan_id=plan_id)

    async def pause(self) -> bool:
        return await self._send_command("pause_execute_task")

    async def resume(self) -> bool:
        return await self._send_command("resume_execute_task")

    async def return_to_dock(self) -> bool:
        return await self._send_command("return_to_dock")

    async def cancel_job(self) -> bool:
        return await self._send_command("cancel_job")

    async def request_telemetry(self) -> bool:
        """Force a telemetry re-request from the mower."""
        await self._request_reporting()
        return True

    async def _send_command(self, command: str, **kwargs) -> bool:
        device = self._mammotion.get_device_by_name(self._device_name) if self._mammotion else None
        if device is None:
            return False
        for attempt in range(2):
            try:
                if device.cloud:
                    await device.cloud.command(command, **kwargs)
                    return True
            except Exception as exc:
                if "UnauthorizedException" in type(exc).__name__ or "Access Token expired" in str(exc):
                    if attempt == 0:
                        try:
                            await self._mammotion.refresh_login(self._account)
                            _LOGGER.info("Token refreshed, retrying command")
                            continue
                        except Exception:
                            _LOGGER.exception("Token refresh failed")
                _LOGGER.exception("Failed to send command: %s", command)
                return False
        return False

    # -- Camera ----------------------------------------------------------------

    async def get_camera_token(self) -> dict | None:
        if self._mammotion is None:
            return None
        try:
            resp = await self._mammotion.get_stream_subscription(self._device_name, self._iot_id)
            if resp and resp.data:
                data = resp.data
                channel_name = getattr(data, "channel_name", None) or getattr(data, "channelName", "")
                cameras = []
                if hasattr(data, "cameras") and data.cameras:
                    cameras = [{"cameraId": c.cameraId, "token": c.token} for c in data.cameras]
                return {
                    "appId": data.appid,
                    "token": data.token,
                    "channelName": channel_name,
                    "uid": data.uid,
                    "cameras": cameras,
                }
        except Exception:
            _LOGGER.exception("Failed to get camera token")
        return None

    # -- WebSocket broadcast ---------------------------------------------------

    def register_ws(self, ws) -> None:
        self._ws_clients.append(ws)

    def unregister_ws(self, ws) -> None:
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)

    async def _broadcast(self, data: dict) -> None:
        import json
        message = json.dumps(data)
        disconnected = []
        for ws in self._ws_clients:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.unregister_ws(ws)