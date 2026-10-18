// Google Calendar (Phase 2) — OAuth 2.0 + Calendar v3 over raw REST (no SDK).
// Single-user: tokens live in google_oauth_tokens (one row, id=1). Access tokens are
// auto-refreshed from the stored refresh_token. The Google Cloud app is published to
// production but left unverified (personal use): in "Testing" refresh tokens expire after 7 days.

import type { Client } from "./db/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { covers, rangeKey, sliceByDate } from "./calRange";
import { getDb, isLocalDatabase } from "./db/client";
import { dayBoundsRFC3339, APP_TZ } from "./dates";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

const clientId = () => process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || "";

export const googleConfigured = () => Boolean(clientId() && clientSecret());

/**
 * The OAuth callback URL, DERIVED FROM THE REQUEST — never from configuration.
 *
 * This was `process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/..."`, and that
 * fallback is a trapdoor rather than a default. A deployment that simply never set the
 * variable did not fail: it built a perfectly valid consent screen and handed Google a
 * redirect to LOCALHOST, so pressing Connect on the live site sent the owner's browser to
 * their own laptop. On 2026-08-14 that laptop happened to have a dev server running, which
 * answered the callback and rejected it as `badstate` — the live site's state lives in a
 * different database — so the only symptom was "it connected to localhost". With nothing on
 * port 3000 it would have read as a dead link instead. Neither says "an env var is missing".
 *
 * It was also configuration that could not be right in two places at once: `fly.toml` set a
 * fly.dev value that would have been just as wrong on Vercel, and one variable cannot name
 * two origins. Deriving it deletes the question. The redirect must return to the origin the
 * consent was started from — there is no deployment where you want it to land anywhere else —
 * so the request already carries the only correct answer.
 *
 * `x-forwarded-*` FIRST because both Vercel and Fly terminate TLS at a proxy and forward
 * plain HTTP inland: `req.url` says `http://` on a real HTTPS visit, and an `http://` redirect
 * URI does not match the `https://` one registered with Google. Same reasoning as
 * `isSecureRequest` in auth.ts, which needs the scheme for the session cookie.
 *
 * GOOGLE_REDIRECT_URI is still honoured, but ONLY when it names this very origin — an
 * override for a proxy this cannot read, never a way to point one host at another. A stale
 * value is ignored rather than obeyed, which is the whole bug above.
 *
 * The URL must still be registered in Google Cloud Console; Google matches it exactly and
 * nothing here can waive that.
 */
export function callbackUrl(req: Request): string {
  const first = (h: string | null) => (h ? h.split(",")[0].trim() : "");
  const proto = first(req.headers.get("x-forwarded-proto"));
  const host = first(req.headers.get("x-forwarded-host"));

  let origin: string;
  try {
    const u = new URL(req.url);
    origin = `${proto || u.protocol.replace(":", "")}://${host || u.host}`;
  } catch {
    origin = `${proto || "http"}://${host || "localhost:3000"}`;
  }

  const configured = process.env.GOOGLE_REDIRECT_URI || "";
  if (configured) {
    try {
      if (new URL(configured).origin === origin) return configured;
    } catch {} // unparseable config is ignored, not thrown — Connect must still work
  }
  return `${origin}/api/google/callback`;
}

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
  // `recurring` (from Google's recurringEventId) is gone with its only reader, the Social
  // ring — parked verbatim in archive/social/google.ts.md.
};

/**
 * One Google Calendar event resource -> a CalEvent, or null when it has no start.
 *
 * The ONE mapping, shared by the live reads and the dev fixture below, so a fixture file is
 * written in exactly the shape Google returns and can never exercise a different path.
 */
export function toCalEvent(e: Record<string, unknown>): CalEvent | null {
  const start = e.start as { dateTime?: string; date?: string } | undefined;
  const end = e.end as { dateTime?: string; date?: string } | undefined;
  const startsAt = start?.dateTime ?? start?.date ?? null;
  if (!startsAt) return null;
  return {
    id: String(e.id),
    summary: String(e.summary ?? "(busy)"),
    start: startsAt,
    end: end?.dateTime ?? end?.date ?? null,
    allDay: Boolean(start?.date && !start?.dateTime),
    colorId: e.colorId == null ? null : String(e.colorId),
  };
}

/** The LOCAL date an event starts on — its bucket. An 09:00 Melbourne block is the previous
 *  day in UTC and would land on the wrong day otherwise. An all-day event's bare date is
 *  already a local day and is kept as it is. */
function localStartDate(startsAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(startsAt)) return startsAt;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(startsAt));
}

