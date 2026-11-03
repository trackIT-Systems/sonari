"""Compare detector predictions from GUANO files with reviewed annotations.

ecohub writes a detector's detections into Sonari as sound events. When a
reviewer changes a tag or deletes an event, the original prediction is gone
from the database, but it is still in the GUANO file next to the audio:

- ``{stem}.{detector}.{version}.guano``: sidecar of a detector run, with the
  detections in ``SONARIX|Detector|Detections``.
- ``{stem}.guano``: station import file, with the detections of each detector
  in ``TS|{detector}|detections``.

Only tasks marked completed or verified are compared, so only their GUANO
files are read. Each predicted tag ends up in one outcome:

- ``confirmed``: the event still has the predicted tag.
- ``relabeled``: the event has another tag of the same key instead.
- ``tag_removed``: the event has no tag of that key any more.
- ``event_deleted``: no event matches the prediction (false positive).
- ``added``: a reviewer added a tag the detector did not predict, either on
  an event of their own (missed detection) or on a predicted event.

Predictions are matched to events by their exact box first, since ecohub
copies the coordinates unchanged, then by overlap for boxes a reviewer moved.
"""

from __future__ import annotations

import ast
import asyncio
import json
import os
from collections import OrderedDict, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from soundevent.data import AnnotationState
from sqlalchemy import String, select, type_coerce
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models, schemas
from sonari.services.detector_taxonomy import BAT_CALL_TYPES, bat_short_long_mapping, bird_ger_sci_mapping

__all__ = [
    "CorrectionRow",
    "ProjectCorrections",
    "get_prediction_corrections",
    "summarize_corrections",
]

Outcome = Literal["confirmed", "relabeled", "tag_removed", "event_deleted", "added"]

#: Task states that count as reviewed
REVIEWED_STATES = (AnnotationState.completed, AnnotationState.verified)

#: Tag keys that detectors predict; other keys are reviewer notes
PREDICTED_KEYS = ("species", "type")

#: Minimum overlap (intersection over union) to match a moved box
MIN_OVERLAP = 0.3

#: Below this share of exactly matched detector events, the GUANO files
#: probably do not belong to the project
MIN_MATCH_RATE = 0.8

ID_FILE_PREFIX = ".annotation_project_id."
SIDECAR_DETECTIONS_FIELD = "SONARIX|Detector|Detections"
SIDECAR_RUN_FIELD = "SONARIX|Run|ID"
SIDECAR_VERSION_FIELD = "SONARIX|Detector|Version"
GEOMETRY_TYPES = {"bbox": "BoundingBox", "interval": "TimeInterval"}

_CHUNK_SIZE = 500


# GUANO files


def parse_guano_text(text: str) -> dict[str, str]:
    """Parse GUANO ``key: value`` lines, the same way ecohub does."""
    fields: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("GUANO|Version:"):
            fields["GUANO|Version"] = line.split(":", 1)[1].strip()
            continue
        sep = line.find(": ")
        if sep < 0:
            sep = line.find(":")
        if sep < 0:
            continue
        fields[line[:sep].strip()] = line[sep + 1 :].strip()
    return fields


_guano_cache: OrderedDict[str, tuple[int, int, dict[str, str]]] = OrderedDict()
_GUANO_CACHE_SIZE = 5000


