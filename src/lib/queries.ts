// Read models. No XP, no levels, no points — see CLAUDE.md.

import type { Client } from "./db/client";
import { getStreak, weekdayBit } from "./engine";
import {
  adherenceFor,
  buildBlocks,
  habitsDueOn,
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

export type PillarView = { key: PillarKey; name: string; priority: string };

export type HabitView = {
  id: number;
  name: string;
  pillar: PillarKey | null;
  days_mask: number;
  done: boolean;
  system_key: string | null;
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

export type DayView = {
  date: string;
  calendarConnected: boolean;
  blocks: Block[];
  adherence: Adherence;
  streak: number;
  habits: HabitView[];
  journal: JournalView[];
  calories: number | null;
  pillars: PillarView[];
};

// ---------------------------------------------------------------- adherence config

export type AdherenceConfig = {
  /** Non-negotiables count from this date onward. null = never (blocks only). */
  habitsSince: string | null;
  /** 'HH:MM' local. Before this, an unticked habit is not in the denominator. */
  cutoff: string;
};

export async function getAdherenceConfig(db: Client): Promise<AdherenceConfig> {
  const r = await db.execute(
    "SELECT key,value FROM app_meta WHERE key IN ('adherence_habits_since','habit_cutoff')"
  );
  const m = new Map(r.rows.map((x) => [String(x.key), String(x.value)]));
  return { habitsSince: m.get("adherence_habits_since") ?? null, cutoff: m.get("habit_cutoff") ?? "21:00" };
}

/**
 * The habit tally for one date, or null when non-negotiables do not count for it.
 *
 * null for any day BEFORE the start stamp — those days were lived under the blocks-only
 * rule and rewriting them would show four untouched non-negotiables against every one of
 * them, which is a lie about days that already happened.
 */
export function habitTallyFor(
  date: string,
  scheduled: number,
  done: number,
  cfg: AdherenceConfig,
  nowMs: number = Date.now(),
  today: string = todayISO()
): HabitTally | null {
  if (!cfg.habitsSince || date < cfg.habitsSince) return null;
  const cutoffMs = Date.parse(rfc3339(date, cfg.cutoff));
  return { due: habitsDueOn(date, today, nowMs, cutoffMs), scheduled, done };
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
  const r = await db.execute("SELECT key,name,priority FROM pillars ORDER BY sort_order");
  return r.rows.map((p) => ({ key: String(p.key) as PillarKey, name: String(p.name), priority: String(p.priority) }));
}

async function loadMarks(db: Client, date: string) {
  const r = await db.execute({
    sql: "SELECT event_id,state,reason FROM block_marks WHERE date=?",
    args: [date],
  });
  const m = new Map<string, { state: BlockState; reason: string | null }>();
  for (const row of r.rows) {
    m.set(String(row.event_id), { state: String(row.state) as BlockState, reason: str(row.reason) });
  }
  return m;
}

/** Today's non-negotiables: only those scheduled for this weekday. */
export async function habitsForDate(db: Client, date: string): Promise<HabitView[]> {
  const { byId } = await pillarMaps(db);
  const bit = weekdayBit(date);
  const r = await db.execute({
    sql: `SELECT h.id,h.name,h.pillar_id,h.days_mask,h.system_key, he.value AS v
          FROM habits h LEFT JOIN habit_entries he ON he.habit_id=h.id AND he.date=?
          WHERE h.active=1 AND (h.days_mask & ?) != 0
          ORDER BY h.sort_order, h.id`,
    args: [date, bit],
  });
  return r.rows.map((h) => ({
    id: num(h.id),
    name: String(h.name),
    pillar: h.pillar_id == null ? null : byId.get(num(h.pillar_id)) ?? null,
    days_mask: num(h.days_mask),
    done: h.v != null,
    system_key: str(h.system_key),
  }));
}

/** Every habit, for the editor — including ones not scheduled today. */
export async function allHabits(db: Client): Promise<HabitView[]> {
  const { byId } = await pillarMaps(db);
  const r = await db.execute(
    "SELECT id,name,pillar_id,days_mask,system_key FROM habits WHERE active=1 ORDER BY sort_order, id"
  );
  return r.rows.map((h) => ({
    id: num(h.id),
    name: String(h.name),
    pillar: h.pillar_id == null ? null : byId.get(num(h.pillar_id)) ?? null,
    days_mask: num(h.days_mask),
    done: false,
    system_key: str(h.system_key),
  }));
}

export async function getDayView(
  db: Client,
  date: string,
  events: CalEvent[],
  calendarConnected: boolean
): Promise<DayView> {
  const marks = await loadMarks(db, date);
  const blocks = buildBlocks(date, events, marks);

  const habits = await habitsForDate(db, date);
  const pillars = await getPillars(db);

  // Non-negotiables join the rate, weighted equally with blocks — one item is one item.
  const cfg = await getAdherenceConfig(db);
  const adherence = adherenceFor(
    blocks,
    habitTallyFor(date, habits.length, habits.filter((h) => h.done).length, cfg)
  );

  const journalRes = await db.execute({
    sql: "SELECT id, kind, substr(COALESCE(body,''),1,140) AS preview FROM journal_entries WHERE date=? ORDER BY id",
    args: [date],
  });
  const cal = await db.execute({ sql: "SELECT calories FROM health_logs WHERE date=?", args: [date] });
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
    calories: cal.rows[0]?.calories == null ? null : num(cal.rows[0].calories),
    pillars,
  };
}

export async function listGoals(db: Client): Promise<GoalView[]> {
  const r = await db.execute(
    "SELECT g.id,g.title,g.target,g.status,p.key AS pk FROM goals g JOIN pillars p ON g.pillar_id=p.id WHERE g.status != 'dropped' ORDER BY p.sort_order, g.id"
  );
  const subs = await db.execute("SELECT id,goal_id,title,weight,done FROM subgoals ORDER BY goal_id, sort_order, id");

  type RawSub = Omit<SubgoalView, "effectiveWeight">;
  const byGoal = new Map<number, RawSub[]>();
  for (const s of subs.rows) {
    const gid = num(s.goal_id);
    const list: RawSub[] = byGoal.get(gid) ?? [];
    list.push({ id: num(s.id), title: String(s.title), weight: num(s.weight), done: num(s.done) === 1 });
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
    };
  });
}

