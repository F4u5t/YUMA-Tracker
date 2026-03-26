"""WebSocket telemetry endpoint for Faust Lawn Maintenance."""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from mower_client import MowerClient

_LOGGER = logging.getLogger(__name__)

router = APIRouter()
client = MowerClient()


@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    """Stream real-time telemetry to connected clients."""
    await websocket.accept()
    client.register_ws(websocket)
    _LOGGER.info("WebSocket client connected")

    # Send initial state snapshot
    try:
        snapshot = client.get_telemetry()
        await websocket.send_text(json.dumps(snapshot))
    except Exception:
        pass

    try:
        # Keep connection alive — just wait for disconnect
        while True:
            # We recv to detect disconnects; client may send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        _LOGGER.info("WebSocket client disconnected")
    finally:
        client.unregister_ws(websocket)