/** Group event resources by local start date, keeping only [fromDate, toDate]. */
function bucketByDate(
  items: Record<string, unknown>[],
  fromDate: string,
  toDate: string,
): Map<string, CalEvent[]> {
  const byDate = new Map<string, CalEvent[]>();
  for (const item of items) {
    const ev = toCalEvent(item);
    if (!ev) continue;
    const localDate = localStartDate(ev.start!);
    if (localDate < fromDate || localDate > toDate) continue;
    const list = byDate.get(localDate) ?? [];
    list.push(ev);
    byDate.set(localDate, list);
  }
  return byDate;
}

// ---- Dev-only calendar fixture ----

/**
 * A LOCAL CALENDAR for development, so the blocks list can be seen without Google — the
 * Health & Career pivot spec, §10.
 *
 * Honoured ONLY when all three hold: NODE_ENV is not "production", the database this process
 * writes to is a LOCAL FILE, and `DEV_CALENDAR_FIXTURE` names a JSON file (relative to the
 * project root, or absolute). The file holds Google event resources, either as
 * `{ "items": [...] }` — the shape the Events API returns — or as a bare array. While it is
 * on, `getCalendarForDate` and `getCalendarRange` read it instead of Google and report
 * `connected: true`; writes to Google are untouched.
 *
 * THE DATABASE CONDITION IS THE POINT, not belt and braces. A fixture event is markable:
 * tapping Adhered on one writes a `block_marks` row keyed to an invented event id. Gated on
 * NODE_ENV alone, `DEV_CALENDAR_FIXTURE=… npm run dev` — or that line added to `.env.local`,
 * the natural place to put it — would serve fabricated blocks while writing to PRODUCTION
 * Turso, because `.env.local` on this machine has pointed `DATABASE_URL` there before
 * (2026-09-03, CLAUDE.md). Marks keyed to events no calendar has would then sit in the live
 * database for good. Paired to a `file:` database they cannot be made at all.
 *
 * Ignoring the variable is SAID, once per process, rather than done quietly: a fixture that
 * silently does nothing reads as a broken fixture, and the next move is to try harder to turn
 * it on. The sanctioned command already satisfies both conditions.
 *
 * Read fresh on every call (no cache), so editing the file shows on the next request. With
 * the variable unset — and always in production — nothing here runs and behaviour is exactly
 * what it was.
 */
let fixtureWarned = false;

function devFixturePath(): string | null {
  const p = process.env.DEV_CALENDAR_FIXTURE;
  if (!p) return null;
  if (process.env.NODE_ENV === "production" || !isLocalDatabase()) {
    if (!fixtureWarned) {
      fixtureWarned = true;
      console.warn(
        `DEV_CALENDAR_FIXTURE is set but IGNORED: it is honoured only outside production ` +
          `and only against a file: database (DATABASE_URL is ` +
          `"${process.env.DATABASE_URL ?? "unset"}"). Fake events must never be markable ` +
          `into Turso. Run: DATABASE_URL=file:./data/pivot.db NEXT_DIST_DIR=.next-build/pivot npx next dev -p 3001`,
      );
    }
    return null;
  }
  return resolve(process.cwd(), p);
}

function readFixture(path: string): Record<string, unknown>[] {
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  const items = Array.isArray(data)
    ? data
    : ((data as { items?: unknown } | null)?.items ?? []);
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

// ---- OAuth ----

export function getAuthUrl(state: string, redirect: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${p.toString()}`;
}

/**
 * `redirect` MUST be byte-identical to the one sent to getAuthUrl — Google compares the
 * two and answers `redirect_uri_mismatch` if they differ. Both call sites derive it from
 * their own request via callbackUrl(), and the two requests are the same browser on the
 * same origin, so they agree by construction rather than by two places being kept in step.
 */
export async function exchangeCode(
  db: Client,
  code: string,
  redirect: string,
): Promise<void> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  const t = await res.json();
  if (!res.ok)
    throw new Error(
      `token exchange failed: ${t.error_description || t.error || res.status}`,
    );
  const expiry = Date.now() + (Number(t.expires_in) || 3600) * 1000;
  await db.execute({
    sql: `INSERT INTO google_oauth_tokens (id, access_token, refresh_token, scope, token_type, expiry, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
          ON CONFLICT(id) DO UPDATE SET access_token=excluded.access_token,
            refresh_token=COALESCE(excluded.refresh_token, google_oauth_tokens.refresh_token),
            scope=excluded.scope, token_type=excluded.token_type, expiry=excluded.expiry,
            updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    args: [
      t.access_token,
      t.refresh_token ?? null,
      t.scope ?? null,
      t.token_type ?? null,
      expiry,
    ],
  });
}

