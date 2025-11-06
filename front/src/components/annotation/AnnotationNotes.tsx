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
  return <Empty padding="p-2">No notes</Empty>;
}

export default function AnnotationNotes({
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
      <Card>
        <div className="flex justify-between items-center gap-2 mb-2">
          <H4 className="text-center whitespace-nowrap">
            <NotesIcon className="inline-block mr-1 w-5 h-5" />
            Clip Notes
          </H4>
        </div>
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
