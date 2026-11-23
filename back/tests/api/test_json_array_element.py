"""The geometry coordinate extraction used by the frequency filters."""

from sqlalchemy import column, literal
from sqlalchemy.dialects import postgresql, sqlite

from sonari.filters.annotation_tasks import json_array_element


def _compile(dialect) -> str:
    expr = json_array_element(column("geometry"), literal(1))
    return str(expr.compile(dialect=dialect, compile_kwargs={"literal_binds": True}))


def test_postgresql_extracts_coordinate_as_text_before_casting():
    """json -> float has no cast in PostgreSQL; ->> (text) -> float does."""
    sql = _compile(postgresql.dialect())

    assert "->>1" in sql.replace(" ", "")
    assert "->'coordinates'->>" in sql


def test_sqlite_uses_json_extract():
    sql = _compile(sqlite.dialect())

    assert "json_extract(geometry, '$.coordinates[1]')" in sql
