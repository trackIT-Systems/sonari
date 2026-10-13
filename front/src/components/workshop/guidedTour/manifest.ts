import raw from "@/data/guidedTourSteps.json";

import {
  guidedTourManifestSchema,
  type GuidedTourLesson,
  type GuidedTourVariant,
  type GuidedTourVariantManifest,
} from "./types";

const manifest = guidedTourManifestSchema.parse(raw);

export function tourTargetSelector(target: string): string {
  return `[data-guided-tour="${target}"]`;
}

export function getVariantManifest(
  variant: GuidedTourVariant,
): GuidedTourVariantManifest | null {
  return manifest[variant] ?? null;
}

export function getTasksTabLesson(variant: GuidedTourVariant): GuidedTourLesson | null {
  return getVariantManifest(variant)?.tasksTab ?? null;
}

export function getAnnotateLesson(
  variant: GuidedTourVariant,
  lessonIndex: number,
): GuidedTourLesson | null {
  const lessons = getVariantManifest(variant)?.lessons ?? [];
  if (lessonIndex < 0 || lessonIndex >= lessons.length) {
    return null;
  }
  return lessons[lessonIndex] ?? null;
}

const KEY_ALIASES: Record<string, string> = {
  Space: " ",
  "←": "ArrowLeft",
  "→": "ArrowRight",
  "↑": "ArrowUp",
  "↓": "ArrowDown",
  Esc: "Escape",
};

/** Whether a keyboard event matches a manifest shortcut like "z", "Shift+h" or "Space". */
export function matchesShortcut(shortcut: string, event: KeyboardEvent): boolean {
  const parts = shortcut.split("+");
  const rawKey = parts.length > 1 && parts[parts.length - 1] === "" ? "+" : parts.pop()!;
  const modifiers = new Set(parts.filter(Boolean).map((m) => m.toLowerCase()));
  const key = KEY_ALIASES[rawKey] ?? rawKey;

  const shift = modifiers.has("shift");
  if (modifiers.has("ctrl") !== (event.ctrlKey || event.metaKey)) return false;
  if (modifiers.has("alt") !== event.altKey) return false;

  if (key.length === 1) {
    // Printable keys: Shift is part of the character ("?" or "H"), so only an
    // explicit Shift+ modifier relaxes case.
    if (shift) return event.shiftKey && event.key.toLowerCase() === key.toLowerCase();
    return event.key === key;
  }
  return shift === event.shiftKey && event.key === key;
}

/** Human-readable label for a manifest key ("ArrowLeft" → "←", " " → "Space"). */
export function formatKeyLabel(shortcut: string): string {
  const labels: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Escape: "Esc",
  };
  return shortcut
    .split("+")
    .map((part) => labels[part] ?? part)
    .join(" + ");
}
