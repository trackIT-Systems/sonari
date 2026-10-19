"""Tag group and tag preset models.

Tags are global across all annotation projects. Tag groups (e.g. Bat, Bird,
Amphibian, Cricket) partition the tags by taxon so that a project only shows
the tags relevant to it. A tag belongs to at most one group; tags without a
group are general purpose (e.g. ``pass:1``) and visible in every project.

Each group carries a list of project name keywords. A project whose name
contains one of these keywords uses the group automatically, unless the
project explicitly selects a group or a preset.

Tag presets are curated, named lists of tags (e.g. "German Bats") that a
project can use as its tag set.

Species are loaded from the species catalog (``sonari/catalogs/species.json``).
Each species has a scientific name, a German name and aliases; tags whose value
matches one of these names are linked to the species. Tags linked to the same
species (e.g. ``species:Amsel`` and ``species:Turdus merula``) name the same
taxon.
"""

from typing import Optional
from uuid import UUID

import sqlalchemy.orm as orm
from sqlalchemy import ForeignKey

from sonari.models.base import Base

__all__ = [
    "Species",
    "SpeciesName",
    "TagGroup",
    "TagPreset",
    "TagPresetTag",
]


class TagGroup(Base):
    """Tag group model for tag_group table.

    Attributes
    ----------
    id
        The database id of the tag group.
    name
        The unique name of the group, e.g. "Bat".
    project_keywords
        Comma separated, case-insensitive keywords. A project whose name
        contains any of them uses this group by default.
    """

    __tablename__ = "tag_group"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    name: orm.Mapped[str] = orm.mapped_column(unique=True)
    project_keywords: orm.Mapped[str] = orm.mapped_column(default="")


class TagPreset(Base):
    """Tag preset model for tag_preset table.

    Attributes
    ----------
    id
        The database id of the tag preset.
    name
        The unique name of the preset, e.g. "German Bats".
    description
        Optional description of the preset.
    group_id
        Optional group the preset belongs to. New tags created in a project
        using this preset are assigned to this group.
    created_by_id
        The user who created the preset.
    """

    __tablename__ = "tag_preset"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    name: orm.Mapped[str] = orm.mapped_column(unique=True)
    description: orm.Mapped[str] = orm.mapped_column(default="")
    group_id: orm.Mapped[Optional[int]] = orm.mapped_column(
        ForeignKey("tag_group.id", ondelete="SET NULL"),
        default=None,
        nullable=True,
        index=True,
    )
    created_by_id: orm.Mapped[Optional[UUID]] = orm.mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"),
        default=None,
        nullable=True,
        index=True,
    )


class TagPresetTag(Base):
    """Association between tag presets and tags."""

    __tablename__ = "tag_preset_tag"

    tag_preset_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("tag_preset.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("tag.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )


class Species(Base):
    """A species (or species complex, genus or call group) from the catalog.

    Attributes
    ----------
    id
        The database id of the species.
    scientific_name
        The unique scientific name, e.g. "Turdus merula".
    name_de
        The German name, e.g. "Amsel".
    group_id
        The tag group (e.g. Bird) of the species.
    """

    __tablename__ = "species"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    scientific_name: orm.Mapped[str] = orm.mapped_column(unique=True)
    name_de: orm.Mapped[str] = orm.mapped_column(default="")
    group_id: orm.Mapped[Optional[int]] = orm.mapped_column(
        ForeignKey("tag_group.id", ondelete="SET NULL"),
        default=None,
        nullable=True,
        index=True,
    )


class SpeciesName(Base):
    """A name under which a species can appear as a tag value.

    ``name`` is normalized (lower case, single spaces) and unique, so every
    name resolves to exactly one species.
    """

    __tablename__ = "species_name"

    id: orm.Mapped[int] = orm.mapped_column(primary_key=True, init=False)
    species_id: orm.Mapped[int] = orm.mapped_column(
        ForeignKey("species.id", ondelete="CASCADE"),
        index=True,
    )
    name: orm.Mapped[str] = orm.mapped_column(unique=True)
