// DEMO MODE — switch the dashboard's recent history to a placeholder "consistent user" and back,
// for showing the app in an interview. From ANY machine with the live credentials.
//
//   node --no-warnings scripts/demo-mode.mjs status
//   node --no-warnings scripts/demo-mode.mjs on  --target rehearsal|live            (dry run: plan + predicted figures)
//   node --no-warnings scripts/demo-mode.mjs on  --target rehearsal|live --commit   (backup, then write)
//   node --no-warnings scripts/demo-mode.mjs off --target rehearsal|live            (exact undo)
//
// See docs/demo-mode.md. Local working files (backups, rehearsal copies, manifest copies) go to
// data/demo/, which is git-ignored.
//
// SAFETY CONTRACT
// - Writes go ONLY to the target database, and only on `on --commit` / `off`.
// - `--target live` writes to production Turso. A full backup (every table except the Google
//   tokens) is written to data/demo/backups/ on THIS machine BEFORE the first write.
// - The MANIFEST — every write, with the row's previous values — lives IN THE TARGET DATABASE
//   (app_meta 'demo_mode'), written before the first data write and advanced in the SAME atomic
//   batch as each chunk of writes. That is what lets `off` run from a different machine than
//   `on`. A copy is kept in data/demo/ as well.
// - `off` replays it backwards and touches only rows that still hold exactly what demo mode
//   wrote — anything you logged or edited since is left alone. Nothing is ever deleted except
//   rows demo mode itself inserted.
// - The Google OAuth tokens are READ ONLY. A refreshed access token is kept in memory and never
//   written back (the app's own refresh path REVOKES the grant on failure — this one just stops).
// - Today is never touched: today is lived for real, so it shows your real ticks and marks.

