import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatKeyLabel,
  getAnnotateLesson,
  getTasksTabLesson,
  getVariantManifest,
  matchesShortcut,
  tourTargetSelector,
} from "./manifest";
import { TOUR_ICONS, iconNamesIn } from "./TourText";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !name.endsWith(".test.tsx") ? [path] : [];
  });
}

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", init);
}

describe("guided tour manifest", () => {
  it("builds target selectors", () => {
    expect(tourTargetSelector("spectrogram")).toBe('[data-guided-tour="spectrogram"]');
  });

  it("loads bat tasks tab and lessons", () => {
    const tab = getTasksTabLesson("bat");
    expect(tab?.id).toBe("tasks-table");
    expect(tab?.steps.length).toBeGreaterThan(0);

    const orientation = getAnnotateLesson("bat", 0);
    expect(orientation?.id).toBe("orientation");

    const practice = getAnnotateLesson("bat", 7);
    expect(practice?.id).toBe("practice");
  });

  it.each([
    ["bat", 8],
    ["bird", 9],
  ] as const)("ends every %s lesson except the last with a status badge step", (variant, count) => {
    const lessons = Array.from({ length: count }, (_, i) => getAnnotateLesson(variant, i)!);
    for (const lesson of lessons) {
      const last = lesson.steps[lesson.steps.length - 1];
      expect(last.complete).toEqual({ type: "event", event: "status-badge-added" });
    }
  });

  it("has one bird lesson per template task", () => {
    const ids = getVariantManifest("bird")!.lessons.map((l) => l.id);
    // Position matters: lesson i runs on template task i. Sound events and tags
    // lessons reference the events of their task (e.g. the "this: is wrong" tag).
    expect(ids).toEqual([
      "orientation",
      "playback",
      "pan",
      "zoom",
      "sound-events",
      "tags",
      "replace-tags",
      "spectrogram-settings",
      "practice",
      "wrap-up",
    ]);
  });

  it("has one bat lesson per template task", () => {
    const ids = getVariantManifest("bat")!.lessons.map((l) => l.id);
    expect(ids).toEqual([
      "orientation",
      "playback",
      "pan",
      "zoom",
      "sound-events",
      "tags",
      "spectrogram-settings",
      "practice",
      "wrap-up",
    ]);
  });

  it("only uses known icons and complete key markup in lesson texts", () => {
    for (const variant of ["bat", "bird"] as const) {
      const manifest = getVariantManifest(variant)!;
      for (const lesson of [manifest.tasksTab, ...manifest.lessons]) {
        const texts = [lesson.intro ?? "", ...lesson.steps.flatMap((s) => [s.hint ?? "", s.task ?? ""])];
        for (const text of texts) {
          for (const name of iconNamesIn(text)) {
            expect(Object.keys(TOUR_ICONS), `${variant}/${lesson.id}: ${name}`).toContain(name);
          }
          expect((text.match(/`/g) ?? []).length % 2, `${variant}/${lesson.id}: ${text}`).toBe(0);
        }
      }
    }
  });

  it("only targets anchors that exist in the app", () => {
    const anchors = new Set<string>();
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      for (const m of Array.from(
        readFileSync(file, "utf8").matchAll(/data-guided-tour="([a-z-]+)"/g),
      )) {
        anchors.add(m[1]);
      }
    }
    for (const variant of ["bat", "bird"] as const) {
      const manifest = getVariantManifest(variant)!;
      for (const lesson of [manifest.tasksTab, ...manifest.lessons]) {
        for (const step of lesson.steps) {
          expect(anchors, `${variant}/${lesson.id}: ${step.title}`).toContain(step.target);
        }
      }
    }
  });

  it("requires the tasks table lesson before the first status badge", () => {
    for (const variant of ["bat", "bird"] as const) {
      const manifest = getVariantManifest(variant)!;
      const required = manifest.lessons[0].steps.find((s) => s.complete?.type === "lesson");
      expect(required?.complete).toEqual({ type: "lesson", lesson: manifest.tasksTab.id });
      const steps = manifest.lessons[0].steps;
      expect(steps.indexOf(required!)).toBeLessThan(steps.length - 1);
    }
  });

  it("matches shortcuts", () => {
    expect(matchesShortcut("z", key({ key: "z" }))).toBe(true);
    expect(matchesShortcut("z", key({ key: "u" }))).toBe(false);
    expect(matchesShortcut("Shift+h", key({ key: "H", shiftKey: true }))).toBe(true);
    expect(matchesShortcut("Shift+h", key({ key: "h" }))).toBe(false);
    expect(matchesShortcut("Space", key({ key: " " }))).toBe(true);
    expect(matchesShortcut("ArrowLeft", key({ key: "ArrowLeft" }))).toBe(true);
    expect(matchesShortcut("?", key({ key: "?", shiftKey: true }))).toBe(true);
    expect(matchesShortcut("ArrowDown", key({ key: "ArrowDown", shiftKey: true }))).toBe(false);
  });

  it("formats key labels", () => {
    expect(formatKeyLabel("ArrowLeft")).toBe("←");
    expect(formatKeyLabel("Shift+h")).toBe("Shift + h");
  });
});
