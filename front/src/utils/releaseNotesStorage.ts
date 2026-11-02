const SEEN_KEY_PREFIX = "sonari-release-notes-seen";

export function getReleaseNotesSeenKey(userId: string): string {
  return `${SEEN_KEY_PREFIX}:${userId}`;
}

export function getSeenReleaseTag(userId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(getReleaseNotesSeenKey(userId));
  } catch {
    return null;
  }
}

export function setSeenReleaseTag(userId: string, tag: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(getReleaseNotesSeenKey(userId), tag);
  } catch {
    // localStorage might be unavailable
  }
}
