// Read models. No XP, no levels, no points — see CLAUDE.md.

import type { Client } from "./db/client";
import { getStreak, weekdayBit } from "./engine";
import {
  adherenceFor,
  buildBlocks,
  type Adherence,
  type Block,
  type BlockState,
  type HabitTally,
} from "./adherence";
import { rfc3339, todayISO } from "./dates";
import type { CalEvent } from "./google";
import { addDays, daysBetween } from "./dates";
import { deriveWeights } from "./goals";
import { METRICS, WINDOW_DAYS, type RawCount, type PillarKey } from "./rings";

// PillarKey now lives in rings.ts, which must stay import-free to be testable under
// `node --test`. Re-exported here so every existing `import { PillarKey } from
// "@/lib/queries"` keeps working.
export type { PillarKey };

const num = (v: unknown) => (v == null ? 0 : Number(v));
const str = (v: unknown) => (v == null ? null : String(v));

export type PillarView = {
  key: PillarKey;
  name: string;
  priority: string;
  color: string | null;
};

export type HabitView = {
  id: number;
  name: string;
  pillar: PillarKey | null;
  days_mask: number;
  done: boolean;
  system_key: string | null;
  /** 'check' = a tick. 'number' = type a value. */
  input: "check" | "number";
  /** e.g. "kg". Shown beside a numeric input. */
  unit: string | null;
  /** The logged number for a numeric habit; null when nothing is entered. */
  value: number | null;
};

export type SubgoalView = {
  id: number;
  title: string;
  /** The raw column. 0 means AUTO — do not render this. */
  weight: number;
  /** What it is actually worth right now. Render THIS. */
  effectiveWeight: number;
  done: boolean;
};

export type GoalView = {
  id: number;
  pillar: PillarKey;
  title: string;
  target: string | null;
  /** Derived: the sum of completed subgoal weights. Never inferred from activity, and
   *  deliberately never read from the stale goals.progress column. */
  progress: number;
  status: string;
  subgoals: SubgoalView[];
  /** True ONLY when explicit overrides exceed 100%. An all-auto goal is well-formed. */
  overAllocated: boolean;
  /** When it was marked done, or null. A finished goal with no date is a fact with no
   *  place in a sequence — see updateGoal. */
  completedAt: string | null;
};

export type SkillView = {
  id: number;
  name: string;
  pillar: PillarKey | null;
  state: "always_on" | "active" | "parked";
  /** Lifetime minutes logged. A measurement of time spent — not a score, not a level.
   *  Only ever accumulates, so this is the continuity number. */
  minutes: number;
  /** Minutes in the rolling 14-day window — the LIVE number. Answers "what am I on
   *  now", which the lifetime total cannot. */
  minutes14: number;
  /** Distinct days this skill was touched in the window. */
  sessions14: number;
  staleDays: number | null;
};

export type JournalView = {
  id: number;
  /** 'drawing' | 'text'. The discriminator everywhere — never test image for emptiness. */
  kind: string;
  /** First line of a text page, for the thumbnail. null for a drawing. */
  preview: string | null;
};

/** A page with its date — the archive's unit. The image itself is never listed; a year of
 *  handwriting as data URLs in one JSON response is the whole reason /api/journal/[id]/image
 *  exists. */
export type JournalPage = JournalView & { date: string };

/** EVERY page, newest first, metadata only — the /journal archive. Deliberately
 *  unpaginated, same ruling as the gym log: years of pages are a few hundred rows of text
 *  and thumbnails fetch their own images lazily. */
export async function allJournalPages(db: Client): Promise<JournalPage[]> {
  const r = await db.execute(
    "SELECT id, date, kind, substr(COALESCE(body,''),1,140) AS preview FROM journal_entries ORDER BY date DESC, id DESC",
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    date: String(x.date),
    kind: String(x.kind),
    preview: x.preview == null ? null : String(x.preview),
  }));
}

export type DayView = {
  date: string;
  calendarConnected: boolean;
  blocks: Block[];
  adherence: Adherence;
  streak: number;
  habits: HabitView[];
  journal: JournalView[];
  /** The day's running total, derived from calorieEntries. null when nothing is logged,
   *  so the screen can render "—" rather than a zero nobody entered. */
  calories: number | null;
  /** The individual additions, so a mistyped one can be removed rather than retyped. */
  calorieEntries: CalorieEntry[];
  /** What the owner intends the day to be. null when unnamed. */
  title: string | null;
  pillars: PillarView[];
};