def read_guano(path: Path) -> dict[str, str] | None:
    """Read a GUANO file, cached until the file changes."""
    try:
        stat = path.stat()
    except OSError:
        return None
    key = str(path)
    cached = _guano_cache.get(key)
    if cached is not None and cached[:2] == (stat.st_mtime_ns, stat.st_size):
        _guano_cache.move_to_end(key)
        return cached[2]
    try:
        fields = parse_guano_text(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return None
    _guano_cache[key] = (stat.st_mtime_ns, stat.st_size, fields)
    if len(_guano_cache) > _GUANO_CACHE_SIZE:
        _guano_cache.popitem(last=False)
    return fields


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _json_list(value: str | None) -> list[dict[str, Any]]:
    try:
        rows = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


# Predictions


@dataclass
class PredictedTag:
    """A tag the detector predicted for one event."""

    key: str
    #: Tag values that count as this prediction (birdedge: German and scientific name)
    values: tuple[str, ...]
    raw_label: str
    detection_confidence: float | None = None
    species_confidence: float | None = None

    def display_value(self, known_values: set[str]) -> str:
        """Return the value as it appears in Sonari's tags."""
        for value in self.values:
            if value in known_values:
                return value
        return self.values[-1]


@dataclass
class Prediction:
    """One event as ecohub created it: all detections with the same box."""

    geometry_type: str
    coords: tuple[float, ...]
    tags: list[PredictedTag]

    @property
    def start(self) -> float:
        return self.coords[0]

    @property
    def end(self) -> float:
        return self.coords[2] if self.geometry_type == "BoundingBox" else self.coords[1]


@dataclass
class GuanoSource:
    """The GUANO file a recording's predictions were read from."""

    path: Path
    model_version: str | None
    predictions: list[Prediction]


def _species_values(detector: str, species: str) -> tuple[str, ...]:
    """Tag values ecohub writes for a detector label (see its ``_resolve_species``)."""
    if detector.startswith("yolobat"):
        return (bat_short_long_mapping.get(species, species),)
    if detector == "birdedge":
        # ecohub maps to scientific names only with SONARI_I18N, accept both
        scientific = bird_ger_sci_mapping.get(species)
        return (species, scientific) if scientific and scientific != species else (species,)
    return (species,)


def build_predictions(
    detector: str,
    detections: Iterable[dict[str, Any]],
    threshold: float | None = None,
) -> list[Prediction]:
    """Turn detections into predicted events with the tags ecohub writes.

    Each detection is a dict with ``geometry`` ("bbox" or "interval"),
    ``coords``, ``species``, ``det_prob``, ``species_prob`` and ``call_type``.
    """
    events: dict[tuple[str, tuple[float, ...]], dict[tuple[str, tuple[str, ...]], PredictedTag]] = {}
    for det in detections:
        geometry_type = GEOMETRY_TYPES.get(str(det.get("geometry")))
        try:
            coords = tuple(float(c) for c in det.get("coords") or ())
        except (TypeError, ValueError):
            continue
        if geometry_type is None or len(coords) != (4 if geometry_type == "BoundingBox" else 2):
            continue
        det_prob = _float(det.get("det_prob"))
        if threshold is not None and det_prob is not None and det_prob < threshold:
            continue
        species_prob = _float(det.get("species_prob"))
        raw = str(det.get("species") or "")
        values = _species_values(detector, raw)
        call_type = det.get("call_type")
        if call_type is None:
            key = "type" if values[0] in BAT_CALL_TYPES else "species"
            labels = [(key, values, raw)]
        else:
            labels = [("species", values, raw), ("type", (str(call_type),), str(call_type))]

        tags = events.setdefault((geometry_type, coords), {})
        for key, tag_values, raw_label in labels:
            tag = tags.setdefault((key, tag_values), PredictedTag(key, tag_values, raw_label))
            if det_prob is not None:
                tag.detection_confidence = max(det_prob, tag.detection_confidence or det_prob)
            if species_prob is not None:
                tag.species_confidence = max(species_prob, tag.species_confidence or species_prob)

    return [Prediction(geometry_type, coords, list(tags.values())) for (geometry_type, coords), tags in events.items()]


def _sidecar_predictions(detector: str, fields: dict[str, str], threshold: float | None) -> list[Prediction]:
    return build_predictions(detector, _json_list(fields.get(SIDECAR_DETECTIONS_FIELD)), threshold)


def _import_predictions(detector: str, rows: list[dict[str, Any]]) -> list[Prediction]:
    """Station import rows (``Time``, ``Duration (s)``, ``Low``, ``High``) as ecohub translates them."""
    detections = []
    for row in rows:
        time = _float(row.get("Time") or 0.0) or 0.0
        duration = _float(row.get("Duration (s)") or row.get("Duration") or 0.0) or 0.0
        low = _float(row.get("Low") or 0.0) or 0.0
        high = _float(row.get("High") or 0.0) or 0.0
        detections.append(
            {
                "geometry": "bbox",
                "coords": [time, low, time + duration, high],
                "species": row.get("Species") or "",
                "det_prob": row.get("Confidence"),
            }
        )
    return build_predictions(detector, detections)


# Finding the GUANO files of a project


@dataclass
class ProjectSource:
    """What ecohub recorded about the run that created a project."""

    detector: str | None = None
    run_id: int | None = None
    model_version: str | None = None
    detection_threshold: float | None = None


def parse_project_name(name: str) -> tuple[str | None, int | None]:
    """Detector and run id from ecohub's ``{processor} {detector} {station} {run_id}``."""
    parts = name.split(" ")
    if len(parts) >= 4 and parts[-1].isdigit():
        return parts[-3], int(parts[-1])
    return None, None


def _read_id_file(path: Path, project_id: int) -> dict[str, Any] | None:
    """Detector config from ecohub's ``.annotation_project_id`` file, if it is this project's."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return None
    values = dict(line.split(": ", 1) for line in lines if ": " in line)
    if values.get("ID", "").strip() != str(project_id):
        return None
    try:
        config = ast.literal_eval(values.get("detector_config", "{}"))
    except (ValueError, SyntaxError):
        return {}
    return config if isinstance(config, dict) else {}


def resolve_project_source(project: schemas.AnnotationProject, station_dirs: Iterable[Path]) -> ProjectSource:
    """Find detector, run and model version of a project ecohub created."""
    detector, run_id = parse_project_name(project.name)
    source = ProjectSource(detector=detector, run_id=run_id)
    prefix = f"{ID_FILE_PREFIX}{project.name}."
    for directory in station_dirs:
        if detector is not None:
            candidates = [directory / f"{prefix}{detector}"]
        else:
            try:
                candidates = [entry for entry in directory.iterdir() if entry.name.startswith(prefix)]
            except OSError:
                continue
        for candidate in candidates:
            config = _read_id_file(candidate, project.id)
            if config is None:
                continue
            source.detector = source.detector or candidate.name[len(prefix) :]
            version = config.get("model_version")
            source.model_version = str(version) if version is not None else None
            source.detection_threshold = _float(config.get("detection_threshold"))
            return source
    return source


class _DirectoryListing:
    """File names per directory, listed once per comparison."""

    def __init__(self) -> None:
        self._names: dict[Path, set[str]] = {}

    def __call__(self, directory: Path) -> set[str]:
        if directory not in self._names:
            try:
                self._names[directory] = {entry.name for entry in os.scandir(directory)}
            except OSError:
                self._names[directory] = set()
        return self._names[directory]


def _version_order(name: str, prefix: str, model_version: str | None) -> tuple[int, tuple[tuple[int, int, str], ...]]:
    """Sort key: the project's model version first, then newest version first."""
    version = name[len(prefix) : -len(".guano")]
    parts = tuple((0, -int(p), "") if p.isdigit() else (1, 0, p) for p in version.split("."))
    return (0 if version == model_version else 1, parts)


def find_recording_source(audio_path: Path, source: ProjectSource, listing: _DirectoryListing) -> GuanoSource | None:
    """Read the predictions of one recording from its GUANO file.

    Prefers the detector sidecar of the project's run, then the station
    import file, then a sidecar of another run (the project's model version
    first, then the newest).
    """
    detector = source.detector
    names = listing(audio_path.parent)
    stem = audio_path.stem
    fallback: GuanoSource | None = None

    if detector is not None:
        prefix = f"{stem}.{detector}."
        sidecars = sorted(
            (n for n in names if n.startswith(prefix) and n.endswith(".guano")),
            key=lambda n: _version_order(n, prefix, source.model_version),
        )
        for name in sidecars:
            path = audio_path.parent / name
            fields = read_guano(path)
            if fields is None:
                continue
            found = GuanoSource(
                path=path,
                model_version=fields.get(SIDECAR_VERSION_FIELD) or name[len(prefix) : -len(".guano")],
                predictions=_sidecar_predictions(detector, fields, source.detection_threshold),
            )
            run = fields.get(SIDECAR_RUN_FIELD)
            if source.run_id is None or run is None or run == str(source.run_id):
                return found
            fallback = fallback or found

    import_name = f"{stem}.guano"
    fields = read_guano(audio_path.parent / import_name) if import_name in names else None
    if fields is None:
        return fallback
    detection_keys = [k for k in fields if k.startswith("TS|") and k.endswith("|detections") and k.count("|") == 2]
    if detector is not None:
        key = f"TS|{detector}|detections"
    elif len(detection_keys) == 1:
        key = detection_keys[0]
    else:
        return fallback
    if key not in fields:
        return fallback
    path = audio_path.parent / import_name
    return GuanoSource(
        path=path,
        model_version=None,
        predictions=_import_predictions(key.split("|")[1], _json_list(fields[key])),
    )


# Comparison


@dataclass
class _Event:
    id: int
    created_by_id: Any
    geometry_type: str
    coords: tuple[float, ...]
    tags: set[tuple[str, str]] = field(default_factory=set)

    @property
    def start(self) -> float:
        return self.coords[0]

    @property
    def end(self) -> float:
        return self.coords[2] if self.geometry_type == "BoundingBox" else self.coords[1]


@dataclass
class _Task:
    id: int
    recording_id: int
    start_time: float
    end_time: float
    review_status: str
    reviewed_by: str | None
    reviewed_on: Any


@dataclass
class _Recording:
    path: Path
    date: Any
    time: Any
    station: str | None


@dataclass
class CorrectionRow:
    """One predicted tag, or one tag a reviewer added, in a reviewed task."""

    annotation_project: str
    annotation_task_id: int
    task_start_time: float
    task_end_time: float
    review_status: str
    reviewed_by: str | None
    reviewed_on: Any
    recording_path: str
    recording_date: Any
    recording_time: Any
    station: str | None
    detector: str | None
    model_version: str | None
    source_file: str
    outcome: Outcome
    key: str
    predicted_value: str | None
    predicted_label: str | None
    detection_confidence: float | None
    species_confidence: float | None
    final_values: list[str]
    box_changed: bool | None
    sound_event_annotation_id: int | None
    predicted_coords: tuple[float, ...] | None
    final_coords: tuple[float, ...] | None


@dataclass
class ProjectCorrections:
    """All correction rows of a project plus how they were found."""

    source: ProjectSource
    rows: list[CorrectionRow]
    reviewed_tasks: int = 0
    recordings: int = 0
    recordings_with_source: int = 0
    model_versions: set[str] = field(default_factory=set)
    detector_events: int = 0
    detector_events_matched: int = 0

    @property
    def match_rate(self) -> float | None:
        if self.detector_events == 0:
            return None
        return self.detector_events_matched / self.detector_events


def _overlap(prediction: Prediction, event: _Event) -> float:
    """Intersection over union in time, and frequency for two boxes."""
    if prediction.geometry_type != event.geometry_type:
        return 0.0
    ranges = [((prediction.start, prediction.end), (event.start, event.end))]
    if prediction.geometry_type == "BoundingBox":
        ranges.append(((prediction.coords[1], prediction.coords[3]), (event.coords[1], event.coords[3])))
    inter = union = 1.0
    for (a0, a1), (b0, b1) in ranges:
        overlap = min(a1, b1) - max(a0, b0)
        if overlap <= 0:
            return 0.0
        inter *= overlap
    for (a0, a1), (b0, b1) in ranges:
        union *= max(a1, b1) - min(a0, b0)
    return inter / union if union > 0 else 0.0


def _match(predictions: list[Prediction], events: list[_Event]) -> list[tuple[Prediction, _Event | None, bool]]:
    """Pair predictions with events: exact box first, then best overlap."""
    by_box: dict[tuple[str, tuple[float, ...]], list[_Event]] = defaultdict(list)
    for event in events:
        by_box[(event.geometry_type, event.coords)].append(event)

    matched: list[tuple[Prediction, _Event | None, bool]] = []
    open_predictions = []
    used: set[int] = set()
    for prediction in predictions:
        candidates = by_box.get((prediction.geometry_type, prediction.coords))
        if candidates:
            event = candidates.pop(0)
            used.add(event.id)
            matched.append((prediction, event, True))
        else:
            open_predictions.append(prediction)

    pairs = sorted(
        (
            (score, i, event)
            for i, prediction in enumerate(open_predictions)
            for event in events
            if event.id not in used and (score := _overlap(prediction, event)) >= MIN_OVERLAP
        ),
        key=lambda pair: -pair[0],
    )
    paired: dict[int, _Event] = {}
    for _, i, event in pairs:
        if i in paired or event.id in used:
            continue
        paired[i] = event
        used.add(event.id)
    for i, prediction in enumerate(open_predictions):
        matched.append((prediction, paired.get(i), False))
    return matched


def _classify_task(
    task: _Task,
    predictions: list[Prediction],
    events: list[_Event],
    known_values: set[str],
    make_row,
) -> tuple[list[CorrectionRow], set[int]]:
    """Rows for one task, and the ids of events matched exactly."""
    in_task = [p for p in predictions if not (p.end <= task.start_time or p.start >= task.end_time)]
    rows: list[CorrectionRow] = []
    exact_ids: set[int] = set()
    matched_ids: set[int] = set()

    for prediction, event, exact in _match(in_task, events):
        if event is None:
            for tag in prediction.tags:
                rows.append(make_row(task, "event_deleted", tag.key, tag, known_values, [], None, prediction, None))
            continue
        matched_ids.add(event.id)
        if exact:
            exact_ids.add(event.id)
        claimed: set[tuple[str, str]] = set()
        for tag in prediction.tags:
            present = [(tag.key, v) for v in tag.values if (tag.key, v) in event.tags]
            same_key = sorted(v for k, v in event.tags if k == tag.key)
            if present:
                outcome: Outcome = "confirmed"
                claimed.update(present)
            elif same_key:
                outcome = "relabeled"
                claimed.update((tag.key, v) for v in same_key)
            else:
                outcome = "tag_removed"
            rows.append(make_row(task, outcome, tag.key, tag, known_values, same_key, not exact, prediction, event))
        for key, value in sorted(event.tags - claimed):
            if key in PREDICTED_KEYS:
                rows.append(make_row(task, "added", key, value, known_values, [value], None, None, event))

    for event in events:
        if event.id in matched_ids:
            continue
        for key, value in sorted(t for t in event.tags if t[0] in PREDICTED_KEYS):
            rows.append(make_row(task, "added", key, value, known_values, [value], None, None, event))
    return rows, exact_ids


def _chunks(items: Sequence[Any], size: int = _CHUNK_SIZE) -> Iterable[Sequence[Any]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


async def _reviewed_tasks(session: AsyncSession, project_id: int) -> dict[int, _Task]:
    """Tasks with a completed or verified badge; the newest such badge is the review."""
    query = (
        select(
            models.AnnotationTask.id,
            models.AnnotationTask.recording_id,
            models.AnnotationTask.start_time,
            models.AnnotationTask.end_time,
            models.AnnotationStatusBadge.state,
            models.AnnotationStatusBadge.created_on,
            models.User.username,
        )
        .join(models.AnnotationStatusBadge, models.AnnotationStatusBadge.annotation_task_id == models.AnnotationTask.id)
        .outerjoin(models.User, models.User.id == models.AnnotationStatusBadge.user_id)
        .where(
            models.AnnotationTask.annotation_project_id == project_id,
            models.AnnotationStatusBadge.state.in_(REVIEWED_STATES),
        )
        .order_by(models.AnnotationStatusBadge.created_on)
    )
    tasks: dict[int, _Task] = {}
    for task_id, recording_id, start, end, state, created_on, username in await session.execute(query):
        previous = tasks.get(task_id)
        status = (
            "verified"
            if state == AnnotationState.verified or (previous and previous.review_status == "verified")
            else "completed"
        )
        tasks[task_id] = _Task(task_id, recording_id, start, end, status, username, created_on)
    return tasks


async def _recordings(session: AsyncSession, recording_ids: Sequence[int]) -> dict[int, _Recording]:
    recordings: dict[int, _Recording] = {}
    for chunk in _chunks(recording_ids):
        query = (
            select(
                models.Recording.id,
                models.Recording.path,
                models.Recording.date,
                models.Recording.time,
                models.Dataset.name,
            )
            .outerjoin(models.DatasetRecording, models.DatasetRecording.recording_id == models.Recording.id)
            .outerjoin(models.Dataset, models.Dataset.id == models.DatasetRecording.dataset_id)
            .where(models.Recording.id.in_(chunk))
        )
        for rec_id, path, date, time, station in await session.execute(query):
            recordings.setdefault(rec_id, _Recording(Path(path), date, time, station))
    return recordings


async def _events(session: AsyncSession, task_ids: Sequence[int]) -> dict[int, list[_Event]]:
    """Sound events of the tasks with their species and type tags."""
    events: dict[int, _Event] = {}
    by_task: dict[int, list[_Event]] = defaultdict(list)
    sea = models.SoundEventAnnotation
    for chunk in _chunks(task_ids):
        query = select(
            sea.id,
            sea.annotation_task_id,
            sea.created_by_id,
            sea.geometry_type,
            type_coerce(sea.geometry, String),
        ).where(sea.annotation_task_id.in_(chunk))
        for event_id, task_id, created_by_id, geometry_type, geometry in await session.execute(query):
            try:
                coords = tuple(float(c) for c in json.loads(geometry).get("coordinates", ()))
            except (ValueError, TypeError, AttributeError):
                coords = ()
            if len(coords) not in (2, 4):
                continue
            event = _Event(event_id, created_by_id, geometry_type, coords)
            events[event_id] = event
            by_task[task_id].append(event)

    event_ids = list(events)
    for chunk in _chunks(event_ids):
        query = (
            select(models.SoundEventAnnotationTag.sound_event_annotation_id, models.Tag.key, models.Tag.value)
            .join(models.Tag, models.Tag.id == models.SoundEventAnnotationTag.tag_id)
            .where(models.SoundEventAnnotationTag.sound_event_annotation_id.in_(chunk))
        )
        for event_id, key, value in await session.execute(query):
            events[event_id].tags.add((key, value))
    return by_task


def _load_sources(
    project: schemas.AnnotationProject,
    audio_dir: Path,
    recordings: dict[int, _Recording],
) -> tuple[ProjectSource, dict[int, GuanoSource]]:
    """Resolve the project's run and read the GUANO file of each recording (blocking I/O)."""
    station_dirs = {audio_dir / rec.path.parts[0] for rec in recordings.values() if rec.path.parts}
    source = resolve_project_source(project, sorted(station_dirs))
    listing = _DirectoryListing()
    found: dict[int, GuanoSource] = {}
    for recording_id, recording in recordings.items():
        guano = find_recording_source(audio_dir / recording.path, source, listing)
        if guano is not None:
            found[recording_id] = guano
    return source, found


async def get_prediction_corrections(
    session: AsyncSession,
    project: schemas.AnnotationProject,
    audio_dir: Path,
) -> ProjectCorrections:
    """Compare the reviewed tasks of a project with the predictions in their GUANO files."""
    tasks = await _reviewed_tasks(session, project.id)
    recordings = await _recordings(session, sorted({t.recording_id for t in tasks.values()}))
    source, sources = await asyncio.to_thread(_load_sources, project, audio_dir, recordings)

    result = ProjectCorrections(
        source=source,
        rows=[],
        reviewed_tasks=len(tasks),
        recordings=len(recordings),
        recordings_with_source=len(sources),
        model_versions={s.model_version for s in sources.values() if s.model_version},
    )
    compared = [t for t in tasks.values() if t.recording_id in sources]
    events_by_task = await _events(session, [t.id for t in compared])

    known_values = set(
        (await session.execute(select(models.Tag.value).where(models.Tag.key.in_(PREDICTED_KEYS)))).scalars()
    )
    detector_user_id = None
    if source.detector is not None:
        username = "yolobat" if source.detector.startswith("yolobat") else source.detector
        detector_user_id = await session.scalar(select(models.User.id).where(models.User.username == username))

    def make_row(task, outcome, key, predicted, known, final_values, box_changed, prediction, event):
        recording = recordings[task.recording_id]
        guano = sources[task.recording_id]
        tag = predicted if isinstance(predicted, PredictedTag) else None
        try:
            source_file = str(guano.path.relative_to(audio_dir))
        except ValueError:
            source_file = str(guano.path)
        return CorrectionRow(
            annotation_project=project.name,
            annotation_task_id=task.id,
            task_start_time=task.start_time,
            task_end_time=task.end_time,
            review_status=task.review_status,
            reviewed_by=task.reviewed_by,
            reviewed_on=task.reviewed_on,
            recording_path=str(recording.path),
            recording_date=recording.date,
            recording_time=recording.time,
            station=recording.station,
            detector=source.detector,
            model_version=guano.model_version,
            source_file=source_file,
            outcome=outcome,
            key=key,
            predicted_value=tag.display_value(known) if tag else None,
            predicted_label=tag.raw_label if tag else None,
            detection_confidence=tag.detection_confidence if tag else None,
            species_confidence=tag.species_confidence if tag else None,
            final_values=list(final_values),
            box_changed=box_changed,
            sound_event_annotation_id=event.id if event else None,
            predicted_coords=prediction.coords if prediction else None,
            final_coords=event.coords if event else None,
        )

    for task in sorted(compared, key=lambda t: t.id):
        events = events_by_task.get(task.id, [])
        rows, exact_ids = _classify_task(task, sources[task.recording_id].predictions, events, known_values, make_row)
        result.rows.extend(rows)
        if detector_user_id is not None:
            detector_events = [e for e in events if e.created_by_id == detector_user_id]
            result.detector_events += len(detector_events)
            result.detector_events_matched += sum(e.id in exact_ids for e in detector_events)
    return result


def summarize_corrections(corrections: ProjectCorrections) -> schemas.PredictionCorrectionStats:
    """Aggregate correction rows per predicted tag, for the project overview."""
    predicted: dict[tuple[str, str], dict[str, Any]] = {}
    added: dict[tuple[str, str], int] = defaultdict(int)
    for row in corrections.rows:
        if row.outcome == "added":
            for value in row.final_values:
                added[(row.key, value)] += 1
            continue
        entry = predicted.setdefault(
            (row.key, row.predicted_value or ""),
            {"counts": defaultdict(int), "box_changed": 0, "relabeled_to": defaultdict(int)},
        )
        entry["counts"][row.outcome] += 1
        if row.box_changed:
            entry["box_changed"] += 1
        if row.outcome == "relabeled":
            for value in row.final_values:
                entry["relabeled_to"][value] += 1

    species = [
        schemas.PredictionCorrectionCount(
            key=key,
            value=value,
            predicted=sum(entry["counts"].values()),
            confirmed=entry["counts"]["confirmed"],
            relabeled=entry["counts"]["relabeled"],
            tag_removed=entry["counts"]["tag_removed"],
            event_deleted=entry["counts"]["event_deleted"],
            box_changed=entry["box_changed"],
            relabeled_to=[
                schemas.PredictionCorrectionTarget(key=key, value=target, count=count)
                for target, count in sorted(entry["relabeled_to"].items(), key=lambda item: -item[1])
            ],
        )
        for (key, value), entry in predicted.items()
    ]
    species.sort(key=lambda s: (-s.predicted, s.key, s.value))
    source = corrections.source
    return schemas.PredictionCorrectionStats(
        detector=source.detector,
        run_id=source.run_id,
        model_versions=sorted(corrections.model_versions),
        reviewed_tasks=corrections.reviewed_tasks,
        recordings=corrections.recordings,
        recordings_with_source=corrections.recordings_with_source,
        match_rate=corrections.match_rate,
        reliable=corrections.match_rate is None or corrections.match_rate >= MIN_MATCH_RATE,
        species=species,
        added=[
            schemas.PredictionCorrectionTarget(key=key, value=value, count=count)
            for (key, value), count in sorted(added.items(), key=lambda item: (-item[1], item[0]))
        ],
    )
