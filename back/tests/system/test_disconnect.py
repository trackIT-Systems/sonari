"""Read requests stop when their client disconnects; writes and finished responses don't."""

import asyncio

import pytest

from sonari.system.disconnect import CancelOnDisconnectMiddleware


def _scope(method: str) -> dict:
    return {"type": "http", "method": method, "path": "/api/v1/annotation_tasks/stats/"}


def _client(disconnect_after: float | None):
    """ASGI receive of a client that sends an empty body, then leaves after a delay."""
    sent_request = False

    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": b"", "more_body": False}
        if disconnect_after is None:
            await asyncio.Event().wait()
        await asyncio.sleep(disconnect_after)
        return {"type": "http.disconnect"}

    return receive


async def _send_response(send):
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok", "more_body": False})


class _SlowApp:
    """Reads the request like FastAPI, then works for `seconds` before answering."""

    def __init__(self, seconds: float):
        self.seconds = seconds
        self.cancelled = False
        self.finished = False

    async def __call__(self, scope, receive, send):
        assert (await receive())["type"] == "http.request"
        try:
            await asyncio.sleep(self.seconds)
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        self.finished = True
        await _send_response(send)


async def _run(app, method: str, disconnect_after: float | None, timeout: float = 5):
    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    middleware = CancelOnDisconnectMiddleware(app)
    await asyncio.wait_for(middleware(_scope(method), _client(disconnect_after), send), timeout)
    return sent


@pytest.mark.asyncio
async def test_read_request_stops_when_client_leaves():
    app = _SlowApp(seconds=30)
    loop = asyncio.get_running_loop()
    start = loop.time()

    sent = await _run(app, "GET", disconnect_after=0.1)

    assert app.cancelled
    assert sent == []
    assert loop.time() - start < 2


@pytest.mark.asyncio
async def test_write_request_finishes_after_client_leaves():
    app = _SlowApp(seconds=0.3)

    sent = await _run(app, "POST", disconnect_after=0.05)

    assert app.finished and not app.cancelled
    assert sent[-1]["body"] == b"ok"


@pytest.mark.asyncio
async def test_read_request_answers_while_client_waits():
    app = _SlowApp(seconds=0.1)

    sent = await _run(app, "GET", disconnect_after=None)

    assert app.finished and not app.cancelled
    assert sent[-1]["body"] == b"ok"


@pytest.mark.asyncio
async def test_work_after_the_response_is_not_cancelled():
    """Background tasks run after the response; the client leaving then is normal."""
    background_done = False

    async def app(scope, receive, send):
        nonlocal background_done
        await receive()
        await _send_response(send)
        await asyncio.sleep(0.3)
        background_done = True

    await _run(app, "GET", disconnect_after=0.05)

    assert background_done


@pytest.mark.asyncio
async def test_server_shutdown_still_cancels():
    """A cancellation from outside (shutdown) is not swallowed."""
    app = _SlowApp(seconds=30)
    middleware = CancelOnDisconnectMiddleware(app)

    async def send(message):
        pass

    task = asyncio.create_task(middleware(_scope("GET"), _client(None), send))
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert app.cancelled
