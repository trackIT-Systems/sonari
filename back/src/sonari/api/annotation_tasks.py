"""Python API for interacting with Annotation Tasks."""

from typing import Sequence

from soundevent import data
from sqlalchemy import and_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql._typing import _ColumnExpressionArgument

from sonari import exceptions, models, schemas
from sonari.api import common
from sonari.api.common import BaseAPI
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
        "features": models.AnnotationTask.features,
        "status_badges": models.AnnotationTask.status_badges,
    }

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
            If True, eagerly load the features relationship.

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
            "features": include_features,
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

        result, count = await get_objects_from_query(
            session,
            models.AnnotationTask,
            query,
            limit=limit,
            offset=offset,
            filters=filters,
            sort_by=sort_by,
        )
        # Don't use unique() - just return the scalars directly
        objs = result.scalars().all()

        # Load sound event tags separately if requested
        if include_sound_event_tags:
            task_ids = [obj.id for obj in objs]
            sound_event_tags_map = await self._load_sound_event_tags(session, task_ids)
            tasks_with_tags = []
            for obj in objs:
                task = self._schema.model_validate(obj)
                tags_for_task = sound_event_tags_map.get(obj.id, [])
                # Use model_copy with update to add sound_event_tags
                task_with_tags = task.model_copy(update={"sound_event_tags": tags_for_task})
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
            If True, eagerly load the features relationship.
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
            "features": include_features,
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
            data = data.model_copy(update={"sound_event_tags": sound_event_tags_map.get(obj.id, [])})

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
            Mapping from task ID to list of unique tags from its sound events.
        """
        # Handle empty task_ids
        if not task_ids:
            return {}

        # Query to get sound event annotation tags for the given tasks
        # Use distinct on both task_id and tag_id to get unique combinations
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
            .where(models.SoundEventAnnotation.annotation_task_id.in_(task_ids))
            .distinct()
        )

        result = await session.execute(query)
        rows = result.all()

        # Group tags by task ID
        tags_by_task: dict[int, list[schemas.Tag]] = {}
        for task_id, tag_id, tag_key, tag_value in rows:
            if task_id not in tags_by_task:
                tags_by_task[task_id] = []
            # Check if tag already added (for uniqueness by id)
            if not any(t.id == tag_id for t in tags_by_task[task_id]):
                tags_by_task[task_id].append(schemas.Tag(id=tag_id, key=tag_key, value=tag_value))

        return tags_by_task

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
