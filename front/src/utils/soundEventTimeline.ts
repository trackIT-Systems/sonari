/**
 * A task's sound events after each edit session, from their versions.
 *
 * Every edit session that changes an event first copies its state into a version (see
 * the backend's sound_event_history). An event's states are therefore its versions,
 * oldest first, then the live event (unless it was deleted). Each version knows the
 * session that replaced it, each state the session that produced it, so the state
 * after any session can be read off directly:
 *
 * - Step 0 is the import: what existed before the first recorded session. GUANO
 *   versions (detector predictions read for edits from before versions existed) show
 *   only here.
 * - Step k is the state after the k-th session, oldest first; the last step is now.
 *
 * The change log is the difference between consecutive steps.
 */
import type { SoundEventTaskHistory, SoundEventVersion } from "@/api/annotation_tasks";
import type { Geometry, SoundEventAnnotation, Tag } from "@/types";

export type Bounds = {
  start: number;
  end: number;
  low: number | null;
  high: number | null;
};

export type TimelineTag = Tag & { confidence?: number | null };

export type TimelineEvent = {
  /** Sound event id; negative for GUANO predictions whose event was already gone. */
  id: number;
  geometry: Geometry;
  tags: TimelineTag[];
  /** Owner of this state, e.g. the detector for an import. */
  createdBy: string | null;
  fromGuano: boolean;
};

export type TimelineState = Map<number, TimelineEvent>;

export type TimelineStep = {
  kind: "import" | "edit";
  editId: string | null;
  /** When the session started; null for the import. */
  time: Date | null;
  username: string | null;
  state: TimelineState;
};

/** How an event at a past step differs from now. */
export type TimelineMark =
  | { status: "unchanged" }
  | { status: "changed"; geometryChanged: boolean; tagsChanged: boolean; now: Geometry }
  | { status: "removed_later" };

export type TimelinePreview = {
  /** Events of the step, shaped like sound events so tags and boxes draw as usual. */
  soundEventAnnotations: SoundEventAnnotation[];
  marks: Map<number, TimelineMark>;
  /** Geometries of events that exist now but not yet at this step. */
  addedLater: Geometry[];
};

/** One line of the change log. */
export type TimelineChange = {
  eventId: number;
  text: string;
};

const TOLERANCE = 1e-6;

function collectPoints(coordinates: unknown, into: [number, number][]): [number, number][] {
  if (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    into.push([coordinates[0], coordinates[1]]);
  } else if (Array.isArray(coordinates)) {
    for (const item of coordinates) collectPoints(item, into);
  }
  return into;
}

/** Start, end, and low/high frequency for shapes that have one. */
export function geometryBounds(geometry: Geometry): Bounds {
  switch (geometry.type) {
    case "BoundingBox": {
      const [start, low, end, high] = geometry.coordinates as number[];
      return { start, end, low, high };
    }
    case "TimeInterval": {
      const [start, end] = geometry.coordinates as number[];
      return { start, end, low: null, high: null };
    }
    case "TimeStamp": {
      const time = geometry.coordinates as number;
      return { start: time, end: time, low: null, high: null };
    }
    default: {
      const all = collectPoints(geometry.coordinates, []);
      const times = all.map(([t]) => t);
      const freqs = all.map(([, f]) => f);
      return {
        start: Math.min(...times),
        end: Math.max(...times),
        low: Math.min(...freqs),
        high: Math.max(...freqs),
      };
    }
  }
}

function close(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= TOLERANCE;
}

export function sameBounds(a: Bounds, b: Bounds): boolean {
  return close(a.start, b.start) && close(a.end, b.end) && close(a.low, b.low) && close(a.high, b.high);
}

const tagKey = (tag: Tag) => `${tag.key}\u0000${tag.value}`;

function sameTags(a: Tag[], b: Tag[]): boolean {
  const keys = new Set(a.map(tagKey));
  return a.length === b.length && b.every((t) => keys.has(tagKey(t)));
}

function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}

export function formatBounds(bounds: Bounds): string {
  const time = `${bounds.start.toFixed(2)}–${bounds.end.toFixed(2)} s`;
  if (bounds.low == null || bounds.high == null) return time;
  return `${time}, ${formatFrequency(bounds.low)}–${formatFrequency(bounds.high)}`;
}

