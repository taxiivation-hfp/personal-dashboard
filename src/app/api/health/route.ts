import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE PHONE'S ONE WAY IN. An iOS Shortcut POSTs today's numbers; nothing else ever calls
 * this. It authenticates with `x-app-secret` because a Shortcut cannot hold a browser
 * session cookie — which is why proxy.ts exempts exactly this path from the cookie gate
 * and no other.
 *
 * UPSERT PER DAY, deliberately: the Shortcut may fire several times through a day and a
 * later push REVISES the numbers rather than accumulating them — steps are a running
 * total on the phone's side already. This is the exact opposite of calorie_entries'
 * additive log, and it is why health data was given its own table (see schema.sql).
 *
 * Fields not sent are left alone (COALESCE on conflict), so a steps-only push never
 * blanks a sleep figure some future shortcut wrote earlier.
 */

/** Sanity ceilings, not judgements — a push of 2 million steps is a unit error. */
const BOUNDS: Record<string, number> = {
  steps: 200000,
  calories: 20000,
  sleep_minutes: 1440,
  resting_hr: 250,
};

/**
 * Constant-time comparison, via digests so the two buffers always have equal length —
 * timingSafeEqual throws on length mismatch, and the mismatch itself would leak. An
 * UNSET secret refuses everything: a deployment that forgot the secret must fail
 * closed, not open.
 */
function authorized(req: Request): boolean {
  const secret = process.env.HEALTH_PUSH_SECRET || "";
  if (!secret) return false;
  const given = req.headers.get("x-app-secret") || "";
  return timingSafeEqual(
    createHash("sha256").update(given).digest(),
    createHash("sha256").update(secret).digest(),
  );
}

/** A bounded non-negative integer, or null for absent/invalid — never a guess. */
function field(v: unknown, key: string): number | null {
  if (v == null) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > BOUNDS[key]!) return null;
  return n;
}

export async function POST(req: Request) {
  if (!authorized(req))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const b = await req.json().catch(() => ({}));
    // The Shortcut leaves `date` out and gets today in the app's own timezone — the
    // phone's midnight and the server's are not the same thing, and the app's is the
    // one the rings are drawn in.
    const date = isISODate(b.date) ? b.date : todayISO();

    const steps = field(b.steps, "steps");
    const calories = field(b.calories, "calories");
    const sleep = field(b.sleep_minutes, "sleep_minutes");
    const hr = field(b.resting_hr, "resting_hr");
    if (steps == null && calories == null && sleep == null && hr == null)
      return Response.json({ error: "nothing to record" }, { status: 400 });

    const db = await getDb();
    await db.execute({
      sql: `INSERT INTO health_logs (date, steps, calories, sleep_minutes, resting_hr)
            VALUES (?,?,?,?,?)
            ON CONFLICT(date) DO UPDATE SET
              steps         = COALESCE(excluded.steps, health_logs.steps),
              calories      = COALESCE(excluded.calories, health_logs.calories),
              sleep_minutes = COALESCE(excluded.sleep_minutes, health_logs.sleep_minutes),
              resting_hr    = COALESCE(excluded.resting_hr, health_logs.resting_hr),
              updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
      args: [date, steps, calories, sleep, hr],
    });
    return Response.json({ ok: true, date, steps });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
