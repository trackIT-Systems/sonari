"""Schemas for handling Tags."""

from typing import Annotated, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from sonari.schemas.base import BaseSchema
from sonari.schemas.users import SimpleUser

__all__ = [
    "ProjectTagScope",
    "SpeciesInfo",
    "SpeciesTags",
    "Tag",
    "TagAssignGroup",
    "TagCreate",
    "TagDetail",
    "TagGroup",
    "TagGroupCreate",
    "TagGroupUpdate",
    "TagMerge",
    "TagMergeResult",
    "TagPreset",
    "TagPresetCreate",
    "TagPresetUpdate",
    "TagScope",
    "TagShortcutSet",
    "TagUpdate",
]

TagScope = Literal["auto", "group", "preset", "all"]


class TagCreate(BaseModel):
    """Schema for creating Tag objects."""

    key: str = Field(min_length=1, max_length=255)
    """Key of the tag."""

    value: str = Field(min_length=1, max_length=255)
    """Value of the tag."""

    created_by: SimpleUser | None = None
    """The user who created the tag."""


class Tag(BaseSchema):
    """Schema for Tag objects returned to the user."""

    id: int = Field(..., exclude=True)
    """Database ID of the tag."""

    key: str
    """Key of the tag."""

    value: str
    """Value of the tag."""

    created_by_id: Optional[UUID] = None
    """ID of the user that created this tag"""

    created_by: Optional[SimpleUser] = None
    """The user object of the tag creator"""

    group_id: Optional[int] = None
    """ID of the tag group (e.g. Bat, Bird) the tag belongs to."""

    species_id: Optional[int] = None
    """ID of the catalog species the tag names. Tags with the same species
    (e.g. species:Amsel and species:Turdus merula) name the same taxon."""

    shortcut: Optional[str] = None
    """Keyboard key (0-9) that picks this tag in the tag search."""


class TagUpdate(BaseModel):
    """Schema for updating Tag objects."""

    key: str | None = Field(default=None, min_length=1, max_length=255)
    """Key of the tag."""

    value: str | None = Field(default=None, min_length=1, max_length=255)
    """Value of the tag."""

    created_by: SimpleUser | None = None
    """The user who created the tag."""


class SpeciesInfo(BaseModel):
    """A species from the species catalog."""

    id: int
    scientific_name: str
    name_de: str = ""
    group_id: int | None = None


class TagDetail(BaseModel):
    """Tag with database id and usage counts, for tag management."""

    id: int
    key: str
    value: str
    group_id: int | None = None
    species: SpeciesInfo | None = None
    """The catalog species the tag names, if any."""
    shortcut: str | None = None
    """Keyboard key (0-9) that picks this tag in the tag search."""
    sound_event_count: int = 0
    """Number of sound event annotation tag assignments (0 inside presets)."""
    task_count: int = 0
    """Number of annotation task tag assignments (0 inside presets)."""


class TagGroupCreate(BaseModel):
    """Schema for creating a tag group."""

    name: str = Field(min_length=1, max_length=255)
    project_keywords: list[str] = []
    """Project name keywords that select this group automatically."""


class TagGroupUpdate(BaseModel):
    """Schema for updating a tag group."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    project_keywords: list[str] | None = None


class TagGroup(BaseModel):
    """Schema for a tag group returned to the user."""

    id: int
    name: str
    project_keywords: list[str] = []
    tag_count: int = 0


class TagPresetCreate(BaseModel):
    """Schema for creating a tag preset."""

    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    group_id: int | None = None
    tag_ids: list[int] = []


class TagPresetUpdate(BaseModel):
    """Schema for updating a tag preset."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    group_id: int | None = None
    tag_ids: list[int] | None = None


class TagPreset(BaseModel):
    """Schema for a tag preset returned to the user."""

    id: int
    name: str
    description: str = ""
    group_id: int | None = None
    created_by_id: UUID | None = None
    tags: list[TagDetail] = []


class TagAssignGroup(BaseModel):
    """Assign a set of tags to a group (or remove their group with None)."""

    tag_ids: list[int] = Field(min_length=1)
    group_id: int | None = None


class TagMerge(BaseModel):
    """Merge the source tags into the target tag."""

    source_tag_ids: list[int] = Field(min_length=1)
    target_tag_id: int


class TagMergeResult(BaseModel):
    """Result of a tag merge."""

    target: TagDetail
    merged_tags: int
    sound_event_tags_moved: int
    task_tags_moved: int
    duplicates_removed: int


class ProjectTagScope(BaseModel):
    """The tags an annotation project shows in its tag search."""

    scope: TagScope
    """The configured scope of the project."""

    group: TagGroup | None = None
    """The effective tag group (explicit, from the preset, or detected from the name)."""

    preset: TagPreset | None = None
    """The preset, if the project uses one."""


ShortcutKey = Annotated[str, Field(pattern=r"^[0-9]$")]


class TagShortcutSet(BaseModel):
    """Give a keyboard key to a tag, or free the key with ``tag_id=None``."""

    shortcut: ShortcutKey
    tag_id: int | None = None


class SpeciesTags(BaseModel):
    """A species named by several tags, e.g. in German and in Latin."""

    species: SpeciesInfo
    tags: list[TagDetail]
