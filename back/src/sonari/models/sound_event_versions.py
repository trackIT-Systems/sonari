"""Hide sound event versions from ORM queries.

Old states of edited sound events are rows of ``sound_event_annotation`` with
``superseded_on`` set (see :class:`~sonari.models.SoundEventAnnotation`). Every ORM
SELECT, UPDATE and DELETE that involves the entity, also in joins, subqueries and
relationship loads, gets ``superseded_on IS NULL`` added, so existing queries keep
seeing only live events. The hook is registered on SQLAlchemy's ``Session`` class when
:mod:`sonari.models` is imported, so it applies to every session in the process, ecohub's
included.

Code that reads or writes versions opts out per statement::

    select(SoundEventAnnotation).execution_options(
        **INCLUDE_VERSIONS
    )

Not covered: Core statements on the bare tables, and queries on
``sound_event_annotation_tag`` or ``sound_event_annotation_feature`` that don't involve
the entity. Those must join the event or use :func:`live`.
"""

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from sonari.models.sound_event_annotation import SoundEventAnnotation

__all__ = ["INCLUDE_VERSIONS", "INCLUDE_VERSIONS_OPTION", "live"]

INCLUDE_VERSIONS_OPTION = "include_sound_event_versions"

#: ``execution_options(**INCLUDE_VERSIONS)`` lets a statement see versions.
INCLUDE_VERSIONS = {INCLUDE_VERSIONS_OPTION: True}


def live():
    """Condition for live (not superseded) sound events."""
    return SoundEventAnnotation.superseded_on.is_(None)


def _live_criteria(cls):
    # A module-level function, not a lambda: loaded objects keep their load options, and
    # the API's shared cache pickles them.
    return cls.superseded_on.is_(None)


@event.listens_for(Session, "do_orm_execute")
def _only_live_sound_events(state: ORMExecuteState) -> None:
    # Refreshing an object already loaded must work for versions too.
    if state.is_column_load:
        return
    if state.execution_options.get(INCLUDE_VERSIONS_OPTION, False):
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return
    state.statement = state.statement.options(
        with_loader_criteria(
            SoundEventAnnotation,
            _live_criteria,
            include_aliases=True,
        )
    )
