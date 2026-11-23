"""Stop read requests whose client went away, and with them their database queries."""

import asyncio
import logging

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("sonari.requests")

#: Only reads are stopped: a write (a badge, a tag edit) finishes even when its
#: page was closed, so nothing is half saved.
CANCELLABLE_METHODS = frozenset({"GET", "HEAD"})


class CancelOnDisconnectMiddleware:
    """Cancel a read request once its client disconnects.

    The browser aborts requests whose results it no longer needs (the filter
    changed, the page closed), but the server keeps running them to the end,
    and slow queries pile up in the database. Cancelling the request's task
    makes asyncpg cancel the query in Postgres too.

    The middleware reads the client's messages itself and passes them on to
    the app, so it notices the disconnect while the app is still working.
    Once the response is sent, nothing is cancelled any more (background tasks
    run after it).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in CANCELLABLE_METHODS:
            await self.app(scope, receive, send)
            return

        messages: asyncio.Queue[Message] = asyncio.Queue()
        response_sent = False
        client_gone = False

        async def send_and_track(message: Message) -> None:
            nonlocal response_sent
            await send(message)
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                response_sent = True

        app_task = asyncio.create_task(self.app(scope, messages.get, send_and_track))

        async def watch_client() -> None:
            nonlocal client_gone
            while True:
                message = await receive()
                messages.put_nowait(message)
                if message["type"] == "http.disconnect":
                    if not response_sent and not app_task.done():
                        client_gone = True
                        app_task.cancel()
                    return

        watcher = asyncio.create_task(watch_client())
        try:
            await app_task
        except asyncio.CancelledError:
            # Ours when the client left; the server's (shutdown) must go on up.
            current = asyncio.current_task()
            if client_gone and current is not None and current.cancelling() == 0:
                logger.info(
                    "Stopped %s %s: the client disconnected",
                    scope["method"],
                    scope.get("path", ""),
                )
                return
            raise
        finally:
            watcher.cancel()
