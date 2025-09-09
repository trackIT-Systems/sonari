"""Constants used across export functions."""


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

    DUMP_HEADERS = [
        "filename",
        "station",
        "date",
        "time",
        "longitude",
        "latitude",
        "sound_event_tags",
        "media_duration",
        "detection_confidence",
        "species_confidence",
        "start_time",
        "lower_frequency",
        "end_time",
        "higher_frequency",
        "user",
        "recording_tags",
        "task_status_badges",
        "geometry_type",
    ]
