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
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
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
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(dt);
  const v = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = v.match(/GMT([+-])(\d{2}):?(\d{2})/);
  return m ? `${m[1]}${m[2]}:${m[3]}` : "+00:00";
}

/** RFC3339 day bounds for a date in the app tz (for Google Calendar timeMin/timeMax). */
export function dayBoundsRFC3339(date: string, tz: string = APP_TZ): { timeMin: string; timeMax: string } {
  const off = tzOffset(date, tz);
  return { timeMin: `${date}T00:00:00${off}`, timeMax: `${date}T23:59:59${off}` };
}

/** RFC3339 instant for a date + 'HH:MM' in the app tz (for creating timed events). */
export function rfc3339(date: string, time: string, tz: string = APP_TZ): string {
  return `${date}T${time.length === 5 ? time + ":00" : time}${tzOffset(date, tz)}`;
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