import { createClient } from "@libsql/client";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// The app's OWN pure modules, so every predicted figure is computed by the code the site runs.
const { adherenceFor, buildBlocks } = await import("../src/lib/adherence.ts");
const { buildCareerRing } = await import("../src/lib/career.ts");
const { buildHealthRing, WINDOW_DAYS, STEPS_FLOOR, CALORIE_FLOOR } = await import("../src/lib/rings.ts");
const { streakEnding, CALORIE_STREAK_FLOOR } = await import("../src/lib/streaks.ts");
const { goalProgress: appGoalProgress } = await import("../src/lib/goals.ts");
const { addDays, daysBetween, dayBoundsRFC3339, localDateOf, todayISO, APP_TZ } = await import("../src/lib/dates.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, "data", "demo"); // git-ignored (/data)
const BACKUPS = resolve(WORK, "backups");
const HISTORY = resolve(WORK, "history");
const REHEARSAL_DB = resolve(WORK, "rehearsal.db");
const REHEARSAL_ORIGINAL = resolve(WORK, "rehearsal-original.db");
const manifestPath = (target) => resolve(WORK, `manifest-${target}.json`);
const fileUrl = (p) => "file:" + p.split("\\").join("/");

// ---------------------------------------------------------------- knobs
const DAYS_BACK = 30; // how far back the placeholder history reaches (today excluded)
const GYM_HORIZON = 42; // real strength sessions in this many days are re-spaced evenly
const TARGET = {
  adherence14: 86, // mean of the 14 finished days
  adherenceMin: 68, // no finished day below this
  tracker7: 84, // the dashboard tracker (7 finished days) should read at least this
  health: 70,
  career: 0.7,
  caloriesFortnight: 0.8, // share of 35,000 kcal over the ring's 14 days
};
const P = { adhered: 0.76, drifted: 0.15, optionalHabit: 0.78, ascnd: 0.72, driftReason: 0.6 };
// The every-day rows start their runs on different days, so the flames are not all one colour.
// Before its run a row is ticked on some days, and never on the day right before the run.
const RUN_DAYS = { calendar: 30, vitamins: 26 };
const KEEP_GOALS = [/^sql$/i, /^algorithms?$/i, /^aws\b/i];
const SUBGOALS_IF_EMPTY = {
  sql: ["SELECT, joins, GROUP BY", "Subqueries and CTEs", "Window functions", "Indexes and EXPLAIN", "Transactions and isolation levels"],
  algorithms: ["Arrays and hashing", "Two pointers and sliding window", "Stacks and queues", "Binary search", "Trees and graphs — BFS/DFS", "Dynamic programming", "One timed mock set"],
  aws: ["SAA-C03 exam guide", "Core services: IAM, VPC, EC2, S3", "Databases and caching", "Resilient architectures", "Practice exam", "Book and sit it"],
};
const DRIFT_REASONS = [
  "ran over from the previous block", "got pulled into admin", "started late", "cut it short, tired",
  "lecture ran long", "went to help a friend", "phone rabbit hole", "moved it to the evening", "slow start after lunch",
];

// ---------------------------------------------------------------- args + env
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const target = opt("target");

// Live credentials: .env.seed FIRST, then .env.local — the same order as scripts/seed-roadmap.mjs,
// because a machine may keep the live Turso URL out of .env.local so `next dev` cannot write to
// production. Real environment variables win over both.
const env = { ...process.env };
for (const name of [".env.seed", ".env.local"]) {
  const p = resolve(ROOT, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!env.DATABASE_URL?.startsWith("libsql:"))
  die("DATABASE_URL must be the production Turso URL (libsql://…) — put it in .env.seed (or .env.local) with TURSO_AUTH_TOKEN.");
if (!env.TURSO_AUTH_TOKEN) die("TURSO_AUTH_TOKEN is not set (.env.seed / .env.local).");
const live = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
// Named on every run, so switching "off" against a DIFFERENT Turso database cannot pass for success.
const LIVE_HOST = (() => {
  try {
    return new URL(env.DATABASE_URL).host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
})();
console.log(`live = ${LIVE_HOST}`);

function die(msg) {
  console.error("\n" + msg + "\n");
  process.exit(1);
}
const n = (v) => (v == null ? null : Number(v));
const T = todayISO(); // Melbourne, same as the app

// ---------------------------------------------------------------- db copy (read-only on the source)
async function copyDb(src, destPath, { includeTokens = false } = {}) {
  for (const f of [destPath, destPath + "-wal", destPath + "-shm"]) if (existsSync(f)) rmSync(f);
  const dst = createClient({ url: fileUrl(destPath) });
  const objs = (
    await src.execute(
      "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
    )
  ).rows;
  for (const o of objs.filter((o) => o.type === "table")) {
    await dst.execute(String(o.sql));
    if (o.name === "google_oauth_tokens" && !includeTokens) continue;
    const rows = (await src.execute(`SELECT * FROM "${o.name}"`)).rows;
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const sql = `INSERT INTO "${o.name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
    for (let i = 0; i < rows.length; i += 200)
      await dst.batch(rows.slice(i, i + 200).map((r) => ({ sql, args: cols.map((c) => r[c]) })), "write");
  }
  for (const o of objs.filter((o) => o.type !== "table")) await dst.execute(String(o.sql));
  dst.close();
}

// ---------------------------------------------------------------- Google (read-only)
async function googleToken(forceRefresh = false) {
  const row = (await live.execute("SELECT access_token, refresh_token, expiry FROM google_oauth_tokens WHERE id=1")).rows[0];
  if (!row) die("Google Calendar is not connected on the live site — reconnect it there first.");
  if (!forceRefresh && Date.now() < Number(row.expiry) - 60_000) return String(row.access_token);
  if (!row.refresh_token) die("The stored Google token has expired and there is no refresh token. Open the live site once (it refreshes), then re-run.");
  // Only `on` reads the calendar, so only `on` needs the OAuth client — `off` works without it.
  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) if (!env[k]) die(`${k} is not set (.env.seed / .env.local) — needed to refresh the Google token.`);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: String(row.refresh_token),
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const t = await res.json();
  if (!res.ok) die(`Google token refresh failed (${t.error || res.status}). Nothing was changed. Open the live site once, then re-run.`);
  return String(t.access_token); // memory only — never written back
}

async function calendarEvents(from, to) {
  const { timeMin } = dayBoundsRFC3339(from);
  const { timeMax } = dayBoundsRFC3339(to);
  let token = await googleToken();
  const items = [];
  let pageToken;
  do {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    if (pageToken) q.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`;
    let res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      token = await googleToken(true);
      res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    }
    if (!res.ok) die(`Google Calendar read failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  // The SITE asks Google for at most 250 events per range and does not page, oldest first — so
  // a busy calendar loses its NEWEST days (the demo ones) on /stats' longer windows.
  if (items.length >= 200)
    console.log(`!! ${items.length} calendar events in ${DAYS_BACK} days: /stats' "30 days" may drop recent blocks (the site reads at most 250). Stay on the default view.`);
  else console.log(`   ${items.length} calendar events in the last ${DAYS_BACK} days — /stats "30 days" is fine; avoid "3 months"/"a year" during the demo.`);

  // Same mapping and bucketing as src/lib/google.ts (toCalEvent + bucketByDate).
  const byDate = new Map();
  const dayOf = (s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? s
      : new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s));
  for (const e of items) {
    const startsAt = e.start?.dateTime ?? e.start?.date ?? null;
    if (!startsAt) continue;
    const ev = {
      id: String(e.id),
      summary: String(e.summary ?? "(busy)"),
      start: startsAt,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      allDay: Boolean(e.start?.date && !e.start?.dateTime),
      colorId: e.colorId == null ? null : String(e.colorId),
    };
    const d = dayOf(ev.start);
    if (d < from || d > to) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(ev);
  }
  return byDate;
}

// ---------------------------------------------------------------- state
async function loadState(db) {
  const from = addDays(T, -(DAYS_BACK + 20));
  const rows = async (sql, args = []) => (await db.execute({ sql, args })).rows;
  const s = {};
  s.habits = (await rows("SELECT id,name,system_key,input,days_mask FROM habits WHERE active=1 ORDER BY sort_order,id")).map((h) => ({
    id: n(h.id), name: String(h.name), key: h.system_key == null ? null : String(h.system_key), input: String(h.input), mask: n(h.days_mask),
  }));
  // A long window so the printed streaks are the site's streaks, not cut off by the read.
  s.entries = (await rows("SELECT id,habit_id,date,value FROM habit_entries WHERE date >= ?", [addDays(T, -400)])).map((r) => ({
    id: n(r.id), habit_id: n(r.habit_id), date: String(r.date), value: n(r.value),
  }));
  s.weights = (await rows("SELECT e.date, e.value FROM habit_entries e JOIN habits h ON h.id=e.habit_id WHERE h.system_key='weight' AND e.value > 0 ORDER BY e.date")).map((r) => ({
    date: String(r.date), value: n(r.value),
  }));
  s.calories = (await rows("SELECT id,date,kcal,note FROM calorie_entries WHERE date >= ?", [addDays(T, -400)])).map((r) => ({ id: n(r.id), date: String(r.date), kcal: n(r.kcal), note: r.note == null ? null : String(r.note) }));
  s.steps = new Map((await rows("SELECT date,steps FROM health_logs WHERE date >= ?", [addDays(T, -400)])).map((r) => [String(r.date), n(r.steps)]));
  s.marks = (await rows("SELECT id,date,event_id,state,reason,worked_fraction FROM block_marks WHERE date >= ?", [from])).map((r) => ({
    id: n(r.id), date: String(r.date), event_id: String(r.event_id), state: String(r.state), reason: r.reason == null ? null : String(r.reason), workedFraction: n(r.worked_fraction),
  }));
  s.oneOffs = (await rows("SELECT date,done FROM one_off_habits WHERE date >= ?", [from])).map((r) => ({ date: String(r.date), done: n(r.done) }));
  s.gym = (await rows("SELECT id,date,kind FROM gym_sessions WHERE kind IN ('strength','cardio') ORDER BY date,id")).map((r) => ({ id: n(r.id), date: String(r.date), kind: String(r.kind) }));
  // The DEPLOYED app has COUNTER goals ("18 of 50"): goals.done_count / goals.target_count. That
  // column is not in this checkout's schema, so it is read only where the database has it.
  const goalCols = new Set((await rows("PRAGMA table_info(goals)")).map((c) => String(c.name)));
  const counterCols = goalCols.has("done_count") ? ",target_count,done_count" : "";
  s.goals = (await rows(`SELECT id,title,status,deadline,created_at${counterCols} FROM goals ORDER BY id`)).map((g) => ({
    id: n(g.id), title: String(g.title), status: String(g.status), deadline: g.deadline == null ? null : String(g.deadline), created_at: String(g.created_at),
    target_count: counterCols ? n(g.target_count) : null, done_count: counterCols ? n(g.done_count) : null,
  }));
  s.subgoals = (await rows("SELECT id,goal_id,title,weight,done,sort_order FROM subgoals ORDER BY goal_id,sort_order,id")).map((x) => ({
    id: n(x.id), goal_id: n(x.goal_id), title: String(x.title), weight: n(x.weight), done: n(x.done), sort_order: n(x.sort_order),
  }));
  return s;
}

// ---------------------------------------------------------------- planning
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pastDays = () => Array.from({ length: DAYS_BACK }, (_, i) => addDays(T, -(DAYS_BACK - i)));
const weekdayBit = (d) => 1 << ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7);

/** Real strength sessions in the last GYM_HORIZON days, re-spaced evenly (order kept). Cardio: keep the real one inside the fortnight. */
function planGym(s) {
  const ops = [];
  const end = addDays(T, -1);
  const start = addDays(T, -GYM_HORIZON);
  const fortnightStart = addDays(T, -(WINDOW_DAYS - 1));
  const strength = s.gym.filter((g) => g.kind === "strength" && g.date >= start && g.date <= end);
  if (strength.length >= 3) {
    // Even slots from the horizon's first session to yesterday. A session only ever moves
    // LATER (never earlier than it really happened), and order is kept, so the log still
    // reads in the order the lifts progressed.
    const first = strength[0].date;
    const span = daysBetween(first, end);
    let prev = null;
    const dates = strength.map((g, i) => {
      const slot = addDays(first, Math.round((i * span) / (strength.length - 1)));
      let d = slot > g.date ? slot : g.date;
      if (prev && d <= prev) d = addDays(prev, 1);
      prev = d;
      return d;
    });
    const inFortnight = (list) => list.filter((d) => d >= fortnightStart && d <= T).length;
    // Apply only if it fits before today and does not LOWER the fortnight's count.
    if (dates[dates.length - 1] <= end && inFortnight(dates) >= inFortnight(strength.map((g) => g.date)))
      strength.forEach((g, i) => {
        if (dates[i] !== g.date) ops.push({ t: "update", table: "gym_sessions", key: { id: g.id }, before: { date: g.date }, after: { date: dates[i] } });
      });
  }
  const cardio = s.gym.filter((g) => g.kind === "cardio");
  if (cardio.length && !cardio.some((c) => c.date >= fortnightStart && c.date <= T)) {
    const latest = cardio[cardio.length - 1];
    const taken = new Set(s.gym.map((g) => ops.find((o) => o.key.id === g.id)?.after.date ?? g.date));
    let d = addDays(T, -6);
    while (taken.has(d) && d > fortnightStart) d = addDays(d, -1);
    ops.push({ t: "update", table: "gym_sessions", key: { id: latest.id }, before: { date: latest.date }, after: { date: d } });
  }
  return ops;
}

/** Keep SQL / Algorithms / AWS, hide every other goal, and set pace so Career ≈ 70%. */
function planGoals(s) {
  const active = s.goals.filter((g) => g.status === "active");
  const keep = KEEP_GOALS.map((re) => active.find((g) => re.test(g.title.trim()))).filter(Boolean);
  if (keep.length !== KEEP_GOALS.length)
    die(`Expected active goals matching ${KEEP_GOALS.join(", ")} but found: ${keep.map((g) => g.title).join(", ") || "none"}.\nActive goals: ${active.map((g) => g.title).join(", ")}\nEdit KEEP_GOALS at the top of demo-mode.mjs. Nothing was changed.`);
  const ops = [];
  // Every goal that is not kept and not already dropped — active, done or paused — is hidden:
  // the Career ring and the timeline list done and paused goals too. `off` restores each one's status.
  for (const g of s.goals)
    if (!keep.includes(g) && g.status !== "dropped") ops.push({ t: "update", table: "goals", key: { id: g.id }, before: { status: g.status }, after: { status: "dropped" } });
  planGoals.hidden = s.goals.filter((g) => !keep.includes(g) && g.status !== "dropped").map((g) => `${g.title} (${g.status})`);
  planGoals.kept = keep.map((g) => g.title);

  // Subtasks per kept goal (real ones, plus a starter list for a goal that has none). A COUNTER
  // goal's progress is its count, which demo mode never touches — so it gets no subtasks at all,
  // and only its pace (start date) is set.
  const subs = new Map();
  for (const g of keep) {
    const real = s.subgoals.filter((x) => x.goal_id === g.id);
    if (isCounter(g)) subs.set(g.id, []);
    else if (real.length) subs.set(g.id, real.map((x) => ({ ...x, real: true })));
    else {
      const t = g.title.trim();
      const list = SUBGOALS_IF_EMPTY[/^sql$/i.test(t) ? "sql" : /^algo/i.test(t) ? "algorithms" : /^aws/i.test(t) ? "aws" : ""] ?? [];
      subs.set(g.id, list.map((title, i) => ({ id: null, goal_id: g.id, title, weight: 0, done: 0, sort_order: i + 1, real: false })));
    }
  }
  const createdChoices = [45, 38, 31, 24, 17, 12, 9, 7, 6, 5, 4, 3, 2, 1].map((k) => addDays(T, -k));
  let best = null;
  const combos = (i, acc) => {
    if (i === keep.length) return [acc];
    const g = keep[i];
    const list = subs.get(g.id);
    const realDone = list.filter((x) => x.done).length;
    const out = [];
    for (const created of createdChoices) {
      if (g.deadline && created >= g.deadline) continue;
      for (let k = realDone; k <= list.length; k++) out.push(...combos(i + 1, [...acc, { g, created, k }]));
    }
    return out;
  };
  for (const c of combos(0, [])) {
    const goals = c.map(({ g, created, k }) => {
      const list = subs.get(g.id);
      const doneFlags = doneSet(list, k);
      return { id: g.id, title: g.title, status: "active", deadline: g.deadline, createdAt: created, progress: goalProgress(g, list.map((x, i) => ({ weight: x.weight, done: doneFlags[i] }))) };
    });
    const ring = buildCareerRing(goals, T);
    if (ring.fill == null) continue;
    const fills = ring.arcs.map((a) => a.fill);
    const score = Math.abs(ring.fill - TARGET.career) + 0.04 * fills.filter((f) => f >= 0.99).length + 0.04 * fills.filter((f) => f < 0.4).length + 0.001 * c.filter((x) => x.created !== createdChoices[1]).length;
    if (!best || score < best.score) best = { score, c };
  }
  if (!best) return ops;
  for (const { g, created, k } of best.c) {
    const createdAt = `${created}T09:00:00Z`;
    if (createdAt !== g.created_at) ops.push({ t: "update", table: "goals", key: { id: g.id }, before: { created_at: g.created_at }, after: { created_at: createdAt } });
    const list = subs.get(g.id);
    const flags = doneSet(list, k);
    list.forEach((x, i) => {
      if (!x.real) ops.push({ t: "insert", table: "subgoals", row: { goal_id: g.id, title: x.title, weight: 0, done: flags[i] ? 1 : 0, sort_order: x.sort_order } });
      else if (Boolean(x.done) !== flags[i]) ops.push({ t: "update", table: "subgoals", key: { id: x.id }, before: { done: x.done }, after: { done: flags[i] ? 1 : 0 } });
    });
  }
  return ops;
}
const isCounter = (g) => g.target_count != null && g.target_count > 0 && g.done_count != null;
/** THE app's own rule (src/lib/goals.ts goalProgress): a counted goal is done/target, otherwise its subtasks. */
function goalProgress(g, subs) {
  return appGoalProgress(isCounter(g) ? { done: g.done_count, target: g.target_count } : null, subs);
}

/** Real done subtasks stay done; the rest of the first k (in order) are added. */
function doneSet(list, k) {
  const flags = list.map((x) => Boolean(x.done));
  let need = k - flags.filter(Boolean).length;
  for (let i = 0; i < list.length && need > 0; i++) if (!flags[i]) { flags[i] = true; need--; }
  return flags;
}

/** Everything that varies day by day, from one seeded RNG. `gymDates`: days holding a gym session AFTER the re-spacing. */
function planDays(s, events, seed, gymDates) {
  const rnd = mulberry32(seed);
  const ops = [];
  const habitBy = (pred) => s.habits.find(pred);
  const H = {
    weight: habitBy((h) => h.key === "weight"),
    ascnd: habitBy((h) => h.key === "ascnd"),
    journal: habitBy((h) => h.key === "journal"),
    calendar: habitBy((h) => /^calendar$/i.test(h.name)),
    vitamins: habitBy((h) => /^vitamins$/i.test(h.name)),
  };
  const runs = [[H.calendar, RUN_DAYS.calendar], [H.vitamins, RUN_DAYS.vitamins]].filter(([h]) => h);
  const special = new Set(Object.values(H).filter(Boolean).map((h) => h.id));
  // Journal is NEVER ticked: in the app a page is what ticks it, and a tick with no page behind
  // it is a state the app cannot produce.
  const optional = s.habits.filter((h) => !special.has(h.id));
  const has = new Set(s.entries.map((e) => `${e.habit_id}|${e.date}`));
  const tick = (habit, d, value = 1) => {
    if (!habit || has.has(`${habit.id}|${d}`) || (habit.mask & weekdayBit(d)) === 0) return;
    has.add(`${habit.id}|${d}`);
    ops.push({ t: "insert", table: "habit_entries", row: { habit_id: habit.id, date: d, value, note: null } });
  };
  // Real marks are kept — except a real SKIP on a past day, which demo mode re-marks like an
  // unmarked block (its original state is in the manifest, and `off` puts it back).
  const realMarks = new Map(s.marks.filter((m) => m.state !== "skipped").map((m) => [`${m.date}|${m.event_id}`, m]));
  const skippedMarks = new Map(s.marks.filter((m) => m.state === "skipped").map((m) => [`${m.date}|${m.event_id}`, m]));
  const isAscnd = (title) => /asc\.?\s?nd/i.test(title);
  const isGym = (b) => b.colorId === "3" || /\b(gym|lift|lifting|workout|training|push|pull|legs|upper|lower)\b/i.test(b.title);
  const isProject = (b) => b.colorId === "10" || /project/i.test(b.title);

  for (const d of pastDays()) {
    const back = daysBetween(d, T);

    // ASC.ND — the habit and its calendar block tell the same story.
    let ascndDone;
    const realAsc = H.ascnd && s.entries.some((e) => e.habit_id === H.ascnd.id && e.date === d && e.value > 0);
    const ascBlock = (events.get(d) ?? []).find((e) => isAscnd(e.summary));
    const ascMark = ascBlock ? realMarks.get(`${d}|${ascBlock.id}`) : null;
    if (realAsc) ascndDone = true;
    else if (ascMark) ascndDone = ascMark.state === "adhered";
    else ascndDone = rnd() < P.ascnd;
    if (ascndDone) tick(H.ascnd, d);

    // Calendar / Vitamins: an unbroken run of RUN_DAYS, patchy before it.
    for (const [h, run] of runs) {
      if (back <= run) tick(h, d);
      else if (back > run + 1 && rnd() < 0.7) tick(h, d);
    }
    for (const h of optional) if (rnd() < P.optionalHabit) tick(h, d);

    // Weight: a believable line THROUGH the real readings.
    if (H.weight && !has.has(`${H.weight.id}|${d}`)) {
      const before = [...s.weights].reverse().find((w) => w.date < d);
      const after = s.weights.find((w) => w.date > d);
      let v;
      if (before && after) v = before.value + ((after.value - before.value) * daysBetween(before.date, d)) / daysBetween(before.date, after.date);
      else v = (before ?? after)?.value ?? 62;
      tick(H.weight, d, Math.round((v + (rnd() - 0.5) * 0.4) * 10) / 10);
    }

    // Calories: every day reaches the 2,000 log-streak line; ~80% of the 2,500 floor over a
    // fortnight. Real entries stay; only the MISSING meals are added, none under 200 kcal.
    const realRows = s.calories.filter((c) => c.date === d);
    const real = realRows.reduce((a, c) => a + c.kcal, 0);
    if (real < CALORIE_STREAK_FLOOR) {
      const total = Math.max(2020 + Math.floor(rnd() * 36) * 10, real + 300);
      const logged = realRows.map((c) => (c.note ?? "").toLowerCase());
      let meals = [["breakfast", 0.27], ["lunch", 0.33], ["dinner", 0.4]].filter(([m]) => !logged.some((x) => x.includes(m)));
      if (!meals.length) meals = [["snack", 1]];
      let remainder = total - real;
      if (remainder / meals.length < 250) meals = meals.slice(-1); // one believable meal, not three crumbs
      const share = meals.reduce((a, [, w]) => a + w, 0);
      meals.forEach(([note, w], i) => {
        const kcal = i === meals.length - 1 ? remainder : Math.round((((total - real) * w) / share) / 10) * 10;
        remainder -= kcal;
        ops.push({ t: "insert", table: "calorie_entries", row: { date: d, kcal, note, source: "manual" } });
      });
    }

    // Steps: the phone's real counts stay; only a day it never reported gets a plausible one,
    // stamped as if pushed that evening (the step row prints how long ago it was pushed).
    const stamp = `${d}T11:30:00Z`;
    if (!s.steps.has(d)) ops.push({ t: "insert", table: "health_logs", row: { date: d, steps: 4800 + Math.floor(rnd() * 3700), source: "ios_shortcuts", created_at: stamp, updated_at: stamp } });
    else if (s.steps.get(d) == null) ops.push({ t: "update", table: "health_logs", key: { date: d }, before: { steps: null }, after: { steps: 4800 + Math.floor(rnd() * 3700) } });

    // Blocks: the REAL calendar's events, marked.
    const blocks = buildBlocks(d, events.get(d) ?? [], new Map(), Date.now());
    for (const b of blocks) {
      if (realMarks.has(`${d}|${b.event_id}`) || b.minutes == null) continue;
      let state, frac = null, reason = null;
      if (b.minutes > 12 * 60) state = "dismissed"; // a multi-day event is not a day's block
      else if (isAscnd(b.title)) state = ascndDone ? "adhered" : "skipped";
      else if (isGym(b)) state = gymDates.has(d) ? "adhered" : "skipped"; // agrees with the gym log
      else {
        const r = rnd();
        if (r < P.adhered) state = "adhered";
        else if (r < P.adhered + P.drifted) {
          state = "drifted";
          frac = Math.round((0.5 + rnd() * 0.4) * 20) / 20;
          // Only drifts WITH a reason appear in the written log; keep project blocks out of it.
          if (!isProject(b) && rnd() < P.driftReason) reason = DRIFT_REASONS[Math.floor(rnd() * DRIFT_REASONS.length)];
        } else state = "skipped";
      }
      const ev = (events.get(d) ?? []).find((e) => e.id === b.event_id);
      const endMs = Date.parse(ev?.end ?? ev?.start ?? `${d}T12:00:00Z`);
      const wasSkipped = skippedMarks.get(`${d}|${b.event_id}`);
      if (wasSkipped) {
        if (state !== "skipped")
          ops.push({
            t: "update", table: "block_marks", key: { id: wasSkipped.id },
            before: { state: "skipped", reason: wasSkipped.reason, worked_fraction: wasSkipped.workedFraction },
            after: { state, reason, worked_fraction: frac },
          });
        continue;
      }
      ops.push({
        t: "insert", table: "block_marks",
        row: { date: d, event_id: b.event_id, title: b.title, time_start: b.time_start, time_end: b.time_end, state, reason, worked_fraction: frac, marked_at: new Date(endMs + (5 + Math.floor(rnd() * 80)) * 60000).toISOString() },
      });
    }
  }
  return ops;
}

// ---------------------------------------------------------------- figures (the app's own maths)
function applyToState(s, ops) {
  const x = structuredClone({ ...s, steps: [...s.steps] });
  x.steps = new Map(x.steps);
  for (const o of ops) {
    if (o.t === "insert") {
      if (o.table === "habit_entries") x.entries.push({ ...o.row, id: -1 });
      if (o.table === "calorie_entries") x.calories.push({ ...o.row, id: -1 });
      if (o.table === "health_logs") x.steps.set(o.row.date, o.row.steps);
      if (o.table === "block_marks") x.marks.push({ date: o.row.date, event_id: o.row.event_id, state: o.row.state, reason: o.row.reason, workedFraction: o.row.worked_fraction });
      if (o.table === "subgoals") x.subgoals.push({ ...o.row, id: -1 });
    } else {
      if (o.table === "gym_sessions") x.gym.find((g) => g.id === o.key.id).date = o.after.date;
      if (o.table === "goals") Object.assign(x.goals.find((g) => g.id === o.key.id), o.after);
      if (o.table === "subgoals") Object.assign(x.subgoals.find((g) => g.id === o.key.id), o.after);
      if (o.table === "health_logs") x.steps.set(o.key.date, o.after.steps);
      if (o.table === "block_marks") {
        const m = x.marks.find((k) => k.id === o.key.id);
        Object.assign(m, { state: o.after.state, reason: o.after.reason, workedFraction: o.after.worked_fraction });
      }
    }
  }
  return x;
}

function figures(s, events) {
  const dayPct = (d) => {
    const marks = new Map(s.marks.filter((m) => m.date === d).map((m) => [m.event_id, m]));
    const blocks = buildBlocks(d, events.get(d) ?? [], marks);
    const bit = weekdayBit(d);
    const scheduled = s.habits.filter((h) => (h.mask & bit) !== 0);
    const ticked = new Set(s.entries.filter((e) => e.date === d && e.value > 0).map((e) => e.habit_id));
    const oo = s.oneOffs.filter((o) => o.date === d);
    const cal = s.calories.filter((c) => c.date === d);
    return adherenceFor(
      blocks,
      { scheduled: scheduled.length + oo.length, done: scheduled.filter((h) => ticked.has(h.id)).length + oo.filter((o) => o.done).length },
      { steps: s.steps.get(d) ?? null, calories: cal.length ? cal.reduce((a, c) => a + c.kcal, 0) : null },
    ).pct;
  };
  const days = Array.from({ length: 14 }, (_, i) => addDays(T, -(14 - i)));
  const pcts = days.map((d) => ({ date: d, pct: dayPct(d) }));
  const today = dayPct(T);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

  const from = addDays(T, -(WINDOW_DAYS - 1));
  const inW = (d) => d >= from && d <= T;
  const asc = s.habits.find((h) => h.key === "ascnd");
  const counts = {
    strength: { count: s.gym.filter((g) => g.kind === "strength" && inW(g.date)).length, resolved: true },
    cardio: { count: s.gym.filter((g) => g.kind === "cardio" && inW(g.date)).length, resolved: true },
    ascnd: asc ? { count: new Set(s.entries.filter((e) => e.habit_id === asc.id && e.value > 0 && inW(e.date)).map((e) => e.date)).size, resolved: true } : { count: 0, resolved: false },
    steps: { count: [...s.steps].filter(([d, v]) => inW(d) && v != null).reduce((a, [, v]) => a + v, 0), resolved: true },
    calories: { count: s.calories.filter((c) => inW(c.date)).reduce((a, c) => a + c.kcal, 0), resolved: true },
  };
  const health = buildHealthRing(counts);
  const goals = s.goals
    .filter((g) => g.status !== "dropped")
    .map((g) => {
      const subs = s.subgoals.filter((x) => x.goal_id === g.id).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      return { id: g.id, title: g.title, status: g.status, deadline: g.deadline, createdAt: localDateOf(g.created_at) ?? g.created_at.slice(0, 10), progress: goalProgress(g, subs.map((x) => ({ weight: x.weight, done: Boolean(x.done) }))) };
    });
  const career = buildCareerRing(goals, T);

  const streak = (dates) => streakEnding(T, new Set(dates), { grace: true });
  const streaks = {};
  for (const h of s.habits) streaks[h.name] = streakEnding(T, new Set(s.entries.filter((e) => e.habit_id === h.id && e.value > 0).map((e) => e.date)), { scheduledOn: (d) => (h.mask & weekdayBit(d)) !== 0, grace: true });
  const calByDay = new Map();
  for (const c of s.calories) calByDay.set(c.date, (calByDay.get(c.date) ?? 0) + c.kcal);
  streaks.Calories = streak([...calByDay].filter(([, v]) => v >= CALORIE_STREAK_FLOOR).map(([d]) => d));
  streaks.Steps = streak([...s.steps].filter(([, v]) => v != null && v >= STEPS_FLOOR).map(([d]) => d));

  return {
    pcts,
    today,
    avg14: mean(pcts.map((p) => p.pct)),
    min14: Math.min(...pcts.map((p) => p.pct)),
    max14: Math.max(...pcts.map((p) => p.pct)),
    tracker7: mean(pcts.slice(-7).map((p) => p.pct)),
    stats7: mean([...pcts.slice(-6).map((p) => p.pct), today]),
    health: Math.round((health.fill ?? 0) * 100),
    healthArcs: health.arcs.map((a) => `${a.label} ${a.fact}`),
    caloriesFill: counts.calories.count / (CALORIE_FLOOR * WINDOW_DAYS),
    career: career.fill == null ? null : Math.round(career.fill * 100),
    careerArcs: career.arcs.map((a) => `${a.label}: ${Math.round(a.progress * 100)}% done, pace fill ${Math.round(a.fill * 100)}%, due ${a.deadline}`),
    streaks,
  };
}

function score(f) {
  return (
    Math.abs(f.avg14 - TARGET.adherence14) +
    2 * Math.max(0, TARGET.adherenceMin - f.min14) +
    1.5 * f.pcts.filter((p) => p.pct >= 98).length +
    2 * Math.max(0, TARGET.tracker7 - f.tracker7) +
    0.7 * Math.abs(f.health - TARGET.health) +
    40 * Math.abs(f.caloriesFill - TARGET.caloriesFortnight)
  );
}

function printFigures(label, f) {
  console.log(`\n== ${label} (today = ${T})`);
  console.log("adherence, finished days:", f.pcts.map((p) => `${p.date.slice(5)} ${p.pct}`).join("  "));
  console.log(`  14-day average ${f.avg14.toFixed(1)}%  (min ${f.min14}, max ${f.max14})`);
  console.log(`  dashboard tracker (7 finished days) ${f.tracker7.toFixed(1)}%`);
  console.log(`  /stats "last 7 days" (includes today, ${f.today}% right now) ${f.stats7.toFixed(1)}%`);
  console.log(`Health ${f.health}%  —  ${f.healthArcs.join(" · ")}`);
  console.log(`Career ${f.career ?? "no goals"}%`);
  for (const a of f.careerArcs) console.log("   " + a);
  console.log("streaks:", Object.entries(f.streaks).map(([k, v]) => `${k} ${v}d`).join(", "));
}

// ---------------------------------------------------------------- write + undo
// What `off` requires a row to STILL hold before it deletes it. Every column the app can rewrite
// in place is included, so a row you have since written into — a real note or page count on a
// seeded tick, a corrected weight, a re-marked block (the app stamps a new marked_at) — no
// longer matches and is left alone. Seeded subtasks are matched on identity only: they are
// demo content, and are removed even if ticked during the interview.
const IDENT = {
  habit_entries: ["id", "habit_id", "date", "value", "note"],
  calorie_entries: ["id", "date", "kcal", "note", "source"],
  block_marks: ["id", "date", "event_id", "title", "time_start", "time_end", "state", "reason", "worked_fraction", "marked_at"],
  subgoals: ["id", "goal_id", "title"],
  health_logs: ["date", "steps"],
  app_meta: ["key"],
};
const MARKER = "demo_mode"; // app_meta key: production itself records that demo mode is on

async function assignIds(db, ops) {
  const next = {};
  for (const table of ["habit_entries", "calorie_entries", "block_marks", "subgoals"])
    next[table] = Number((await db.execute(`SELECT COALESCE(MAX(id),0) AS m FROM ${table}`)).rows[0].m) + 1;
  for (const o of ops) if (o.t === "insert" && o.table in next) o.row = { id: next[o.table]++, ...o.row };
}

function toStatement(o) {
  if (o.t === "insert") {
    const cols = Object.keys(o.row);
    return { sql: `INSERT INTO ${o.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, args: cols.map((c) => o.row[c]) };
  }
  const set = Object.keys(o.after);
  const where = [...Object.keys(o.key).map((k) => `${k} = ?`), ...Object.keys(o.before).map((k) => `${k} IS ?`)];
  return {
    sql: `UPDATE ${o.table} SET ${set.map((k) => `${k} = ?`).join(", ")} WHERE ${where.join(" AND ")}`,
    args: [...set.map((k) => o.after[k]), ...Object.values(o.key), ...Object.values(o.before)],
  };
}

function undoStatement(o) {
  if (o.t === "insert") {
    const cols = IDENT[o.table];
    return { sql: `DELETE FROM ${o.table} WHERE ${cols.map((c) => `${c} IS ?`).join(" AND ")}`, args: cols.map((c) => o.row[c] ?? null) };
  }
  const set = Object.keys(o.before);
  const where = [...Object.keys(o.key).map((k) => `${k} = ?`), ...Object.keys(o.after).map((k) => `${k} IS ?`)];
  return {
    sql: `UPDATE ${o.table} SET ${set.map((k) => `${k} = ?`).join(", ")} WHERE ${where.join(" AND ")}`,
    args: [...set.map((k) => o.before[k]), ...Object.values(o.key), ...Object.values(o.after)],
  };
}

function targetDb() {
  if (target === "live") return live;
  if (target === "rehearsal") {
    // Only `on` creates the rehearsal copy; anything else on a machine without one would leave an
    // empty file behind (createClient creates it) that later breaks `status`.
    if (cmd !== "on" && !existsSync(REHEARSAL_DB)) die("There is no rehearsal copy on this machine (data/demo/rehearsal.db).");
    return createClient({ url: fileUrl(REHEARSAL_DB) });
  }
  die("Pass --target rehearsal (a local copy of production) or --target live.");
}

/** The local COPY of the manifest (the database holds the real one). Atomic via rename. */
function saveLocalCopy(m) {
  mkdirSync(WORK, { recursive: true });
  const p = manifestPath(m.target);
  writeFileSync(p + ".tmp", JSON.stringify(m, null, 1));
  renameSync(p + ".tmp", p);
}

/** The manifest the database holds, or null when demo mode is off there. */
async function readManifest(db) {
  const v = (await db.execute({ sql: "SELECT value FROM app_meta WHERE key=?", args: [MARKER] })).rows[0]?.value;
  if (v == null) return null;
  try {
    return JSON.parse(String(v));
  } catch {
    die(`app_meta '${MARKER}' exists but is not a readable manifest. Nothing was changed — inspect it before doing anything else.`);
  }
}

/**
 * The manifest, rewritten ONLY while it still belongs to this session — and, for `on`, only
 * while no `off` has started closing it. Always followed by ABORT_UNLESS_WRITTEN in the same
 * batch: if the record was deleted or taken over (an `off` on another machine), that raises an
 * error and the WHOLE batch rolls back, so no chunk of writes can ever commit without its record.
 */
const manifestStatement = (m, { closing }) => ({
  sql: `UPDATE app_meta SET value=? WHERE key=? AND json_extract(value,'$.session') IS ? AND json_extract(value,'$.closing') IS ${closing ? "NOT NULL" : "NULL"}`,
  args: [JSON.stringify(m), MARKER, m.session ?? null],
});
// json() on text that is not JSON is a runtime error — SQL's way to throw inside a batch.
const ABORT_UNLESS_WRITTEN = { sql: "SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('demo_mode record changed underneath this run') END", args: [] };

/** A local copy whose session the database no longer holds (switched off elsewhere) is history. */
function archiveLocalCopy(target, why) {
  const p = manifestPath(target);
  if (!existsSync(p)) return;
  mkdirSync(HISTORY, { recursive: true });
  renameSync(p, resolve(HISTORY, `manifest-${target}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  if (why) console.log(why);
}

function warnIfStale(m) {
  if (m.today !== T)
    console.log(`\n!! Demo mode on ${m.target} was seeded for ${m.today}, but today is ${T}. Its history now ends before yesterday — run \`off --target ${m.target}\` then \`on\` again for a fresh demo.`);
}

async function on() {
  const commit = flag("commit");
  if (target === "rehearsal") {
    // --from <file.db>: rehearse from a backup (e.g. while production is itself in demo mode).
    const from = opt("from");
    if (from) {
      console.log(`Copying ${from} -> data/demo/rehearsal.db …`);
      const src = createClient({ url: fileUrl(resolve(from)) });
      await copyDb(src, REHEARSAL_DB);
      src.close();
    } else {
      console.log("Copying production -> data/demo/rehearsal.db (read-only on production)…");
      await copyDb(live, REHEARSAL_DB);
    }
    // The comparison copy is taken from the rehearsal file, not from production a second time:
    // the phone may push steps between two reads, and that would show as a false difference.
    const r = createClient({ url: fileUrl(REHEARSAL_DB) });
    await copyDb(r, REHEARSAL_ORIGINAL, { includeTokens: true });
    r.close();
  }
  const db = targetDb();
  const existing = await readManifest(db);
  if (existing) {
    warnIfStale(existing);
    die(`Demo mode is already ON for ${target} (since ${existing.createdAt}, seeded for ${existing.today}). Run \`off --target ${target}\` first — from any machine.`);
  }
  archiveLocalCopy(target, `(an old local manifest copy was moved to data/demo/history — the ${target} database says demo mode is off)`);
  const state = await loadState(db);
  console.log("Reading your real Google Calendar (read-only)…");
  const events = await calendarEvents(addDays(T, -DAYS_BACK), T);

  printFigures("NOW", figures(state, events));

  const fixed = [...planGym(state), ...planGoals(state)];
  const gymDates = new Set(applyToState(state, fixed).gym.map((g) => g.date));
  let best = null;
  const seeds = opt("seed") ? [Number(opt("seed"))] : Array.from({ length: 400 }, (_, i) => i + 1);
  for (const seed of seeds) {
    const ops = [...fixed, ...planDays(state, events, seed, gymDates)];
    const f = figures(applyToState(state, ops), events);
    const sc = score(f);
    if (!best || sc < best.sc) best = { seed, ops, f, sc };
  }
  printFigures(`WITH DEMO DATA (seed ${best.seed})`, best.f);
  console.log(`\nCareer keeps: ${planGoals.kept.join(", ")}`);
  console.log(`Hidden (set to dropped until off): ${planGoals.hidden.join(", ") || "nothing"}`);
  const count = (t, table) => best.ops.filter((o) => o.t === t && (!table || o.table === table)).length;
  console.log(
    `plan: ${count("insert")} rows added (${count("insert", "habit_entries")} ticks, ${count("insert", "calorie_entries")} food entries, ${count("insert", "block_marks")} block marks, ${count("insert", "health_logs")} step days, ${count("insert", "subgoals")} subtasks), ` +
      `${count("update")} rows changed (${count("update", "gym_sessions")} gym dates, ${count("update", "goals")} goals, ${count("update", "subgoals")} subtasks, ${count("update", "block_marks")} past skips re-marked, ${count("update", "health_logs")} step days)`,
  );
  if (!commit) {
    console.log(`\nDry run — nothing written. Add --commit to apply to ${target}.`);
    return;
  }

  mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (target === "live") {
    const backup = resolve(BACKUPS, `live-${stamp}.db`);
    console.log(`\nBacking up production -> ${backup} …`);
    await copyDb(live, backup);
  }
  const ops = best.ops;
  await assignIds(db, ops);
  const manifest = {
    target, host: target === "live" ? LIVE_HOST : "data/demo/rehearsal.db", session: randomUUID(),
    createdAt: new Date().toISOString(), today: T, seed: best.seed, applied: 0, ops,
  };
  // The record goes into the database FIRST, on its own. If another run got there first, this
  // INSERT fails on the key and nothing else is written.
  await db.execute({ sql: "INSERT INTO app_meta (key, value) VALUES (?, ?)", args: [MARKER, JSON.stringify(manifest)] });
  saveLocalCopy(manifest);
  for (let i = 0; i < ops.length; i += 100) {
    const chunk = ops.slice(i, i + 100);
    manifest.applied = i + chunk.length;
    // ONE atomic batch: the record (advanced to include this chunk), the check that it was still
    // ours, the writes — and, right after each UPDATE, a flag set IN THE SAME TRANSACTION if that
    // UPDATE matched nothing (the row changed since it was read), so `off` never "restores" a
    // value over something you changed.
    const stmts = [manifestStatement(manifest, { closing: false }), ABORT_UNLESS_WRITTEN];
    const at = [];
    chunk.forEach((o, j) => {
      at.push(stmts.length);
      stmts.push(toStatement(o));
      if (o.t === "update")
        stmts.push({ sql: "UPDATE app_meta SET value = json_set(value, ?, json('true')) WHERE key = ? AND changes() = 0", args: [`$.ops[${i + j}].noop`, MARKER] });
    });
    const res = await db.batch(stmts, "write");
    chunk.forEach((o, j) => {
      if (o.t === "update" && Number(res[at[j]].rowsAffected) === 0) o.noop = true;
    });
    saveLocalCopy(manifest);
  }
  const noops = ops.filter((o) => o.noop).length;
  console.log(`\nApplied ${ops.length - noops} changes to ${target} (${manifest.host})${noops ? ` — ${noops} skipped: those rows changed while this ran` : ""}. The undo record is in that database (app_meta '${MARKER}'), so \`off\` works from any machine.`);
  printFigures(`${target.toUpperCase()} AFTER WRITE (re-read from the database)`, figures(await loadState(db), events));
}

async function off() {
  const db = targetDb();
  if (!(await readManifest(db))) {
    archiveLocalCopy(target, `(an old local manifest copy was moved to data/demo/history)`);
    die(`Demo mode is not on for ${target} (${target === "live" ? LIVE_HOST : "rehearsal.db"}) — that database holds no demo session. Nothing to undo.`);
  }
  // CLOSE the session first: from here on, an `on` still running anywhere fails its next batch
  // (its record check requires closing IS NULL). Then re-read, so `applied` is final.
  await db.execute({ sql: "UPDATE app_meta SET value = json_set(value, '$.closing', json('true')) WHERE key = ?", args: [MARKER] });
  const manifest = await readManifest(db);
  if (!manifest || !Array.isArray(manifest.ops))
    die(`The ${target} database marks demo mode as on, but its record has no undo list. Nothing was undone — inspect app_meta '${MARKER}'.`);
  console.log(`Switching off the demo session from ${manifest.createdAt} on ${manifest.host ?? target}…`);
  // Only what was APPLIED: the record advances in the same transaction as each batch, so ops past
  // `applied` provably never landed — and undoing them could revert a real edit that happens to
  // match what demo mode would have written.
  const all = manifest.ops.map((o, i) => ({ o, i })).filter(({ o, i }) => i < manifest.applied && !o.noop && !o.undone).reverse();
  let restored = 0;
  const changedSince = [];
  for (let k = 0; k < all.length; k += 100) {
    const chunk = all.slice(k, k + 100);
    for (const { o } of chunk) o.undone = true;
    // The undos and "these are undone" commit together (or not at all), so an interrupted `off`
    // can simply be re-run, and two `off`s cannot both undo the same batch.
    const stmts = [manifestStatement(manifest, { closing: true }), ABORT_UNLESS_WRITTEN, ...chunk.map(({ o }) => undoStatement(o))];
    const res = await db.batch(stmts, "write");
    chunk.forEach(({ o }, j) => {
      if (Number(res[j + 2].rowsAffected) > 0) restored++;
      else changedSince.push(o);
    });
  }
  await db.execute({ sql: "DELETE FROM app_meta WHERE key=?", args: [MARKER] }); // last: demo mode is off
  mkdirSync(HISTORY, { recursive: true });
  writeFileSync(resolve(HISTORY, `manifest-${target}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify(manifest, null, 1));
  if (existsSync(manifestPath(target))) rmSync(manifestPath(target));
  const neverLanded = manifest.ops.length - manifest.applied;
  console.log(`\nUndid ${restored} changes on ${target}.${neverLanded ? ` (${neverLanded} planned changes had never been written.)` : ""}`);
  if (changedSince.length) {
    console.log(`${changedSince.length} left alone because you changed or removed them since demo mode wrote them:`);
    for (const o of changedSince.slice(0, 30)) console.log("  ", o.table, JSON.stringify(o.t === "insert" ? o.row : { ...o.key, demoValue: o.after }));
  }
  if (target === "rehearsal" && existsSync(REHEARSAL_ORIGINAL)) await compareWithOriginal(db);
}

async function compareWithOriginal(db) {
  const orig = createClient({ url: fileUrl(REHEARSAL_ORIGINAL) });
  const tables = (await orig.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map((r) => String(r.name));
  let diffs = 0;
  for (const t of tables) {
    const dump = async (c) => JSON.stringify((await c.execute(`SELECT * FROM "${t}" ORDER BY rowid`)).rows.map((r) => ({ ...r })), (_, v) => (typeof v === "bigint" ? Number(v) : v));
    if ((await dump(orig)) !== (await dump(db))) {
      diffs++;
      console.log(`  DIFFERS: ${t}`);
    }
  }
  console.log(diffs ? `\nREHEARSAL CHECK FAILED: ${diffs} table(s) differ from the original copy.` : `\nRehearsal check passed: all ${tables.length} tables are identical to the untouched copy.`);
  orig.close();
}

async function status() {
  // Production first: it is the question `status` exists to answer. Each target is reported on its
  // own line, so a broken rehearsal copy can never hide it.
  const targets = [["live", () => live]];
  if (existsSync(REHEARSAL_DB)) targets.push(["rehearsal", () => createClient({ url: fileUrl(REHEARSAL_DB) })]);
  for (const [t, open] of targets) {
    try {
      const m = await readManifest(open());
      if (!m) console.log(`${t}: OFF`);
      else {
        const undone = Array.isArray(m.ops) ? m.ops.filter((o) => o.undone).length : 0;
        console.log(`${t}: ON since ${m.createdAt} (seeded for ${m.today}; ${m.applied ?? "?"}/${m.ops?.length ?? "?"} changes applied${m.closing ? `; an off started — ${undone} undone so far, re-run off` : ""})`);
        warnIfStale(m);
      }
    } catch (e) {
      console.log(`${t}: could not read (${e.message})`);
    }
  }
}

if (cmd === "on") await on();
else if (cmd === "off") await off();
else if (cmd === "status") await status();
else die("Usage: node --no-warnings scripts/demo-mode.mjs status | on --target rehearsal|live [--commit] | off --target rehearsal|live");
