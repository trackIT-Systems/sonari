"""Python API for interacting with Annotation Tasks."""

from statistics import median
import datetime
from typing import Sequence

from soundevent import data
from sqlalchemy import and_, case, delete, exists, func, insert, literal, select, tuple_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql._typing import _ColumnExpressionArgument

from sonari import exceptions, models, schemas
from sonari.api import common
from sonari.api.common import BaseAPI
from sonari.filters.annotation_tasks import confidence_feature_name_clause_for_tag_creator
from sonari.filters.base import Filter
from sonari.services.sound_event_history import EditContext
from sonari.api.bulk_sound_event_tag_replace import (
    BulkSoundEventTagReplaceParams,
    build_bulk_params,
    invalidate_species_counts_for_tasks,
    process_bulk_delete_sound_events_chunk,
    process_bulk_tag_replace_chunk,
)
from sonari.utils.bat_groups import (
    GROUP_TAG_KEY,
    REPLACEABLE_BAT_GROUPS,
    SPECIES_TAG_KEY,
    species_in_group,
)
from sonari.utils.sound_event_tag_replace import is_replace_all_tag

__all__ = [
    "AnnotationTaskAPI",
    "annotation_tasks",
    "compute_duration",
]

#: Tasks handled per statement/commit in bulk operations. Bulk operations have
#: no upper limit: they work through the targets chunk by chunk, so each
#: statement stays small (well under the bind parameter limit) and progress is
#: committed as it goes. The UI additionally sends large targets in several
#: requests to show progress and keep each request short.
_BULK_CHUNK_SIZE = 100

#: Chunk size for read-only ``IN (...)`` lookups of task ids.
_ID_LOOKUP_CHUNK_SIZE = 5000


