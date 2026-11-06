import { describe, expect, it } from "vitest";

import type { SoundEventLiveState, SoundEventTaskHistory, SoundEventVersion } from "@/api/annotation_tasks";
import type { SoundEventAnnotation } from "@/types";

import { buildTimeline, describeStep, geometryBounds, previewStep } from "./soundEventTimeline";

const T0 = new Date("2026-11-04T10:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
type Box = [number, number, number, number];

function event(id: number, box: Box, tags: string[]): SoundEventAnnotation {
  return {
    id,
    annotation_task_id: 1,
    recording_id: 1,
    geometry_type: "BoundingBox",
    geometry: { type: "BoundingBox", coordinates: box },
    created_by_id: "00000000-0000-0000-0000-000000000000",
    tags: tags.map((value) => ({ key: "species", value })),
    created_on: T0,
  } as SoundEventAnnotation;
}

let nextId = 1000;
function version(
  of: number | null,
  box: Box,
  tags: string[],
  overrides: Partial<SoundEventVersion> = {},
): SoundEventVersion {
  return {
    id: nextId++,
    version_of_id: of,
    annotation_task_id: 1,
    geometry_type: "BoundingBox",
    geometry: { type: "BoundingBox", coordinates: box },
    tags: tags.map((value) => ({ key: "species", value, confidence: 0.9 })),
    created_on: T0,
    superseded_on: at(1),
    version_reason: "edited",
    ...overrides,
  } as SoundEventVersion;
}

function live(id: number, editId: string | null, createdOn = T0): SoundEventLiveState {
  return { id, edit_id: editId, created_on: createdOn };
}

function history(versions: SoundEventVersion[], liveStates: SoundEventLiveState[]): SoundEventTaskHistory {
  return { annotation_task_id: 1, versions, live: liveStates };
}

const ids = (step: { state: Map<number, unknown> }) => Array.from(step.state.keys()).sort((a, b) => a - b);
const values = (step: { state: Map<number, { tags: { value: string }[] }> }, id: number) =>
  step.state.get(id)?.tags.map((t) => t.value);

describe("sound event timeline", () => {
  it("shows each session's result for an imported event", () => {
    const current = [event(10, [1, 1000, 2, 2000], ["Apus"])];
    const steps = buildTimeline(
      current,
      history(
        [
          version(10, [1, 1000, 1.5, 2000], ["Delichon"], { superseded_edit_id: "a", superseded_on: at(1) }),
          version(10, [1, 1000, 1.5, 2000], ["Apus"], { edit_id: "a", superseded_edit_id: "b", superseded_on: at(5) }),
        ],
        [live(10, "b")],
      ),
    );

    expect(steps.map((s) => s.kind)).toEqual(["import", "edit", "edit"]);
    expect(values(steps[0], 10)).toEqual(["Delichon"]);
    expect(values(steps[1], 10)).toEqual(["Apus"]);
    expect(geometryBounds(steps[1].state.get(10)!.geometry).end).toBe(1.5);
    expect(steps[2].state.get(10)!.geometry).toBe(current[0].geometry);
    expect(describeStep(steps[0].state, steps[1].state).map((c) => c.text)).toEqual(["species: Delichon → Apus"]);
    expect(describeStep(steps[1].state, steps[2].state).map((c) => c.text)).toEqual([
      "Box 1.00–1.50 s, 1.0 kHz–2.0 kHz → 1.00–2.00 s, 1.0 kHz–2.0 kHz",
    ]);
  });

  it("adds events from the session that created them and drops deleted ones", () => {
    const current = [event(20, [3, 500, 4, 900], ["Myotis"])];
    const steps = buildTimeline(
      current,
      history(
        [version(10, [1, 1, 2, 2], ["Pipistrellus"], { superseded_edit_id: "a", superseded_on: at(1), version_reason: "deleted" })],
        [live(20, "b", at(3))],
      ),
    );

    expect(steps.map(ids)).toEqual([[10], [], [20]]);
    expect(describeStep(steps[0].state, steps[1].state).map((c) => c.text)).toEqual(["Deleted: Pipistrellus (90 %)"]);
    expect(describeStep(steps[1].state, steps[2].state)[0].text).toMatch(/^Created: Myotis/);
  });

  it("shows GUANO predictions at the import only, and marks the difference to now", () => {
    const current = [event(10, [1, 1, 2, 2], ["Apus"]), event(11, [5, 1, 6, 2], ["Apus"])];
    const steps = buildTimeline(
      current,
      history(
        [
          version(10, [1, 1, 2.5, 2], ["Apus"], { version_reason: "guano", superseded_edit_id: null }),
          version(null, [8, 1, 9, 2], ["Hirundo"], { version_reason: "guano", superseded_edit_id: null }),
        ],
        [live(10, null), live(11, null)],
      ),
    );

    expect(steps.map((s) => s.kind)).toEqual(["import", "edit"]);
    const orphan = ids(steps[0]).find((id) => id < 0)!;
    expect(ids(steps[0])).toEqual([orphan, 10, 11]);
    expect(ids(steps[1])).toEqual([10, 11]);

    const preview = previewStep(steps[0], current, { id: 1, recording_id: 1 });
    expect(preview.marks.get(10)).toMatchObject({ status: "changed", geometryChanged: true, tagsChanged: false });
    expect(preview.marks.get(11)).toEqual({ status: "unchanged" });
    expect(preview.marks.get(orphan)).toEqual({ status: "removed_later" });
    expect(preview.addedLater).toEqual([]);
  });

  it("orders sessions by time, also when the creating session has no version", () => {
    const current = [event(10, [1, 1, 2, 2], ["A"]), event(11, [3, 1, 4, 2], ["B"])];
    const steps = buildTimeline(
      current,
      history(
        // 11 was drawn in session "x" at minute 2 and changed in "y" at minute 4.
        [version(11, [3, 1, 3.5, 2], ["B"], { edit_id: "x", created_on: at(2), superseded_edit_id: "y", superseded_on: at(4) })],
        [live(10, null), live(11, "y", at(2))],
      ),
    );
    expect(steps.map((s) => s.editId)).toEqual([null, "x", "y"]);
    expect(steps.map(ids)).toEqual([[10], [10, 11], [10, 11]]);
  });
});
