"""Python API for sound event annotations."""

from soundevent import Geometry
from sqlalchemy import and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import exceptions, models, schemas
from sonari.api import common
from sonari.api.common import BaseAPI

__all__ = [
    "CONFIDENCE_FEATURE_NAMES",
    "ML_CONFIDENCE_USERNAMES",
    "SoundEventAnnotationAPI",
    "sound_event_annotations",
]

# Only these service users may keep ML confidence features after tag edits.
ML_CONFIDENCE_USERNAMES = frozenset({"birdedge", "yolobat"})
CONFIDENCE_FEATURE_NAMES = ("detection_confidence", "species_confidence")


class SoundEventAnnotationAPI(
    BaseAPI[
        int,
        models.SoundEventAnnotation,
        schemas.SoundEventAnnotation,
        schemas.SoundEventAnnotationCreate,
        schemas.SoundEventAnnotationUpdate,
    ]
):
    _model = models.SoundEventAnnotation
    _schema = schemas.SoundEventAnnotation

    async def get(
        self,
        session: AsyncSession,
        pk: int,
        *,
        include_tags: bool = False,
        include_features: bool = False,
        include_created_by: bool = False,
    ) -> schemas.SoundEventAnnotation:
        """Get a sound event annotation by ID with optional relationship loading.

        Parameters
        ----------
        session
            The database session to use.
        pk
            The primary key.
        include_tags
            If True, eagerly load the tags relationship.
        include_features
            If True, eagerly load the features relationship.
        include_created_by
            If True, eagerly load the created_by relationship.

        Returns
        -------
        schemas.SoundEventAnnotation
            The sound event annotation with the given primary key.

        Raises
        ------
        NotFoundError
            If the annotation could not be found.
        """
        from sqlalchemy import select
        from sqlalchemy.orm import noload, selectinload

        # Check cache first if no relationships are requested
        if not (include_tags or include_features or include_created_by):
            if self._is_in_cache(pk):
                return self._get_from_cache(pk)

        query = select(self._model).where(self._model.id == pk)

        # Build loading options dynamically
        options = []
        if include_tags:
            options.append(selectinload(models.SoundEventAnnotation.tags))
        else:
            options.append(noload(models.SoundEventAnnotation.tags))

        if include_features:
            options.append(selectinload(models.SoundEventAnnotation.features))
        else:
            options.append(noload(models.SoundEventAnnotation.features))

        if include_created_by:
            options.append(selectinload(models.SoundEventAnnotation.created_by))
        else:
            options.append(noload(models.SoundEventAnnotation.created_by))

        query = query.options(*options)

        result = await session.execute(query)
        obj = result.unique().scalar_one_or_none()

        if obj is None:
            raise exceptions.NotFoundError(f"SoundEventAnnotation with id {pk} not found")

        data = self._schema.model_validate(obj)
        self._update_cache(data)
        return data

    async def create(
        self,
        session: AsyncSession,
        annotation_task: schemas.AnnotationTask,
        geometry: Geometry,
        created_by: schemas.SimpleUser | None = None,
        **kwargs,
    ) -> schemas.SoundEventAnnotation:
        """Create a sound event annotation.

        Parameters
        ----------
        session
            The database session.
        annotation_task
            The annotation task to add the annotation to.
        geometry
            The geometry of the sound event.
        created_by
            The user that created the annotation. Defaults to None.
        **kwargs
            Additional keyword arguments to use when creating the annotation.

        Returns
        -------
        schemas.SoundEventAnnotation
            The created sound event annotation.
        """
        return await self.create_from_data(
            session,
            annotation_task_id=annotation_task.id,
            recording_id=annotation_task.recording_id,
            geometry_type=geometry.type,
            geometry=geometry,
            created_by_id=created_by.id if created_by else None,
            **kwargs,
        )

    async def update_geometry(
        self,
        session: AsyncSession,
        sound_event_annotation: schemas.SoundEventAnnotation,
        geometry: Geometry,
    ) -> schemas.SoundEventAnnotation:
        """Update the geometry of a sound event annotation.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        sound_event_annotation
            The sound event annotation to update.
        geometry
            The new geometry.

        Returns
        -------
        schemas.SoundEventAnnotation
            The updated annotation.
        """
        await common.update_object(
            session,
            models.SoundEventAnnotation,
            condition=models.SoundEventAnnotation.id == sound_event_annotation.id,
            geometry_type=geometry.type,
            geometry=geometry,
        )

        obj = sound_event_annotation.model_copy(
            update=dict(
                geometry_type=geometry.type,
                geometry=geometry,
            )
        )
        self._update_cache(obj)
        return obj

    async def mark_as_edited_by_user(
        self,
        session: AsyncSession,
        sound_event_annotation: schemas.SoundEventAnnotation,
        user: schemas.SimpleUser,
    ) -> schemas.SoundEventAnnotation:
        """Mark a sound event annotation as edited and update ownership.

        Human edits remove machine-generated confidence features; ``birdedge`` and ``yolobat``
        may retain them. Call after geometry or tag changes.

        Parameters
        ----------
        session
            SQLAlchemy AsyncSession.
        sound_event_annotation
            The sound event annotation that was edited.
        user
            The user who made the edit.

        Returns
        -------
        schemas.SoundEventAnnotation
            The updated annotation.
        """
        retain_confidence = user.username in ML_CONFIDENCE_USERNAMES

        if sound_event_annotation.features is None:
            sound_event_annotation = await self.get(
                session,
                sound_event_annotation.id,
                include_tags=True,
                include_features=True,
            )

        if not retain_confidence:
            await session.execute(
                delete(models.SoundEventAnnotationFeature).where(
                    and_(
                        models.SoundEventAnnotationFeature.sound_event_annotation_id
                        == sound_event_annotation.id,
                        models.SoundEventAnnotationFeature.name.in_(CONFIDENCE_FEATURE_NAMES),
                    )
                )
            )
            updated_features = [
                f
                for f in (sound_event_annotation.features or [])
                if f.name not in CONFIDENCE_FEATURE_NAMES
            ]
        else:
            updated_features = list(sound_event_annotation.features or [])

        # Update created_by to current user
        await common.update_object(
            session,
            models.SoundEventAnnotation,
            condition=models.SoundEventAnnotation.id == sound_event_annotation.id,
            created_by_id=user.id,
        )

        # Create updated schema object with the new created_by info and features
        updated_annotation = sound_event_annotation.model_copy(update=dict(created_by=user, features=updated_features, tags=sound_event_annotation.tags))
        self._update_cache(updated_annotation)

        return updated_annotation

    async def add_feature(
        self,
        session: AsyncSession,
        obj: schemas.SoundEventAnnotation,
        feature: schemas.Feature,
    ) -> schemas.SoundEventAnnotation:
        """Add a feature to a sound event annotation."""
        # Check if feature already exists
        for f in obj.features:
            if f.name == feature.name:
                raise exceptions.DuplicateObjectError(f"Feature {feature.name} already exists in annotation {obj}.")

        await common.create_object(
            session,
            models.SoundEventAnnotationFeature,
            sound_event_annotation_id=obj.id,
            name=feature.name,
            value=feature.value,
        )

        obj = obj.model_copy(
            update=dict(
                features=[
                    feature,
                    *obj.features,
                ],
            )
        )
        self._update_cache(obj)
        return obj

    async def remove_feature(
        self,
        session: AsyncSession,
        obj: schemas.SoundEventAnnotation,
        feature: schemas.Feature,
    ) -> schemas.SoundEventAnnotation:
        """Remove a feature from a sound event annotation."""
        for f in obj.features:
            if f.name == feature.name:
                break
        else:
            raise exceptions.NotFoundError(f"Feature {feature} does not exist in annotation {obj}.")

        await common.delete_object(
            session,
            models.SoundEventAnnotationFeature,
            and_(
                models.SoundEventAnnotationFeature.sound_event_annotation_id == obj.id,
                models.SoundEventAnnotationFeature.name == feature.name,
            ),
        )

        obj = obj.model_copy(
            update=dict(
                features=[f for f in obj.features if f.name != feature.name],
            )
        )
        self._update_cache(obj)
        return obj

    async def add_tag(
        self,
        session: AsyncSession,
        obj: schemas.SoundEventAnnotation,
        tag: schemas.Tag,
        user: schemas.SimpleUser | None = None,
    ) -> schemas.SoundEventAnnotation:
        """Add a tag to a sound event annotation."""
        user_id = user.id if user else None
        
        # Load relationships needed for mark_as_edited_by_user after tag changes.
        if obj.tags is None or obj.features is None:
            obj = await self.get(session, obj.id, include_tags=True, include_features=True)
        
        # Safety check: even after eager loading, tags might still be None in edge cases
        existing_tags = obj.tags if obj.tags is not None else []
        
        for t in existing_tags:
            if t.key == tag.key and t.value == tag.value:
                raise exceptions.DuplicateObjectError(f"Tag {tag} already exists in annotation {obj}.")

        await common.create_object(
            session,
            models.SoundEventAnnotationTag,
            sound_event_annotation_id=obj.id,
            tag_id=tag.id,
            created_by_id=user_id,
        )

        obj = obj.model_copy(
            update=dict(
                tags=[
                    tag,
                    *existing_tags,
                ],
            )
        )
        self._update_cache(obj)
        return obj

    async def remove_tag(
        self,
        session: AsyncSession,
        obj: schemas.SoundEventAnnotation,
        tag: schemas.Tag,
    ) -> schemas.SoundEventAnnotation:
        """Remove a tag from a sound event annotation."""
        if obj.tags is None or obj.features is None:
            obj = await self.get(session, obj.id, include_tags=True, include_features=True)

        for t in obj.tags:
            if t.key == tag.key and t.value == tag.value:
                break
        else:
            raise exceptions.NotFoundError(f"Tag {tag} does not exist in annotation {obj}.")

        await common.delete_object(
            session,
            models.SoundEventAnnotationTag,
            and_(
                models.SoundEventAnnotationTag.sound_event_annotation_id == obj.id,
                models.SoundEventAnnotationTag.tag_id == tag.id,
            ),
        )

        obj = obj.model_copy(
            update=dict(
                tags=[t for t in obj.tags if not (t.key == tag.key and t.value == tag.value)],
            )
        )
        self._update_cache(obj)
        return obj


sound_event_annotations = SoundEventAnnotationAPI()
