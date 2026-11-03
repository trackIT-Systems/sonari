/**
 * Read the filename from a Content-Disposition header.
 *
 * Prefers the RFC 5987 `filename*=utf-8''...` form (sent for non-ASCII names)
 * and otherwise takes `filename=`, quoted or bare. The surrounding quotes are
 * not part of the name; a browser saving `rec.wav"` turns it into `rec.wav_`.
 */
export function filenameFromContentDisposition(
  header: unknown,
): string | null {
  if (typeof header !== "string") return null;

  const extended = header.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (extended) {
    try {
      return decodeURIComponent(extended[2].trim());
    } catch {
      // Malformed encoding: fall back to the plain parameter.
    }
  }

  const quoted = header.match(/filename\s*=\s*"((?:\\.|[^"\\])*)"/i);
  if (quoted) return quoted[1].replace(/\\(.)/g, "$1");

  const bare = header.match(/filename\s*=\s*([^;]+)/i);
  if (bare) return bare[1].trim() || null;

  return null;
}
