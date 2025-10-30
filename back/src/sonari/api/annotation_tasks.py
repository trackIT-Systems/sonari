"""Python API for interacting with Annotation Tasks.

Since Clip, ClipAnnotation, and AnnotationTask have been merged into a single
AnnotationTask model, this API handles all clip and annotation functionality.
"""

from pathlib import Path
from typing import Any, Sequence

from soundevent import data
from sqlalchemy import and_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql._typing import _ColumnExpressionArgument

from sonari import exceptions, models, schemas
from sonari.api import common
from sonari.api.common import BaseAPI
from sonari.api.recordings import recordings
from sonari.api.users import users
from sonari.filters.base import Filter

__all__ = [
    "AnnotationTaskAPI",
    "annotation_tasks",
    "compute_duration",
]


class AnnotationTaskAPI(
    BaseAPI[
        int,
        models.AnnotationTask,
        schemas.AnnotationTask,
        schemas.AnnotationTaskCreate,
        schemas.AnnotationTaskUpdate,
    ]
):
    """API for annotation tasks.

    Annotation tasks now include all clip and annotation data.
    """

    _model = models.AnnotationTask
    _schema = schemas.AnnotationTask

    async def get_many(
        self,
        session: AsyncSession,
        *,
        limit: int | None = 1000,
        offset: int | None = 0,
        filters: Sequence[Filter | _ColumnExpressionArgument] | None = None,
        sort_by: _ColumnExpressionArgument | str | None = "-created_on",
        noloads: list[Any] | None = None,
    ) -> tuple[Sequence[schemas.AnnotationTask], int]:
        """Get many annotation tasks without unique() to avoid duplicate removal after pagination."""
        from sonari.api.common.utils import get_objects_from_query

        query = select(models.AnnotationTask)
        result, count = await get_objects_from_query(
            session,
            models.AnnotationTask,
            query,
            limit=limit,
            offset=offset,
            filters=filters,
            sort_by=sort_by,
            noloads=noloads,
        )
        # Don't use unique() - just return the scalars directly
        objs = result.scalars().all()
        return [self._schema.model_validate(obj) for obj in objs], count

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

        # Compute and add default features
        features = await self._create_task_features(session, [task])
        task = task.model_copy(update=dict(features=features[0]))
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
        tasks = await super().create_many_without_duplicates(
            session,
            data,
            return_all=return_all,
        )

        if not tasks:
            return tasks

        # Compute features for all tasks
        task_features = await self._create_task_features(session, tasks)
        return [
            task.model_copy(update=dict(features=features))
            for task, features in zip(tasks, task_features, strict=False)
        ]

    async def add_feature(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        feature: schemas.Feature,
    ) -> schemas.AnnotationTask:
        """Add feature to annotation task.

        Parameters
        ----------
        session
            Database session.
        obj
            Task to add feature to.
        feature
            Feature to add.

        Returns
        -------
        schemas.AnnotationTask
            Updated task.
        """
        for f in obj.features:
            if f.name == feature.name:
                raise exceptions.DuplicateObjectError(f"Task {obj.id} already has a feature with name {feature.name}.")

        await common.create_object(
            session,
            models.AnnotationTaskFeature,
            annotation_task_id=obj.id,
            name=feature.name,
            value=feature.value,
        )

        obj = obj.model_copy(update=dict(features=[*obj.features, feature]))
        self._update_cache(obj)
        return obj

    async def update_feature(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        feature: schemas.Feature,
    ) -> schemas.AnnotationTask:
        """Update a feature value for a task.

        Parameters
        ----------
        session
            Database session.
        obj
            Task to update feature for.
        feature
            Feature to update.

        Returns
        -------
        schemas.AnnotationTask
            The updated task.
        """
        for f in obj.features:
            if f.name == feature.name:
                break
        else:
            raise ValueError(f"Task {obj} does not have a feature with name {feature.name}.")

        await common.update_object(
            session,
            models.AnnotationTaskFeature,
            and_(
                models.AnnotationTaskFeature.annotation_task_id == obj.id,
                models.AnnotationTaskFeature.name == feature.name,
            ),
            value=feature.value,
        )

        obj = obj.model_copy(update=dict(features=[f if f.name != feature.name else feature for f in obj.features]))
        self._update_cache(obj)
        return obj

    async def remove_feature(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        feature: schemas.Feature,
    ) -> schemas.AnnotationTask:
        """Remove feature from task.

        Parameters
        ----------
        session
            Database session.
        obj
            Task to remove feature from.
        feature
            Feature to remove.

        Returns
        -------
        schemas.AnnotationTask
            The updated task.
        """
        for f in obj.features:
            if f.name == feature.name:
                break
        else:
            raise ValueError(f"Task {obj} does not have a feature with name {feature.name}.")

        await common.delete_object(
            session,
            models.AnnotationTaskFeature,
            and_(
                models.AnnotationTaskFeature.annotation_task_id == obj.id,
                models.AnnotationTaskFeature.name == feature.name,
            ),
        )

        obj = obj.model_copy(update=dict(features=[f for f in obj.features if f.name != feature.name]))
        self._update_cache(obj)
        return obj

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
        for b in obj.status_badges:
            if b.user == user and b.state == state:
                raise exceptions.DuplicateObjectError(f"Status badge {b} already exists in task {obj.id}")

        badge = await common.create_object(
            session,
            models.AnnotationStatusBadge,
            state=state,
            annotation_task_id=obj.id,
            user_id=user.id if user else None,
        )

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

    async def from_soundevent(
        self,
        session: AsyncSession,
        data: data.AnnotationTask,
        annotation_project: schemas.AnnotationProject,
    ) -> schemas.AnnotationTask:
        """Get or create a task from a `soundevent` task.

        Parameters
        ----------
        session
            An async database session.
        data
            The `soundevent` task.
        annotation_project
            The annotation project to which the task belongs.

        Returns
        -------
        schemas.AnnotationTask
            The created task.
        """
        # Note: UUIDs have been removed, so we can't look up by UUID anymore
        # We'll need to create a new task or find by other means
        recording = await recordings.from_soundevent(session, data.clip.recording)

        task = await self.create(
            session,
            annotation_project=annotation_project,
            recording=recording,
            start_time=data.clip.start_time,
            end_time=data.clip.end_time,
        )

        return await self._update_from_soundevent(session, task, data)

    def to_soundevent(
        self,
        task: schemas.AnnotationTask,
        audio_dir: Path | None = None,
    ) -> data.AnnotationTask:
        """Convert a task to a `soundevent` task.

        Parameters
        ----------
        task
            The task to convert.
        audio_dir
            Optional audio directory path.

        Returns
        -------
        data.AnnotationTask
            The converted task.
        """
        # Create clip data from task
        clip = data.Clip(
            recording=recordings.to_soundevent(task.recording, audio_dir=audio_dir),
            start_time=task.start_time,
            end_time=task.end_time,
        )

        return data.AnnotationTask(
            clip=clip,
            status_badges=[
                data.StatusBadge(
                    owner=users.to_soundevent(sb.user) if sb.user else None,
                    state=sb.state,
                    created_on=sb.created_on,
                )
                for sb in task.status_badges
            ],
            created_on=task.created_on,
        )

    async def _create_task_features(
        self,
        session: AsyncSession,
        tasks: Sequence[schemas.AnnotationTask],
    ) -> Sequence[list[schemas.Feature]]:
        """Create features for tasks.

        Parameters
        ----------
        session
            Database session.
        tasks
            List of tasks to create features for.

        Returns
        -------
        list[list[schemas.Feature]]
            List of features created for each task.
        """
        task_features = [
            [schemas.Feature(name=name, value=value) for name, value in compute_task_features(task).items()]
            for task in tasks
        ]

        create_values = [
            (task.id, feature.name, feature.value)
            for task, features in zip(tasks, task_features, strict=False)
            for feature in features
        ]

        data = [
            dict(
                annotation_task_id=task_id,
                name=name,
                value=value,
            )
            for task_id, name, value in create_values
        ]

        await common.create_objects_without_duplicates(
            session,
            models.AnnotationTaskFeature,
            data,
            key=lambda obj: (obj["annotation_task_id"], obj["name"]),
            key_column=tuple_(
                models.AnnotationTaskFeature.annotation_task_id,
                models.AnnotationTaskFeature.name,
            ),
            return_all=True,
        )
        return task_features

    async def _update_from_soundevent(
        self,
        session: AsyncSession,
        obj: schemas.AnnotationTask,
        data: data.AnnotationTask,
    ) -> schemas.AnnotationTask:
        """Update a task from a `soundevent` task.

        Parameters
        ----------
        session
            An async database session.
        obj
            The task to update.
        data
            The `soundevent` task.

        Returns
        -------
        schemas.AnnotationTask
            The updated task.
        """
        current_status_badges = {(b.user.id if b.user else None, b.state) for b in obj.status_badges}
        for status_badge in data.status_badges:
            if (
                status_badge.owner.uuid if status_badge.owner else None,
                status_badge.state,
            ) in current_status_badges:
                continue

            user = None
            if status_badge.owner:
                user = await users.from_soundevent(session, status_badge.owner)

            obj = await self.add_status_badge(
                session,
                obj,
                state=status_badge.state,
                user=user,
            )

        return obj

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


# Feature computation functions
DURATION = "duration"
"""Name of duration feature."""


def compute_duration(task: schemas.AnnotationTask | models.AnnotationTask) -> float:
    """Compute duration of task's audio segment.

    Parameters
    ----------
    task
        Task to compute duration for.

    Returns
    -------
    float
        Duration in seconds.
    """
    return task.end_time - task.start_time


TASK_FEATURES = {
    DURATION: compute_duration,
}


def compute_task_features(
    task: schemas.AnnotationTask | models.AnnotationTask,
) -> dict[str, float]:
    """Compute features for task.

    Parameters
    ----------
    task
        Task to compute features for.

    Returns
    -------
    dict[str, float]
        Dictionary of feature names and values.
    """
    return {name: func(task) for name, func in TASK_FEATURES.items()}


annotation_tasks = AnnotationTaskAPI()
