import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import {
  applyHistoryPatches,
  type HistoryExecutor,
} from "@/hooks/annotation/annotationHistoryExecutor";
import {
  commandInversePatches,
  patchLabel,
  trimUndoStack,
} from "@/hooks/annotation/annotationHistoryLogic";
import type {
  HistoryCommand,
  HistoryPatch,
  HistoryReplayEvent,
  SoundEventToken,
} from "@/hooks/annotation/annotationHistoryTypes";
import { MAX_UNDO_STACK } from "@/hooks/annotation/annotationHistoryTypes";
import type { Geometry, SoundEventAnnotation, Tag } from "@/types";

function createToken(): SoundEventToken {
  return crypto.randomUUID();
}

export type AnnotationHistoryMutations = {
  addSoundEventAnnotation: (params: {
    geometry: Geometry;
    tags: Tag[];
  }) => Promise<SoundEventAnnotation>;
  removeSoundEventAnnotation: (
    annotation: SoundEventAnnotation,
  ) => Promise<SoundEventAnnotation>;
  updateSoundEventAnnotation: (params: {
    soundEventAnnotation: SoundEventAnnotation;
    geometry: Geometry;
  }) => Promise<SoundEventAnnotation>;
  addTagToSoundEventAnnotation: (params: {
    soundEventAnnotation: SoundEventAnnotation;
    tag: Tag;
  }) => Promise<SoundEventAnnotation>;
  removeTagFromSoundEventAnnotation: (params: {
    soundEventAnnotation: SoundEventAnnotation;
    tag: Tag;
  }) => Promise<SoundEventAnnotation>;
  addTaskTag: (tag: Tag) => Promise<unknown>;
  removeTaskTag: (tag: Tag) => Promise<unknown>;
};

