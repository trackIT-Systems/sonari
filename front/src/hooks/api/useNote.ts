import api from "@/app/api";
import useObject from "@/hooks/utils/useObject";

import type { Note } from "@/types";

export default function useNote({
  id,
  note,
  onUpdate,
  onDelete,
  enabled = true,
}: {
  id: number;
  note?: Note;
  onUpdate?: (note: Note) => void;
  onDelete?: (note: Note) => void;
  enabled?: boolean;
}) {
  if (note !== undefined && note.id !== id) {
    throw new Error("Note id does not match");
  }

  const { query, useMutation } = useObject({
    id,
    initial: note,
    name: "note",
    enabled,
    getFn: api.notes.get,
  });

  const update = useMutation({
    mutationFn: api.notes.update,
    onSuccess: onUpdate,
  });

  const delete_ = useMutation({
    mutationFn: api.notes.delete,
    onSuccess: onDelete,
  });

  return {
    ...query,
    update,
    delete: delete_,
  } as const;
}
