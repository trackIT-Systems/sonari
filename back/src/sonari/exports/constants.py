"""Constants used across export functions."""

from sonari.utils.bat_groups import BAT_GROUPS


class ExportConstants:
    """Constants used across export functions."""

    DEFAULT_BATCH_SIZE = 1000
    DEFAULT_DATE_FORMAT = "DD.MM.YYYY"
    DEFAULT_EVENT_COUNT = 2
    NIGHT_START_HOUR = 18  # 6PM
    NIGHT_END_HOUR = 6  # 6AM

    MULTIBASE_HEADERS = [
        "Art",
        "Datum",
        "Tag",
        "Monat",
        "Jahr",
        "Beobachter",
        "Bestimmer",
        "Fundort",
        "X",
        "Y",
        "EPSG",
        "Nachweistyp",
        "Bemerkung_1",
    ]

    PROBAT_HEADERS = [
        "Species",
        "Prob",
        "Aufnahmezeit",
        "Dateiname",
        "Kommentar",
        "Rufzahl",
    ]

    DUMP_HEADERS = [
        "filename",
        "station",
        "date",
        "time",
        "longitude",
        "latitude",
        "sound_event_tags",
        "task_tags",
        "media_duration",
        "detection_confidence",
        "species_confidence",
        "start_time",
        "lower_frequency",
        "end_time",
        "higher_frequency",
        "user",
        "task_status_badges",
        "geometry_type",
    ]



# Latin name (or group label) → ProBat short code for CSV export
PROBAT_SPECIES_CODES: dict[str, str] = {
    # Group labels (identity)
    "Nyctaloid": "Nyctaloid",
    "Pipistrelloid": "Pipistrelloid",
    "Myotis": "Myotis",
    "Rhinolophus": "Rhinolophus",
    "Plecotus": "Plecotus",
    # Pipistrellus
    "Pipistrellus pipistrellus": "Ppip",
    "Pipistrellus pygmaeus": "Ppyg",
    "Pipistrellus nathusii": "Pnat",
    # Nyctalus / Vespertilio / Eptesicus
    "Nyctalus noctula": "Nnoc",
    "Nyctalus leisleri": "Nlei",
    "Vespertilio murinus": "Vmur",
    "Eptesicus serotinus": "Eser",
    "Eptesicus nilsonii": "Enil",
    # Myotis
    "Myotis alcathoe": "Malc",
    "Myotis mystacinus/brandtii": "Mbart",
    "Myotis brandtii": "Mbart",
    "Myotis mystacinus": "Mbart",
    "Myotis bechsteinii": "Mbec",
    "Myotis daubentonii": "Mdau",
    "Myotis myotis": "Mmyo",
    "Myotis nattereri": "Mnat",
    "Myotis emarginatus": "Mema",
    "Myotis dasycneme": "Mdas",
    # Rhinolophus
    "Rhinolophus ferrumequinum": "Rfer",
    "Rhinolophus hipposideros": "Rhip",
    # Plecotus
    "Plecotus auritus": "Plecotus",
    "Plecotus austriacus": "Plecotus",
    "Plecotus auritus/austriacus": "Plecotus",
    # Other / placeholder
    "Barbastella barbastellus": "Bbar",
    "Spec.": "Spec.",
}


def resolve_probat_species(tag_value: str, group_species: bool = False) -> str:
    """Map a tag value to a ProBat species code."""
    value = tag_value
    if group_species:
        value = BAT_GROUPS.get(value, value)
    return PROBAT_SPECIES_CODES.get(value, value)