export async function isConnected(db: Client): Promise<boolean> {
  const r = await db.execute("SELECT 1 FROM google_oauth_tokens WHERE id=1");
  return r.rows.length > 0;
}

export async function disconnect(db: Client): Promise<void> {
  // Otherwise the app keeps serving a disconnected account's events until the TTL expires.
  clearCalendarCache();
  // Actually revoke the grant at Google, not just forget it locally.
  const r = await db.execute(
    "SELECT refresh_token, access_token FROM google_oauth_tokens WHERE id=1",
  );
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

/**
 * A usable access token, refreshing when the stored one has expired.
 *
 * `force` skips the expiry check and refreshes regardless. It exists because the expiry
 * timestamp is a PREDICTION, not a fact: Google can invalidate a token well before it runs
 * out — re-consenting, a revoked grant, or a superseded session all do it. Trusting the
 * timestamp alone meant a token that Google had already rejected was handed out again on
 * every request, forever, and since each reconnect wrote a fresh one-hour expiry,
 * reconnecting could not clear it either. See the 401 retry in api().
 */
async function validAccessToken(db: Client, force = false): Promise<string> {
  const r = await db.execute(
    "SELECT access_token, refresh_token, expiry FROM google_oauth_tokens WHERE id=1",
  );
  if (!r.rows.length) throw new Error("not_connected");
  const row = r.rows[0] as Record<string, unknown>;
  const expiry = Number(row.expiry);
  if (!force && Date.now() < expiry - 60_000) return String(row.access_token);

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
    throw new Error(
      `token refresh failed: ${t.error_description || t.error || res.status}`,
    );
  }
  const newExpiry = Date.now() + (Number(t.expires_in) || 3600) * 1000;
  await db.execute({
    sql: "UPDATE google_oauth_tokens SET access_token=?, expiry=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=1",
    args: [t.access_token, newExpiry],
  });
  return String(t.access_token);
}

