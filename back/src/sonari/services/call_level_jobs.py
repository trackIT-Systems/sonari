"""Search for the reference calls of one tag in an annotation project, in the background.

One search at a time per project and tag. It measures a sample of the calls (see
:mod:`sonari.api.reference_calls`); the UI starts it here and polls its progress, and a
rerun reuses what is measured and searches further recordings.
"""

import dataclasses
import datetime
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from sonari import exceptions, models, schemas
from sonari.api import reference_calls
from sonari.api.call_levels import call_level_coverage
from sonari.api.reference_calls import DEFAULT_REFERENCE_CALLS

__all__ = [
    "get_reference_calls",
    "run_reference_search",
    "start_reference_search",
]

logger = logging.getLogger(__name__)

Job = models.CallLevelJob

STALE_AFTER = datetime.timedelta(minutes=10)

#: Calls measured at once; small enough that each batch takes seconds, so progress moves.
BATCH_SIZE = 100
WORKERS = 2


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _status(row: Job | None) -> schemas.CallLevelJobStatus | None:
    if row is None:
        return None
    status = schemas.CallLevelJobStatus.model_validate(row)
    updated_on = row.updated_on if row.updated_on.tzinfo else row.updated_on.replace(tzinfo=datetime.timezone.utc)
    return status.model_copy(update={"stale": row.state == "running" and _now() - updated_on > STALE_AFTER})


async def get_reference_calls(
    session: AsyncSession, project_id: int, tag_id: int, limit: int = DEFAULT_REFERENCE_CALLS
) -> schemas.ReferenceCalls:
    calls = await reference_calls.get_reference_calls(
        session, tag_id=tag_id, annotation_project_id=project_id, limit=limit
    )
    recordings, searched = await reference_calls.reference_search_coverage(
        session, tag_id=tag_id, annotation_project_id=project_id
    )
    total, measured = await call_level_coverage(session, tag_id=tag_id, annotation_project_id=project_id)
    return schemas.ReferenceCalls(
        calls=[schemas.ReferenceCall.model_validate(dataclasses.asdict(c)) for c in calls],
        recordings=recordings,
        searched_recordings=searched,
        total_calls=total,
        measured_calls=measured,
        job=_status(await session.get(Job, (project_id, tag_id))),
    )


async def start_reference_search(session: AsyncSession, project_id: int, tag_id: int) -> schemas.CallLevelJobStatus:
    """Mark a search as running; refuses while another one for the tag is still making progress."""
    row = await session.get(Job, (project_id, tag_id))
    status = _status(row)
    if status is not None and status.state == "running" and not status.stale:
        raise exceptions.DuplicateObjectError("Reference calls of this tag are already being searched for.")

    now = _now()
    if row is None:
        row = Job(annotation_project_id=project_id, tag_id=tag_id, state="running", started_on=now, updated_on=now)
        session.add(row)
    row.state = "running"
    row.started_on = row.updated_on = now
    row.finished_on = None
    row.error = None
    # The search sets the total once it has chosen the calls to probe.
    row.total = row.done = row.failed = 0
    await session.commit()
    return _status(row)  # type: ignore[return-value]


async def run_reference_search(project_id: int, tag_id: int, audio_dir: Path) -> None:
    """Search for reference calls. Runs as a background task with its own session."""
    from sonari.system.database import get_async_session

    async with get_async_session() as session:

        async def progress(done: int, total: int) -> None:
            row = await session.get(Job, (project_id, tag_id))
            row.done, row.total = done, total
            row.updated_on = _now()
            await session.commit()

        try:
            run = await reference_calls.find_reference_calls(
                session,
                tag_id=tag_id,
                annotation_project_id=project_id,
                audio_dir=audio_dir,
                workers=WORKERS,
                batch_size=BATCH_SIZE,
                progress=progress,
            )
            row = await session.get(Job, (project_id, tag_id))
            row.state = "done"
            row.failed = run.failed
        except Exception as exc:  # noqa: BLE001
            logger.exception("Searching for reference calls failed [project=%s tag=%s]", project_id, tag_id)
            await session.rollback()
            row = await session.get(Job, (project_id, tag_id))
            if row is None:
                return
            row.state = "failed"
            row.error = str(exc)[:1000]
        row.finished_on = row.updated_on = _now()
        await session.commit()
