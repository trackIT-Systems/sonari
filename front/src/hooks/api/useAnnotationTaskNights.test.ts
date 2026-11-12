import { describe, expect, it } from "vitest";

import { nightOfRecording } from "@/hooks/api/useAnnotationTaskNights";

const at = (date: string, time: string | null) => ({ date: new Date(`${date}T00:00:00Z`), time });

describe("nightOfRecording", () => {
  it("runs from noon to noon, named by its evening", () => {
    expect(nightOfRecording(at("2026-06-14", "21:00:00"), 0)).toBe("2026-06-14");
    expect(nightOfRecording(at("2026-06-15", "02:00:00"), 0)).toBe("2026-06-14");
    expect(nightOfRecording(at("2026-06-15", "11:59:59"), 0)).toBe("2026-06-14");
    expect(nightOfRecording(at("2026-06-15", "12:00:00"), 0)).toBe("2026-06-15");
  });

  it("follows the UTC offset, like the server", () => {
    // 11:30 UTC is 13:30 at UTC+2: past noon, so the next night
    expect(nightOfRecording(at("2026-06-15", "11:30:00"), 120)).toBe("2026-06-15");
    // 13:00 UTC is 08:00 at UTC-5: still the night before
    expect(nightOfRecording(at("2026-06-15", "13:00:00"), -300)).toBe("2026-06-14");
  });

  it("counts a recording without a time as midnight, and without a date as no night", () => {
    expect(nightOfRecording(at("2026-06-15", null), 0)).toBe("2026-06-14");
    expect(nightOfRecording({ date: "2026-06-15", time: "13:00:00.5" }, 0)).toBe("2026-06-15");
    expect(nightOfRecording({ date: null, time: null }, 0)).toBeNull();
    expect(nightOfRecording(undefined, 0)).toBeNull();
  });
});
