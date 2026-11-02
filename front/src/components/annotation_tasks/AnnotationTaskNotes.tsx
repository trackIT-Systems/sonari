import { useMemo } from "react";

import { type NoteCreate } from "@/api/notes";
import Card from "@/components/Card";
import Empty from "@/components/Empty";
import { H4 } from "@/components/Headings";
import { NotesIcon } from "@/components/icons";
import CreateNote from "@/components/notes/CreateNote";
import Feed from "@/components/notes/Feed";

import type { AnnotationTask, Note, User } from "@/types";

function NoNotes() {
  return <Empty padding="p-1">No notes yet</Empty>;
}

export default function AnnotationTaskNotes({
  annotationTask,
  currentUser,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: {
  annotationTask: AnnotationTask;
  currentUser?: User;
  onCreateNote?: (note: NoteCreate) => void;
  onUpdateNote?: (note: Note) => void;
  onDeleteNote?: (note: Note) => void;
}) {
  const notes = useMemo(() => annotationTask.notes || [], [annotationTask]);

  return (
    <div>
      <Card className="gap-2 p-3">
        <H4 className="flex items-center gap-1.5 text-sm">
          <NotesIcon className="h-4 w-4 shrink-0" />
          Notes
        </H4>
        <CreateNote onCreate={onCreateNote} />
        {notes.length === 0 ? (
          <NoNotes />
        ) : (
          <Feed
            notes={notes}
            currentUser={currentUser}
            onUpdate={onUpdateNote}
            onDelete={onDeleteNote}
          />
        )}
      </Card>
    </div>
  );
}
