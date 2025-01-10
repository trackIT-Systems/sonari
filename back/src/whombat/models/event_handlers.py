from sqlalchemy import event
from sqlalchemy.orm import Session

from whombat.models import AnnotationProject, AnnotationTask


# This function is a workaround for a deeper problem.
# When a project or a task are deleted, the corresponding
# clip annotation is not deleted on the database level due to dependencies.
# Solving those dependencies, however, will introduce a lot of refactoring.
# Since deleting projects is not done that frequently, we can
# accept the cost this introduces.
def setup_model_events():
    @event.listens_for(Session, "after_flush")
    def after_flush(session: Session, _):
        for obj in session.deleted:
            if isinstance(obj, AnnotationProject):
                for task in obj.annotation_tasks:
                    if task.clip_annotation:
                        session.delete(task.clip_annotation)
                    session.delete(task)

            elif isinstance(obj, AnnotationTask):
                if obj.clip_annotation:
                    session.delete(obj.clip_annotation)