class AnnotationTaskAPI(
    BaseAPI[
        int,
        models.AnnotationTask,
        schemas.AnnotationTask,
        schemas.AnnotationTaskCreate,
        schemas.AnnotationTaskUpdate,
    ]
):
    """API for annotation tasks."""

    _model = models.AnnotationTask
    _schema = schemas.AnnotationTask

    # Map relationship names to model attributes
    relationships = {
        "recording": models.AnnotationTask.recording,
        "annotation_project": models.AnnotationTask.annotation_project,
        "sound_event_annotations": models.AnnotationTask.sound_event_annotations,
        "tags": models.AnnotationTask.tags,
        "notes": models.AnnotationTask.notes,
        "status_badges": models.AnnotationTask.status_badges,
    }

    async def get_index(
        self,
        session: AsyncSession,
        *,
        limit: int | None = None,
        offset: int | None = 0,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None = None,
        sort_by: _ColumnExpressionArgument | str | None = "-created_on",
    ) -> tuple[Sequence[schemas.AnnotationTaskIndex], int]:
        """Get minimal task index for navigation.

        Parameters
        ----------
        session
            The database session to use.
        limit
            Maximum number of objects to return. None means no limit.
        offset
            Offset for pagination.
        filters
            List of filters to apply.
        sort_by
            Column to sort by.

        Returns
        -------
        tasks : Sequence[schemas.AnnotationTaskIndex]
            The minimal annotation task indices.
        count : int
            Total number of tasks matching filters.
        """
        from sonari.api.common.utils import get_objects_from_query

        # Query only the minimal fields needed for navigation
        query = select(
            models.AnnotationTask.id,
            models.AnnotationTask.recording_id,
            models.AnnotationTask.start_time,
        )

        rows, count = await get_objects_from_query(
            session,
            models.AnnotationTask,
            query,
            limit=limit,
            offset=offset,
            filters=filters,
            sort_by=sort_by,
        )

        # Convert rows to schema objects
        indices = [
            schemas.AnnotationTaskIndex(
                id=row[0],
                recording_id=row[1],
                start_time=row[2],
            )
            for row in rows
        ]

        return indices, count

    @staticmethod
    def _night_tasks(
        filters: Sequence[Filter | _ColumnExpressionArgument] | None,
        utc_offset: int,
        *,
        nights: Sequence[str | None] | None = None,
    ):
        """The matching tasks (``task_id``) with their night (``night``), as a subquery.

        With ``nights``, only the tasks of those nights: a range on recorded_at
        per run of consecutive nights, so the index on it narrows the tasks
        before the other filters run.
        """
        from sqlalchemy import or_
        from sqlalchemy.orm import aliased

        from sonari.api.common.utils import apply_filters
        from sonari.filters.annotation_tasks import night_bounds, night_of_recording

        recording = aliased(models.Recording)
        tasks = select(
            models.AnnotationTask.id.label("task_id"),
            night_of_recording(recording.recorded_at, utc_offset).label("night"),
        ).join(recording, recording.id == models.AnnotationTask.recording_id)
        if nights is not None:
            conditions = []
            for first, last in _consecutive_runs(sorted({n for n in nights if n is not None})):
                start, _ = night_bounds(first, utc_offset)
                _, end = night_bounds(last, utc_offset)
                conditions.append(and_(recording.recorded_at >= start, recording.recorded_at < end))
            if None in nights:
                conditions.append(recording.recorded_at.is_(None))
            tasks = tasks.where(or_(*conditions) if conditions else literal(False))
        return apply_filters(tasks, filters).subquery()

    async def get_nights(
        self,
        session: AsyncSession,
        *,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None = None,
        utc_offset: int = 0,
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[list[schemas.AnnotationTaskNightTotal], int]:
        """The nights (noon to noon local time) of the matching tasks, with their task counts.

        Ordered by night; recordings without a date come last. Meant for cheap
        filters (project, station, date range): the status counts under the full
        filter come per night from `get_night_stats`, for the nights shown only.

        Returns
        -------
        nights : list[schemas.AnnotationTaskNightTotal]
            The page of nights.
        count : int
            Total number of nights.
        """
        filtered = self._night_tasks(filters, utc_offset)
        query = (
            select(filtered.c.night, func.count(), func.count().over())
            .group_by(filtered.c.night)
            .order_by(filtered.c.night.is_(None), filtered.c.night)
        )
        if limit is not None and limit >= 0:
            query = query.limit(limit).offset(offset)

        rows = (await session.execute(query)).all()
        nights = [schemas.AnnotationTaskNightTotal(night=night, total=total) for night, total, _ in rows]
        if rows:
            count = rows[0][-1]
        elif offset:
            # Past the last page: count the nights without paging
            count = len((await session.execute(select(filtered.c.night).distinct())).all())
        else:
            count = 0
        return nights, count

    async def get_night_stats(
        self,
        session: AsyncSession,
        nights: Sequence[str | None],
        *,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None = None,
        utc_offset: int = 0,
    ) -> list[schemas.AnnotationTaskNight]:
        """Status counts of the matching tasks of each of ``nights`` (None: no recording date).

        Only those nights' tasks are filtered and counted, so a page of nights
        costs about as much as its tasks, however large the project. In the
        order given; a night without matching tasks has all counts zero.
        """
        if not nights:
            return []
        filtered = self._night_tasks(filters, utc_offset, nights=nights)

        def has_state(*states: data.AnnotationState):
            return exists().where(
                models.AnnotationStatusBadge.annotation_task_id == filtered.c.task_id,
                models.AnnotationStatusBadge.state.in_(states),
            )

        def count_if(condition):
            return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)

        done = has_state(
            data.AnnotationState.verified,
            data.AnnotationState.rejected,
            data.AnnotationState.completed,
        )
        query = select(
            filtered.c.night,
            func.count(),
            count_if(done),
            count_if(has_state(data.AnnotationState.verified)),
            count_if(has_state(data.AnnotationState.rejected)),
            count_if(has_state(data.AnnotationState.completed)),
            count_if(has_state(data.AnnotationState.assigned)),
        ).group_by(filtered.c.night)

        counted = {
            night: schemas.AnnotationTaskNight(
                night=night,
                total=total,
                done_count=done_count,
                verified_count=verified,
                rejected_count=rejected,
                completed_count=completed,
                pending_count=total - done_count,
                assigned_count=assigned,
            )
            for night, total, done_count, verified, rejected, completed, assigned in (
                await session.execute(query)
            ).all()
        }
        return [
            counted.get(night)
            or schemas.AnnotationTaskNight(
                night=night,
                total=0,
                done_count=0,
                verified_count=0,
                rejected_count=0,
                completed_count=0,
                pending_count=0,
                assigned_count=0,
            )
            for night in nights
        ]

    async def get_stats(
        self,
        session: AsyncSession,
        *,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None = None,
    ) -> schemas.AnnotationTaskStats:
        """Get aggregate statistics for annotation tasks.

        Matches the logic from frontend's computeAnnotationTasksProgress function.

        Parameters
        ----------
        session
            The database session to use.
        filters
            List of filters to apply.

        Returns
        -------
        schemas.AnnotationTaskStats
            Aggregate statistics for tasks.
        """
        from sonari.api.common.utils import apply_filters

        # Count in the database: loading every task and badge of a large
        # project into Python is far too slow. A task is done when any user
        # verified, rejected or completed it; every other task is pending.
        filtered = apply_filters(
            select(models.AnnotationTask.id.label("task_id")),
            filters,
        ).subquery()

        def has_state(*states: data.AnnotationState):
            return exists().where(
                models.AnnotationStatusBadge.annotation_task_id == filtered.c.task_id,
                models.AnnotationStatusBadge.state.in_(states),
            )

        def count_if(condition):
            return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)

        done = has_state(
            data.AnnotationState.verified,
            data.AnnotationState.rejected,
            data.AnnotationState.completed,
        )
        query = select(
            func.count(),
            count_if(done),
            count_if(has_state(data.AnnotationState.verified)),
            count_if(has_state(data.AnnotationState.rejected)),
            count_if(has_state(data.AnnotationState.completed)),
            count_if(has_state(data.AnnotationState.assigned)),
        ).select_from(filtered)

        total, done_count, verified, rejected, completed, assigned = (
            await session.execute(query)
        ).one()

        return schemas.AnnotationTaskStats(
            total=total,
            done_count=done_count,
            verified_count=verified,
            rejected_count=rejected,
            completed_count=completed,
            pending_count=total - done_count,
            assigned_count=assigned,
        )

    async def get_many(
        self,
        session: AsyncSession,
        *,
        limit: int | None = 1000,
        offset: int | None = 0,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None = None,
        sort_by: _ColumnExpressionArgument | str | None = "-created_on",
        include_recording: bool = False,
        include_annotation_project: bool = False,
        include_sound_event_annotations: bool = False,
        include_sound_event_tags: bool = False,
        include_tags: bool = False,
        include_notes: bool = False,
        include_features: bool = False,
        include_status_badges: bool = False,
        include_status_badge_users: bool = False,
        include_sound_event_annotation_features: bool = False,
        include_sound_event_annotation_users: bool = False,
        include_note_users: bool = False,
    ) -> tuple[Sequence[schemas.AnnotationTask], int]:
        """Get many annotation tasks without unique() to avoid duplicate removal after pagination.

        Parameters
        ----------
        session
            The database session to use.
        limit
            Maximum number of objects to return.
        offset
            Offset for pagination.
        filters
            List of filters to apply.
        sort_by
            Column to sort by.
        include_recording
            If True, eagerly load the recording relationship.
        include_annotation_project
            If True, eagerly load the annotation_project relationship.
        include_sound_event_annotations
            If True, eagerly load the sound_event_annotations relationship.
        include_tags
            If True, eagerly load the tags relationship.
        include_notes
            If True, eagerly load the notes relationship.
        include_features
            Kept for compatibility: the duration feature is always returned.

        Returns
        -------
        tasks : Sequence[schemas.AnnotationTask]
            The annotation tasks.
        count : int
            Total number of tasks matching filters.
        """
        from sqlalchemy.orm import noload, selectinload

        from sonari.api.common.utils import get_objects_from_query

        query = select(models.AnnotationTask)

        # Map include parameters
        include_map = {
            "recording": include_recording,
            "annotation_project": include_annotation_project,
            "sound_event_annotations": include_sound_event_annotations,
            "tags": include_tags,
            "notes": include_notes,
            "status_badges": include_status_badges or include_status_badge_users,
        }

        # Build loading options dynamically
        options = []
        for name, rel in self.relationships.items():
            if include_map.get(name, False):
                if name == "status_badges" and include_status_badge_users:
                    # Chain load users when requested
                    options.append(selectinload(rel).selectinload(models.AnnotationStatusBadge.user))
                elif name == "sound_event_annotations":
                    # Handle nested relationships for sound events
                    # Add base loader for sound_event_annotations
                    options.append(selectinload(rel))
                    # Add independent loaders for each nested relationship
                    if include_sound_event_annotation_features:
                        options.append(selectinload(rel).selectinload(models.SoundEventAnnotation.features))
                    if include_sound_event_annotation_users:
                        options.append(selectinload(rel).selectinload(models.SoundEventAnnotation.created_by))
                    # Always load tags for sound events when loading the sound events
                    options.append(selectinload(rel).selectinload(models.SoundEventAnnotation.tags))
                elif name == "notes" and include_note_users:
                    # Chain load users for notes when requested
                    options.append(selectinload(rel).selectinload(models.Note.created_by))
                else:
                    options.append(selectinload(rel))
            else:
                options.append(noload(rel))

        query = query.options(*options)

        rows, count = await get_objects_from_query(
            session,
            models.AnnotationTask,
            query,
            limit=limit,
            offset=offset,
            filters=filters,
            sort_by=sort_by,
        )
        # Don't deduplicate - just return the objects directly
        objs = [row[0] for row in rows]

        # Load sound event tags separately if requested
        if include_sound_event_tags:
            task_ids = [obj.id for obj in objs]
            sound_event_tags_map = await self._load_sound_event_tags(session, task_ids)
            stats_map = await self._load_sound_event_tag_stats(session, task_ids)
            tasks_with_tags = []
            for obj in objs:
                task = self._schema.model_validate(obj)
                tags_for_task = sound_event_tags_map.get(obj.id, [])
                # Use model_copy with update to add sound_event_tags
                task_with_tags = task.model_copy(
                    update={
                        "sound_event_tags": tags_for_task,
                        "sound_event_tag_stats": stats_map.get(obj.id, []),
                    }
                )
                tasks_with_tags.append(task_with_tags)
            return tasks_with_tags, count

        return [self._schema.model_validate(obj) for obj in objs], count

    async def get(
        self,
        session: AsyncSession,
        pk: int,
        *,
        include_recording: bool = False,
        include_annotation_project: bool = False,
        include_sound_event_annotations: bool = False,
        include_sound_event_tags: bool = False,
        include_tags: bool = False,
        include_notes: bool = False,
        include_features: bool = False,
        include_status_badges: bool = False,
        include_status_badge_users: bool = False,
        include_sound_event_annotation_features: bool = False,
        include_sound_event_annotation_users: bool = False,
        include_note_users: bool = False,
    ) -> schemas.AnnotationTask:
        """Get an annotation task by primary key.

        Parameters
        ----------
        session
            The database session to use.
        pk
            The primary key (ID) of the annotation task.
        include_recording
            If True, eagerly load the recording relationship.
        include_annotation_project
            If True, eagerly load the annotation_project relationship.
        include_sound_event_annotations
            If True, eagerly load the sound_event_annotations relationship.
        include_tags
            If True, eagerly load the tags relationship.
        include_notes
            If True, eagerly load the notes relationship.
        include_features
            Kept for compatibility: the duration feature is always returned.
        include_status_badges
            If True, eagerly load the status_badges relationship.
        include_status_badge_users
            If True, eagerly load user information for status badges (implies include_status_badges).

        Returns
        -------
        task : schemas.AnnotationTask
            The annotation task.

        Raises
        ------
        NotFoundError
            If the annotation task could not be found.
        """
        from sqlalchemy.orm import noload, selectinload

        # Map include parameters
        include_map = {
            "recording": include_recording,
            "annotation_project": include_annotation_project,
            "sound_event_annotations": include_sound_event_annotations,
            "tags": include_tags,
            "notes": include_notes,
            "status_badges": include_status_badges or include_status_badge_users,
        }

        # Check cache first if no relationships are requested
        if not any(include_map.values()):
            if self._is_in_cache(pk):
                return self._get_from_cache(pk)

        query = select(self._model).where(self._model.id == pk)

        # Build loading options dynamically
        options = []
        for name, rel in self.relationships.items():
            if include_map.get(name, False):
                if name == "status_badges" and include_status_badge_users:
                    # Chain load users when requested
                    options.append(selectinload(rel).selectinload(models.AnnotationStatusBadge.user))
                elif name == "sound_event_annotations":
                    # Handle nested relationships for sound events
                    # Add base loader for sound_event_annotations
                    options.append(selectinload(rel))
                    # Add independent loaders for each nested relationship
                    if include_sound_event_annotation_features:
                        options.append(selectinload(rel).selectinload(models.SoundEventAnnotation.features))
                    if include_sound_event_annotation_users:
                        options.append(selectinload(rel).selectinload(models.SoundEventAnnotation.created_by))
                    # Always load tags for sound events when loading the sound events
                    options.append(selectinload(rel).selectinload(models.SoundEventAnnotation.tags))
                elif name == "notes" and include_note_users:
                    # Chain load users for notes when requested
                    options.append(selectinload(rel).selectinload(models.Note.created_by))
                else:
                    options.append(selectinload(rel))
            else:
                options.append(noload(rel))

        query = query.options(*options)

        result = await session.execute(query)
        obj = result.unique().scalar_one_or_none()

        if obj is None:
            raise exceptions.NotFoundError(f"AnnotationTask with id {pk} not found")

        data = self._schema.model_validate(obj)

        # Load sound event tags separately if requested
        if include_sound_event_tags:
            sound_event_tags_map = await self._load_sound_event_tags(session, [obj.id])
            # Use model_copy with update to add sound_event_tags
            stats_map = await self._load_sound_event_tag_stats(session, [obj.id])
            data = data.model_copy(
                update={
                    "sound_event_tags": sound_event_tags_map.get(obj.id, []),
                    "sound_event_tag_stats": stats_map.get(obj.id, []),
                }
            )

        self._update_cache(data)
        return data

    async def create(
        self,
        session: AsyncSession,
        annotation_project: schemas.AnnotationProject,
        recording: schemas.Recording,
        start_time: float,
        end_time: float,
        **kwargs,
    ) -> schemas.AnnotationTask:
        """Create an annotation task.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        annotation_project
            Annotation project to which the task belongs.
        recording
            Recording from which to extract the audio segment.
        start_time
            Start time of the audio segment in seconds.
        end_time
            End time of the audio segment in seconds.
        **kwargs
            Additional keyword arguments.

        Returns
        -------
        schemas.AnnotationTask
            Created task.
        """
        task = await self.create_from_data(
            session,
            annotation_project_id=annotation_project.id,
            recording_id=recording.id,
            start_time=start_time,
            end_time=end_time,
            **kwargs,
        )

        self._update_cache(task)
        return task

    async def create_many_without_duplicates(
        self,
        session: AsyncSession,
        data: Sequence[dict],
        return_all: bool = False,
    ) -> Sequence[schemas.AnnotationTask]:
        """Create annotation tasks without duplicates.

        Parameters
        ----------
        session
            Database session.
        data
            List of tasks to create.
        return_all
            Whether to return all tasks or only the created ones.

        Returns
        -------
        list[schemas.AnnotationTask]
            Created tasks.
        """
        return await super().create_many_without_duplicates(
            session,
            data,
            return_all=return_all,
        )

    async def add_status_badge(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        state: data.AnnotationState,
        user: schemas.SimpleUser | None = None,
    ) -> schemas.AnnotationTask:
        """Add a status badge to a task.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Task to add the status badge to.
        state
            State of the status badge.
        user
            User that owns the status badge.

        Returns
        -------
        schemas.AnnotationTask
            Task with the new status badge.
        """
        # Compare ids: the user may be an ORM object (request user) or a schema.
        user_id = user.id if user is not None else None
        for b in obj.status_badges:
            badge_user_id = b.user.id if b.user is not None else getattr(b, "user_id", None)
            if badge_user_id == user_id and b.state == state:
                raise exceptions.DuplicateObjectError(f"Status badge {b} already exists in task {obj.id}")

        badge = await common.create_object(
            session,
            models.AnnotationStatusBadge,
            state=state,
            annotation_task_id=obj.id,
            user_id=user.id if user else None,
        )

        await session.refresh(badge, attribute_names=["user"])

        obj = obj.model_copy(
            update=dict(
                status_badges=[
                    *obj.status_badges,
                    schemas.AnnotationStatusBadge.model_validate(badge),
                ],
            )
        )
        self._update_cache(obj)
        return obj

    async def remove_status_badge(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        state: data.AnnotationState,
        user_id: str | None = None,
    ) -> schemas.AnnotationTask:
        """Remove a status badge from a task.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Task to remove the status badge from.
        state
            State of the status badge to remove.
        user_id
            Optional user ID to filter by.

        Returns
        -------
        schemas.AnnotationTask
            Task with the status badge removed.
        """
        for b in obj.status_badges:
            if b.state == state:
                break
        else:
            raise exceptions.NotFoundError(f"Status badge with state {state} not found in task {obj.id}")

        filters = [
            models.AnnotationStatusBadge.annotation_task_id == obj.id,
            models.AnnotationStatusBadge.state == b.state,
        ]
        if user_id is not None:
            filters.append(models.AnnotationStatusBadge.user_id == user_id)
        await common.delete_object(
            session,
            models.AnnotationStatusBadge,
            and_(*filters),
        )

        obj = obj.model_copy(
            update=dict(
                status_badges=[b for b in obj.status_badges if (b.state != state)],
            ),
            deep=True,
        )
        self._update_cache(obj)
        return obj

    async def add_tag(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        tag: schemas.Tag,
        user: schemas.SimpleUser | None = None,
    ) -> schemas.AnnotationTask:
        """Add a tag to an annotation task.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Task to add the tag to.
        tag
            Tag to add.
        user
            User who is adding the tag.

        Returns
        -------
        schemas.AnnotationTask
            Task with the new tag.
        """
        user_id = user.id if user else None
        for t in obj.tags:
            if t.key == tag.key and t.value == tag.value:
                raise exceptions.DuplicateObjectError(f"Tag {tag} already exists in task {obj.id}.")

        await common.create_object(
            session,
            models.AnnotationTaskTag,
            annotation_task_id=obj.id,
            tag_id=tag.id,
            created_by_id=user_id,
        )

        obj = obj.model_copy(
            update=dict(
                tags=[
                    tag,
                    *obj.tags,
                ],
            )
        )
        self._update_cache(obj)
        return obj

    async def remove_tag(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        tag: schemas.Tag,
    ) -> schemas.AnnotationTask:
        """Remove a tag from an annotation task.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Task to remove the tag from.
        tag
            Tag to remove.

        Returns
        -------
        schemas.AnnotationTask
            Task with the tag removed.
        """
        for t in obj.tags:
            if t.key == tag.key and t.value == tag.value:
                break
        else:
            raise exceptions.NotFoundError(f"Tag {tag} does not exist in task {obj.id}.")

        await common.delete_object(
            session,
            models.AnnotationTaskTag,
            and_(
                models.AnnotationTaskTag.annotation_task_id == obj.id,
                models.AnnotationTaskTag.tag_id == tag.id,
            ),
        )

        obj = obj.model_copy(
            update=dict(
                tags=[t for t in obj.tags if not (t.key == tag.key and t.value == tag.value)],
            )
        )
        self._update_cache(obj)
        return obj

    async def add_note(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        note: schemas.Note,
    ) -> schemas.AnnotationTask:
        """Add a note to an annotation task.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Task to add the note to.
        note
            Note to add.

        Returns
        -------
        schemas.AnnotationTask
            Task with the new note.
        """
        for n in obj.notes:
            if n.id == note.id:
                raise exceptions.DuplicateObjectError(f"Note {note.id} already exists in task {obj.id}.")

        # Update the note to associate it with this task
        await common.update_object(
            session,
            models.Note,
            models.Note.id == note.id,
            annotation_task_id=obj.id,
        )

        obj = obj.model_copy(
            update=dict(
                notes=[
                    note,
                    *obj.notes,
                ],
            )
        )
        self._update_cache(obj)
        return obj

    async def remove_note(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        note: schemas.Note,
    ) -> schemas.AnnotationTask:
        """Remove a note from an annotation task.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        obj
            Task to remove the note from.
        note
            Note to remove.

        Returns
        -------
        schemas.AnnotationTask
            Task with the note removed.
        """
        for n in obj.notes:
            if n.id == note.id:
                break
        else:
            raise exceptions.NotFoundError(f"Note {note.id} does not exist in task {obj.id}.")

        # Delete the note from the database
        await common.delete_object(
            session,
            models.Note,
            models.Note.id == note.id,
        )

        obj = obj.model_copy(
            update=dict(
                notes=[n for n in obj.notes if n.id != note.id],
            )
        )
        self._update_cache(obj)
        return obj

    async def _load_sound_event_tags(
        self,
        session: AsyncSession,
        task_ids: list[int],
    ) -> dict[int, list[schemas.Tag]]:
        """Load aggregated tags from sound event annotations for tasks.

        Parameters
        ----------
        session
            Database session.
        task_ids
            List of task IDs to load tags for.

        Returns
        -------
        dict[int, list[schemas.Tag]]
            Mapping from task ID to tags (one entry per sound-event tag link, for counts).
        """
        # Handle empty task_ids
        if not task_ids:
            return {}

        query = (
            select(
                models.SoundEventAnnotation.annotation_task_id,
                models.Tag.id,
                models.Tag.key,
                models.Tag.value,
            )
            .select_from(models.SoundEventAnnotation)
            .join(
                models.SoundEventAnnotationTag,
                models.SoundEventAnnotation.id == models.SoundEventAnnotationTag.sound_event_annotation_id,
            )
            .join(models.Tag, models.SoundEventAnnotationTag.tag_id == models.Tag.id)
        )

        # Chunk the IN list to stay under the database's bound-parameter limit.
        tags_by_task: dict[int, list[schemas.Tag]] = {}
        for start in range(0, len(task_ids), 500):
            chunk = task_ids[start : start + 500]
            result = await session.execute(
                query.where(models.SoundEventAnnotation.annotation_task_id.in_(chunk))
            )
            for task_id, tag_id, tag_key, tag_value in result.all():
                tags_by_task.setdefault(task_id, []).append(
                    schemas.Tag(id=tag_id, key=tag_key, value=tag_value),
                )

        return tags_by_task

    async def _load_sound_event_tag_stats(
        self,
        session: AsyncSession,
        task_ids: list[int],
    ) -> dict[int, list[schemas.SoundEventTagStats]]:
        """Load per-tag confidence statistics (median, max) for tasks.

        Confidence is ``species_confidence`` for tags created by ``birdedge`` and
        ``detection_confidence`` otherwise, matching the confidence filter.
        """
        if not task_ids:
            return {}

        tag_creator = models.User.__table__.alias("stats_tag_creator")
        query = (
            select(
                models.SoundEventAnnotation.annotation_task_id,
                models.Tag.key,
                models.Tag.value,
                models.SoundEventAnnotationFeature.value,
            )
            .select_from(models.SoundEventAnnotation)
            .join(
                models.SoundEventAnnotationTag,
                models.SoundEventAnnotation.id == models.SoundEventAnnotationTag.sound_event_annotation_id,
            )
            .join(models.Tag, models.SoundEventAnnotationTag.tag_id == models.Tag.id)
            .outerjoin(tag_creator, tag_creator.c.id == models.Tag.created_by_id)
            .outerjoin(
                models.SoundEventAnnotationFeature,
                and_(
                    models.SoundEventAnnotationFeature.sound_event_annotation_id == models.SoundEventAnnotation.id,
                    confidence_feature_name_clause_for_tag_creator(tag_creator.c.username),
                ),
            )
        )

        # (task_id, key, value) -> [event count, confidences]
        grouped: dict[tuple[int, str, str], tuple[list[int], list[float]]] = {}
        for start in range(0, len(task_ids), 500):
            chunk = task_ids[start : start + 500]
            result = await session.execute(
                query.where(models.SoundEventAnnotation.annotation_task_id.in_(chunk))
            )
            for task_id, key, value, confidence in result.all():
                count, confidences = grouped.setdefault((task_id, key, value), ([0], []))
                count[0] += 1
                if confidence is not None:
                    confidences.append(confidence)

        stats_by_task: dict[int, list[schemas.SoundEventTagStats]] = {}
        for (task_id, key, value), (count, confidences) in grouped.items():
            stats_by_task.setdefault(task_id, []).append(
                schemas.SoundEventTagStats(
                    key=key,
                    value=value,
                    count=count[0],
                    median_confidence=median(confidences) if confidences else None,
                    max_confidence=max(confidences) if confidences else None,
                )
            )

        return stats_by_task

    def _key_fn(self, obj: dict):
        return (
            obj.get("annotation_project_id"),
            obj.get("recording_id"),
            obj.get("start_time"),
            obj.get("end_time"),
        )

    def _get_key_column(self):
        return tuple_(
            models.AnnotationTask.annotation_project_id,
            models.AnnotationTask.recording_id,
            models.AnnotationTask.start_time,
            models.AnnotationTask.end_time,
        )

    async def resolve_bulk_task_ids(
        self,
        session: AsyncSession,
        *,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None,
        annotation_task_ids: list[int] | None,
    ) -> list[int]:
        """Resolve task IDs for bulk operations (intersect explicit IDs with filter).

        Without explicit IDs, every task matching the filter is targeted, in
        ascending id order. With explicit IDs, their order is kept and only
        those matching the filter remain. There is no upper limit.
        """
        from sonari.api.common.utils import apply_filters

        base = apply_filters(select(models.AnnotationTask.id), filters)

        if annotation_task_ids is None:
            result = await session.execute(base.order_by(models.AnnotationTask.id))
            return list(result.scalars().all())

        requested = list(dict.fromkeys(annotation_task_ids))
        matching: set[int] = set()
        for start in range(0, len(requested), _ID_LOOKUP_CHUNK_SIZE):
            chunk = requested[start : start + _ID_LOOKUP_CHUNK_SIZE]
            result = await session.execute(
                base.where(models.AnnotationTask.id.in_(chunk)),
            )
            matching.update(result.scalars().all())
        return [task_id for task_id in requested if task_id in matching]

    def _forget_cached_tasks(self, task_ids: Sequence[int]) -> None:
        """Drop tasks changed by set-based SQL from the object cache."""
        cache = self._cache
        if cache is None:
            return
        for task_id in task_ids:
            cache.pop((self._model.__name__, task_id), None)

    async def _existing_task_ids(
        self,
        session: AsyncSession,
        task_ids: Sequence[int],
    ) -> set[int]:
        result = await session.execute(
            select(models.AnnotationTask.id).where(
                models.AnnotationTask.id.in_(task_ids),
            ),
        )
        return set(result.scalars().all())

    @staticmethod
    def _not_found_failures(
        chunk: Sequence[int],
        existing_ids: set[int],
    ) -> list[schemas.AnnotationTaskBulkFailure]:
        return [
            schemas.AnnotationTaskBulkFailure(
                annotation_task_id=task_id,
                message="Annotation task not found.",
            )
            for task_id in chunk
            if task_id not in existing_ids
        ]

    @staticmethod
    def _chunk_failures(
        chunk: Sequence[int],
        exc: Exception,
    ) -> list[schemas.AnnotationTaskBulkFailure]:
        message = str(exc)
        return [
            schemas.AnnotationTaskBulkFailure(annotation_task_id=task_id, message=message)
            for task_id in chunk
        ]

    async def bulk_add_status_badge(
        self,
        session: AsyncSession,
        *,
        task_ids: list[int],
        state: data.AnnotationState,
        user: schemas.SimpleUser,
    ) -> schemas.AnnotationTaskBulkResult:
        """Add the user's status badge to many tasks; skip tasks that already have it."""
        user_id = user.id
        tasks_updated = 0
        tasks_skipped = 0
        failures: list[schemas.AnnotationTaskBulkFailure] = []

        for chunk_start in range(0, len(task_ids), _BULK_CHUNK_SIZE):
            chunk = task_ids[chunk_start : chunk_start + _BULK_CHUNK_SIZE]
            try:
                existing_ids = await self._existing_task_ids(session, chunk)
                failures.extend(self._not_found_failures(chunk, existing_ids))
                if not existing_ids:
                    continue

                # Same rule as add_status_badge: one badge per (task, user, state).
                already_badged = exists(
                    select(1).where(
                        models.AnnotationStatusBadge.annotation_task_id
                        == models.AnnotationTask.id,
                        models.AnnotationStatusBadge.state == state,
                        models.AnnotationStatusBadge.user_id == user_id,
                    ),
                )
                now = datetime.datetime.now(datetime.timezone.utc)
                source = select(
                    models.AnnotationTask.id.label("annotation_task_id"),
                    literal(user_id, type_=models.AnnotationStatusBadge.user_id.type).label(
                        "user_id",
                    ),
                    literal(state, type_=models.AnnotationStatusBadge.state.type).label(
                        "state",
                    ),
                    literal(now).label("created_on"),
                ).where(
                    models.AnnotationTask.id.in_(existing_ids),
                    ~already_badged,
                )
                result = await session.execute(
                    insert(models.AnnotationStatusBadge)
                    .from_select(
                        ["annotation_task_id", "user_id", "state", "created_on"],
                        source,
                    )
                    .returning(models.AnnotationStatusBadge.annotation_task_id),
                )
                inserted = list(result.scalars().all())
                tasks_updated += len(inserted)
                tasks_skipped += len(existing_ids) - len(inserted)
                if inserted:
                    await invalidate_species_counts_for_tasks(session, inserted)
                    await session.commit()
                    self._forget_cached_tasks(inserted)
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                failures.extend(self._chunk_failures(chunk, exc))

        return schemas.AnnotationTaskBulkResult(
            tasks_targeted=len(task_ids),
            tasks_updated=tasks_updated,
            tasks_skipped=tasks_skipped,
            sound_events_updated=0,
            failures=failures,
        )

    async def bulk_remove_status_badge(
        self,
        session: AsyncSession,
        *,
        task_ids: list[int],
        state: data.AnnotationState,
        user_id: str | None = None,
    ) -> schemas.AnnotationTaskBulkResult:
        """Remove status badges of ``state`` from many tasks.

        Like :meth:`remove_status_badge`, every user's badge of that state is
        removed unless ``user_id`` is given. Tasks without such a badge are
        counted as skipped.
        """
        tasks_updated = 0
        tasks_skipped = 0
        failures: list[schemas.AnnotationTaskBulkFailure] = []

        for chunk_start in range(0, len(task_ids), _BULK_CHUNK_SIZE):
            chunk = task_ids[chunk_start : chunk_start + _BULK_CHUNK_SIZE]
            try:
                existing_ids = await self._existing_task_ids(session, chunk)
                failures.extend(self._not_found_failures(chunk, existing_ids))
                if not existing_ids:
                    continue

                conditions = [
                    models.AnnotationStatusBadge.annotation_task_id.in_(existing_ids),
                    models.AnnotationStatusBadge.state == state,
                ]
                if user_id is not None:
                    conditions.append(models.AnnotationStatusBadge.user_id == user_id)
                result = await session.execute(
                    delete(models.AnnotationStatusBadge)
                    .where(*conditions)
                    .returning(models.AnnotationStatusBadge.annotation_task_id),
                )
                changed = set(result.scalars().all())
                tasks_updated += len(changed)
                tasks_skipped += len(existing_ids) - len(changed)
                if changed:
                    await invalidate_species_counts_for_tasks(session, list(changed))
                    await session.commit()
                    self._forget_cached_tasks(list(changed))
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                failures.extend(self._chunk_failures(chunk, exc))

        return schemas.AnnotationTaskBulkResult(
            tasks_targeted=len(task_ids),
            tasks_updated=tasks_updated,
            tasks_skipped=tasks_skipped,
            sound_events_updated=0,
            failures=failures,
        )

    async def bulk_add_tag(
        self,
        session: AsyncSession,
        *,
        task_ids: list[int],
        tag: schemas.TagCreate,
        user: schemas.SimpleUser,
    ) -> schemas.AnnotationTaskBulkResult:
        """Add a tag to many tasks; skip tasks that already have it."""
        from sonari.api import tags as tags_api

        tag_obj = await tags_api.get_or_create(session, tag.key, tag.value, user)
        tag_id = tag_obj.id

        tasks_updated = 0
        tasks_skipped = 0
        failures: list[schemas.AnnotationTaskBulkFailure] = []

        for chunk_start in range(0, len(task_ids), _BULK_CHUNK_SIZE):
            chunk = task_ids[chunk_start : chunk_start + _BULK_CHUNK_SIZE]
            try:
                existing_result = await session.execute(
                    select(models.AnnotationTask.id).where(
                        models.AnnotationTask.id.in_(chunk),
                    ),
                )
                existing_ids = set(existing_result.scalars().all())
                for task_id in chunk:
                    if task_id not in existing_ids:
                        failures.append(
                            schemas.AnnotationTaskBulkFailure(
                                annotation_task_id=task_id,
                                message="Annotation task not found.",
                            ),
                        )
                if not existing_ids:
                    continue

                # Like add_tag: a task counts as tagged if any user attached the tag.
                already_tagged = exists(
                    select(1).where(
                        models.AnnotationTaskTag.annotation_task_id
                        == models.AnnotationTask.id,
                        models.AnnotationTaskTag.tag_id == tag_id,
                    ),
                )
                now = datetime.datetime.now(datetime.timezone.utc)
                source = select(
                    models.AnnotationTask.id.label("annotation_task_id"),
                    literal(tag_id).label("tag_id"),
                    literal(user.id).label("created_by_id"),
                    literal(now).label("created_on"),
                ).where(
                    models.AnnotationTask.id.in_(existing_ids),
                    ~already_tagged,
                )
                result = await session.execute(
                    insert(models.AnnotationTaskTag)
                    .from_select(
                        ["annotation_task_id", "tag_id", "created_by_id", "created_on"],
                        source,
                    )
                    .returning(models.AnnotationTaskTag.annotation_task_id),
                )
                inserted = len(result.all())
                tasks_updated += inserted
                tasks_skipped += len(existing_ids) - inserted
                if inserted > 0:
                    await session.commit()
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                message = str(exc)
                for task_id in chunk:
                    failures.append(
                        schemas.AnnotationTaskBulkFailure(
                            annotation_task_id=task_id,
                            message=message,
                        ),
                    )

        return schemas.AnnotationTaskBulkResult(
            tasks_targeted=len(task_ids),
            tasks_updated=tasks_updated,
            tasks_skipped=tasks_skipped,
            sound_events_updated=0,
            failures=failures,
        )

    async def bulk_sound_event_tag_counts(
        self,
        session: AsyncSession,
        *,
        task_ids: list[int],
    ) -> list[schemas.SoundEventTagBulkCount]:
        """Aggregate distinct sound event tags (with counts) for the given tasks."""
        if not task_ids:
            return []

        query = (
            select(
                models.Tag.key,
                models.Tag.value,
                func.count(models.SoundEventAnnotationTag.id),
            )
            .select_from(models.SoundEventAnnotationTag)
            .join(
                models.SoundEventAnnotation,
                models.SoundEventAnnotationTag.sound_event_annotation_id
                == models.SoundEventAnnotation.id,
            )
            .join(models.Tag, models.SoundEventAnnotationTag.tag_id == models.Tag.id)
            .group_by(models.Tag.key, models.Tag.value)
        )
        counts: dict[tuple[str, str], int] = {}
        for start in range(0, len(task_ids), _ID_LOOKUP_CHUNK_SIZE):
            chunk = task_ids[start : start + _ID_LOOKUP_CHUNK_SIZE]
            result = await session.execute(
                query.where(models.SoundEventAnnotation.annotation_task_id.in_(chunk)),
            )
            for key, value, count in result.all():
                counts[(key, value)] = counts.get((key, value), 0) + count

        return [
            schemas.SoundEventTagBulkCount(key=key, value=value, count=count)
            for (key, value), count in sorted(counts.items())
        ]

    async def bulk_replace_sound_event_tags(
        self,
        session: AsyncSession,
        *,
        task_ids: list[int],
        old_tag: schemas.TagCreate | None,
        new_tag: schemas.TagCreate | None,
        replace_all: bool,
        add_to_tagged: bool,
        user: schemas.SimpleUser,
        replace_group: str | None = None,
        edit: EditContext | None = None,
    ) -> schemas.AnnotationTaskBulkResult:
        """Replace sound event tags across many annotation tasks."""
        from sonari.api import tags as tags_api

        edit = edit or EditContext(user_id=user.id)
        if replace_group is not None:
            return await self._bulk_replace_species_group(
                session,
                task_ids=task_ids,
                group=replace_group,
                user=user,
                edit=edit,
            )

        effective_replace_all = replace_all or is_replace_all_tag(old_tag)
        if add_to_tagged:
            if replace_all or effective_replace_all:
                raise ValueError("add_to_tagged cannot be combined with replace_all.")
            if old_tag is None or new_tag is None or is_replace_all_tag(old_tag):
                raise ValueError("add_to_tagged requires old_tag and new_tag.")
        if new_tag is None and old_tag is None and not effective_replace_all:
            raise ValueError("Provide old_tag, new_tag, or replace_all to update tags.")

        new_tag_id: int | None = None
        if new_tag is not None:
            new_tag_obj = await tags_api.get_or_create(
                session,
                new_tag.key,
                new_tag.value,
                user,
            )
            new_tag_id = new_tag_obj.id

        old_tag_id: int | None = None
        old_tag_provided = old_tag is not None
        if old_tag is not None and not is_replace_all_tag(old_tag):
            old_tag_obj = await tags_api.get(session, (old_tag.key, old_tag.value))
            old_tag_id = old_tag_obj.id

        bulk_params = build_bulk_params(
            new_tag_id=new_tag_id,
            old_tag_id=old_tag_id,
            effective_replace_all=effective_replace_all,
            old_tag_provided=old_tag_provided,
            add_to_tagged=add_to_tagged,
            user=user,
        )

        return await self._run_bulk_replace_chunks(session, task_ids, bulk_params, edit)

    async def _run_bulk_replace_chunks(
        self,
        session: AsyncSession,
        task_ids: list[int],
        bulk_params: BulkSoundEventTagReplaceParams,
        edit: EditContext,
    ) -> schemas.AnnotationTaskBulkResult:
        tasks_targeted = len(task_ids)
        tasks_updated = 0
        sound_events_updated = 0
        failures: list[schemas.AnnotationTaskBulkFailure] = []

        for chunk_start in range(0, len(task_ids), _BULK_CHUNK_SIZE):
            chunk = task_ids[chunk_start : chunk_start + _BULK_CHUNK_SIZE]
            try:
                chunk_result = await process_bulk_tag_replace_chunk(
                    session,
                    chunk,
                    bulk_params,
                    edit,
                )
                failures.extend(chunk_result.failures)
                tasks_updated += chunk_result.tasks_updated
                sound_events_updated += chunk_result.sound_events_updated
                if chunk_result.tasks_updated > 0 or chunk_result.sound_events_updated > 0:
                    await session.commit()
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                message = str(exc)
                for task_id in chunk:
                    failures.append(
                        schemas.AnnotationTaskBulkFailure(
                            annotation_task_id=task_id,
                            message=message,
                        ),
                    )

        return schemas.AnnotationTaskBulkResult(
            tasks_targeted=tasks_targeted,
            tasks_updated=tasks_updated,
            tasks_skipped=0,
            sound_events_updated=sound_events_updated,
            failures=failures,
        )

    async def _bulk_replace_species_group(
        self,
        session: AsyncSession,
        *,
        task_ids: list[int],
        group: str,
        user: schemas.SimpleUser,
        edit: EditContext,
    ) -> schemas.AnnotationTaskBulkResult:
        """Replace every species tag of ``group`` with the tag ``group=<group>``."""
        from sonari.api import tags as tags_api

        if group not in REPLACEABLE_BAT_GROUPS:
            raise ValueError(f"Unsupported group: {group}.")

        empty = schemas.AnnotationTaskBulkResult(
            tasks_targeted=len(task_ids),
            tasks_updated=0,
            tasks_skipped=0,
            sound_events_updated=0,
            failures=[],
        )

        member_values = [v for v in species_in_group(group) ]
        member_ids = (
            await session.execute(
                select(models.Tag.id).where(
                    models.Tag.key == SPECIES_TAG_KEY,
                    models.Tag.value.in_(member_values),
                ),
            )
        ).scalars().all()
        if not member_ids:
            return empty

        group_tag = await tags_api.get_or_create(session, GROUP_TAG_KEY, group, user)
        bulk_params = build_bulk_params(
            new_tag_id=group_tag.id,
            old_tag_id=None,
            effective_replace_all=False,
            old_tag_provided=True,
            add_to_tagged=False,
            user=user,
            old_tag_ids=member_ids,
        )
        return await self._run_bulk_replace_chunks(session, task_ids, bulk_params, edit)

    async def bulk_delete_sound_events_by_tag(
        self,
        session: AsyncSession,
        *,
        task_ids: list[int],
        tag: schemas.TagCreate,
        edit: EditContext | None = None,
    ) -> schemas.AnnotationTaskBulkResult:
        """Delete sound event annotations whose only tag is ``tag`` across many tasks."""
        from sonari.api import tags as tags_api

        if is_replace_all_tag(tag):
            raise ValueError("Deleting sound events requires a specific tag.")

        tag_obj = await tags_api.get(session, (tag.key, tag.value))

        tasks_updated = 0
        sound_events_deleted = 0
        sound_events_skipped = 0
        failures: list[schemas.AnnotationTaskBulkFailure] = []

        for chunk_start in range(0, len(task_ids), _BULK_CHUNK_SIZE):
            chunk = task_ids[chunk_start : chunk_start + _BULK_CHUNK_SIZE]
            try:
                chunk_result = await process_bulk_delete_sound_events_chunk(
                    session,
                    chunk,
                    tag_obj.id,
                    edit,
                )
                failures.extend(chunk_result.failures)
                tasks_updated += chunk_result.tasks_updated
                sound_events_deleted += chunk_result.sound_events_updated
                sound_events_skipped += chunk_result.sound_events_skipped
                if chunk_result.sound_events_updated > 0:
                    await session.commit()
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                message = str(exc)
                for task_id in chunk:
                    failures.append(
                        schemas.AnnotationTaskBulkFailure(
                            annotation_task_id=task_id,
                            message=message,
                        ),
                    )

        return schemas.AnnotationTaskBulkResult(
            tasks_targeted=len(task_ids),
            tasks_updated=tasks_updated,
            tasks_skipped=0,
            sound_events_updated=sound_events_deleted,
            sound_events_skipped=sound_events_skipped,
            failures=failures,
        )


annotation_tasks = AnnotationTaskAPI()


def _consecutive_runs(nights: Sequence[str]) -> list[tuple[str, str]]:
    """Sorted night dates ("YYYY-MM-DD") as runs of consecutive days: [(first, last), ...]."""
    runs: list[tuple[str, str]] = []
    previous: datetime.date | None = None
    for night in nights:
        day = datetime.date.fromisoformat(night)
        if previous is not None and day == previous + datetime.timedelta(days=1):
            runs[-1] = (runs[-1][0], night)
        else:
            runs.append((night, night))
        previous = day
    return runs
