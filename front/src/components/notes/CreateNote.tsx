import { useState, useRef } from "react";

import Button from "@/components/Button";
import { IssueIcon, NotesIcon } from "@/components/icons";
import { InputGroup, TextArea } from "@/components/inputs/index";

import { useKeyPressEvent } from "react-use";
import useKeyFilter from "@/hooks/utils/useKeyFilter";
import { CLIP_NOTE_SHORTCUT, SUBMIT_CLIP_NOTE_SHORTCUT } from "@/utils/keyboard";

import type { NoteCreate } from "@/api/notes";

export default function CreateNoteForm({
  onCreate,
}: {
  onCreate?: (note: NoteCreate) => void;
}) {
  const [message, setMessage] = useState("");

  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useKeyPressEvent(
    useKeyFilter({ key: CLIP_NOTE_SHORTCUT }),
    (event) => {
      event.preventDefault();
      textAreaRef.current?.focus();
    }
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== SUBMIT_CLIP_NOTE_SHORTCUT) {
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
    <div className="flex flex-col p-4 w-full">
      <InputGroup
        label="Add a note"
        name="message"
        help="Write the note message and click on the type of note you want to create."
      >
        <TextArea
          ref={textAreaRef}
          name="message"
          value={message}
          placeholder="Type your note here..."
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </InputGroup>
      <div className="flex flex-row gap-4 justify-end">
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
