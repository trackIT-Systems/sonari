import type { HistoryCommand, HistoryPatch } from "@/hooks/annotation/annotationHistoryTypes";

export function patchLabel(patch: HistoryPatch): string {
  switch (patch.type) {
    case "createSoundEvent":
      return "Create sound event";
    case "deleteSoundEvent":
      return "Delete sound event";
    case "updateGeometry":
      return "Move sound event";
    case "addSoundEventTag":
      return "Add tag";
    case "removeSoundEventTag":
      return "Remove tag";
    case "addTaskTag":
      return "Add task tag";
    case "removeTaskTag":
      return "Remove task tag";
    default:
      return "Edit annotation";
  }
}

export function invertPatch(patch: HistoryPatch): HistoryPatch {
  switch (patch.type) {
    case "createSoundEvent":
      return { type: "deleteSoundEvent", token: patch.token, snapshot: patch.snapshot };
    case "deleteSoundEvent":
      return { type: "createSoundEvent", token: patch.token, snapshot: patch.snapshot };
    case "updateGeometry":
      return { type: "updateGeometry", token: patch.token, from: patch.to, to: patch.from };
    case "addSoundEventTag":
      return { type: "removeSoundEventTag", token: patch.token, tag: patch.tag };
    case "removeSoundEventTag":
      return { type: "addSoundEventTag", token: patch.token, tag: patch.tag };
    case "addTaskTag":
      return { type: "removeTaskTag", tag: patch.tag };
    case "removeTaskTag":
      return { type: "addTaskTag", tag: patch.tag };
    default: {
      const _exhaustive: never = patch;
      return _exhaustive;
    }
  }
}

/** Patches to run when undoing a recorded command (inverse order). */
export function commandInversePatches(command: HistoryCommand): HistoryPatch[] {
  return [...command.patches].reverse().map(invertPatch);
}

export function trimUndoStack<T>(stack: T[], maxSize: number): T[] {
  if (stack.length <= maxSize) {
    return stack;
  }
  return stack.slice(stack.length - maxSize);
}
