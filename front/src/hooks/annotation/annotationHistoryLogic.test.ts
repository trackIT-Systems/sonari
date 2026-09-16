import { describe, expect, it } from "vitest";

import {
  commandInversePatches,
  invertPatch,
  patchLabel,
  trimUndoStack,
} from "@/hooks/annotation/annotationHistoryLogic";
import type { HistoryCommand, HistoryPatch } from "@/hooks/annotation/annotationHistoryTypes";
import type { SoundEventAnnotation } from "@/types";
import { MAX_UNDO_STACK } from "@/hooks/annotation/annotationHistoryTypes";

const sampleSea = (id: number): SoundEventAnnotation =>
  ({
    id,
    annotation_task_id: 1,
    recording_id: 1,
    geometry_type: "TimeInterval",
    geometry: { type: "TimeInterval", coordinates: [0, 1] },
    tags: [{ key: "species", value: "test" }],
  }) as SoundEventAnnotation;

describe("invertPatch", () => {
  it("swaps create and delete", () => {
    const token = "tok";
    const snapshot = sampleSea(1);
    const create: HistoryPatch = { type: "createSoundEvent", token, snapshot };
    expect(invertPatch(create)).toEqual({
      type: "deleteSoundEvent",
      token,
      snapshot,
    });
    expect(invertPatch(invertPatch(create))).toEqual(create);
  });

  it("swaps sound event tag add/remove", () => {
    const tag = { key: "species", value: "x" };
    const add: HistoryPatch = {
      type: "addSoundEventTag",
      token: "t",
      tag,
    };
    expect(invertPatch(add)).toEqual({
      type: "removeSoundEventTag",
      token: "t",
      tag,
    });
  });

  it("swaps task tag add/remove", () => {
    const tag = { key: "site", value: "A" };
    expect(invertPatch({ type: "addTaskTag", tag })).toEqual({
      type: "removeTaskTag",
      tag,
    });
    expect(invertPatch({ type: "removeTaskTag", tag })).toEqual({
      type: "addTaskTag",
      tag,
    });
  });

  it("swaps geometry endpoints", () => {
    const patch: HistoryPatch = {
      type: "updateGeometry",
      token: "t",
      from: { type: "TimeInterval", coordinates: [0, 1] },
      to: { type: "TimeInterval", coordinates: [0, 2] },
    };
    const inverted = invertPatch(patch);
    expect(inverted.type).toBe("updateGeometry");
    if (inverted.type === "updateGeometry") {
      expect(inverted.from.coordinates).toEqual([0, 2]);
      expect(inverted.to.coordinates).toEqual([0, 1]);
    }
  });
});

describe("commandInversePatches", () => {
  it("reverses patch order", () => {
    const command: HistoryCommand = {
      id: "1",
      label: "Bulk",
      patches: [
        { type: "addTaskTag", tag: { key: "a", value: "1" } },
        { type: "addTaskTag", tag: { key: "b", value: "2" } },
      ],
    };
    const inverse = commandInversePatches(command);
    expect(inverse[0].type).toBe("removeTaskTag");
    expect(inverse[1].type).toBe("removeTaskTag");
  });
});

describe("patchLabel", () => {
  it("returns a label for each patch type", () => {
    const snapshot = sampleSea(1);
    expect(
      patchLabel({ type: "createSoundEvent", token: "t", snapshot }),
    ).toBe("Create sound event");
    expect(
      patchLabel({ type: "deleteSoundEvent", token: "t", snapshot }),
    ).toBe("Delete sound event");
    expect(
      patchLabel({
        type: "updateGeometry",
        token: "t",
        from: snapshot.geometry,
        to: snapshot.geometry,
      }),
    ).toBe("Move sound event");
    expect(
      patchLabel({
        type: "addSoundEventTag",
        token: "t",
        tag: { key: "a", value: "b" },
      }),
    ).toBe("Add tag");
    expect(
      patchLabel({
        type: "removeSoundEventTag",
        token: "t",
        tag: { key: "a", value: "b" },
      }),
    ).toBe("Remove tag");
    expect(patchLabel({ type: "addTaskTag", tag: { key: "a", value: "b" } })).toBe(
      "Add task tag",
    );
    expect(
      patchLabel({ type: "removeTaskTag", tag: { key: "a", value: "b" } }),
    ).toBe("Remove task tag");
  });
});

describe("trimUndoStack", () => {
  it("keeps the most recent commands", () => {
    expect(trimUndoStack([1, 2, 3], 2)).toEqual([2, 3]);
  });

  it("returns the stack unchanged when within the limit", () => {
    const stack = ["a", "b"];
    expect(trimUndoStack(stack, MAX_UNDO_STACK)).toBe(stack);
  });

  it("trims to max undo stack size used in production", () => {
    const stack = Array.from({ length: MAX_UNDO_STACK + 5 }, (_, i) => i);
    const trimmed = trimUndoStack(stack, MAX_UNDO_STACK);
    expect(trimmed).toHaveLength(MAX_UNDO_STACK);
    expect(trimmed[0]).toBe(5);
    expect(trimmed[trimmed.length - 1]).toBe(MAX_UNDO_STACK + 4);
  });
});