/** One addition to a day's total. `note` is the food's name, or null — the schema always
 *  had the column; the UI only started writing it when logging grew a name field. */
export type CalorieEntry = { id: number; kcal: number; note: string | null };

/** One past day of the calorie log, for the dialog's sidebar. */
export type CalorieDay = { date: string; total: number; entries: CalorieEntry[] };

/**
 * Calendar events the owner ADHERED to, by event id, over a window.
 *
 * What the Social ring counts now: an event on the calendar you drifted from is not a
 * social fortnight you had. Unmarked events do not count either — the mark is the record,
 * and the ring reads the record, not the plan.
 */
export async function adheredEventIds(
  db: Client,
  from: string,
  to: string,
): Promise<Set<string>> {
  const r = await db.execute({
    sql: `SELECT event_id FROM block_marks
          WHERE date BETWEEN ? AND ? AND state='adhered'`,
    args: [from, to],
  });
  return new Set(r.rows.map((x) => String(x.event_id)));
}

/** One skill's slice of the Portfolio ring: who it is, how it stands, and how many
 *  sessions the window holds. Only skills with at least one session appear — the ring is
 *  a record of the fortnight, not a roster. */
export type SkillSlice = {
  id: number;
  name: string;
  state: string;
  /** Owner-chosen palette hex, or null for the id-cycled default. */
  color: string | null;
  sessions: number;
};

export async function skillSlices(
  db: Client,
  from: string,
  to: string,
): Promise<SkillSlice[]> {
  const r = await db.execute({
    sql: `SELECT s.id, s.name, s.state, s.color, COUNT(t.id) AS sessions
          FROM skill_time t JOIN skills s ON s.id = t.skill_id
          WHERE t.date BETWEEN ? AND ?
          GROUP BY s.id ORDER BY sessions DESC, s.sort_order`,
    args: [from, to],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    state: String(x.state),
    color: x.color == null ? null : String(x.color),
    sessions: num(x.sessions),
  }));
}

/** Every skill's name and chosen colour, for the /colours page. */
export async function skillColours(
  db: Client,
): Promise<{ id: number; name: string; state: string; color: string | null }[]> {
  const r = await db.execute(
    "SELECT id, name, state, color FROM skills ORDER BY sort_order, id",
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    name: String(x.name),
    state: String(x.state),
    color: x.color == null ? null : String(x.color),
  }));
}

/** Day titles across a range, for the strip and the day ahead. */
export async function dayTitlesBetween(
  db: Client,
  from: string,
  to: string,
): Promise<Map<string, string>> {
  const r = await db.execute({
    sql: "SELECT date,title FROM day_titles WHERE date BETWEEN ? AND ?",
    args: [from, to],
  });
  return new Map(r.rows.map((x) => [String(x.date), String(x.title)]));
}

/**
 * The day's calories, total and entries, from one place.
 *
 * Shared by getDayView and /api/calories deliberately: two readers deriving the same total
 * independently is how a total and its parts start disagreeing on screen.
 */
export async function caloriesForDate(
  db: Client,
  date: string,
): Promise<{ total: number | null; entries: CalorieEntry[] }> {
  const r = await db.execute({
    sql: "SELECT id,kcal,note FROM calorie_entries WHERE date=? ORDER BY id",
    args: [date],
  });
  const entries = r.rows.map((x) => ({
    id: Number(x.id),
    kcal: num(x.kcal),
    note: x.note == null ? null : String(x.note),
  }));
  // Summed in JS rather than by SQL SUM(): the rows are already loaded, and it keeps the
  // BigInt conversion in exactly one place.
  return {
    total: entries.length ? entries.reduce((s, e) => s + e.kcal, 0) : null,
    entries,
  };
}

/**
 * The calorie log's recent past, grouped by day, newest first — the dialog's sidebar.
 *
 * Days with no entries simply do not appear: a day you logged nothing is a gap in the
 * record, not a zero, which is the same rule every chart here draws by. The totals are
 * derived exactly as caloriesForDate derives today's, so the two can never disagree.
 */
