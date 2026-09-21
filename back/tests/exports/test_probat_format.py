"""Tests for ProBat export formatting and species resolution."""

import datetime

from sonari.exports.constants import resolve_probat_species
from sonari.exports.utils.probat_format import (
    format_probat_count,
    format_probat_datetime,
    format_probat_number,
    max_confidence_for_species,
)
from sonari.exports.utils.tag_utils import find_matching_tag_values_on_annotation


class _User:
    def __init__(self, username: str):
        self.username = username


class _Tag:
    def __init__(self, key: str, value: str, created_by: _User | None = None):
        self.key = key
        self.value = value
        self.created_by = created_by


class _Feature:
    def __init__(self, name: str, value: float):
        self.name = name
        self.value = value


class _Annotation:
    def __init__(self, tags, features):
        self.tags = tags
        self.features = features


def test_format_probat_datetime_with_time():
    d = datetime.date(2025, 4, 12)
    t = datetime.time(23, 32, 25)
    assert format_probat_datetime(d, t) == "12.04.2025, 23:32:25"


def test_format_probat_datetime_date_only():
    d = datetime.date(2025, 4, 12)
    assert format_probat_datetime(d, None) == "12.04.2025"


def test_format_probat_number():
    assert format_probat_number(0.75) == "0,75"
    assert format_probat_number(0.0) == "0,00"


def test_format_probat_count():
    assert format_probat_count(3) == "3,0"


def test_resolve_probat_species_latin_name():
    assert resolve_probat_species("Nyctalus noctula", group_species=False) == "Nnoc"


def test_resolve_probat_species_with_grouping():
    assert resolve_probat_species("Nyctalus noctula", group_species=True) == "Nyctaloid"


def test_resolve_probat_species_unknown_passthrough():
    assert resolve_probat_species("CustomCode", group_species=False) == "CustomCode"


def test_max_confidence_birdedge_uses_species_confidence():
    ann = _Annotation(
        tags=[_Tag("species", "Turdus merula", _User("birdedge"))],
        features=[
            _Feature("species_confidence", 0.9),
            _Feature("detection_confidence", 0.5),
        ],
    )
    assert max_confidence_for_species(ann, "Turdus merula") == 0.9


def test_max_confidence_bat_uses_detection_confidence():
    ann = _Annotation(
        tags=[_Tag("species", "Nyctalus noctula", _User("yolobat"))],
        features=[
            _Feature("species_confidence", 0.9),
            _Feature("detection_confidence", 0.77),
        ],
    )
    assert max_confidence_for_species(ann, "Nyctalus noctula") == 0.77


def test_find_matching_tag_values_empty_selection_returns_all():
    tags = [_Tag("species", "Nyctalus noctula"), _Tag("quality", "noise")]
    assert find_matching_tag_values_on_annotation(tags, None) == ["Nyctalus noctula", "noise"]


def test_find_matching_tag_values_matches_key_value():
    tags = [_Tag("species", "Nyctalus noctula")]
    assert find_matching_tag_values_on_annotation(tags, ["species:Nyctalus noctula"]) == [
        "Nyctalus noctula"
    ]


def test_max_confidence_picks_highest_matching_feature():
    ann = _Annotation(
        tags=[_Tag("species", "Nyctalus noctula", _User("yolobat"))],
        features=[
            _Feature("detection_confidence_v2", 0.88),
            _Feature("detection_confidence", 0.77),
        ],
    )
    assert max_confidence_for_species(ann, "Nyctalus noctula") == 0.88
