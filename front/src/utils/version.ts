/**
 * Version check utility for cache invalidation on app updates.
 * Clears localStorage and browser caches when a new version is detected.
 */

import releaseNotesByTag from "@/data/releaseNotes.json";

/** Baked at build time: git tag in Docker CI (`NEXT_PUBLIC_APP_VERSION`), else git describe / package.json locally. */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

export type ReleaseNotesHighlight = {
  title: string;
  description?: string;
};

export type ReleaseNotesEntry = {
  highlights: ReleaseNotesHighlight[];
};
const VERSION_KEY = "sonari-app-version";
const STORAGE_KEY = "sonari-storage";

/**
 * Check if the app version has changed and clear all caches if so.
 * @returns true if a reload is needed (old version existed and was different)
 */
export function checkVersionAndClearCaches(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storedVersion = localStorage.getItem(VERSION_KEY);

    if (storedVersion !== APP_VERSION) {
      // Clear Zustand persisted storage
      localStorage.removeItem(STORAGE_KEY);

      // Update stored version
      localStorage.setItem(VERSION_KEY, APP_VERSION);

      // Clear browser caches if available (for service workers, etc.)
      if ("caches" in window) {
        caches
          .keys()
          .then((names) => names.forEach((name) => caches.delete(name)));
      }

      // Return true to indicate reload needed (only if old version existed)
      // First-time visitors shouldn't be reloaded
      return storedVersion !== null;
    }
  } catch {
    // localStorage might be unavailable (private browsing, etc.)
  }

  return false;
}

/**
 * Get the current app version.
 */
export function getAppVersion(): string {
  return APP_VERSION;
}

/**
 * First two dot-separated segments (e.g. YYYY.MM from YYYY.MM.patch).
 */
export function getAppVersionShort(): string {
  const parts = APP_VERSION.split(".");
  if (parts.length >= 2) {
    return `${parts[0]}.${parts[1]}`;
  }
  return APP_VERSION;
}

/**
 * Normalize build version to a release tag (e.g. git describe `2026.9.6-5-gabc` → `2026.9.6`).
 */
export function getReleaseTag(version: string = APP_VERSION): string {
  const describeSuffix = version.search(/-\d+-g/);
  if (describeSuffix !== -1) {
    return version.slice(0, describeSuffix);
  }
  return version;
}

/**
 * Compact sidebar label derived from the release tag (Docker image tag in production),
 * not from package.json alone. CalVer tags `YYYY.M.patch` render as `M.patch`.
 */
export function getSidebarVersionLabel(version: string = APP_VERSION): string {
  const tag = getReleaseTag(version);
  const parts = tag.split(".");
  if (parts.length >= 3 && /^\d{4}$/.test(parts[0])) {
    return `${parts[1]}.${parts[2]}`;
  }
  return tag.length > 7 ? tag.slice(-7) : tag;
}

export function getReleaseNotes(tag?: string): ReleaseNotesEntry | null {
  const releaseTag = tag ?? getReleaseTag();
  const entry = (releaseNotesByTag as Record<string, ReleaseNotesEntry>)[
    releaseTag
  ];
  return entry ?? null;
}