export async function calorieDays(
  db: Client,
  from: string,
  to: string,
): Promise<CalorieDay[]> {
  const r = await db.execute({
    sql: `SELECT id,date,kcal,note FROM calorie_entries
          WHERE date BETWEEN ? AND ? ORDER BY date DESC, id`,
    args: [from, to],
  });
  const byDate = new Map<string, CalorieEntry[]>();
  for (const x of r.rows) {
    const d = String(x.date);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push({
      id: Number(x.id),
      kcal: num(x.kcal),
      note: x.note == null ? null : String(x.note),
    });
  }
  return [...byDate.entries()].map(([date, entries]) => ({
    date,
    total: entries.reduce((s, e) => s + e.kcal, 0),
    entries,
  }));
}

// ---------------------------------------------------------------- adherence config

export type AdherenceConfig = {
  /** Non-negotiables count from this date onward. null = never (blocks only). */
  habitsSince: string | null;
  /** 'HH:MM' local. Before this, an unticked habit is not in the denominator. */
  cutoff: string;
};

export async function getAdherenceConfig(db: Client): Promise<AdherenceConfig> {
  const r = await db.execute(
    "SELECT key,value FROM app_meta WHERE key IN ('adherence_habits_since','habit_cutoff')",
  );
  const m = new Map(r.rows.map((x) => [String(x.key), String(x.value)]));
  return {
    habitsSince: m.get("adherence_habits_since") ?? null,
    cutoff: m.get("habit_cutoff") ?? "21:00",
  };
}

/**
 * The day’s non-negotiable tally.
 *
 * THERE IS NO LONGER A CUTOFF. Habits used to sit outside the denominator until an evening
 * hour, so the figure lurched at 21:00 when the untouched ones joined it. With the figure
 * now climbing from zero, that machinery has nothing to protect against: an unticked habit
 * simply has not added its share yet, which is the same statement the whole number makes.
 *
 * The habitsSince gate went with it. It existed to stop a rule change rewriting days
 * already lived; the owner’s call is that the handful of placeholder days in the record
 * are not worth a versioning scheme.
 */
export function habitTallyFor(
  _date: string,
  scheduled: number,
  done: number,
): HabitTally {
  return { scheduled, done };
}

export async function pillarMaps(db: Client) {
  const r = await db.execute("SELECT id,key FROM pillars");
  const byId = new Map<number, PillarKey>();
  const byKey = new Map<string, number>();
  for (const p of r.rows) {
    byId.set(num(p.id), String(p.key) as PillarKey);
    byKey.set(String(p.key), num(p.id));
  }
  return { byId, byKey };
}

export async function getPillars(db: Client): Promise<PillarView[]> {
  const r = await db.execute(
    "SELECT key,name,priority,color FROM pillars ORDER BY sort_order",
  );
  return r.rows.map((p) => ({
    key: String(p.key) as PillarKey,
    name: String(p.name),
    priority: String(p.priority),
    color: str(p.color),
  }));
}

async function loadMarks(db: Client, date: string) {
  const r = await db.execute({
    sql: "SELECT event_id,state,reason FROM block_marks WHERE date=?",
    args: [date],
  });
  const m = new Map<string, { state: BlockState; reason: string | null }>();
  for (const row of r.rows) {
    m.set(String(row.event_id), {
      state: String(row.state) as BlockState,
      reason: str(row.reason),
    });
  }
  return m;
}

/**
 * Today's non-negotiables: only those scheduled for this weekday, wearing any per-date
 * OVERRIDE the owner set for it — a different name, a different pillar, for that day
 * only. COALESCE keeps the default the truth everywhere no override exists, and the id
 * stays the habit's own, so ticks land on the same history whatever it was called today.
 */
export async function habitsForDate(
  db: Client,
  date: string,
): Promise<HabitView[]> {
  const { byId } = await pillarMaps(db);
  const bit = weekdayBit(date);
  const r = await db.execute({
    sql: `SELECT h.id,
                 COALESCE(o.name, h.name) AS name,
                 COALESCE(o.pillar_id, h.pillar_id) AS pillar_id,
                 h.days_mask,h.system_key,h.input,h.unit, he.value AS v
          FROM habits h
          LEFT JOIN habit_entries he ON he.habit_id=h.id AND he.date=?
          LEFT JOIN habit_overrides o ON o.habit_id=h.id AND o.date=?
          WHERE h.active=1 AND (h.days_mask & ?) != 0
          ORDER BY h.sort_order, h.id`,
    args: [date, date, bit],
  });
  return r.rows.map((h) => ({
    id: num(h.id),
    name: String(h.name),
    pillar: h.pillar_id == null ? null : (byId.get(num(h.pillar_id)) ?? null),
    days_mask: num(h.days_mask),
    done: h.v != null,
    system_key: str(h.system_key),
    input: (str(h.input) ?? "check") as "check" | "number",
    unit: str(h.unit),
    value: h.v == null ? null : Number(h.v),
  }));
}

