import type { Geometry, SoundEventAnnotation, Tag } from "@/types";

export type SoundEventToken = string;

export type HistoryPatch =
  | { type: "createSoundEvent"; token: SoundEventToken; snapshot: SoundEventAnnotation }
  | { type: "deleteSoundEvent"; token: SoundEventToken; snapshot: SoundEventAnnotation }
  | { type: "updateGeometry"; token: SoundEventToken; from: Geometry; to: Geometry }
  | { type: "addSoundEventTag"; token: SoundEventToken; tag: Tag }
  | { type: "removeSoundEventTag"; token: SoundEventToken; tag: Tag }
  | { type: "addTaskTag"; tag: Tag }
  | { type: "removeTaskTag"; tag: Tag };

export type HistoryCommand = {
  id: string;
  label: string;
  patches: HistoryPatch[];
};

export type HistoryReplayEvent =
  | { type: "restored"; token: SoundEventToken; soundEvent: SoundEventAnnotation }
  | { type: "removed"; token: SoundEventToken; serverId: number };

export const MAX_UNDO_STACK = 50;
