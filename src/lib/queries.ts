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
import { carriedDays, tasksFor, type DayTask } from "./tasks";
import { workedFraction } from "./worked";

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
  /** Lifetime SESSIONS logged. A count of times you turned up — not a score, not a level.
   *  Only ever accumulates, so this is the continuity number. Was lifetime minutes. */
  sessions: number;
  /** Sessions in the rolling 14-day window — the LIVE number. Answers "what am I on
   *  now", which the lifetime total cannot. ROWS, not distinct days: two sittings at the
   *  piano on one Saturday are two sessions, the ruling gym already runs under. */
  sessions14: number;
  /** The window's sessions themselves, newest first — the log the dialog reopens. Skills
   *  hold few enough of these that a list is cheaper than a second round trip per skill. */
  recent: { id: number; date: string; note: string }[];
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
  /** Today's step count as the phone last pushed it. null = no push yet — the checklist
   *  row prints "—", never a zero the phone didn't say. */
  steps: number | null;
  /**
   * WHEN the phone last pushed this day, as the UTC instant health_logs stamped.
   *
   * The count on its own cannot say whether it is this minute's or this morning's, and a
   * step count you assume is current when it is four hours old is worse than no count —
   * it is a number you act on. Carried beside the figure so the row can print its age.
   *
   * null when nothing has ever been pushed for the day.
   */
  stepsUpdatedAt: string | null;
  /** The day's running total, derived from calorieEntries. null when nothing is logged,
   *  so the screen can render "—" rather than a zero nobody entered. */
  calories: number | null;
  /** The individual additions, so a mistyped one can be removed rather than retyped. */
  calorieEntries: CalorieEntry[];
  /** What the owner intends the day to be. null when unnamed. */
  title: string | null;
  /**
   * One-off tasks sitting on this day — the ones due today, plus anything that carried in
   * from an earlier day, plus whatever was ticked today.
   *
   * DELIBERATELY ABSENT FROM `adherence` ABOVE. See src/lib/tasks.ts: a carrying backlog
   * joining that fixed denominator would make each non-negotiable worth less for reasons
   * nothing about today caused, which is the "item you are designed to fail" CLAUDE.md
   * already ruled out once for the gym.
   */
  tasks: DayTaskView[];
  pillars: PillarView[];
};

/** One addition to a day's total. `note` is the food's name, or null — the schema always
 *  had the column; the UI only started writing it when logging grew a name field. */
export type CalorieEntry = { id: number; kcal: number; note: string | null };

/** A one-off task as the screen needs it: the row, plus how long it has been carrying. */
export type DayTaskView = DayTask & {
  done: boolean;
  /** Days since it was first due, 0 unless it has carried. A fact, never a penalty. */
  carried: number;
};

/**
 * The tasks belonging to one day.
 *
 * Loads the OUTSTANDING ones plus anything ticked on that date, then lets tasks.ts place
 * them — the carry is derived, so the query cannot do the placing itself without teaching
 * SQL the same rule twice. Outstanding tasks are a short list by nature (a backlog nobody
 * clears is the thing this feature exists to surface), so fetching them all is cheaper than
 * a window of dates would be.
 */
export async function dayTasksFor(
  db: Client,
  date: string,
  today: string,
): Promise<DayTaskView[]> {
  const r = await db.execute({
    sql: "SELECT id,title,due,done_on FROM day_tasks WHERE done_on IS NULL OR done_on = ?",
    args: [date],
  });
  const all: DayTask[] = r.rows.map((x) => ({
    id: num(x.id),
    title: String(x.title),
    due: String(x.due),
    doneOn: str(x.done_on),
  }));
  return tasksFor(all, date, today).map((t) => ({
    ...t,
    done: t.doneOn != null,
    carried: carriedDays(t, today),
  }));
}

/** Every task not yet ticked, soonest first — the planning list on /habits. */
export async function openDayTasks(db: Client, today: string): Promise<DayTaskView[]> {
  const r = await db.execute(
    "SELECT id,title,due,done_on FROM day_tasks WHERE done_on IS NULL ORDER BY due, id",
  );
  return r.rows.map((x) => {
    const t: DayTask = {
      id: num(x.id),
      title: String(x.title),
      due: String(x.due),
      doneOn: null,
    };
    return { ...t, done: false, carried: carriedDays(t, today) };
  });
}

/** One past day of the calorie log, for the dialog's sidebar. */
export type CalorieDay = { date: string; total: number; entries: CalorieEntry[] };

/** What a marked calendar event was worth over a window: its state, and how much of it was
 *  worked. */