/** The raw overrides for one date, keyed by habit id — the editor needs to know which
 *  fields are actually overridden, which the COALESCEd view above cannot say. */
export async function habitOverridesFor(
  db: Client,
  date: string,
): Promise<Map<number, { name: string | null; pillar: PillarKey | null }>> {
  const { byId } = await pillarMaps(db);
  const r = await db.execute({
    sql: "SELECT habit_id, name, pillar_id FROM habit_overrides WHERE date=?",
    args: [date],
  });
  return new Map(
    r.rows.map((x) => [
      num(x.habit_id),
      {
        name: x.name == null ? null : String(x.name),
        pillar:
          x.pillar_id == null ? null : (byId.get(num(x.pillar_id)) ?? null),
      },
    ]),
  );
}

/** Every habit, for the editor — including ones not scheduled today. */
export async function allHabits(db: Client): Promise<HabitView[]> {
  const { byId } = await pillarMaps(db);
  const r = await db.execute(
    "SELECT id,name,pillar_id,days_mask,system_key,input,unit FROM habits WHERE active=1 ORDER BY sort_order, id",
  );
  return r.rows.map((h) => ({
    id: num(h.id),
    name: String(h.name),
    pillar: h.pillar_id == null ? null : (byId.get(num(h.pillar_id)) ?? null),
    days_mask: num(h.days_mask),
    done: false,
    system_key: str(h.system_key),
    input: (str(h.input) ?? "check") as "check" | "number",
    unit: str(h.unit),
    value: null,
  }));
}

export async function getDayView(
  db: Client,
  date: string,
  events: CalEvent[],
  calendarConnected: boolean,
): Promise<DayView> {
  const marks = await loadMarks(db, date);
  const blocks = buildBlocks(date, events, marks);

  const habits = await habitsForDate(db, date);
  const pillars = await getPillars(db);

  // Non-negotiables join the rate, weighted equally with blocks — one item is one item.
  const cfg = await getAdherenceConfig(db);
  const adherence = adherenceFor(
    blocks,
    habitTallyFor(date, habits.length, habits.filter((h) => h.done).length),
  );

  const journalRes = await db.execute({
    sql: "SELECT id, kind, substr(COALESCE(body,''),1,140) AS preview FROM journal_entries WHERE date=? ORDER BY id",
    args: [date],
  });
  const cal = await caloriesForDate(db, date);
  const titles = await dayTitlesBetween(db, date, date);
  const { count } = await getStreak(db, date);

  return {
    date,
    calendarConnected,
    blocks,
    adherence,
    streak: count,
    habits,
    journal: journalRes.rows.map((j) => ({
      id: num(j.id),
      kind: String(j.kind ?? "drawing"),
      preview: j.kind === "text" ? String(j.preview ?? "") : null,
    })),
    calories: cal.total,
    calorieEntries: cal.entries,
    title: titles.get(date) ?? null,
    pillars,
  };
}

export async function listGoals(db: Client): Promise<GoalView[]> {
  const r = await db.execute(
    "SELECT g.id,g.title,g.target,g.status,g.completed_at,p.key AS pk FROM goals g JOIN pillars p ON g.pillar_id=p.id WHERE g.status != 'dropped' ORDER BY p.sort_order, g.id",
  );
  const subs = await db.execute(
    "SELECT id,goal_id,title,weight,done FROM subgoals ORDER BY goal_id, sort_order, id",
  );

  type RawSub = Omit<SubgoalView, "effectiveWeight">;
  const byGoal = new Map<number, RawSub[]>();
  for (const s of subs.rows) {
    const gid = num(s.goal_id);
    const list: RawSub[] = byGoal.get(gid) ?? [];
    list.push({
      id: num(s.id),
      title: String(s.title),
      weight: num(s.weight),
      done: num(s.done) === 1,
    });
    byGoal.set(gid, list);
  }

  return r.rows.map((g) => {
    const raw = byGoal.get(num(g.id)) ?? [];
    // Progress is DERIVED here rather than read from goals.progress, so the stored
    // column can never drift out of step with the subgoals that define it. (It already
    // had: row 1 stored 0.0833 while deriving 0.)
    const w = deriveWeights(raw);
    return {
      id: num(g.id),
      pillar: String(g.pk) as PillarKey,
      title: String(g.title),
      target: str(g.target),
      progress: w.progress,
      status: String(g.status),
      subgoals: raw.map((s, i) => ({ ...s, effectiveWeight: w.effective[i] })),
      overAllocated: w.overAllocated,
      completedAt: str(g.completed_at),
    };
  });
}

