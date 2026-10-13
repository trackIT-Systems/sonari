import { useEffect, useRef } from "react";

/**
 * Tiny event bus so app components can report user actions to the guided tour
 * coach without depending on it. Emitting is a no-op when no tour is listening.
 */
export const GUIDED_TOUR_EVENTS = [
  "sound-event-created",
  "sound-event-deleted",
  "sound-event-selected",
  "sound-event-updated",
  "tag-replaced",
  "sound-event-tag-added",
  "sound-event-tag-removed",
  "task-tag-added",
  "status-badge-added",
  "view-panned",
  "view-zoomed",
  "time-interval-selected",
  "undo",
  "redo",
  /** Shown again after being hidden (h). */
  "spectrogram-shown",
  /** Shown again after being hidden (Shift+h). */
  "sound-events-shown",
  /** Full page view closed again (w). */
  "fullscreen-exited",
  "settings-closed",
  "shortcuts-closed",
  "pending-filter-included",
  "note-created",
  "playback-started",
  "playback-speed-changed",
] as const;

export type GuidedTourEvent = (typeof GUIDED_TOUR_EVENTS)[number];

const EVENT_NAME = "sonari:guided-tour";

export function emitGuidedTourEvent(event: GuidedTourEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GuidedTourEvent>(EVENT_NAME, { detail: event }));
}

export function subscribeGuidedTourEvents(
  listener: (event: GuidedTourEvent) => void,
): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<GuidedTourEvent>).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/**
 * Emit `event` whenever `value` changes to `target`, e.g. when the spectrogram
 * is shown again after being hidden. Never fires for the initial value.
 */
export function useGuidedTourReturnEvent(value: boolean, target: boolean, event: GuidedTourEvent): void {
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current !== value && value === target) emitGuidedTourEvent(event);
    previous.current = value;
  }, [value, target, event]);
}

/**
 * Set by the coach while the current lesson still has unfinished steps; the
 * annotate page checks it before accepting a status badge (which advances to
 * the next lesson).
 */
let lessonBlocking = false;

export function setGuidedTourLessonBlocking(blocking: boolean): void {
  lessonBlocking = blocking;
}

export function isGuidedTourLessonBlocking(): boolean {
  return lessonBlocking;
}