export type EventWork = { state: BlockState; worked: number };

/**
 * Marked calendar events over a window, by event id — the state AND the worked fraction.
 *
 * It used to be `adheredEventIds`, a bare Set of ids marked 'adhered', because the two ring
 * consumers wanted the same thing from it. They no longer do, and the split is the whole
 * reason this returns a map:
 *
 *   - THE SOCIAL RING wants `state === 'adhered'`, strictly. An event on the calendar you
 *     drifted from is not a social fortnight you had, and the fraction has nothing to say
 *     about it — a social event is a thing that happened, not a quantity of hours, so half
 *     an evening out is not half a social event.
 *   - THE PORTFOLIO LAP wants `worked`, because it is measured in HOURS, and an hour worked
 *     is an hour worked wherever it is read.
 *
 * One query rather than two over the same rows, and one place where a fifth reader of the
 * state table would otherwise have appeared.
 */
export async function eventWorkIn(
  db: Client,
  from: string,
  to: string,
): Promise<Map<string, EventWork>> {
  const r = await db.execute({
    sql: `SELECT event_id,state,worked_fraction FROM block_marks
          WHERE date BETWEEN ? AND ?`,
    args: [from, to],
  });
  const m = new Map<string, EventWork>();
  for (const x of r.rows) {
    const state = String(x.state) as BlockState;
    m.set(String(x.event_id), {
      state,
      worked: workedFraction(
        state,
        x.worked_fraction == null ? null : Number(x.worked_fraction),
      ),
    });
  }
  return m;
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
    sql: "SELECT event_id,state,reason,worked_fraction FROM block_marks WHERE date=?",
    args: [date],
  });
  const m = new Map<
    string,
    { state: BlockState; reason: string | null; workedFraction: number | null }
  >();
  for (const row of r.rows) {
    m.set(String(row.event_id), {
      state: String(row.state) as BlockState,
      reason: str(row.reason),
      // NULL stays null rather than becoming 0: "nobody was asked" and "you said none of
      // it" are different facts, and the coach is the reader that can use the difference.
      workedFraction:
        row.worked_fraction == null ? null : Number(row.worked_fraction),
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
  // The phone's last push for this day, and WHEN it landed. null when it never pushed —
  // the row prints "—", never a zero the phone didn't say. `updated_at` comes back on the
  // same row rather than from a second read: the age of a figure is part of the figure.
  const health = await db.execute({
    sql: "SELECT steps, updated_at FROM health_logs WHERE date=?",
    args: [date],
  });

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
    steps:
      health.rows.length && health.rows[0]!.steps != null
        ? num(health.rows[0]!.steps)
        : null,
    // Tied to the COUNT, not to the row: a health_logs row written by a sleep-only push
    // has an updated_at but no steps, and dating a step count that does not exist would
    // be the one thing an honest staleness label must not do.
    //
    // What this canNOT catch, and it is worth knowing: `updated_at` is a ROW stamp, and
    // the POST bumps it for whatever field arrived. Today that is only ever the steps
    // Shortcut — it is the single writer of this table — so the row's age and the count's
    // age are the same number. The day something pushes sleep or a resting heart rate,
    // they stop being, and an unchanged count would start reading "just now". The fix at
    // that point is a `steps_updated_at` column written only when a steps value is
    // present; it is a migration, so it waits for a reason to exist.
    stepsUpdatedAt:
      health.rows.length && health.rows[0]!.steps != null
        ? str(health.rows[0]!.updated_at)
        : null,
    calories: cal.total,
    calorieEntries: cal.entries,
    title: titles.get(date) ?? null,
    // todayISO() rather than `date`: where a task SITS depends on the real today, not on
    // the day being looked at. Passing `date` here would make a carrying task appear on
    // every future day anyone opened — the exact bug tasks.test.ts pins down.
    tasks: await dayTasksFor(db, date, todayISO()),
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
  // COUNT(*), not COUNT(DISTINCT date): a row is a session now, and a skill may hold
  // several on one day. The old DISTINCT capped each skill at one a day while the metric
  // declared perDayCapped:false — the label-versus-counter drift the registry warns about.
  const r = await db.execute({
    sql: `SELECT s.id, s.name, s.pillar_id, s.state, s.last_touched,
            COALESCE((SELECT COUNT(*) FROM skill_time t WHERE t.skill_id = s.id), 0) AS sessions,
            COALESCE((SELECT COUNT(*) FROM skill_time t
                       WHERE t.skill_id = s.id AND t.date BETWEEN ? AND ?), 0) AS sessions14
     FROM skills s
     ORDER BY CASE s.state WHEN 'active' THEN 0 WHEN 'always_on' THEN 1 ELSE 2 END, s.sort_order, s.id`,
    args: [from, anchor],
  });

  // The window's sessions, in one query rather than one per skill. Ordered newest first so
  // the UI never re-sorts; `note` may be NULL on a row imported under the hours model, and
  // an empty document is the honest rendering of "an hour was logged, nothing was written".
  const notes = await db.execute({
    sql: `SELECT id, skill_id, date, COALESCE(note,'') AS note
            FROM skill_time WHERE date BETWEEN ? AND ?
           ORDER BY date DESC, id DESC`,
    args: [from, anchor],
  });
  const bySkill = new Map<number, { id: number; date: string; note: string }[]>();
  for (const x of notes.rows) {
    const k = num(x.skill_id);
    const list = bySkill.get(k) ?? [];
    list.push({ id: num(x.id), date: String(x.date), note: String(x.note) });
    bySkill.set(k, list);
  }

  const today = Date.now();
  return r.rows.map((s) => {
    const t =
      s.last_touched == null ? null : Date.parse(String(s.last_touched));
    const id = num(s.id);
    return {
      id,
      name: String(s.name),
      pillar: s.pillar_id == null ? null : (byId.get(num(s.pillar_id)) ?? null),
      state: String(s.state) as SkillView["state"],
      // num() is mandatory on every aggregate: libSQL returns them as BigInt, and
      // `bigint / number` THROWS rather than producing a wrong answer.
      sessions: num(s.sessions),
      sessions14: num(s.sessions14),
      recent: bySkill.get(id) ?? [],
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
  /** Portfolio: skill SESSIONS in the window. Was summed minutes — skills log documents
   *  now, not hours, so the caption counts what the ring counts. */
  skillSessions: number;
  /** Physical: gym_sessions ROWS in the window. Sessions, not days. */
  workoutSessions: number;
  /** Social: outreach non-negotiable ticks in the window. */
  outreach: number;
};

export async function getPillarFacts(
  db: Client,
  from: string,
  to: string,
): Promise<PillarFacts> {
  const [skillRows, sessions, out] = await Promise.all([
    // SESSIONS, not summed minutes — skills stopped being measured in hours. Rows that
    // still carry a `minutes` value are pre-ruling history and count as one session each,
    // which is what they always were.
    db.execute({
      sql: "SELECT COUNT(*) AS n FROM skill_time WHERE date BETWEEN ? AND ?",
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
    skillSessions: num(skillRows.rows[0].n),
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

    // Both calendar-sourced metrics come from the caller: Google events are never
    // persisted, so whoever already holds the range counts them. An absent key is an
    // UNRESOLVED source rather than a zero — a Google outage must read "no data", not
    // "you did nothing".
    if (m.source === "calendar_social" || m.source === "calendar_project_hours") {
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

    if (m.source === "health_steps") {
      /**
       * TOTAL STEPS in the window — a SUM, not a count of qualifying days.
       *
       * This used to be `COUNT(*) ... AND steps >= dailyThreshold`, which scored 6,900
       * steps identically to zero and a 20k day identically to 7,001. Steps accumulate,
       * so the ring now asks how far you actually walked. `m.dailyThreshold` is still the
       * daily floor the checklist and the chart draw; it deliberately no longer filters
       * here, and the metric's own `required` carries floor x window.
       *
       * COALESCE because SUM over no rows is NULL, and `num(null)` is not 0 — an empty
       * window must read as a real zero, not as a broken source. `resolved` stays true
       * for the same reason it always did: the table answered.
       */
      const r = await db.execute({
        sql: "SELECT COALESCE(SUM(steps), 0) AS n FROM health_logs WHERE date BETWEEN ? AND ?",
        args: [from, to],
      });
      out[m.key] = { count: num(r.rows[0].n), resolved: true };
      continue;
    }

    if (m.source === "skill_session") {
      /**
       * ROWS, because a row IS a session now.
       *
       * This counted DISTINCT (skill_id, date), which silently capped each skill at one a
       * day while the metric declared `perDayCapped: false` and printed "sessions" — the
       * exact label-versus-counter disagreement that Misc carried for its whole life and
       * that the perDayCapped split exists to prevent. Two sittings at the piano on one
       * Saturday are two sessions, the same ruling gym runs under.
       */
      const r = await db.execute({
        sql: "SELECT COUNT(*) AS n FROM skill_time WHERE date BETWEEN ? AND ?",
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
