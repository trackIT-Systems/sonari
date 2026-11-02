"""Workers that start slowly must not be killed in a loop.

uvicorn's supervisor pings each worker as soon as it exists, but the worker
only answers once it has imported the app. With the default 5 s ping timeout,
a loaded host where the import takes longer (9 s on prod) gets every new
worker SIGKILLed before it can answer: prod logged ~22k such kills in 35 h.
"""

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

import sonari

BACK_DIR = Path(__file__).parents[2]
WORKERS = 2

pytestmark = pytest.mark.skipif(sys.platform == "win32", reason="kills the worker process group")


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def test_slow_starting_workers_are_not_killed(tmp_path):
    src = str(Path(sonari.__file__).parents[1])
    env = dict(
        os.environ,
        PYTHONPATH=src,
        SONARI_DATA_DIR=str(tmp_path / "data"),
        SONARI_DB_DIALECT="sqlite",
        SONARI_DB_NAME=str(tmp_path / "sonari.db"),
        SONARI_HOST="127.0.0.1",
        SONARI_PORT=str(_free_port()),
        SONARI_WORKERS=str(WORKERS),
        SONARI_LOG_TO_FILE="false",
        SONARI_LOG_TO_STDOUT="true",
    )
    # Migrate once up front: workers migrating a fresh SQLite file at the same time collide.
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import asyncio; from sonari.system.database import init_database;"
            " from sonari.system.settings import get_settings; asyncio.run(init_database(get_settings()))",
        ],
        env=env,
        check=True,
        capture_output=True,
    )
    # Every new interpreter, workers included, now sleeps before running anything.
    site = tmp_path / "site"
    site.mkdir()
    (site / "sitecustomize.py").write_text("import time\ntime.sleep(6)\n")
    env["PYTHONPATH"] = os.pathsep.join([str(site), src])
    log = tmp_path / "server.log"
    with log.open("w") as out:
        server = subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=BACK_DIR,
            env=env,
            stdout=out,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    try:
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            text = log.read_text()
            if "died" in text or text.count("Application startup complete") >= WORKERS:
                break
            if server.poll() is not None:  # the server itself failed to start
                break
            time.sleep(0.5)
        text = log.read_text()
        assert "died" not in text, "".join(line for line in text.splitlines(True) if "child process" in line.lower())
        assert text.count("Application startup complete") >= WORKERS
    finally:
        os.killpg(server.pid, signal.SIGKILL)
        server.wait(timeout=10)