async function api(db: Client, path: string, init?: RequestInit) {
  const call = async (token: string) =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init?.headers || {}),
      },
    });

  let res = await call(await validAccessToken(db));

  // ONE retry on 401, with a forced refresh.
  //
  // The stored expiry is a prediction, not a fact — Google invalidates tokens early when a
  // grant is re-consented or superseded, and the app has no way to be told. Without this
  // retry a single dead-but-unexpired token bricks the integration permanently: every
  // request presents it, every request 401s, and reconnecting only writes a fresh expiry
  // for an equally dead token. That is exactly what happened on 2026-08-06.
  //
  // Only once, and only on 401: a 403 is a scope or quota problem that refreshing cannot
  // fix, and retrying it would just double the failed calls.
  if (res.status === 401) {
    res = await call(await validAccessToken(db, true));
  }

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(
      `calendar api ${res.status}: ${body.slice(0, 200)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// ---- Calendar ----

export async function listEvents(
  db: Client,
  date: string,
): Promise<CalEvent[]> {
  const { timeMin, timeMax } = dayBoundsRFC3339(date);
  const q = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const data = await api(db, `/calendars/primary/events?${q.toString()}`);
  return ((data?.items ?? []) as Record<string, unknown>[])
    .map(toCalEvent)
    .filter((e): e is CalEvent => e != null);
}

/**
 * Events across a date range, grouped by local date.
 *
 * The 7-day adherence strip needs this. Computing history from block_marks alone would
 * silently inflate it: a past day with three blocks where only one was marked adhered
 * would read 100%, because the two you never marked wouldn't be in the denominator.
 * One range request is also far cheaper than seven per-day calls.
 */
/**
 * A VERY SHORT-LIVED CACHE over the calendar, and it exists for one measured reason.
 *
 * Marking a single block fires four requests: the write, then /api/today, /api/adherence and
 * /api/rings to refresh. The write is 27ms. The other three are ~300ms each, and all of that
 * is one Google round trip apiece — so the app's most repeated action, the one tapped a dozen
 * times a day, was asking Google for the same events three times over inside one second.
 *
 * Fifteen seconds is chosen to be shorter than any human edit loop: long enough that one
 * user action shares a single fetch, far too short to hide a calendar change you just made
 * and came back to look at. It is per-process and in-memory, so it dies with the server and
 * cannot go stale across a deploy.
 *
 * It caches SUCCESS ONLY. An auth failure or an outage must be retried immediately — caching
 * a failure would turn a five-second blip into fifteen seconds of an app that says the
 * calendar is disconnected.
 */
const CAL_TTL_MS = 15_000;
const calCache = new Map<string, { at: number; value: Map<string, CalEvent[]> }>();

/** Exposed so a write through this module can drop what it just invalidated. */
export function clearCalendarCache(): void {
  calCache.clear();
}

async function cachedRange(
  db: Client,
  fromDate: string,
  toDate: string,
): Promise<Map<string, CalEvent[]>> {
  const key = rangeKey(fromDate, toDate);
  const now = Date.now();

  const exact = calCache.get(key);
  if (exact && now - exact.at < CAL_TTL_MS) return exact.value;

  /**
   * A WIDER cached range serves a narrower request.
   *
   * Today asks for three different spans on one load — one day for the day's blocks, seven
   * for the strip, fourteen for the rings and the sparkline. Keyed exactly, that is three
   * Google calls for events that overlap almost entirely. The fortnight contains both of the
   * others, so once any of them has been fetched the rest are free.
   *
   * Slicing is safe because listEventsRange groups by date and a day's events do not depend
   * on how wide a window they arrived in. The result is rebuilt rather than shared, so a
   * caller cannot mutate the cache through the map it was handed.
   */
  for (const [entryKey, entry] of calCache) {
    if (now - entry.at >= CAL_TTL_MS) continue;
    if (!covers(entryKey, fromDate, toDate)) continue;
    return sliceByDate(entry.value, fromDate, toDate);
  }

  const value = await listEventsRange(db, fromDate, toDate);

  // Drop what has expired before adding. Nothing here ever removed an entry, and the key is
  // a date range — so a server left running for weeks accumulated one entry per distinct
  // span per anchor date and never gave any of it back. Sweeping on insert costs a walk of
  // a map that is a handful of entries in practice, and bounds it by construction.
  for (const [k, v] of calCache) {
    if (now - v.at >= CAL_TTL_MS) calCache.delete(k);
  }
  calCache.set(key, { at: now, value });
  return value;
}

export async function listEventsRange(
  db: Client,
  fromDate: string,
  toDate: string,
): Promise<Map<string, CalEvent[]>> {
  const { timeMin } = dayBoundsRFC3339(fromDate);
  const { timeMax } = dayBoundsRFC3339(toDate);
  const q = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const data = await api(db, `/calendars/primary/events?${q.toString()}`);
  // Bucketed by the LOCAL start date, not the UTC one — see bucketByDate.
  return bucketByDate(
    (data?.items ?? []) as Record<string, unknown>[],
    fromDate,
    toDate,
  );
}

export async function getCalendarRange(
  fromDate: string,
  toDate: string,
): Promise<{ connected: boolean; byDate: Map<string, CalEvent[]> }> {
  const fixture = devFixturePath();
  if (fixture)
    return {
      connected: true,
      byDate: bucketByDate(readFixture(fixture), fromDate, toDate),
    };
  if (!googleConfigured()) return { connected: false, byDate: new Map() };
  const db = await getDb();
  if (!(await isConnected(db))) return { connected: false, byDate: new Map() };
  try {
    return {
      connected: true,
      byDate: await cachedRange(db, fromDate, toDate),
    };
  } catch {
    return { connected: false, byDate: new Map() };
  }
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
  return (
    String(e).includes("not_connected") || status === 401 || status === 403
  );
}

/** Convenience for routes/coach: ready-to-use db + connected check. */
export async function getCalendarForDate(
  date: string,
): Promise<{ connected: boolean; configured: boolean; events: CalEvent[] }> {
  const fixture = devFixturePath();
  if (fixture)
    return {
      connected: true,
      configured: true,
      events: bucketByDate(readFixture(fixture), date, date).get(date) ?? [],
    };
  if (!googleConfigured())
    return { connected: false, configured: false, events: [] };
  const db = await getDb();
  if (!(await isConnected(db)))
    return { connected: false, configured: true, events: [] };
  try {
    return {
      connected: true,
      configured: true,
      // Routed through the SAME cache as the range fetch, keyed as a one-day range, so a
      // screen that asks for today and a screen that asks for the week do not each pay for
      // it. listEvents itself stays untouched for callers that must not be cached.
      events: (await cachedRange(db, date, date)).get(date) ?? [],
    };
  } catch (e) {
    if (isAuthFailure(e)) {
      console.error(
        "[google] calendar auth failed — reconnect at /api/google/connect:",
        String(e).slice(0, 160),
      );
      return { connected: false, configured: true, events: [] };
    }
    throw e;
  }
}
