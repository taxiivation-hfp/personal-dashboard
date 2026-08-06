// Google Calendar (Phase 2) — OAuth 2.0 + Calendar v3 over raw REST (no SDK).
// Single-user: tokens live in google_oauth_tokens (one row, id=1). Access tokens are
// auto-refreshed from the stored refresh_token. Keep the Google Cloud app in "Testing"
// mode with yourself as a test user (skips verification).

import type { Client } from "./db/client";
import { getDb } from "./db/client";
import { dayBoundsRFC3339, rfc3339, addDays, APP_TZ } from "./dates";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

const clientId = () => process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || "";
const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback";

export const googleConfigured = () => Boolean(clientId() && clientSecret());

export type CalEvent = {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  /**
   * Google's palette id for the event.
   *
   * NULL when the event uses the calendar's DEFAULT colour — Google omits the field
   * entirely for those rather than sending an id, and "default" is a real tier in
   * src/lib/productivity.ts, not an absence. Do not collapse it to a string.
   *
   * It costs nothing to ask for: neither request sends a `fields=` mask, so this has
   * always been in the response and was simply being dropped by the map below.
   */
  colorId: string | null;
};

// ---- OAuth ----

export function getAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${p.toString()}`;
}

export async function exchangeCode(db: Client, code: string): Promise<void> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${t.error_description || t.error || res.status}`);
  const expiry = Date.now() + (Number(t.expires_in) || 3600) * 1000;
  await db.execute({
    sql: `INSERT INTO google_oauth_tokens (id, access_token, refresh_token, scope, token_type, expiry, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
          ON CONFLICT(id) DO UPDATE SET access_token=excluded.access_token,
            refresh_token=COALESCE(excluded.refresh_token, google_oauth_tokens.refresh_token),
            scope=excluded.scope, token_type=excluded.token_type, expiry=excluded.expiry,
            updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    args: [t.access_token, t.refresh_token ?? null, t.scope ?? null, t.token_type ?? null, expiry],
  });
}

export async function isConnected(db: Client): Promise<boolean> {
  const r = await db.execute("SELECT 1 FROM google_oauth_tokens WHERE id=1");
  return r.rows.length > 0;
}

export async function disconnect(db: Client): Promise<void> {
  // Actually revoke the grant at Google, not just forget it locally.
  const r = await db.execute("SELECT refresh_token, access_token FROM google_oauth_tokens WHERE id=1");
  const tok = r.rows[0]?.refresh_token ?? r.rows[0]?.access_token;
  if (tok) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: String(tok) }),
      });
    } catch {} // best-effort — token may already be invalid
  }
  await db.execute("DELETE FROM google_oauth_tokens WHERE id=1");
}

async function validAccessToken(db: Client): Promise<string> {
  const r = await db.execute("SELECT access_token, refresh_token, expiry FROM google_oauth_tokens WHERE id=1");
  if (!r.rows.length) throw new Error("not_connected");
  const row = r.rows[0] as Record<string, unknown>;
  const expiry = Number(row.expiry);
  if (Date.now() < expiry - 60_000) return String(row.access_token);

  const refresh = row.refresh_token == null ? null : String(row.refresh_token);
  if (!refresh) throw new Error("not_connected"); // expired, no refresh token → reconnect
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const t = await res.json();
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      await disconnect(db); // refresh token revoked → drop creds
      throw new Error("not_connected"); // so getCalendarForDate degrades to {connected:false}
    }
    throw new Error(`token refresh failed: ${t.error_description || t.error || res.status}`);
  }
  const newExpiry = Date.now() + (Number(t.expires_in) || 3600) * 1000;
  await db.execute({
    sql: "UPDATE google_oauth_tokens SET access_token=?, expiry=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=1",
    args: [t.access_token, newExpiry],
  });
  return String(t.access_token);
}

async function api(db: Client, path: string, init?: RequestInit) {
  const token = await validAccessToken(db);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`calendar api ${res.status}: ${body.slice(0, 200)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ---- Calendar ----

export async function listEvents(db: Client, date: string): Promise<CalEvent[]> {
  const { timeMin, timeMax } = dayBoundsRFC3339(date);
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  const data = await api(db, `/calendars/primary/events?${q.toString()}`);
  return (data?.items ?? []).map((e: Record<string, unknown>) => {
    const start = e.start as { dateTime?: string; date?: string } | undefined;
    const end = e.end as { dateTime?: string; date?: string } | undefined;
    return {
      id: String(e.id),
      summary: String(e.summary ?? "(busy)"),
      start: start?.dateTime ?? start?.date ?? null,
      end: end?.dateTime ?? end?.date ?? null,
      allDay: Boolean(start?.date && !start?.dateTime),
      colorId: e.colorId == null ? null : String(e.colorId),
    };
  });
}

/**
 * Events across a date range, grouped by local date.
 *
 * The 7-day adherence strip needs this. Computing history from block_marks alone would
 * silently inflate it: a past day with three blocks where only one was marked adhered
 * would read 100%, because the two you never marked wouldn't be in the denominator.
 * One range request is also far cheaper than seven per-day calls.
 */
export async function listEventsRange(db: Client, fromDate: string, toDate: string): Promise<Map<string, CalEvent[]>> {
  const { timeMin } = dayBoundsRFC3339(fromDate);
  const { timeMax } = dayBoundsRFC3339(toDate);
  const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const data = await api(db, `/calendars/primary/events?${q.toString()}`);
  const byDate = new Map<string, CalEvent[]>();
  for (const e of (data?.items ?? []) as Record<string, unknown>[]) {
    const start = e.start as { dateTime?: string; date?: string } | undefined;
    const end = e.end as { dateTime?: string; date?: string } | undefined;
    const startsAt = start?.dateTime ?? start?.date ?? null;
    if (!startsAt) continue;
    // Bucket by the LOCAL date, not the UTC one — an 09:00 Melbourne block is the
    // previous day in UTC and would land on the wrong strip segment.
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startsAt));
    const ev: CalEvent = {
      id: String(e.id),
      summary: String(e.summary ?? "(busy)"),
      start: startsAt,
      end: end?.dateTime ?? end?.date ?? null,
      allDay: Boolean(start?.date && !start?.dateTime),
      colorId: e.colorId == null ? null : String(e.colorId),
    };
    const list = byDate.get(localDate) ?? [];
    list.push(ev);
    byDate.set(localDate, list);
  }
  return byDate;
}

export async function getCalendarRange(
  fromDate: string,
  toDate: string
): Promise<{ connected: boolean; byDate: Map<string, CalEvent[]> }> {
  if (!googleConfigured()) return { connected: false, byDate: new Map() };
  const db = await getDb();
  if (!(await isConnected(db))) return { connected: false, byDate: new Map() };
  try {
    return { connected: true, byDate: await listEventsRange(db, fromDate, toDate) };
  } catch {
    return { connected: false, byDate: new Map() };
  }
}

type EventInput = { summary: string; date: string; timeStart: string; timeEnd?: string | null; description?: string };

// End of a timed event as an instant, rolling to the next day when it crosses midnight,
// so the end is never before the start (Google rejects end <= start with 400).
function endInstant(date: string, startHHMM: string, timeEnd?: string | null): { date: string; time: string } {
  if (timeEnd) return { date: timeEnd <= startHHMM ? addDays(date, 1) : date, time: timeEnd };
  const [h, m] = startHHMM.split(":").map(Number);
  const total = h * 60 + m + 30; // default 30-min block
  const t = total % 1440;
  return {
    date: total >= 1440 ? addDays(date, 1) : date,
    time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
  };
}

function eventBody(ev: EventInput) {
  const end = endInstant(ev.date, ev.timeStart, ev.timeEnd);
  return {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: rfc3339(ev.date, ev.timeStart), timeZone: APP_TZ },
    end: { dateTime: rfc3339(end.date, end.time), timeZone: APP_TZ },
  };
}

