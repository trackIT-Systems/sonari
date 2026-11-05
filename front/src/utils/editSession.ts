import type { AxiosInstance } from "axios";

/**
 * Edit sessions group sound event edits in the server-side history.
 *
 * Every edit is still saved immediately. Edits sent with the same session id are merged
 * per sound event into their net effect (several resizes become one box change, removing
 * A and adding B becomes "A -> B"). A session lasts while one event is in edit mode; a
 * grouped action such as "Replace tags" on many events gets its own session.
 */

export const EDIT_ID_HEADER = "X-Sonari-Edit-Id";

/** Requests that change sound events and therefore carry the session id. */
const EDIT_PATHS = [
  "/api/v1/sound_event_annotations/",
  "/api/v1/annotation_tasks/bulk/sound_event_tags/",
  "/api/v1/annotation_tasks/bulk/sound_events/",
];

let currentEditId: string | null = null;

export function startEditSession(): string {
  currentEditId = crypto.randomUUID();
  return currentEditId;
}

export function endEditSession(): void {
  currentEditId = null;
}

export function getEditSession(): string | null {
  return currentEditId;
}

/** Run `fn` in a fresh session, then go back to the session that was active before. */
export async function withEditSession<T>(fn: () => Promise<T>): Promise<T> {
  const previous = currentEditId;
  const id = startEditSession();
  try {
    return await fn();
  } finally {
    // Don't clobber a session that was started while `fn` ran.
    if (currentEditId === id) currentEditId = previous;
  }
}

export function isEditRequest(method: string | undefined, url: string | undefined): boolean {
  if (!url || !method || method.toLowerCase() === "get") return false;
  return EDIT_PATHS.some((path) => url.startsWith(path));
}

export function setupEditSessionInterceptor(instance: AxiosInstance) {
  instance.interceptors.request.use((config) => {
    if (currentEditId && isEditRequest(config.method, config.url)) {
      config.headers.set(EDIT_ID_HEADER, currentEditId);
    }
    return config;
  });
}
