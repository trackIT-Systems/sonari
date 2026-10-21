import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatKeyLabel,
  getAnnotateLesson,
  getTasksTabLesson,
  getTasksTabLessons,
  pickTasksTabLesson,
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
    expect(getAnnotateLesson("bat", 9)?.id).toBe("wrap-up");
  });

  it.each([
    ["bat", 9],
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
    // 10 template tasks: a task without a lesson leaves the user without
    // instructions and without "Finish tour" (resume lands there).
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
      "practice-2",
      "wrap-up",
    ]);
  });

  it("only uses known icons and complete key markup in lesson texts", () => {
    for (const variant of ["bat", "bird"] as const) {
      const manifest = getVariantManifest(variant)!;
      for (const lesson of [...getTasksTabLessons(variant), ...manifest.lessons]) {
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
      for (const lesson of [...getTasksTabLessons(variant), ...manifest.lessons]) {
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

  it("hands over to every later Tasks-tab lesson from an annotate lesson step", () => {
    for (const variant of ["bat", "bird"] as const) {
      const manifest = getVariantManifest(variant)!;
      const lessonIds = manifest.lessons.map((l) => l.id);
      for (const tasksLesson of manifest.tasksTabLessons ?? []) {
        // Offered only after an existing annotate lesson ...
        expect(lessonIds, `${variant}/${tasksLesson.id}`).toContain(tasksLesson.availableAfter);
        // ... and required by a later one, before its status badge step.
        const owner = manifest.lessons.find((l) =>
          l.steps.some((s) => s.complete?.type === "lesson" && s.complete.lesson === tasksLesson.id),
        );
        expect(owner, `${variant}/${tasksLesson.id} is never required`).toBeTruthy();
        expect(lessonIds.indexOf(owner!.id)).toBeGreaterThan(lessonIds.indexOf(tasksLesson.availableAfter!));
      }
    }
    expect(getTasksTabLessons("bat").map((l) => l.id)).toEqual(["tasks-table", "tasks-bulk"]);
  });

  it("picks the first available, unfinished Tasks-tab lesson", () => {
    const lessons = getTasksTabLessons("bat");
    const pick = (done: string[]) => pickTasksTabLesson(lessons, (id) => done.includes(id))?.id;
    expect(pick([])).toBe("tasks-table");
    // Table lesson done, bulk lesson not yet offered: the table lesson stays.
    expect(pick(["tasks-table"])).toBe("tasks-table");
    expect(pick(["tasks-table", "sound-events"])).toBe("tasks-bulk");
    expect(pick(["tasks-table", "sound-events", "tasks-bulk"])).toBe("tasks-bulk");
  });

  it("matches shortcuts", () => {
    expect(matchesShortcut("z", key({ key: "z" }))).toBe(true);
    expect(matchesShortcut("z", key({ key: "u" }))).toBe(false);
    expect(matchesShortcut("Shift+h", key({ key: "H", shiftKey: true }))).toBe(true);
    expect(matchesShortcut("Shift+h", key({ key: "h" }))).toBe(false);
    expect(matchesShortcut("Space", key({ key: " " }))).toBe(true);
    expect(matchesShortcut("ArrowLeft", key({ key: "ArrowLeft" }))).toBe(true);
    expect(matchesShortcut("?", key({ key: "?", shiftKey: true }))).toBe(true);
    expect(matchesShortcut("Ctrl++", key({ key: "+", ctrlKey: true }))).toBe(true);
    expect(matchesShortcut("Ctrl++", key({ key: "+" }))).toBe(false);
    expect(matchesShortcut("Ctrl+-", key({ key: "-", ctrlKey: true }))).toBe(true);
    expect(matchesShortcut("ArrowDown", key({ key: "ArrowDown", shiftKey: true }))).toBe(false);
  });

  it("formats key labels", () => {
    expect(formatKeyLabel("ArrowLeft")).toBe("←");
    expect(formatKeyLabel("Shift+h")).toBe("Shift + h");
  });
});
