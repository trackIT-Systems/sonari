import { useState, useRef } from "react";

import Button from "@/components/Button";
import { IssueIcon, NotesIcon } from "@/components/icons";
import { TextArea } from "@/components/inputs/index";

import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { ANNOTATION_TASK_NOTE_SHORTCUT, SUBMIT_ANNOTATION_TASK_NOTE_SHORTCUT } from "@/utils/keyboard";

import type { NoteCreate } from "@/api/notes";

export default function CreateNoteForm({
  onCreate,
}: {
  onCreate?: (note: NoteCreate) => void;
}) {
  const [message, setMessage] = useState("");

  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useKeyPressEvent(
    useKeyFilter({ key: ANNOTATION_TASK_NOTE_SHORTCUT }),
    (event) => {
      event.preventDefault();
      textAreaRef.current?.focus();
    }
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== SUBMIT_ANNOTATION_TASK_NOTE_SHORTCUT) {
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();

      onCreate?.({
        message,
        is_issue: false,
      });
      setMessage("");
      return;
    }

    if (event.metaKey) {
      event.preventDefault();
      event.stopPropagation();

      onCreate?.({
        message,
        is_issue: true,
      });
      setMessage("");
      return
    }
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <TextArea
        ref={textAreaRef}
        name="message"
        aria-label="Add a note"
        rows={2}
        value={message}
        placeholder="Add a note or flag an issue…"
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex flex-row flex-wrap justify-end gap-x-2">
        <Button
          variant="danger"
          mode="text"
          onClick={() => {
            setMessage("");
            onCreate?.({
              message,
              is_issue: true,
            });
          }}
        >
          <IssueIcon className="inline-block mr-1 w-5 h-5" />
          Add Issue
        </Button>
        <Button
          variant="primary"
          mode="text"
          onClick={() => {
            setMessage("");
            onCreate?.({
              message,
              is_issue: false,
            });
          }}
        >
          <NotesIcon className="inline-block mr-1 w-5 h-5" />
          Add Note
        </Button>
      </div>
    </div>
  );
}
