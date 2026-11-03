"""Schemas for Annotation Projects."""

from typing import TYPE_CHECKING, Literal, Optional
from uuid import UUID

from pydantic import BaseModel

from sonari.schemas.base import BaseSchema
from sonari.schemas.tags import Tag, TagScope

if TYPE_CHECKING:
    from sonari.schemas.annotation_tasks import AnnotationTask

GuidedTourVariant = Literal["bird", "bat"]

__all__ = [
    "AnnotationProject",
    "AnnotationProjectCreate",
    "AnnotationProjectUpdate",
    "AnnotationProjectProgress",
    "GuidedTourEnsureRequest",
    "GuidedTourEnsureResponse",
    "GuidedTourAvailableResponse",
    "GuidedTourProgress",
    "GuidedTourVariant",
    "SpeciesTagCount",
]


class AnnotationProjectCreate(BaseModel):
    """Schema for creating an annotation project."""

    name: str
    """Name of the annotation project."""

    description: str
    """A description of the annotation project."""

    annotation_instructions: str | None = None
    """Project instructions for annotating."""


class AnnotationProject(BaseSchema):
    """Schema for an annotation project."""

    id: int
    """Database ID of the annotation project."""

    name: str
    """Name of the annotation project."""

    description: str
    """A description of the annotation project."""

    annotation_instructions: str | None = None
    """Project instructions for annotating."""

    is_guided_tour: bool = False
    """Whether this project is a personal guided tour (hidden from project list)."""

    guided_tour_owner_user_id: UUID | None = None
    """Owner of a guided tour clone."""

    guided_tour_variant: GuidedTourVariant | None = None
    """bird or bat for guided tour templates and personal clones."""

    tag_scope: TagScope = "auto"
    """Which tags the project shows in the tag search."""

    tag_group_id: int | None = None
    """Tag group used when tag_scope is "group"."""

    tag_preset_id: int | None = None
    """Tag preset used when tag_scope is "preset"."""

    tags: Optional[list[Tag]] = None
    """Tags to be used throughout the annotation project."""

    annotation_tasks: Optional[list["AnnotationTask"]] = None
    """Annotation tasks related to this project the annotation project."""


class AnnotationProjectUpdate(BaseModel):
    """Schema for updating an annotation project."""

    name: str | None = None
    """Name of the annotation project."""

    description: str | None = None
    """A description of the annotation project."""

    annotation_instructions: str | None = None
    """Project instructions for annotating."""

    tag_scope: TagScope | None = None
    """Which tags the project shows in the tag search."""

    tag_group_id: int | None = None
    """Tag group used when tag_scope is "group"."""

    tag_preset_id: int | None = None
    """Tag preset used when tag_scope is "preset"."""


class GuidedTourEnsureRequest(BaseModel):
    """Request body for ensuring a user's guided tour project exists."""

    variant: GuidedTourVariant
    reset: bool = False
    """If true, delete and re-clone the tour from the template."""


class GuidedTourEnsureResponse(BaseModel):
    """Response after ensuring a guided tour project."""

    annotation_project_id: int
    first_annotation_task_id: int | None
    resume_annotation_task_id: int | None = None
    """First task without a status badge (where "keep going" continues)."""
    created: bool
    variant: GuidedTourVariant


class GuidedTourProgress(BaseModel):
    """The current user's personal tour for one variant."""

    variant: GuidedTourVariant
    annotation_project_id: int
    total_tasks: int
    done_tasks: int
    resume_annotation_task_id: int | None


class GuidedTourAvailableResponse(BaseModel):
    """Guided tour variants available on this server."""

    variants: list[GuidedTourVariant]
    tours: list[GuidedTourProgress] = []
    """Tours the current user has already started."""


class AnnotationProjectProgress(BaseModel):
    """Schema for annotation project progress statistics."""

    total: int
    """Total number of tasks in the project."""

    verified: int
    """Number of tasks with verified status."""

    rejected: int
    """Number of tasks with rejected status."""

    completed: int
    """Number of tasks with completed status."""

    assigned: int
    """Number of tasks with assigned status."""

    pending: int
    """Number of tasks with no done status (pending or only assigned)."""