export function formatTags(tags: TimelineTag[]): string {
  if (tags.length === 0) return "No tags";
  return tags
    .map((tag) =>
      tag.confidence != null ? `${tag.value} (${Math.round(tag.confidence * 100)} %)` : tag.value,
    )
    .join(", ");
}

// Replacing species tags with their group is a relabel, so these keys pair with each other.
const LABEL_KEYS = new Set(["species", "group"]);

function pairable(a: string, b: string): boolean {
  return a === b || (LABEL_KEYS.has(a) && LABEL_KEYS.has(b));
}

/** A state of one event, valid from step `from` until before step `until`. */
type Span = { event: TimelineEvent; from: number; until: number };

type Session = { editId: string; time: Date; username: string | null };

function versionEvent(version: SoundEventVersion, id: number): TimelineEvent {
  return {
    id,
    geometry: version.geometry as Geometry,
    tags: version.tags.map((t) => ({ key: t.key, value: t.value, confidence: t.confidence })),
    createdBy: version.created_by_username ?? null,
    fromGuano: version.version_reason === "guano",
  };
}

/** Oldest first; GUANO versions describe the import, so they come before everything. */
function versionOrder(a: SoundEventVersion, b: SoundEventVersion): number {
  const guano = Number(b.version_reason === "guano") - Number(a.version_reason === "guano");
  return guano || a.superseded_on.getTime() - b.superseded_on.getTime() || a.id - b.id;
}

/** All steps from the import to now; the last step is the current state. */
export function buildTimeline(current: SoundEventAnnotation[], history: SoundEventTaskHistory): TimelineStep[] {
  const liveById = new Map(history.live.map((l) => [l.id, l]));

  // States per event: versions oldest first, then the live event.
  const lineages = new Map<number, SoundEventVersion[]>();
  for (const version of history.versions) {
    const id = version.version_of_id ?? -version.id;
    const list = lineages.get(id) ?? [];
    list.push(version);
    lineages.set(id, list);
  }
  for (const event of current) if (!lineages.has(event.id)) lineages.set(event.id, []);
  lineages.forEach((list) => list.sort(versionOrder));

  // Sessions: those that replaced a state, and those that created an event.
  const sessions = new Map<string, Session>();
  const note = (editId: string | null | undefined, time: Date, username: string | null | undefined) => {
    if (editId == null) return;
    const known = sessions.get(editId);
    if (known == null || time < known.time) {
      sessions.set(editId, { editId, time, username: username ?? known?.username ?? null });
    }
  };
  for (const version of history.versions) {
    note(version.superseded_edit_id, version.superseded_on, version.superseded_by_username);
  }
  lineages.forEach((versions, id) => {
    const first = versions[0] ?? liveById.get(id);
    if (first != null) note(first.edit_id, first.created_on, first.created_by_username);
  });
  const ordered = Array.from(sessions.values()).sort(
    (a, b) => a.time.getTime() - b.time.getTime() || a.editId.localeCompare(b.editId),
  );
  const stepOf = new Map(ordered.map((s, index) => [s.editId, index + 1]));
  // With only GUANO versions there is no session: the import and now still differ.
  const lastStep = Math.max(ordered.length, 1);

  const spans: Span[] = [];
  const currentById = new Map(current.map((e) => [e.id, e]));
  lineages.forEach((versions, id) => {
    const live = currentById.get(id);
    const first = versions[0] ?? liveById.get(id);
    let from = first?.edit_id != null ? stepOf.get(first.edit_id) ?? 0 : 0;
    for (const version of versions) {
      // GUANO versions and versions without a known session end with the import.
      const until =
        version.superseded_edit_id != null ? stepOf.get(version.superseded_edit_id) ?? 1 : 1;
      if (until > from) spans.push({ event: versionEvent(version, id), from, until });
      from = Math.max(from, until);
    }
    if (live != null) {
      spans.push({
        event: {
          id,
          geometry: live.geometry,
          tags: (live.tags ?? []).map((t) => ({ key: t.key, value: t.value })),
          createdBy: liveById.get(id)?.created_by_username ?? null,
          fromGuano: false,
        },
        from: Math.min(from, lastStep),
        until: Infinity,
      });
    }
  });

  const stateAt = (step: number): TimelineState => {
    const state: TimelineState = new Map();
    for (const span of spans) {
      if (span.from <= step && step < span.until) state.set(span.event.id, span.event);
    }
    return state;
  };

  const steps: TimelineStep[] = [
    { kind: "import", editId: null, time: null, username: null, state: stateAt(0) },
  ];
  for (let step = 1; step <= lastStep; step++) {
    const session = ordered[step - 1];
    steps.push({
      kind: "edit",
      editId: session?.editId ?? null,
      time: session?.time ?? null,
      username: session?.username ?? null,
      state: stateAt(step),
    });
  }
  return steps;
}

