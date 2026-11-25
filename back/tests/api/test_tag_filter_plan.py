"""The costly task filters stay per-task checks that PostgreSQL cannot turn into joins.

On a large server an ``EXISTS`` tag check became a semi join over every link
to the tag in the database (millions, across all projects), so the filter's
cost grew with the database instead of with the project. Rewriting the
filters back and forth between per-task and grouped forms kept moving the
slow case around; these tests pin the per-task form.

Turning an ``EXISTS`` into a semi or anti join happens before PostgreSQL
compares costs, so the plan test holds on a small test database too.
"""

import pytest
from sqlalchemy import select, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from sonari import api, models
from sonari.filters.annotation_tasks import AnnotationTaskFilter

# Filter combinations used on the tasks page: included and excluded tags,
# AND/OR, and the distinct tag count (early-stop and counting bounds).
FILTERS = {
    "include": dict(sound_event_annotation_tag__keys="species", sound_event_annotation_tag__values="Pipistrellus pipistrellus"),
    "include_or": dict(
        sound_event_annotation_tag__keys="species,species",
        sound_event_annotation_tag__values="Pipistrellus pipistrellus,Nyctalus noctula",
        sound_event_annotation_tag__include_match="or",
    ),
    "include_and": dict(
        sound_event_annotation_tag__keys="species,species",
        sound_event_annotation_tag__values="Pipistrellus pipistrellus,Nyctalus noctula",
        sound_event_annotation_tag__include_match="and",
    ),
    "exclude": dict(
        sound_event_annotation_tag__exclude_keys="species",
        sound_event_annotation_tag__exclude_values="Nyctalus noctula",
    ),
    "include_exactly_one_tag": dict(
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values="Pipistrellus pipistrellus",
        sound_event_annotation_tag_count__eq=1,
    ),
    "at_least_one_tag": dict(sound_event_annotation_tag_count__ge=1),
    "at_most_one_tag": dict(sound_event_annotation_tag_count__le=1),
    "include_exactly_three_tags": dict(
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values="Pipistrellus pipistrellus",
        sound_event_annotation_tag_count__eq=3,
    ),
}


def _filtered_query(project_id: int, **params):
    query = select(models.AnnotationTask.id).where(models.AnnotationTask.annotation_project_id == project_id)
    return AnnotationTaskFilter(**params).filter(query)


def _postgres_sql(query) -> str:
    return str(query.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))


@pytest.mark.parametrize("params", FILTERS.values(), ids=FILTERS.keys())
def test_tag_filters_compile_without_exists(params):
    """Each tag check is a ``LIMIT 1`` scalar subquery, never an ``EXISTS`` (any database)."""
    sql = _postgres_sql(_filtered_query(1, **params))

    assert "EXISTS" not in sql.upper()
    assert "LIMIT" in sql.upper()


@pytest.mark.asyncio
@pytest.mark.parametrize("params", FILTERS.values(), ids=FILTERS.keys())
async def test_tag_filters_plan_without_semi_or_anti_join(db_session: AsyncSession, params):
    """PostgreSQL runs each tag check per task (a SubPlan), not as a join over all tag links."""
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Query plans are PostgreSQL's")

    sql = _postgres_sql(_filtered_query(1, **params))
    plan = "\n".join(row[0] for row in (await db_session.execute(text(f"EXPLAIN {sql}"))).all())

    assert "Semi Join" not in plan, plan
    assert "Anti Join" not in plan, plan
    assert "SubPlan" in plan, plan


# Confidence and median confidence: per-task checks as well. As an EXISTS (and
# as a ranking with window functions) PostgreSQL read every confidence value
# in the database.
CONFIDENCE_FILTERS = {
    "confidence": dict(confidence__gt=0.9),
    "include_and_confidence": dict(
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values="Pipistrellus pipistrellus",
        confidence__gt=0.9,
    ),
    "exclude_and_confidence": dict(
        sound_event_annotation_tag__exclude_keys="species",
        sound_event_annotation_tag__exclude_values="Nyctalus noctula",
        confidence__gt=0.9,
    ),
}

MEDIAN_FILTERS = {
    "median": dict(median_confidence__gt=0.8),
    "median_range": dict(median_confidence__gt=0.5, median_confidence__lt=0.9),
    "include_and_median": dict(
        sound_event_annotation_tag__keys="species",
        sound_event_annotation_tag__values="Pipistrellus pipistrellus",
        median_confidence__gt=0.8,
    ),
}


