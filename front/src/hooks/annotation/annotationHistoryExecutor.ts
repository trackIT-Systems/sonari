import type {
  HistoryPatch,
  HistoryReplayEvent,
  SoundEventToken,
} from "@/hooks/annotation/annotationHistoryTypes";
import type { Geometry, SoundEventAnnotation, Tag } from "@/types";

export type HistoryExecutor = {
  createSoundEvent: (params: {
    geometry: Geometry;
    tags: Tag[];
  }) => Promise<SoundEventAnnotation>;
  deleteSoundEvent: (
    annotation: SoundEventAnnotation,
  ) => Promise<SoundEventAnnotation>;
  updateSoundEvent: (params: {
    soundEventAnnotation: SoundEventAnnotation;
    geometry: Geometry;
  }) => Promise<SoundEventAnnotation>;
  addSoundEventTag: (params: {
    soundEventAnnotation: SoundEventAnnotation;
    tag: Tag;
  }) => Promise<SoundEventAnnotation>;
  removeSoundEventTag: (params: {
    soundEventAnnotation: SoundEventAnnotation;
    tag: Tag;
  }) => Promise<SoundEventAnnotation>;
  addTaskTag: (tag: Tag) => Promise<unknown>;
  removeTaskTag: (tag: Tag) => Promise<unknown>;
  getServerId: (token: SoundEventToken) => number | undefined;
  getSnapshot: (token: SoundEventToken) => SoundEventAnnotation | undefined;
  setServerId: (
    token: SoundEventToken,
    id: number,
    snapshot: SoundEventAnnotation,
  ) => void;
};

function soundEventForToken(
  executor: HistoryExecutor,
  token: SoundEventToken,
  fallback?: SoundEventAnnotation,
): SoundEventAnnotation {
  const id = executor.getServerId(token);
  const snapshot = executor.getSnapshot(token) ?? fallback;
  if (id == null && snapshot?.id == null) {
    throw new Error("Sound event is no longer available for undo.");
  }
  return {
    ...(snapshot ?? { geometry: { type: "TimeInterval", coordinates: [0, 1] } }),
    id: id ?? snapshot!.id,
  } as SoundEventAnnotation;
}

export async function applyHistoryPatch(
  patch: HistoryPatch,
  executor: HistoryExecutor,
): Promise<HistoryReplayEvent | undefined> {
  switch (patch.type) {
    case "createSoundEvent": {
      const created = await executor.createSoundEvent({
        geometry: patch.snapshot.geometry,
        tags: patch.snapshot.tags ?? [],
      });
      executor.setServerId(patch.token, created.id, created);
      return { type: "restored", token: patch.token, soundEvent: created };
    }
    case "deleteSoundEvent": {
      const annotation = soundEventForToken(
        executor,
        patch.token,
        patch.snapshot,
      );
      await executor.deleteSoundEvent(annotation);
      return {
        type: "removed",
        token: patch.token,
        serverId: annotation.id,
      };
    }
    case "updateGeometry": {
      const annotation = soundEventForToken(executor, patch.token);
      const updated = await executor.updateSoundEvent({
        soundEventAnnotation: annotation,
        geometry: patch.to,
      });
      executor.setServerId(patch.token, updated.id, updated);
      return undefined;
    }
    case "addSoundEventTag": {
      const annotation = soundEventForToken(executor, patch.token);
      const updated = await executor.addSoundEventTag({
        soundEventAnnotation: annotation,
        tag: patch.tag,
      });
      executor.setServerId(patch.token, updated.id, updated);
      return undefined;
    }
    case "removeSoundEventTag": {
      const annotation = soundEventForToken(executor, patch.token);
      const updated = await executor.removeSoundEventTag({
        soundEventAnnotation: annotation,
        tag: patch.tag,
      });
      executor.setServerId(patch.token, updated.id, updated);
      return undefined;
    }
    case "addTaskTag": {
      await executor.addTaskTag(patch.tag);
      return undefined;
    }
    case "removeTaskTag": {
      await executor.removeTaskTag(patch.tag);
      return undefined;
    }
    default: {
      const _exhaustive: never = patch;
      return _exhaustive;
    }
  }
}

export async function applyHistoryPatches(
  patches: HistoryPatch[],
  executor: HistoryExecutor,
): Promise<HistoryReplayEvent[]> {
  const events: HistoryReplayEvent[] = [];
  for (const patch of patches) {
    const event = await applyHistoryPatch(patch, executor);
    if (event) {
      events.push(event);
    }
  }
  return events;
}
