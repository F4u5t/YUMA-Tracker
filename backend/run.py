"""Start the Faust Lawn Maintenance backend with correct event loop for Windows."""

import asyncio
import os
import sys

# Must set event loop policy BEFORE uvicorn creates its loop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Ensure we're in the backend directory so uvicorn can import main
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import uvicorn

if __name__ == "__main__":
    cert_path = os.path.join(os.path.dirname(__file__), "..", "certs", "cert.pem")
    key_path = os.path.join(os.path.dirname(__file__), "..", "certs", "key.pem")

    kwargs = {"host": "0.0.0.0", "port": 18080, "log_level": "info"}
    if os.path.exists(cert_path) and os.path.exists(key_path):
        kwargs["ssl_certfile"] = cert_path
        kwargs["ssl_keyfile"] = key_path

    uvicorn.run("main:app", **kwargs)