@pytest.mark.parametrize("params", CONFIDENCE_FILTERS.values(), ids=CONFIDENCE_FILTERS.keys())
def test_confidence_filters_compile_without_exists(params):
    sql = _postgres_sql(_filtered_query(1, **params))

    assert "EXISTS" not in sql.upper()
    assert "LIMIT" in sql.upper()


@pytest.mark.parametrize("params", MEDIAN_FILTERS.values(), ids=MEDIAN_FILTERS.keys())
def test_median_filter_is_per_task_percentile_on_postgres(params):
    """PostgreSQL: percentile_cont per task, computed once (HAVING); no ranking."""
    sql = _postgres_sql(_filtered_query(1, **params))

    assert sql.count("percentile_cont(0.5) WITHIN GROUP") == len(
        [k for k in params if k.startswith("median_confidence__")]
    )
    assert "HAVING" in sql
    assert "row_number()" not in sql


@pytest.mark.parametrize("params", MEDIAN_FILTERS.values(), ids=MEDIAN_FILTERS.keys())
def test_median_filter_ranks_on_sqlite(params):
    """SQLite has no percentile function: the median comes from window functions."""
    sql = str(_filtered_query(1, **params).compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds": True}))

    assert "percentile_cont" not in sql
    assert "row_number()" in sql


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [*CONFIDENCE_FILTERS.values(), *MEDIAN_FILTERS.values()],
    ids=[*CONFIDENCE_FILTERS.keys(), *MEDIAN_FILTERS.keys()],
)
async def test_confidence_filters_plan_per_task(db_session: AsyncSession, params):
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("Query plans are PostgreSQL's")

    sql = _postgres_sql(_filtered_query(1, **params))
    plan = "\n".join(row[0] for row in (await db_session.execute(text(f"EXPLAIN {sql}"))).all())

    assert "Semi Join" not in plan, plan
    assert "Anti Join" not in plan, plan
    assert "WindowAgg" not in plan, plan
    assert "SubPlan" in plan, plan


class _Captured(Exception):
    def __init__(self, statement):
        self.statement = statement


class _CapturingSession:
    async def execute(self, statement, *args, **kwargs):
        raise _Captured(statement)


async def _list_statement(method: str, **kwargs) -> str:
    try:
        await getattr(api.annotation_tasks, method)(_CapturingSession(), **kwargs)
    except _Captured as captured:
        return str(captured.statement.compile(dialect=postgresql.dialect()))
    raise AssertionError("no statement executed")


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["get_index", "get_many"])
async def test_task_list_filters_before_sorting(method):
    """The filtered task ids come from a materialized CTE; only they are sorted and paged.

    Without the fence PostgreSQL walked every recording in the database by
    time and checked the filters row by row until a page was full.
    """
    filters = [AnnotationTaskFilter(annotation_project__eq=1, **FILTERS["include"])]
    sql = await _list_statement(method, limit=100, offset=0, filters=filters, sort_by="recording_datetime")

    assert "WITH matching AS MATERIALIZED" in sql
    assert "JOIN matching ON matching.id = annotation_task.id" in sql
    main_query = sql.split(")\n SELECT", 1)[1]
    assert "sound_event_annotation_tag" not in main_query


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["get_index", "get_many"])
@pytest.mark.parametrize("sort_by", ["recording_datetime", "recording", "-recording", "duration", "-created_on"])
@pytest.mark.parametrize("limit", [1, 100, -1])
async def test_task_list_sorts_by_the_cte_only(method, sort_by, limit):
    """The outer query sorts by the CTE's columns, never by an indexed table column.

    With the sort key outside the CTE (the recording time), a project-only
    filter with LIMIT 1 walked every recording of the database by time and
    timed out: PostgreSQL ignored that ``count(*) OVER ()`` needs all rows.
    """
    filters = [AnnotationTaskFilter(annotation_project__eq=1)]
    sql = await _list_statement(method, limit=limit, offset=0, filters=filters, sort_by=sort_by)

    main_query = sql.split(")\n SELECT", 1)[1]
    order_by = main_query.split("ORDER BY", 1)[1].split("LIMIT", 1)[0]
    assert "JOIN recording" not in main_query
    assert [key.strip().split(" ")[0] for key in order_by.split(",")] == [
        f"matching.sort_{i}" for i in range(len(order_by.split(",")))
    ]
