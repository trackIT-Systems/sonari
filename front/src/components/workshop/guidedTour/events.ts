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
  "spectrogram-toggled",
  "sound-events-toggled",
  "fullscreen-toggled",
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