/**
 * Every skill, ALWAYS including parked ones.
 *
 * Parked skills are never filtered out — the point of the board is seeing everything
 * you have put time into, including what you're not working on right now.
 */
export async function listSkills(
  db: Client,
  anchor: string,
): Promise<SkillView[]> {
  const { byId } = await pillarMaps(db);
  const from = addDays(anchor, -(WINDOW_DAYS - 1));
  const r = await db.execute({
    sql: `SELECT s.id, s.name, s.pillar_id, s.state, s.last_touched,
            COALESCE((SELECT SUM(minutes) FROM skill_time t WHERE t.skill_id = s.id), 0) AS minutes,
            COALESCE((SELECT SUM(minutes) FROM skill_time t
                       WHERE t.skill_id = s.id AND t.date BETWEEN ? AND ?), 0) AS minutes14,
            COALESCE((SELECT COUNT(DISTINCT date) FROM skill_time t
                       WHERE t.skill_id = s.id AND t.date BETWEEN ? AND ?), 0) AS sessions14
     FROM skills s
     ORDER BY CASE s.state WHEN 'active' THEN 0 WHEN 'always_on' THEN 1 ELSE 2 END, s.sort_order, s.id`,
    args: [from, anchor, from, anchor],
  });
  const today = Date.now();
  return r.rows.map((s) => {
    const t =
      s.last_touched == null ? null : Date.parse(String(s.last_touched));
    return {
      id: num(s.id),
      name: String(s.name),
      pillar: s.pillar_id == null ? null : (byId.get(num(s.pillar_id)) ?? null),
      state: String(s.state) as SkillView["state"],
      // num() is mandatory on every aggregate: libSQL returns them as BigInt, and
      // `bigint / number` THROWS rather than producing a wrong answer.
      minutes: num(s.minutes),
      minutes14: num(s.minutes14),
      sessions14: num(s.sessions14),
      staleDays:
        t == null || Number.isNaN(t)
          ? null
          : Math.floor((today - t) / 86400000),
    };
  });
}

/**
 * Raw counts for every ring metric over [from, to] inclusive.
 *
 * `resolved` says whether the SOURCE wired up — never whether it found rows. Zero rows
 * in the window is a real, meaningful zero and must stay distinguishable from a metric
 * that has no source at all, or a first day reads as a fortnight of neglect.
 */
/**
 * The plain-words fortnight, one line per pillar.
 *
 * Separate from getRingCounts on purpose. That function answers "how full is the ring",
 * which is a capped, weighted, sufficiency question; this answers "what actually happened",
 * which is a raw count and must never cap. Deriving one from the other would have meant the
 * caption inheriting the ring's cap and printing "8 sessions" on a fortnight of twenty.
 *
 * Grape calendar events are deliberately NOT counted here. The owner logs sessions by hand
 * and does not want them counted twice; the caption follows the ring's rule.
 */
export type PillarFacts = {
  /** Portfolio: total minutes across every skill in the window. */
  skillMinutes: number;
  /** Physical: gym_sessions ROWS in the window, all three kinds. Sessions, not days. */
  workoutSessions: number;
  /** Social: outreach non-negotiable ticks in the window. */
  outreach: number;
};

