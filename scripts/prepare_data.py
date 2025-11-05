import asyncio
import glob
import os
import sys
import traceback
import uuid
from pathlib import Path
from typing import Sequence

import sonari.api as api
import sonari.exceptions as exceptions
import sonari.models as models
import sonari.schemas as schemas
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import URL 

SONARI_PSQL_URL: URL = URL.create(
    "postgresql+asyncpg",
    host=os.getenv("SONARI_DB_HOST", "localhost"),
    #port=int(os.getenv("SONARI_DB_PORT", 5432)),
    username=os.getenv("SONARI_DB_USERNAME", "ts_sonari"),
    password=os.getenv("SONARI_DB_PASSWORD", "ts_sonari"),
    database=os.getenv("SONARI_DB_NAME", "sonari"),
)

ANNOTATION_PROJECT_NAME_TEMPLATE = "{labeler}{project_name}{detector}{dataset_name}"


def _make_annotation_project_name(project_name: str | None, detector: str, dataset_name: str) -> str:
    return ANNOTATION_PROJECT_NAME_TEMPLATE.format(
        labeler="",
        project_name=f"{project_name} " if project_name is not None else "",
        detector=detector,
        dataset_name=f" {dataset_name}",
    )


async def _create_dataset(session: AsyncSession, dataset_name: str, audio_base_path: str) -> schemas.Dataset:
    try:
        return await api.datasets.get_by_name(session, dataset_name)
    except exceptions.NotFoundError:
        dataset_obj = schemas.DatasetCreate(
            name=dataset_name,
            description="",
            audio_dir=Path(f"{audio_base_path}{dataset_name}"),
        )

        dataset: schemas.Dataset = await api.datasets.create_from_data(
            session,
            dataset_obj.model_copy(update=dict(audio_dir=dataset_obj.audio_dir.relative_to(audio_base_path))),
        )
        await session.commit()
        return dataset


async def _add_file_to_dataset(
    session: AsyncSession,
    dataset: schemas.Dataset,
    audio_base_path: str,
    recording_path: str,
) -> schemas.Recording:
    try:
        dataset_recording: schemas.DatasetRecording = await api.datasets.add_file(
            session,
            dataset,
            Path(f"{audio_base_path}{recording_path}"),
            audio_dir=Path(audio_base_path),
        )
        recording: schemas.Recording = dataset_recording.recording
        await session.commit()
        return recording
    except exceptions.DuplicateObjectError:
        await session.rollback()
        return await api.recordings.get_by_path(session, Path(recording_path))


async def _create_annotation_project(
    session: AsyncSession,
    dataset_name: str,
    project_name: str | None,
    detector: str,
) -> schemas.AnnotationProject:
    name: str = _make_annotation_project_name(project_name, detector, dataset_name)

    try:
        annotation_project_model: models.Base = await api.common.get_object(  # type: ignore
            session,
            models.AnnotationProject,
            models.AnnotationProject.name == name,
        )
        return schemas.AnnotationProject.model_validate(annotation_project_model)
    except exceptions.NotFoundError:
        annotation_project: schemas.AnnotationProject = await api.annotation_projects.create(
            session,
            name,
            "",
            "",
        )
        await session.commit()

        return annotation_project


async def _create_clip(session: AsyncSession, recording: schemas.Recording) -> schemas.Clip | None:
    clips = await api.clips.create_many_without_duplicates(
        session,
        [
            dict(
                uuid=uuid.uuid4(),
                recording_id=recording.id,
                start_time=0,
                end_time=recording.duration,
            )
        ],
        return_all=True,
    )

    if len(clips) == 0:
        await session.rollback()
        return None

    await session.commit()
    return clips[0]


async def _create_annotation_task(
    session: AsyncSession,
    annotation_project: schemas.AnnotationProject,
    clip: schemas.Clip,
) -> tuple[schemas.AnnotationTask, schemas.ClipAnnotation] | None:
    clip_annotation: schemas.ClipAnnotation = await api.clip_annotations.create(session, clip)
    await session.commit()

    tasks: Sequence[schemas.AnnotationTask] = await api.annotation_tasks.create_many_without_duplicates(
        session,
        [
            dict(
                annotation_project_id=annotation_project.id,
                clip_annotation_id=clip_annotation.id,
                clip_id=clip_annotation.clip.id,
            )
        ],
        return_all=True,
    )
    if len(tasks) != 1:
        await session.rollback()
        return None

    await session.commit()
    return tasks[0], clip_annotation


async def insert(
    audio_file_path,
) -> bool:
    try:
        print(f"Inserting file {audio_file_path}")
        audio_base_path: str
        recording_path: str
        dataset_name = os.path.dirname(audio_file_path)
        print("dataset name" + dataset_name)
        path_components: tuple[str, ...] = Path(audio_file_path).parts
        if len(path_components) < 4:
            return False
        audio_base_path: str = os.path.join(path_components[0], path_components[1], path_components[2])
        print("audiobase path" + audio_base_path)
        dataset_name = dataset_name.replace(audio_base_path, "", 1)
        recording_path = audio_file_path.replace(audio_base_path, "", 1)
        print(recording_path)
        print(dataset_name)

        async with api.create_session("sqlite://:@/sonari.db") as session:
            dataset: schemas.Dataset = await _create_dataset(session, dataset_name, audio_base_path)

            recording: schemas.Recording = await _add_file_to_dataset(
                session,
                dataset,
                audio_base_path,
                recording_path,
            )

            annotation_project: schemas.AnnotationProject = await _create_annotation_project(
                session,
                dataset_name,
                "",
                "melli",
            )

            clip: schemas.Clip | None = await _create_clip(session, recording)
            if clip is None:
                print("Could not create clip")
                return False

            task_and_clip: tuple[schemas.AnnotationTask, schemas.ClipAnnotation] | None
            task_and_clip = await _create_annotation_task(session, annotation_project, clip)
            if task_and_clip is None:
                print("Could not create task and/or clip")
                return False

            print(f"Done with sonari pipeline [{audio_file_path=}]")

        return True
    except Exception:
        traceback.print_exc()
        return False


if __name__ == "__main__":
    try:
        base_path: str = sys.argv[1]
    except IndexError:
        print(f"Usage: {sys.argv[0]} <base_folder>")
        exit(1)

    if not os.path.exists(base_path) or not os.path.isdir(base_path):
        print(f"{base_path} is not a valid folder path")
        exit(2)

    wav_files: list[str] = glob.glob(f"{base_path}/**/*.wav", recursive=True)

    for wav_file in wav_files:
        asyncio.run(insert(wav_file))
