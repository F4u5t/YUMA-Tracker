"""Faust Lawn Maintenance backend — FastAPI application."""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

# Windows + Python 3.14: ProactorEventLoop doesn't support add_reader/add_writer
# which paho-mqtt requires. Switch to SelectorEventLoop.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import router as api_router
from ws import router as ws_router
from mower_client import MowerClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
_LOGGER = logging.getLogger(__name__)

client = MowerClient()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown."""
    _LOGGER.info("Starting Faust Lawn Maintenance backend...")
    try:
        await client.connect()
        _LOGGER.info("Mower connected successfully.")
    except Exception:
        _LOGGER.exception("Failed to connect to mower — running in offline mode")
    yield
    _LOGGER.info("Shutting down Faust Lawn Maintenance backend...")
    await client.disconnect()


app = FastAPI(title="Faust Lawn Maintenance", lifespan=lifespan)

# CORS — allow all origins (local network, no auth)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {"app": "Faust Lawn Maintenance", "status": "running"}
