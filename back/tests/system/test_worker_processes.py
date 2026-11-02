"""A uvicorn worker must not leave processes behind when it is SIGKILLed.

uvicorn's supervisor SIGKILLs workers that miss its health ping, so their
lifespan shutdown never runs. Anything the lifespan spawned is orphaned; on
prod that left one ~200 MB cache manager per killed worker (18 GB of swap).
"""

import os
import signal
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import pytest

import sonari

pytestmark = pytest.mark.skipif(not Path("/proc").is_dir(), reason="reads the process tree from /proc")

_WORKER = textwrap.dedent(
    """
    import asyncio
    import sys
    from pathlib import Path

    from sonari.system import create_app
    from sonari.system.settings import Settings

    settings = Settings(
        db_name=sys.argv[1],
        db_dialect="sqlite",
        dev=False,
        log_to_stdout=True,
        log_to_file=False,
        open_on_startup=False,
        domain="localhost",
        audio_dir=Path.home(),
    )
    app = create_app(settings)


    async def main():
        async with app.router.lifespan_context(app):
            print("ready", flush=True)
            await asyncio.sleep(3600)


    asyncio.run(main())
    """
)


def _parent_of(pid: int) -> int | None:
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
    except OSError:
        return None
    # Field 4 is the parent pid; the command in field 2 may contain spaces.
    return int(stat.rsplit(")", 1)[1].split()[1])


def _descendants(root: int) -> set[int]:
    pids = [int(p) for p in os.listdir("/proc") if p.isdigit()]
    found: set[int] = set()
    frontier = {root}
    while frontier:
        frontier = {pid for pid in pids if _parent_of(pid) in frontier} - found
        found |= frontier
    return found


def _alive(pid: int) -> bool:
    try:
        state = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[0]
    except OSError:
        return False
    return state != "Z"


def test_sigkilled_worker_leaves_no_processes_behind(tmp_path):
    env = dict(os.environ, PYTHONPATH=str(Path(sonari.__file__).parents[1]))
    worker = subprocess.Popen(
        [sys.executable, "-c", _WORKER, str(tmp_path / "sonari.db")],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        env=env,
    )
    spawned: set[int] = set()
    try:
        # sonari_init prints its own startup messages before ours.
        assert "ready" in (line.strip() for line in worker.stdout), "worker exited before its lifespan started"
        spawned = _descendants(worker.pid)

        worker.send_signal(signal.SIGKILL)
        worker.wait(timeout=10)
        time.sleep(1)

        survivors = sorted(pid for pid in spawned if _alive(pid))
        assert not survivors, f"processes started by the worker survived its SIGKILL: {survivors}"
    finally:
        if worker.poll() is None:
            worker.kill()
        for pid in spawned:
            if _alive(pid):
                os.kill(pid, signal.SIGKILL)