/**
 * Every skill, ALWAYS including parked ones.
 *
 * Parked skills are never filtered out — the point of the board is seeing everything
 * you have put time into, including what you're not working on right now.
 */
export async function listSkills(db: Client, anchor: string): Promise<SkillView[]> {
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
    const t = s.last_touched == null ? null : Date.parse(String(s.last_touched));
    return {
      id: num(s.id),
      name: String(s.name),
      pillar: s.pillar_id == null ? null : byId.get(num(s.pillar_id)) ?? null,
      state: String(s.state) as SkillView["state"],
      // num() is mandatory on every aggregate: libSQL returns them as BigInt, and
      // `bigint / number` THROWS rather than producing a wrong answer.
      minutes: num(s.minutes),
      minutes14: num(s.minutes14),
      sessions14: num(s.sessions14),
      staleDays: t == null || Number.isNaN(t) ? null : Math.floor((today - t) / 86400000),
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
export async function getRingCounts(db: Client, from: string, to: string): Promise<Record<string, RawCount>> {
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
          `[rings] metric "${m.key}" is sourceReady but system_key "${m.systemKey}" resolved to no active habit`
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

    if (m.source === "gym") {
      // DISTINCT date within a kind: the per-day cap applies per kind, so two strength
      // sessions on Tuesday is still one strength day.
      const r = await db.execute({
        sql: "SELECT COUNT(DISTINCT date) AS n FROM gym_sessions WHERE kind=? AND date BETWEEN ? AND ?",
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
export async function getObservedDays(db: Client, anchor: string): Promise<number> {
  const r = await db.execute("SELECT value FROM app_meta WHERE key='rings_since'");
  if (!r.rows.length) return WINDOW_DAYS;
  return Math.max(1, Math.min(WINDOW_DAYS, daysBetween(String(r.rows[0].value), anchor) + 1));
}

// logSkillTime moved to engine.ts — it is a write, and every write in this app runs
// transactionally in the engine.
