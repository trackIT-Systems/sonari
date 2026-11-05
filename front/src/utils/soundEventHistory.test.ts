import { describe, expect, it } from "vitest";

import type { SoundEventChange } from "@/api/annotation_tasks";

import { describeChange, groupChangesByEdit } from "./soundEventHistory";

function change(overrides: Partial<SoundEventChange>): SoundEventChange {
  return {
    id: 1,
    annotation_task_id: 1,
    sound_event_annotation_id: 10,
    edit_id: "a",
    action: "tag_added",
    created_on: new Date("2026-11-04T10:00:00Z"),
    ...overrides,
  } as SoundEventChange;
}

describe("sound event history", () => {
  it("groups changes by edit session, newest session first", () => {
    const groups = groupChangesByEdit([
      change({ id: 1, edit_id: "a", created_on: new Date("2026-11-04T10:00:00Z") }),
      change({ id: 2, edit_id: "b", created_on: new Date("2026-11-04T11:00:00Z") }),
      change({
        id: 3,
        edit_id: "a",
        created_on: new Date("2026-11-04T10:01:00Z"),
        updated_on: new Date("2026-11-04T12:00:00Z"),
      }),
    ]);
    expect(groups.map((g) => g.editId)).toEqual(["a", "b"]);
    expect(groups[0].changes.map((c) => c.id)).toEqual([1, 3]);
  });

  it("describes replacements, with the key only once when it doesn't change", () => {
    expect(
      describeChange(
        change({
          action: "tag_replaced",
          old_tag_key: "species",
          old_tag_value: "Pipistrellus pipistrellus",
          new_tag_key: "species",
          new_tag_value: "Pipistrellus pygmaeus",
        }),
      ),
    ).toBe("species: Pipistrellus pipistrellus → Pipistrellus pygmaeus");
    expect(
      describeChange(
        change({
          action: "tag_replaced",
          old_tag_key: "species",
          old_tag_value: "Nyctalus noctula",
          new_tag_key: "group",
          new_tag_value: "Nyctaloid",
        }),
      ),
    ).toBe("species: Nyctalus noctula → group: Nyctaloid");
  });

  it("describes box changes in seconds and kHz", () => {
    expect(
      describeChange(
        change({
          action: "geometry_changed",
          old_start_time: 0.5,
          old_end_time: 1.5,
          old_low_freq: 20000,
          old_high_freq: 45000,
          new_start_time: 0.6,
          new_end_time: 1.4,
          new_low_freq: 21000,
          new_high_freq: 44000,
        }),
      ),
    ).toBe("Box 0.50–1.50 s, 20.0 kHz–45.0 kHz → 0.60–1.40 s, 21.0 kHz–44.0 kHz");
  });
});
