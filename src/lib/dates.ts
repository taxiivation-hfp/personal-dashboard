// All "days" in the app are local Australia/Melbourne dates, computed here so the
// server and any future cron jobs agree regardless of host timezone.

export const APP_TZ = process.env.APP_TZ || "Australia/Melbourne";

/** Today's date as 'YYYY-MM-DD' in the app timezone. */
export function todayISO(tz: string = APP_TZ): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a real 'YYYY-MM-DD' calendar date (rejects e.g. 2026-13-45, 2026-02-30). */
export function isISODate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Shift a 'YYYY-MM-DD' by n days (UTC math on the date parts — safe for date-only). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Whole days from `a` to `b` (i.e. b − a). Negative when `b` is earlier.
 *
 * UTC math on the date parts, exactly as addDays does — a millisecond subtraction on
 * parsed LOCAL dates would be off by one across a DST transition, and Melbourne has two
 * a year.
 */
export function daysBetween(a: string, b: string): number {
  const utc = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** The app-tz UTC offset for a given date, e.g. "+11:00" (DST-aware). */
export function tzOffset(date: string, tz: string = APP_TZ): string {
  const dt = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(dt);
  const v = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = v.match(/GMT([+-])(\d{2}):?(\d{2})/);
  return m ? `${m[1]}${m[2]}:${m[3]}` : "+00:00";
}

/** RFC3339 day bounds for a date in the app tz (for Google Calendar timeMin/timeMax). */
export function dayBoundsRFC3339(
  date: string,
  tz: string = APP_TZ,
): { timeMin: string; timeMax: string } {
  const off = tzOffset(date, tz);
  return {
    timeMin: `${date}T00:00:00${off}`,
    timeMax: `${date}T23:59:59${off}`,
  };
}

/** RFC3339 instant for a date + 'HH:MM' in the app tz (for creating timed events). */
export function rfc3339(
  date: string,
  time: string,
  tz: string = APP_TZ,
): string {
  return `${date}T${time.length === 5 ? time + ":00" : time}${tzOffset(date, tz)}`;
}

/**
 * How long ago an instant was, in words: "just now", "47m ago", "4h ago", "3d ago".
 *
 * `now` is passed in rather than read, for the reason every other pure thing in this file
 * gives: a function that reads the clock cannot be tested and cannot be rendered twice
 * with the same answer. Returns null for anything unparseable or absent, so a caller
 * always has to say out loud what "no reading" looks like rather than getting a plausible
 * "0m ago" for a push that never happened.
 *
 * DELIBERATELY TIMEZONE-FREE. The gap between two instants is the same number of minutes
 * in Melbourne and in UTC, so a timezone here would be a parameter that changed nothing.
 * The app timezone matters to the health log in the place it actually bites — which DAY a
 * push belongs to, decided by todayISO() in the route — and to `stampInAppTz` below, which
 * is the one part of this that prints a clock.
 *
 * Coarse ON PURPOSE. "47m" and "4h" are the two facts worth having: is this number from
 * this hour, or is it from this morning. "3h 12m ago" is a precision nobody acts on.
 */
export function sinceLabel(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  // Clamped at zero. A clock skew between the database host and the phone can put a
  // stamp a few seconds in the future, and "in 4 seconds" is a bug report, not a label.
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** An instant as a plain day and clock time in the app timezone — "Sat 9 Aug, 6:12 am".
 *  For the hover title behind a relative label: "4h ago" is what you read, and this is
 *  what you check when 4h ago matters. */
export function stampInAppTz(iso: string, tz: string = APP_TZ): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(t);
}

/** A friendly heading like "Friday, 19 June". */
export function prettyDate(iso: string, tz: string = APP_TZ): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
