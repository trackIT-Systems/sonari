"""Species catalog: relates tags that name the same species and assigns groups.

The catalog (``sonari/catalogs/species.json``) lists species with their
scientific name, German name, tag group (Bat, Bird, ...) and aliases such as
YOLOBat short codes. It is synced into the ``species`` and ``species_name``
tables on startup. Tags whose value matches a catalog name are linked to the
species and, if they have no group yet, put into the species' group.

Only unlinked tags are touched, so a group changed by hand is kept.
"""

from __future__ import annotations

import datetime
import json
import unicodedata
from functools import cache
from pathlib import Path
from typing import Any

from sqlalchemy import delete, insert, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import models
from sonari.shared_cache_global import get_shared_cache

__all__ = [
    "CATALOG_PATH",
    "find_species",
    "load_catalog",
    "normalize_name",
    "sync_species_catalog",
]

CATALOG_PATH = Path(__file__).parent.parent / "catalogs" / "species.json"

_ADVISORY_LOCK_ID = 726_000_001
"""Serializes the sync between workers starting at the same time (Postgres)."""


def normalize_name(name: str) -> str:
    """Normalize a species name for matching: NFC, lower case, single spaces."""
    return " ".join(unicodedata.normalize("NFC", name).lower().split())


def _entry_names(entry: dict[str, Any]) -> set[str]:
    """Normalized names (scientific, German, aliases) of a catalog entry."""
    names = [entry["scientific"], entry.get("de") or "", *entry.get("aliases", [])]
    return {normalize_name(name) for name in names if name}


@cache
def load_catalog() -> tuple[dict[str, Any], ...]:
    """Load the catalog entries and check that no name points to two species."""
    entries = tuple(json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["species"])
    seen: dict[str, str] = {}
    for entry in entries:
        for name in _entry_names(entry):
            other = seen.setdefault(name, entry["scientific"])
            if other != entry["scientific"]:
                raise ValueError(f"Catalog name '{name}' is used by '{other}' and '{entry['scientific']}'")
    return entries


async def _ensure_groups(session: AsyncSession, names: set[str]) -> dict[str, int]:
    rows = (await session.execute(select(models.TagGroup.name, models.TagGroup.id))).all()
    by_name = {name.lower(): group_id for name, group_id in rows}
    for name in sorted(names):
        if name.lower() not in by_name:
            group = models.TagGroup(name=name, project_keywords="")
            session.add(group)
            await session.flush()
            by_name[name.lower()] = group.id
    return {name: by_name[name.lower()] for name in names}


async def sync_species_catalog(session: AsyncSession) -> tuple[int, int]:
    """Sync the catalog into the database and link unlinked tags.

    Idempotent. The caller commits. Returns (tags linked, tags assigned to
    a group).
    """
    if session.bind.dialect.name == "postgresql":
        await session.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _ADVISORY_LOCK_ID})

    entries = load_catalog()
    now = datetime.datetime.now(datetime.timezone.utc)
    group_ids = await _ensure_groups(session, {e["group"] for e in entries})

    # Species
    existing = {s.scientific_name: s for s in (await session.scalars(select(models.Species))).all()}
    for entry in entries:
        values = {"name_de": entry.get("de") or "", "group_id": group_ids[entry["group"]]}
        species = existing.get(entry["scientific"])
        if species is None:
            species = models.Species(scientific_name=entry["scientific"], **values)
            session.add(species)
            existing[entry["scientific"]] = species
        else:
            for k, v in values.items():
                setattr(species, k, v)
    await session.flush()

    # Names: diff against the database so restarts do not churn rows.
    desired = {
        name: existing[entry["scientific"]].id for entry in entries for name in _entry_names(entry)
    }
    current = dict(
        (await session.execute(select(models.SpeciesName.name, models.SpeciesName.species_id))).all()
    )
    stale = [name for name, species_id in current.items() if desired.get(name) != species_id]
    if stale:
        await session.execute(delete(models.SpeciesName).where(models.SpeciesName.name.in_(stale)))
    missing = [name for name, species_id in desired.items() if current.get(name) != species_id]
    if missing:
        await session.execute(
            insert(models.SpeciesName),
            [{"name": name, "species_id": desired[name], "created_on": now} for name in missing],
        )

    # Link tags that are not linked yet.
    group_of = {s.id: s.group_id for s in existing.values()}
    tags = (
        await session.execute(
            select(models.Tag.id, models.Tag.key, models.Tag.value, models.Tag.group_id).where(
                models.Tag.species_id.is_(None)
            )
        )
    ).all()
    linked_keys: list[tuple[str, str]] = []
    tags_grouped = 0
    for tag_id, key, value, group_id in tags:
        species_id = desired.get(normalize_name(value))
        if species_id is None:
            continue
        values: dict[str, Any] = {"species_id": species_id}
        if group_id is None and group_of.get(species_id) is not None:
            values["group_id"] = group_of[species_id]
            tags_grouped += 1
        await session.execute(update(models.Tag).where(models.Tag.id == tag_id).values(**values))
        linked_keys.append((key, value))

    cache = get_shared_cache()
    if cache is not None:
        for pk in linked_keys:
            cache.pop(("Tag", pk), None)

    return len(linked_keys), tags_grouped


async def find_species(session: AsyncSession, value: str) -> models.Species | None:
    """The catalog species a tag value names, if any."""
    return await session.scalar(
        select(models.Species)
        .join(models.SpeciesName, models.SpeciesName.species_id == models.Species.id)
        .where(models.SpeciesName.name == normalize_name(value))
    )
