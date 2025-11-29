/**
 * Version check utility for cache invalidation on app updates.
 * Clears localStorage and browser caches when a new version is detected.
 */

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";
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

