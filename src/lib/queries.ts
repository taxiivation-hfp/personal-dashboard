// Read models. No XP, no levels, no points — see CLAUDE.md.

import type { Client } from "./db/client";
import { getStreak, weekdayBit } from "./engine";
import { adherenceFor, buildBlocks, type Adherence, type Block, type BlockState } from "./adherence";
import type { CalEvent } from "./google";

export type PillarKey = "social_capital" | "physical" | "portfolio";

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

export type SubgoalView = { id: number; title: string; weight: number; done: boolean };

export type GoalView = {
  id: number;
  pillar: PillarKey;
  title: string;
  target: string | null;
  /** Derived: the sum of completed subgoal weights. Never inferred from activity. */
  progress: number;
  status: string;
  subgoals: SubgoalView[];
  /** Surfaced so a mis-weighted goal is visible rather than silently wrong. */
  weightSum: number;
};

export type SkillView = {
  id: number;
  name: string;
  pillar: PillarKey | null;
  state: "always_on" | "active" | "parked";
  /** Total minutes logged. A measurement of time spent — not a score, not a level. */
  minutes: number;
  staleDays: number | null;
};

export type JournalView = { id: number };

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
  /** Categorisation only — a well-roundedness reminder, never the hero. */
  pillarAdherence: { pillar: PillarKey; name: string; adhered: number; due: number }[];
};

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
  const adherence = adherenceFor(blocks);

  const habits = await habitsForDate(db, date);
  const pillars = await getPillars(db);

  const journalRes = await db.execute({ sql: "SELECT id FROM journal_entries WHERE date=? ORDER BY id", args: [date] });
  const cal = await db.execute({ sql: "SELECT calories FROM health_logs WHERE date=?", args: [date] });
  const { count } = await getStreak(db, date);

  // Pillar adherence is derived from the non-negotiables' pillars only — blocks come
  // from Google and carry no pillar. It is a balance hint, nothing more.
  const pillarAdherence = pillars.map((p) => {
    const mine = habits.filter((h) => h.pillar === p.key);
    return { pillar: p.key, name: p.name, adhered: mine.filter((h) => h.done).length, due: mine.length };
  });

  return {
    date,
    calendarConnected,
    blocks,
    adherence,
    streak: count,
    habits,
    journal: journalRes.rows.map((j) => ({ id: num(j.id) })),
    calories: cal.rows[0]?.calories == null ? null : num(cal.rows[0].calories),
    pillars,
    pillarAdherence,
  };
}

export async function listGoals(db: Client): Promise<GoalView[]> {
  const r = await db.execute(
    "SELECT g.id,g.title,g.target,g.status,p.key AS pk FROM goals g JOIN pillars p ON g.pillar_id=p.id WHERE g.status != 'dropped' ORDER BY p.sort_order, g.id"
  );
  const subs = await db.execute("SELECT id,goal_id,title,weight,done FROM subgoals ORDER BY goal_id, sort_order, id");

  const byGoal = new Map<number, SubgoalView[]>();
  for (const s of subs.rows) {
    const gid = num(s.goal_id);
    const list = byGoal.get(gid) ?? [];
    list.push({ id: num(s.id), title: String(s.title), weight: num(s.weight), done: num(s.done) === 1 });
    byGoal.set(gid, list);
  }

  return r.rows.map((g) => {
    const subgoals = byGoal.get(num(g.id)) ?? [];
    // Progress is DERIVED here rather than read from goals.progress, so the stored
    // column can never drift out of step with the subgoals that define it.
    const progress = subgoals.reduce((sum, s) => sum + (s.done ? s.weight : 0), 0);
    return {
      id: num(g.id),
      pillar: String(g.pk) as PillarKey,
      title: String(g.title),
      target: str(g.target),
      progress: Math.min(1, progress),
      status: String(g.status),
      subgoals,
      weightSum: subgoals.reduce((sum, s) => sum + s.weight, 0),
    };
  });
}

export async function createGoal(
  db: Client,
  g: { pillar_id: number; title: string; target?: string | null }
): Promise<number> {
  const r = await db.execute({
    sql: "INSERT INTO goals (pillar_id,title,target) VALUES (?,?,?)",
    args: [g.pillar_id, g.title.trim(), g.target ?? null],
  });
  return Number(r.lastInsertRowid);
}

/**
 * Goal progress is now set BY HAND. It used to be derived from completed-task counts,
 * which was an output measure — the exact thing this app stopped scoring.
 */
export async function updateGoal(
  db: Client,
  id: number,
  patch: { title?: string; target?: string | null; progress?: number; status?: string }
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) (sets.push("title=?"), args.push(patch.title));
  if (patch.target !== undefined) (sets.push("target=?"), args.push(patch.target));
  if (patch.progress !== undefined) (sets.push("progress=?"), args.push(Math.max(0, Math.min(1, patch.progress))));
  if (patch.status !== undefined) (sets.push("status=?"), args.push(patch.status));
  if (!sets.length) return;
  sets.push("updated_at=?");
  args.push(new Date().toISOString(), id);
  await db.execute({ sql: `UPDATE goals SET ${sets.join(", ")} WHERE id=?`, args });
}

/**
 * Every skill, ALWAYS including parked ones.
 *
 * Parked skills are never filtered out — the point of the board is seeing everything
 * you have put time into, including what you're not working on right now.
 */
export async function listSkills(db: Client): Promise<SkillView[]> {
  const { byId } = await pillarMaps(db);
  const r = await db.execute(
    `SELECT s.id, s.name, s.pillar_id, s.state, s.last_touched,
            COALESCE((SELECT SUM(minutes) FROM skill_time t WHERE t.skill_id = s.id), 0) AS minutes
     FROM skills s
     ORDER BY CASE s.state WHEN 'active' THEN 0 WHEN 'always_on' THEN 1 ELSE 2 END, s.sort_order, s.id`
  );
  const today = Date.now();
  return r.rows.map((s) => {
    const t = s.last_touched == null ? null : Date.parse(String(s.last_touched));
    return {
      id: num(s.id),
      name: String(s.name),
      pillar: s.pillar_id == null ? null : byId.get(num(s.pillar_id)) ?? null,
      state: String(s.state) as SkillView["state"],
      minutes: num(s.minutes),
      staleDays: t == null || Number.isNaN(t) ? null : Math.floor((today - t) / 86400000),
    };
  });
}

export async function logSkillTime(
  db: Client,
  skillId: number,
  minutes: number,
  date: string,
  note?: string | null
): Promise<void> {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  await db.execute({
    sql: "INSERT INTO skill_time (skill_id,date,minutes,note) VALUES (?,?,?,?)",
    args: [skillId, date, Math.round(minutes), note ?? null],
  });
  await db.execute({
    sql: "UPDATE skills SET last_touched=?, updated_at=? WHERE id=?",
    args: [new Date().toISOString(), new Date().toISOString(), skillId],
  });
}