export default function useAnnotationHistory({
  taskId,
  soundEventAnnotations,
  mutations,
}: {
  taskId: number | undefined;
  soundEventAnnotations: SoundEventAnnotation[] | undefined;
  mutations: AnnotationHistoryMutations;
}) {
  const [undoStack, setUndoStack] = useState<HistoryCommand[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryCommand[]>([]);

  const isReplayingRef = useRef(false);
  const batchRef = useRef<{ label: string; patches: HistoryPatch[] } | null>(
    null,
  );
  const idToTokenRef = useRef<Map<number, SoundEventToken>>(new Map());
  const tokenRegistryRef = useRef<
    Map<SoundEventToken, { serverId: number; snapshot: SoundEventAnnotation }>
  >(new Map());

  const mutationsRef = useRef(mutations);
  mutationsRef.current = mutations;

  const resetHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    idToTokenRef.current = new Map();
    tokenRegistryRef.current = new Map();
    batchRef.current = null;
  }, []);

  useEffect(() => {
    resetHistory();
  }, [taskId, resetHistory]);

  useEffect(() => {
    for (const sea of soundEventAnnotations ?? []) {
      if (sea.id == null) continue;
      if (idToTokenRef.current.has(sea.id)) continue;
      const token = createToken();
      idToTokenRef.current.set(sea.id, token);
      tokenRegistryRef.current.set(token, { serverId: sea.id, snapshot: sea });
    }
  }, [taskId, soundEventAnnotations]);

  const ensureTokenForSoundEvent = useCallback(
    (sea: SoundEventAnnotation): SoundEventToken => {
      const existing = idToTokenRef.current.get(sea.id);
      if (existing) {
        tokenRegistryRef.current.set(existing, {
          serverId: sea.id,
          snapshot: sea,
        });
        return existing;
      }
      const token = createToken();
      idToTokenRef.current.set(sea.id, token);
      tokenRegistryRef.current.set(token, { serverId: sea.id, snapshot: sea });
      return token;
    },
    [],
  );

  const setServerId = useCallback(
    (token: SoundEventToken, id: number, snapshot: SoundEventAnnotation) => {
      const previousId = tokenRegistryRef.current.get(token)?.serverId;
      if (previousId != null && previousId !== id) {
        idToTokenRef.current.delete(previousId);
      }
      idToTokenRef.current.set(id, token);
      tokenRegistryRef.current.set(token, { serverId: id, snapshot });
    },
    [],
  );

  const getServerId = useCallback((token: SoundEventToken) => {
    return tokenRegistryRef.current.get(token)?.serverId;
  }, []);

  const getSnapshot = useCallback((token: SoundEventToken) => {
    return tokenRegistryRef.current.get(token)?.snapshot;
  }, []);

  const pushCommand = useCallback((command: HistoryCommand) => {
    setUndoStack((prev) => trimUndoStack([...prev, command], MAX_UNDO_STACK));
    setRedoStack([]);
  }, []);

  const recordPatch = useCallback(
    (patch: HistoryPatch) => {
      if (isReplayingRef.current) {
        return;
      }
      if (batchRef.current) {
        batchRef.current.patches.push(patch);
        return;
      }
      pushCommand({
        id: createToken(),
        label: patchLabel(patch),
        patches: [patch],
      });
    },
    [pushCommand],
  );

  const runBatch = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      batchRef.current = { label, patches: [] };
      try {
        const result = await fn();
        const batch = batchRef.current;
        if (batch && batch.patches.length > 0) {
          pushCommand({
            id: createToken(),
            label,
            patches: batch.patches,
          });
        }
        return result;
      } finally {
        batchRef.current = null;
      }
    },
    [pushCommand],
  );

  const buildExecutor = useCallback((): HistoryExecutor => {
    const m = mutationsRef.current;
    return {
      createSoundEvent: m.addSoundEventAnnotation,
      deleteSoundEvent: m.removeSoundEventAnnotation,
      updateSoundEvent: m.updateSoundEventAnnotation,
      addSoundEventTag: m.addTagToSoundEventAnnotation,
      removeSoundEventTag: m.removeTagFromSoundEventAnnotation,
      addTaskTag: m.addTaskTag,
      removeTaskTag: m.removeTaskTag,
      getServerId,
      getSnapshot,
      setServerId,
    };
  }, [getServerId, getSnapshot, setServerId]);

  const undo = useCallback(async (): Promise<HistoryReplayEvent[]> => {
    if (isReplayingRef.current) {
      return [];
    }
    const command = undoStack[undoStack.length - 1];
    if (!command) {
      return [];
    }
    isReplayingRef.current = true;
    try {
      const patches = commandInversePatches(command);
      const events = await applyHistoryPatches(patches, buildExecutor());
      setUndoStack((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [...prev, command]);
      toast.success(`Undid: ${command.label}`);
      return events;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Undo failed";
      toast.error(message);
      return [];
    } finally {
      isReplayingRef.current = false;
    }
  }, [undoStack, buildExecutor]);

  const redo = useCallback(async (): Promise<HistoryReplayEvent[]> => {
    if (isReplayingRef.current) {
      return [];
    }
    const command = redoStack[redoStack.length - 1];
    if (!command) {
      return [];
    }
    isReplayingRef.current = true;
    try {
      const events = await applyHistoryPatches(
        command.patches,
        buildExecutor(),
      );
      setRedoStack((prev) => prev.slice(0, -1));
      setUndoStack((prev) => trimUndoStack([...prev, command], MAX_UNDO_STACK));
      toast.success(`Redid: ${command.label}`);
      return events;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Redo failed";
      toast.error(message);
      return [];
    } finally {
      isReplayingRef.current = false;
    }
  }, [redoStack, buildExecutor]);

  const wrapAddSoundEventAnnotation = useCallback(
    async (params: { geometry: Geometry; tags: Tag[] }) => {
      const result = await mutationsRef.current.addSoundEventAnnotation(params);
      const token = ensureTokenForSoundEvent(result);
      setServerId(token, result.id, result);
      recordPatch({ type: "createSoundEvent", token, snapshot: result });
      return result;
    },
    [ensureTokenForSoundEvent, recordPatch, setServerId],
  );

  const wrapRemoveSoundEventAnnotation = useCallback(
    async (annotation: SoundEventAnnotation) => {
      const token = ensureTokenForSoundEvent(annotation);
      const snapshot = { ...annotation };
      const result =
        await mutationsRef.current.removeSoundEventAnnotation(annotation);
      recordPatch({ type: "deleteSoundEvent", token, snapshot });
      return result;
    },
    [ensureTokenForSoundEvent, recordPatch],
  );

  const wrapUpdateSoundEventAnnotation = useCallback(
    async (params: {
      soundEventAnnotation: SoundEventAnnotation;
      geometry: Geometry;
    }) => {
      const token = ensureTokenForSoundEvent(params.soundEventAnnotation);
      const from = params.soundEventAnnotation.geometry;
      const result = await mutationsRef.current.updateSoundEventAnnotation(
        params,
      );
      setServerId(token, result.id, result);
      recordPatch({ type: "updateGeometry", token, from, to: params.geometry });
      return result;
    },
    [ensureTokenForSoundEvent, recordPatch, setServerId],
  );

  const wrapAddTagToSoundEventAnnotation = useCallback(
    async (params: {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }) => {
      const token = ensureTokenForSoundEvent(params.soundEventAnnotation);
      const result =
        await mutationsRef.current.addTagToSoundEventAnnotation(params);
      setServerId(token, result.id, result);
      recordPatch({ type: "addSoundEventTag", token, tag: params.tag });
      return result;
    },
    [ensureTokenForSoundEvent, recordPatch, setServerId],
  );

  const wrapRemoveTagFromSoundEventAnnotation = useCallback(
    async (params: {
      soundEventAnnotation: SoundEventAnnotation;
      tag: Tag;
    }) => {
      const token = ensureTokenForSoundEvent(params.soundEventAnnotation);
      const result =
        await mutationsRef.current.removeTagFromSoundEventAnnotation(params);
      setServerId(token, result.id, result);
      recordPatch({ type: "removeSoundEventTag", token, tag: params.tag });
      return result;
    },
    [ensureTokenForSoundEvent, recordPatch, setServerId],
  );

  const wrapAddTaskTag = useCallback(
    async (tag: Tag) => {
      const result = await mutationsRef.current.addTaskTag(tag);
      recordPatch({ type: "addTaskTag", tag });
      return result;
    },
    [recordPatch],
  );

  const wrapRemoveTaskTag = useCallback(
    async (tag: Tag) => {
      const result = await mutationsRef.current.removeTaskTag(tag);
      recordPatch({ type: "removeTaskTag", tag });
      return result;
    },
    [recordPatch],
  );

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const undoLabel = undoStack[undoStack.length - 1]?.label ?? null;
  const redoLabel = redoStack[redoStack.length - 1]?.label ?? null;

  return useMemo(
    () => ({
      canUndo,
      canRedo,
      undoLabel,
      redoLabel,
      undo,
      redo,
      runBatch,
      wrapAddSoundEventAnnotation,
      wrapRemoveSoundEventAnnotation,
      wrapUpdateSoundEventAnnotation,
      wrapAddTagToSoundEventAnnotation,
      wrapRemoveTagFromSoundEventAnnotation,
      wrapAddTaskTag,
      wrapRemoveTaskTag,
    }),
    [
      canUndo,
      canRedo,
      undoLabel,
      redoLabel,
      undo,
      redo,
      runBatch,
      wrapAddSoundEventAnnotation,
      wrapRemoveSoundEventAnnotation,
      wrapUpdateSoundEventAnnotation,
      wrapAddTagToSoundEventAnnotation,
      wrapRemoveTagFromSoundEventAnnotation,
      wrapAddTaskTag,
      wrapRemoveTaskTag,
    ],
  );
}