export async function getPillarFacts(
  db: Client,
  from: string,
  to: string,
): Promise<PillarFacts> {
  const [mins, sessions, out] = await Promise.all([
    db.execute({
      sql: "SELECT COALESCE(SUM(minutes),0) AS n FROM skill_time WHERE date BETWEEN ? AND ?",
      args: [from, to],
    }),
    db.execute({
      sql: "SELECT COUNT(*) AS n FROM gym_sessions WHERE date BETWEEN ? AND ?",
      args: [from, to],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT e.date) AS n
              FROM habit_entries e
              JOIN habits h ON h.id = e.habit_id
             WHERE h.system_key = 'outreach' AND e.value > 0
               AND e.date BETWEEN ? AND ?`,
      args: [from, to],
    }),
  ]);
  // num() at the boundary, every time: libSQL returns aggregates as BigInt and
  // `bigint / number` throws.
  return {
    skillMinutes: num(mins.rows[0].n),
    workoutSessions: num(sessions.rows[0].n),
    outreach: num(out.rows[0].n),
  };
}

export async function getRingCounts(
  db: Client,
  from: string,
  to: string,
  /**
   * Counts this function cannot get from the database.
   *
   * Calendar events are never persisted — they are read live from Google — so a metric
   * sourced from them has to be counted by the caller that already holds the range. Keyed
   * by metric key; a key that is absent is treated as an unresolved source rather than a
   * zero, so a Google outage reads as "no data" instead of "you did nothing".
   */
  external: Record<string, number | undefined> = {},
): Promise<Record<string, RawCount>> {
  const out: Record<string, RawCount> = {};

  for (const m of METRICS) {
    if (!m.sourceReady) {
      out[m.key] = { count: 0, resolved: false };
      continue;
    }

    if (m.source === "habit") {
      const h = await db.execute({
        sql: "SELECT id FROM habits WHERE system_key=? AND active=1",
        args: [m.systemKey!],
      });
      if (!h.rows.length) {
        // A metric declared ready whose wire is broken. Ghost it so the screen still
        // works, but say so loudly — silently ghosting hides a bug behind a state that
        // looks intentional.
        console.error(
          `[rings] metric "${m.key}" is sourceReady but system_key "${m.systemKey}" resolved to no active habit`,
        );
        out[m.key] = { count: 0, resolved: false };
        continue;
      }
      // value > 0: the column is a REAL defaulting to 1 and nothing constrains it to be
      // truthy, so a 0 row would otherwise count as a tick.
      const r = await db.execute({
        sql: "SELECT COUNT(DISTINCT date) AS n FROM habit_entries WHERE habit_id=? AND date BETWEEN ? AND ? AND value > 0",
        args: [num(h.rows[0].id), from, to],
      });
      out[m.key] = { count: num(r.rows[0].n), resolved: true };
      continue;
    }

    if (m.source === "calendar_social") {
      const n = external[m.key];
      out[m.key] = n == null ? { count: 0, resolved: false } : { count: n, resolved: true };
      continue;
    }

    if (m.source === "gym") {
      // Driven by the metric's own perDayCapped flag rather than hard-coded. Gym now
      // counts SESSIONS — two lifts on a Tuesday are two things that happened — which is
      // the owner's ruling. Keeping the switch here rather than in the SQL means the noun
      // printed in the fact line and the way it is counted can never drift apart again;
      // `misc` spent its whole life declaring "sessions" while being counted by date.
      const agg = m.perDayCapped ? "COUNT(DISTINCT date)" : "COUNT(*)";
      const r = await db.execute({
        sql: `SELECT ${agg} AS n FROM gym_sessions WHERE kind=? AND date BETWEEN ? AND ?`,
        args: [m.workoutKind!, from, to],
      });
      out[m.key] = { count: num(r.rows[0].n), resolved: true };
      continue;
    }

    if (m.source === "skill_session") {
      // Sessions, not days: three skills on one Saturday is three. Several of these are
      // social activities rather than crammed practice. The ring's own cap still bounds it.
      const r = await db.execute({
        sql: "SELECT COUNT(*) AS n FROM (SELECT DISTINCT skill_id, date FROM skill_time WHERE date BETWEEN ? AND ?)",
        args: [from, to],
      });
      out[m.key] = { count: num(r.rows[0].n), resolved: true };
      continue;
    }

    out[m.key] = { count: 0, resolved: false };
  }

  return out;
}

/** How much of the 14-day window has actually been observed. Caps at WINDOW_DAYS. */
export async function getObservedDays(
  db: Client,
  anchor: string,
): Promise<number> {
  const r = await db.execute(
    "SELECT value FROM app_meta WHERE key='rings_since'",
  );
  if (!r.rows.length) return WINDOW_DAYS;
  return Math.max(
    1,
    Math.min(WINDOW_DAYS, daysBetween(String(r.rows[0].value), anchor) + 1),
  );
}

// logSkillTime moved to engine.ts — it is a write, and every write in this app runs
// transactionally in the engine.
