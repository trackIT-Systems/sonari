"""API functions for interacting with datasets."""

import datetime
from pathlib import Path
from typing import Sequence

from sqlalchemy import tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import exceptions, models, schemas
from sonari.api import common
from sonari.api.common import BaseAPI
from sonari.api.recordings import recordings
from sonari.core import files
from sonari.filters.base import Filter
from sonari.filters.recordings import DatasetFilter
from sonari.system import get_settings

__all__ = [
    "DatasetAPI",
    "datasets",
]


class DatasetAPI(
    BaseAPI[
        int,
        models.Dataset,
        schemas.Dataset,
        schemas.DatasetCreate,
        schemas.DatasetUpdate,
    ]
):
    _model = models.Dataset
    _schema = schemas.Dataset

    async def update(
        self,
        session: AsyncSession,
        obj: schemas.Dataset,
        data: schemas.DatasetUpdate,
        audio_dir: Path | None = None,
    ) -> schemas.Dataset:
        """Update a dataset.

        Parameters
        ----------
        session
            The database session to use.
        obj
            The dataset to update.
        data
            The data to update the dataset with.
        audio_dir
            The root audio directory, by default None. If None, the root audio
            directory from the settings will be used.

        Returns
        -------
        dataset : schemas.Dataset

        Raises
        ------
        sonari.exceptions.NotFoundError
            If no dataset with the given ID exists.
        """
        if audio_dir is None:
            audio_dir = get_settings().audio_dir

        if data.audio_dir is not None:
            if not data.audio_dir.is_relative_to(audio_dir):
                raise ValueError(
                    "The audio directory must be relative to the root audio "
                    "directory."
                    f"\n\tRoot audio directory: {audio_dir}"
                    f"\n\tAudio directory: {data.audio_dir}"
                )

            # If the audio directory has changed, update the path.
            data.audio_dir = data.audio_dir.relative_to(audio_dir)

        return await super().update(session, obj, data)

    async def create_from_data(
        self,
        session: AsyncSession,
        data: schemas.DatasetCreate | None = None,
        audio_dir: Path | None = None,
        **kwargs,
    ) -> schemas.Dataset:
        """Create a dataset from a ``DatasetCreate`` schema.

        This override ensures that ``data.audio_dir`` is stored relative to the
        root audio directory. If an absolute path is provided, it is validated
        to live under the root audio directory and then relativized. Relative
        paths are assumed to already be root-relative and are stored as-is.

        Parameters
        ----------
        session
            The database session to use.
        data
            The dataset creation data. ``audio_dir`` may be absolute (must be
            under the root audio directory) or already root-relative.
        audio_dir
            The root audio directory, by default None. If None, the root audio
            directory from the settings will be used.
        **kwargs
            Additional keyword arguments to pass to the creation function.

        Returns
        -------
        dataset : schemas.Dataset

        Raises
        ------
        ValueError
            If ``data.audio_dir`` is absolute and not under the root audio
            directory.
        """
        if data is None:
            return await super().create_from_data(session, data, **kwargs)

        if audio_dir is None:
            audio_dir = get_settings().audio_dir

        if data.audio_dir.is_absolute():
            if not data.audio_dir.is_relative_to(audio_dir):
                raise ValueError(
                    "The audio directory must be relative to the root audio "
                    "directory."
                    f"\n\tRoot audio directory: {audio_dir}"
                    f"\n\tAudio directory: {data.audio_dir}"
                )
            data = data.model_copy(
                update=dict(audio_dir=data.audio_dir.relative_to(audio_dir))
            )

        return await super().create_from_data(session, data, **kwargs)

    async def get_by_audio_dir(
        self,
        session: AsyncSession,
        audio_dir: Path,
    ) -> schemas.Dataset:
        """Get a dataset by audio directory.

        Parameters
        ----------
        session
            The database session to use.
        audio_dir
            The audio directory of the dataset to get.

        Returns
        -------
        dataset : schemas.Dataset

        Raises
        ------
        sonari.exceptions.NotFoundError
            If no dataset with the given audio directory exists.
        """
        dataset = await common.get_object(
            session,
            models.Dataset,
            models.Dataset.audio_dir == audio_dir,
        )
        return schemas.Dataset.model_validate(dataset)

    async def get_by_name(
        self,
        session: AsyncSession,
        name: str,
    ) -> schemas.Dataset:
        """Get a dataset by name.

        Parameters
        ----------
        session
            The database session to use.
        name
            The name of the dataset to get.

        Returns
        -------
        dataset : schemas.Dataset

        Raises
        ------
        sonari.exceptions.NotFoundError
            If no dataset with the given name exists.
        """
        dataset = await common.get_object(
            session,
            models.Dataset,
            models.Dataset.name == name,
        )
        return schemas.Dataset.model_validate(dataset)

    async def add_file(
        self,
        session: AsyncSession,
        obj: schemas.Dataset,
        path: Path,
        date: datetime.date | None = None,
        time: datetime.time | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        time_expansion: float = 1.0,
        rights: str | None = None,
        audio_dir: Path | None = None,
    ) -> schemas.DatasetRecording:
        """Add a file to a dataset.

        This function adds a file to a dataset. The file is registered as a
        recording and is added to the dataset. If the file is already
        registered in the database, it is only added to the dataset.

        Parameters
        ----------
        session
            The database session to use.
        obj
            The dataset to add the file to.
        path
            The path to the audio file. This should be relative to the
            current working directory, or an absolute path.
        date
            The date of the recording.
        time
            The time of the recording.
        latitude
            The latitude of the recording site.
        longitude
            The longitude of the recording site.
        time_expansion
            Some recordings may be time expanded or time compressed. This
            value is the factor by which the recording is expanded or
            compressed. The default value is 1.0.
        rights
            A string describing the usage rights of the recording.
        audio_dir
            The root audio directory, by default None. If None, the root audio
            directory from the settings will be used.

        Returns
        -------
        recording : schemas.DatasetRecording
            The recording that was added to the dataset.

        Raises
        ------
        sonari.exceptions.NotFoundError
            If the file does not exist.
        ValueError
            If the file is not part of the root audio directory.
        """
        if audio_dir is None:
            audio_dir = get_settings().audio_dir

        # Make sure the file is part of the root audio dir
        if not path.is_relative_to(audio_dir):
            raise ValueError("The file is not part of the root audio directory.")

        try:
            recording = await recordings.get_by_path(
                session,
                path.relative_to(audio_dir),
            )
        except exceptions.NotFoundError:
            recording = await recordings.create(
                session,
                path=path,
                date=date,
                time=time,
                latitude=latitude,
                longitude=longitude,
                time_expansion=time_expansion,
                rights=rights,
                audio_dir=audio_dir,
            )

        return await self.add_recording(
            session,
            obj,
            recording,
        )

    async def add_recording(
        self,
        session: AsyncSession,
        obj: schemas.Dataset,
        recording: schemas.Recording,
    ) -> schemas.DatasetRecording:
        """Add a recording to a dataset.

        Parameters
        ----------
        session
            The database session to use.
        obj
            The dataset to add the recording to.
        recording
            The recording to add to the dataset.

        Returns
        -------
        dataset_recording : schemas.DatasetRecording
            The dataset recording that was created.

        Notes
        -----
        The recording does not need to live under the dataset's audio
        directory. File access always uses ``recording.path`` resolved against
        the root audio directory; the ``DatasetRecording`` link itself carries
        no path.
        """
        dataset_recording = await common.create_object(
            session,
            models.DatasetRecording,
            data=schemas.DatasetRecordingCreate(),
            dataset_id=obj.id,
            recording_id=recording.id,
        )

        obj = obj.model_copy(update=dict(recording_count=obj.recording_count + 1))
        self._update_cache(obj)
        return schemas.DatasetRecording.model_validate(dataset_recording)

    async def add_recordings(
        self,
        session: AsyncSession,
        obj: schemas.Dataset,
        recordings: Sequence[schemas.Recording],
    ) -> list[schemas.DatasetRecording]:
        """Add recordings to a dataset.

        Use this function to efficiently add multiple recordings to a dataset.

        Parameters
        ----------
        session
            The database session to use.
        obj
            The dataset to add the recordings to.
        recordings
            The recordings to add to the dataset.
        """
        data = []
        for recording in recordings:
            data.append(
                dict(
                    dataset_id=obj.id,
                    recording_id=recording.id,
                )
            )

        db_recordings = await common.create_objects_without_duplicates(
            session,
            models.DatasetRecording,
            data,
            key=lambda x: (x.get("dataset_id"), x.get("recording_id")),
            key_column=tuple_(
                models.DatasetRecording.dataset_id,
                models.DatasetRecording.recording_id,
            ),
        )

        obj = obj.model_copy(update=dict(recording_count=obj.recording_count + len(db_recordings)))
        self._update_cache(obj)
        return [schemas.DatasetRecording.model_validate(x) for x in db_recordings]

    async def get_recordings(
        self,
        session: AsyncSession,
        obj: schemas.Dataset,
        *,
        limit: int = 1000,
        offset: int = 0,
        filters: Sequence[Filter] | None = None,
        sort_by: str | None = "-created_on",
    ) -> tuple[list[schemas.Recording], int]:
        """Get all recordings of a dataset.

        Parameters
        ----------
        session
            The database session to use.
        obj
            The ID of the dataset to get the recordings of.
        limit
            The maximum number of recordings to return, by default 1000.
            If set to -1, all recordings will be returned.
        offset
            The number of recordings to skip, by default 0.
        filters
            A list of filters to apply to the query, by default None.
        sort_by
            The column to sort the recordings by, by default None.

        Returns
        -------
        recordings : list[schemas.DatasetRecording]
        count : int
            The total number of recordings in the dataset.
        """
        database_recordings, count = await common.get_objects(
            session,
            models.Recording,
            limit=limit,
            offset=offset,
            filters=[
                DatasetFilter(eq=obj.id),
                *(filters or []),
            ],
            sort_by=sort_by,
        )
        return [schemas.Recording.model_validate(x) for x in database_recordings], count

    async def create(
        self,
        session: AsyncSession,
        name: str,
        dataset_dir: Path,
        description: str | None = None,
        audio_dir: Path | None = None,
        **kwargs,
    ) -> schemas.Dataset:
        """Create a dataset.

        This function will create a dataset and populate it with the audio
        files found in the given directory. It will look recursively for audio
        files within the directory.

        Parameters
        ----------
        session
            The database session to use.
        name
            The name of the dataset.
        dataset_dir
            The directory of the dataset.
        description
            The description of the dataset, by default None.
        audio_dir
            The root audio directory, by default None. If None, the root audio
            directory from the settings will be used.
        **kwargs
            Additional keyword arguments to pass to the creation function.

        Returns
        -------
        dataset : schemas.Dataset

        Raises
        ------
        ValueError
            If a dataset with the given name or audio directory already exists.
        pydantic.ValidationError
            If the given audio directory does not exist.
        """
        if audio_dir is None:
            audio_dir = get_settings().audio_dir

        # Make sure the path is relative to the root audio directory.
        if not dataset_dir.is_relative_to(audio_dir):
            raise ValueError(
                "The audio directory must be relative to the root audio "
                "directory."
                f"\n\tRoot audio directory: {audio_dir}"
                f"\n\tAudio directory: {dataset_dir}"
            )

        # Validate the creation data. ``create_from_data`` will relativize
        # ``audio_dir`` against the root audio directory before storing.
        data = schemas.DatasetCreate(
            name=name,
            description=description,
            audio_dir=dataset_dir,
        )

        obj = await self.create_from_data(
            session,
            data,
            audio_dir=audio_dir,
            **kwargs,
        )

        file_list = files.get_audio_files_in_folder(
            dataset_dir,
            relative=False,
        )

        recording_list = await recordings.create_many(
            session,
            [dict(path=file) for file in file_list],
            audio_dir=audio_dir,
        )

        if recording_list is None:
            raise RuntimeError("No recordings were created.")

        dataset_recordigns = await self.add_recordings(session, obj, recording_list)

        obj = obj.model_copy(update=dict(recording_count=len(dataset_recordigns)))
        self._update_cache(obj)
        return obj


datasets = DatasetAPI()