export async function insertEvent(db: Client, ev: EventInput): Promise<string> {
  const data = await api(db, "/calendars/primary/events", { method: "POST", body: JSON.stringify(eventBody(ev)) });
  return String(data.id);
}

export async function updateEvent(db: Client, eventId: string, ev: EventInput): Promise<void> {
  try {
    await api(db, `/calendars/primary/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify(eventBody(ev)),
    });
  } catch (e) {
    const st = (e as { status?: number }).status;
    if (st !== 404 && st !== 410) throw e; // already gone is fine
  }
}

export async function deleteEvent(db: Client, eventId: string): Promise<void> {
  try {
    await api(db, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  } catch (e) {
    const st = (e as { status?: number }).status;
    if (st !== 404 && st !== 410) throw e; // already gone is fine
  }
}

/** After a task edit: patch its pushed Google event (or remove it if un-time-blocked). Best-effort, never throws. */
export async function syncTaskEvent(db: Client, taskId: number): Promise<void> {
  const t = await db.execute({
    sql: "SELECT title, date, time_start, time_end, calendar_event_id FROM tasks WHERE id=?",
    args: [taskId],
  });
  const row = t.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.calendar_event_id == null) return;
  const eventId = String(row.calendar_event_id);
  if (row.time_start == null) {
    // task no longer has a time block → drop the orphaned event and unlink
    try {
      await deleteEvent(db, eventId);
    } catch {}
    await db.execute({ sql: "UPDATE tasks SET calendar_event_id=NULL WHERE id=?", args: [taskId] });
    return;
  }
  try {
    await updateEvent(db, eventId, {
      summary: String(row.title),
      date: String(row.date),
      timeStart: String(row.time_start),
      timeEnd: row.time_end == null ? null : String(row.time_end),
      description: "Synced from your daily-guide coach",
    });
  } catch {}
}

/**
 * A calendar failure must never take the whole app down.
 *
 * Google rejecting the token — revoked access, changed password, a consent screen still
 * in Testing mode expiring it — is a BROKEN CONNECTION, not a server error. Treated as
 * such, the day still renders with adherence, rings, goals, skills, non-negotiables and
 * the journal intact, and the screen offers to reconnect. Treated as a throw, a dashboard
 * whose entire point is daily use goes blank because one integration hiccuped.
 *
 * 403 counts too: that is what a revoked scope looks like.
 */
function isAuthFailure(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  return String(e).includes("not_connected") || status === 401 || status === 403;
}

/** Convenience for routes/coach: ready-to-use db + connected check. */
export async function getCalendarForDate(date: string): Promise<{ connected: boolean; configured: boolean; events: CalEvent[] }> {
  if (!googleConfigured()) return { connected: false, configured: false, events: [] };
  const db = await getDb();
  if (!(await isConnected(db))) return { connected: false, configured: true, events: [] };
  try {
    return { connected: true, configured: true, events: await listEvents(db, date) };
  } catch (e) {
    if (isAuthFailure(e)) {
      console.error("[google] calendar auth failed — reconnect at /api/google/connect:", String(e).slice(0, 160));
      return { connected: false, configured: true, events: [] };
    }
    throw e;
  }
}