class SpeciesTagCount(BaseModel):
    """Count of a species tag across sound event annotations in a project.

    Status fields are mutually exclusive: each sound event annotation is
    classified by its parent task's highest-priority badge
    (verified > rejected > accepted/completed > unsure/assigned > no status).
    Their sum equals ``count``.
    """

    key: str
    """Tag key."""

    value: str
    """Tag value."""

    count: int
    """Number of sound event annotations with this tag."""

    accepted: int = 0
    """Annotations on tasks with completed (accepted) as primary status."""

    verified: int = 0
    """Annotations on tasks with verified as primary status."""

    unsure: int = 0
    """Annotations on tasks with assigned (unsure) as primary status."""

    rejected: int = 0
    """Annotations on tasks with rejected as primary status."""

    no_status: int = 0
    """Annotations on tasks with no status badges."""


class PredictionCorrectionTarget(BaseModel):
    """A tag and how often reviewers chose it."""

    key: str
    """Tag key."""

    value: str
    """Tag value."""

    count: int
    """Number of tags."""


class PredictionConfidence(BaseModel):
    """Confidence of a group of predictions."""

    count: int
    """Number of predictions with a confidence."""

    mean: float
    """Mean confidence."""

    median: float
    """Median confidence."""


class PredictionConfidenceComparison(BaseModel):
    """Confidence of confirmed predictions next to corrected ones.

    Corrected means relabeled, tag removed or event deleted. Birdedge
    predictions use the species confidence, all others the detection
    confidence.
    """

    confirmed: PredictionConfidence | None = None
    """Predictions reviewers kept."""

    corrected: PredictionConfidence | None = None
    """Predictions reviewers overruled."""

    suggested_threshold: float | None = None
    """Lowest confidence above which at least 90% of predictions were confirmed.

    None with fewer than 10 predictions or if no confidence reaches 90%.
    """


class PredictionCorrectionCount(BaseModel):
    """What reviewers did with one predicted tag across a project.

    The outcomes are mutually exclusive and sum to ``predicted``.
    """

    key: str
    """Tag key (species or type)."""

    value: str
    """Predicted tag value."""

    predicted: int
    """Number of predictions of this tag in reviewed tasks."""

    confirmed: int = 0
    """Predictions whose event still has the tag."""

    relabeled: int = 0
    """Predictions whose event has another tag of the same key instead."""

    tag_removed: int = 0
    """Predictions whose event has no tag of this key any more."""

    event_deleted: int = 0
    """Predictions without a matching event (false positives)."""

    box_changed: int = 0
    """Predictions whose event box was moved or resized."""

    relabeled_to: list[PredictionCorrectionTarget] = []
    """Tags the relabeled predictions were changed to."""

    confidence: PredictionConfidenceComparison = PredictionConfidenceComparison()
    """Confidence of confirmed and corrected predictions of this tag."""


class PredictionCorrectionStats(BaseModel):
    """Detector predictions from GUANO files compared with reviewed tasks.

    Only tasks marked completed or verified are compared.
    """

    detector: str | None
    """Detector that created the project, from its name or ecohub's id file."""

    run_id: int | None
    """ecohub run that created the project."""

    model_versions: list[str]
    """Model versions of the GUANO files that were read."""

    reviewed_tasks: int
    """Tasks marked completed or verified."""

    recordings: int
    """Recordings of the reviewed tasks."""

    recordings_with_source: int
    """Recordings with a GUANO file holding the predictions."""

    match_rate: float | None
    """Share of the detector's events that match a GUANO detection exactly."""

    reliable: bool
    """Whether the match rate is high enough to trust the comparison."""

    confidence: PredictionConfidenceComparison
    """Confidence of confirmed and corrected predictions across all tags."""

    species: list[PredictionCorrectionCount]
    """Outcomes per predicted tag, most predicted first."""

    added: list[PredictionCorrectionTarget]
    """Tags reviewers added that no prediction covered."""