/** What a step changed, compared with the step before. */
export function describeStep(before: TimelineState, after: TimelineState): TimelineChange[] {
  const changes: TimelineChange[] = [];
  const ids = Array.from(new Set([...Array.from(before.keys()), ...Array.from(after.keys())])).sort(
    (a, b) => a - b,
  );
  for (const id of ids) {
    const old = before.get(id);
    const now = after.get(id);
    if (old === now) continue;
    if (old == null && now != null) {
      changes.push({ eventId: id, text: `Created: ${formatTags(now.tags)} (${formatBounds(geometryBounds(now.geometry))})` });
      continue;
    }
    if (old != null && now == null) {
      changes.push({ eventId: id, text: `Deleted: ${formatTags(old.tags)}` });
      continue;
    }
    if (old == null || now == null) continue;

    const oldBounds = geometryBounds(old.geometry);
    const newBounds = geometryBounds(now.geometry);
    if (!sameBounds(oldBounds, newBounds)) {
      changes.push({ eventId: id, text: `Box ${formatBounds(oldBounds)} → ${formatBounds(newBounds)}` });
    }
    const removed = old.tags.filter((t) => !now.tags.some((n) => tagKey(n) === tagKey(t)));
    const added = now.tags.filter((t) => !old.tags.some((o) => tagKey(o) === tagKey(t)));
    for (const tag of removed) {
      const index = added.findIndex((a) => pairable(tag.key, a.key));
      if (index >= 0) {
        const [replacement] = added.splice(index, 1);
        const label =
          tag.key === replacement.key
            ? `${tag.key}: ${tag.value} → ${replacement.value}`
            : `${tag.key}: ${tag.value} → ${replacement.key}: ${replacement.value}`;
        changes.push({ eventId: id, text: label });
      } else {
        changes.push({ eventId: id, text: `Removed ${tag.key}: ${tag.value}` });
      }
    }
    for (const tag of added) changes.push({ eventId: id, text: `Added ${tag.key}: ${tag.value}` });
  }
  return changes;
}

/** The events of a step and how they differ from the current ones. */
export function previewStep(
  step: TimelineStep,
  current: SoundEventAnnotation[],
  annotationTask: { id: number; recording_id: number },
): TimelinePreview {
  const now = new Map(current.map((e) => [e.id, e]));
  const marks = new Map<number, TimelineMark>();
  const soundEventAnnotations: SoundEventAnnotation[] = [];

  step.state.forEach((event) => {
    const existing = now.get(event.id);
    if (existing == null) {
      marks.set(event.id, { status: "removed_later" });
    } else {
      const geometryChanged = !sameBounds(geometryBounds(event.geometry), geometryBounds(existing.geometry));
      const tagsChanged = !sameTags(event.tags, existing.tags ?? []);
      marks.set(
        event.id,
        geometryChanged || tagsChanged
          ? { status: "changed", geometryChanged, tagsChanged, now: existing.geometry }
          : { status: "unchanged" },
      );
    }
    soundEventAnnotations.push({
      ...(existing ?? {
        annotation_task_id: annotationTask.id,
        recording_id: annotationTask.recording_id,
        created_by_id: "",
        features: [],
        created_on: step.time ?? new Date(0),
      }),
      id: event.id,
      geometry: event.geometry,
      geometry_type: event.geometry.type,
      tags: event.tags.map((t) => ({ key: t.key, value: t.value })),
    } as SoundEventAnnotation);
  });

  const addedLater = current.filter((e) => !step.state.has(e.id)).map((e) => e.geometry);
  return { soundEventAnnotations, marks, addedLater };
}
