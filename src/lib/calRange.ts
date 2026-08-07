// Date-range arithmetic for the calendar cache. PURE — no DB, no network, zero imports, so
// this runs under `node --test` with no dependencies.
//
// It is separated from google.ts for one reason: a mistake in here is SILENT. Serve a
// narrower cached range as though it covered a wider request and the app shows fewer events
// than the calendar holds, with no error anywhere — a day that looks empty because of a
// string comparison. That is worth a test file of its own.
//
// Every date is an ISO `YYYY-MM-DD`, which is why plain string comparison is a date
// comparison here: no parsing, no Date object, and no timezone to get wrong.

/** A cache key: two ISO dates, inclusive at both ends. */
export const rangeKey = (from: string, to: string): string => `${from}..${to}`;

/**
 * Does the cached range `entry` cover every day of the request?
 *
 * INCLUSIVE at both ends, matching how the range is fetched. Off by one here means the first
 * or last day of a window silently loses its events.
 */
export function covers(entry: string, from: string, to: string): boolean {
  const parts = entry.split("..");
  if (parts.length !== 2) return false;
  const [a, b] = parts as [string, string];
  // A malformed or reversed entry covers nothing. Better to re-fetch than to serve a window
  // that was never really held.
  if (!a || !b || a > b) return false;
  if (from > to) return false;
  return a <= from && b >= to;
}

/**
 * The days of `wide` that fall inside [from, to].
 *
 * Rebuilt rather than shared: a caller that received the cache's own map could mutate it and
 * poison every later read from the same entry.
 */
export function sliceByDate<T>(
  wide: Map<string, T>,
  from: string,
  to: string,
): Map<string, T> {
  const out = new Map<string, T>();
  for (const [d, v] of wide) {
    if (d >= from && d <= to) out.set(d, v);
  }
  return out;
}
