// THE RULES. Everything the model must not be trusted to get right lives here and
// runs in transactions.
//
// This app measures ADHERENCE, never output. "Did I do what I said I'd do?" — not
// "how much did I get done?". There is no XP, no levels and no points: a progression
// system rewards volume, which is the exact thing this product refuses to score.
//
// The other rule that outranks everything: honest logging. Marking "drifted" must
// never be made to feel like failure, because a person who feels judged logs
// inaccurately, and inaccurate logs make every number here meaningless.

import type { Client } from "./db/client";
import { addDays, todayISO } from "./dates";

type Tx = Awaited<ReturnType<Client["transaction"]>>;
type Exec = Pick<Tx, "execute">;

export type BlockState = "adhered" | "drifted" | "skipped" | "dismissed";

const now = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

// ---------------------------------------------------------------- blocks

/**
 * Mark a calendar block. Idempotent per (date, event_id) — re-tapping changes the
 * mark rather than adding another.
 *
 * title/time_start/time_end are snapshotted deliberately: the mark has to keep meaning
 * something if the underlying calendar event is later edited or deleted.
 */
export async function markBlock(
  db: Client,
  m: {
    date: string;
    event_id: string;
    state: BlockState;
    title?: string | null;
    time_start?: string | null;
    time_end?: string | null;
    reason?: string | null;
  }
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO block_marks (date,event_id,title,time_start,time_end,state,reason,marked_at)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(date,event_id) DO UPDATE SET
            state=excluded.state,
            reason=excluded.reason,
            title=COALESCE(excluded.title, block_marks.title),
            time_start=COALESCE(excluded.time_start, block_marks.time_start),
            time_end=COALESCE(excluded.time_end, block_marks.time_end),
            marked_at=excluded.marked_at`,
    args: [
      m.date,
      m.event_id,
      m.title ?? null,
      m.time_start ?? null,
      m.time_end ?? null,
      m.state,
      // A reason only ever belongs to a drift. Carrying one onto "adhered" would be
      // a stale justification attached to the wrong event.
      m.state === "drifted" ? (m.reason?.trim() || null) : null,
      now(),
    ],
  });
}

/** Undo a mark entirely — back to unmarked, which is distinct from "skipped". */
export async function unmarkBlock(db: Client, date: string, eventId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM block_marks WHERE date=? AND event_id=?", args: [date, eventId] });
}

// ---------------------------------------------------------------- non-negotiables

/** bit0=Mon … bit6=Sun. JS getDay() is 0=Sun, hence the shift. */
export function weekdayBit(dateISO: string): number {
  const d = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return 1 << ((d + 6) % 7);
}

/**
 * Tick or untick a non-negotiable. Binary — no states, no reasons. That contrast with
 * blocks is deliberate: these are the small fixed things, not the day's shape.
 */
export async function setHabit(db: Client, habitId: number, date: string, done: boolean): Promise<void> {
  if (done) {
    await db.execute({
      sql: "INSERT INTO habit_entries (habit_id,date,value) VALUES (?,?,1) ON CONFLICT(habit_id,date) DO UPDATE SET value=1",
      args: [habitId, date],
    });
  } else {
    await db.execute({ sql: "DELETE FROM habit_entries WHERE habit_id=? AND date=?", args: [habitId, date] });
  }
}

export async function createHabit(
  db: Client,
  h: { name: string; pillar_id?: number | null; days_mask?: number }
): Promise<number> {
  const ts = now();
  const r = await db.execute({
    sql: `INSERT INTO habits (name,pillar_id,days_mask,active,sort_order,created_at,updated_at)
          VALUES (?,?,?,1,(SELECT COALESCE(MAX(sort_order),0)+1 FROM habits),?,?)`,
    args: [h.name.trim(), h.pillar_id ?? null, h.days_mask ?? 127, ts, ts],
  });
  return Number(r.lastInsertRowid);
}

export async function updateHabit(
  db: Client,
  id: number,
  patch: { name?: string; days_mask?: number; pillar_id?: number | null; active?: boolean }
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    sets.push("name=?");
    args.push(patch.name.trim());
  }
  if (patch.days_mask !== undefined) {
    sets.push("days_mask=?");
    args.push(patch.days_mask);
  }
  if (patch.pillar_id !== undefined) {
    sets.push("pillar_id=?");
    args.push(patch.pillar_id);
  }
  if (patch.active !== undefined) {
    sets.push("active=?");
    args.push(patch.active ? 1 : 0);
  }
  if (!sets.length) return;
  sets.push("updated_at=?");
  args.push(now(), id);
  await db.execute({ sql: `UPDATE habits SET ${sets.join(", ")} WHERE id=?`, args });
}

/**
 * Deletion is SOFT. habit_entries reference habit_id, so a hard delete would orphan
 * real history — including ticks the owner made on days that already happened.
 */
export async function deleteHabit(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "UPDATE habits SET active=0, updated_at=? WHERE id=?", args: [now(), id] });
}

// ---------------------------------------------------------------- journal

/** Save a handwritten page and tick the Journal non-negotiable, atomically. */
export async function saveJournalEntry(
  db: Client,
  entry: { date: string; image: string; width?: number | null; height?: number | null }
): Promise<number> {
  const tx = await db.transaction("write");
  try {
    const r = await tx.execute({
      sql: "INSERT INTO journal_entries (date,image,width,height) VALUES (?,?,?,?)",
      args: [entry.date, entry.image, entry.width ?? null, entry.height ?? null],
    });
    // Looked up by system_key, not by name — the owner can rename their habits.
    const h = await tx.execute("SELECT id FROM habits WHERE system_key='journal' AND active=1");
    if (h.rows.length) {
      await tx.execute({
        sql: "INSERT INTO habit_entries (habit_id,date,value) VALUES (?,?,1) ON CONFLICT(habit_id,date) DO UPDATE SET value=1",
        args: [num(h.rows[0].id), entry.date],
      });
    }
    await tx.commit();
    return Number(r.lastInsertRowid);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function deleteJournalEntry(db: Client, id: number): Promise<void> {
  const tx = await db.transaction("write");
  try {
    const e = await tx.execute({ sql: "SELECT date FROM journal_entries WHERE id=?", args: [id] });
    if (!e.rows.length) {
      await tx.rollback();
      return;
    }
    const date = String(e.rows[0].date);
    await tx.execute({ sql: "DELETE FROM journal_entries WHERE id=?", args: [id] });
    const left = await tx.execute({ sql: "SELECT 1 FROM journal_entries WHERE date=? LIMIT 1", args: [date] });
    if (!left.rows.length) {
      const h = await tx.execute("SELECT id FROM habits WHERE system_key='journal'");
      if (h.rows.length) {
        await tx.execute({
          sql: "DELETE FROM habit_entries WHERE habit_id=? AND date=?",
          args: [num(h.rows[0].id), date],
        });
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------------------------------------------------------------- calories

/** One manual number per day. No database, no barcode, no estimation. */
export async function setDailyCalories(db: Client, date: string, calories: number | null): Promise<void> {
  await db.execute({
    sql: `INSERT INTO health_logs (date,calories,updated_at) VALUES (?,?,?)
          ON CONFLICT(date) DO UPDATE SET calories=excluded.calories, updated_at=excluded.updated_at`,
    args: [date, calories, now()],
  });
}

// ---------------------------------------------------------------- skills

export const MAX_ACTIVE_SKILLS = 2;

export class TooManyActiveSkills extends Error {
  constructor(public active: string[]) {
    super(`Already levelling ${active.length}: ${active.join(" and ")}. Park one before promoting another.`);
    this.name = "TooManyActiveSkills";
  }
}

export async function setSkillState(
  db: Client,
  id: number,
  state: "always_on" | "active" | "parked"
): Promise<void> {
  const tx = await db.transaction("write");
  try {
    const cur = await tx.execute({ sql: "SELECT state FROM skills WHERE id=?", args: [id] });
    if (!cur.rows.length) {
      await tx.rollback();
      throw new Error("skill not found");
    }
    if (state === "active" && String(cur.rows[0].state) !== "active") {
      const active = await tx.execute("SELECT name FROM skills WHERE state='active' ORDER BY sort_order, id");
      if (active.rows.length >= MAX_ACTIVE_SKILLS) {
        await tx.rollback();
        throw new TooManyActiveSkills(active.rows.map((r) => String(r.name)));
      }
    }
    await tx.execute({ sql: "UPDATE skills SET state=?, updated_at=? WHERE id=?", args: [state, now(), id] });
    await tx.commit();
  } catch (e) {
    if (!(e instanceof TooManyActiveSkills) && !(e instanceof Error && e.message === "skill not found")) {
      await tx.rollback().catch(() => {});
    }
    throw e;
  }
}

export async function touchSkill(db: Client, id: number, progress?: number | null): Promise<void> {
  const ts = now();
  if (progress != null) {
    await db.execute({
      sql: "UPDATE skills SET progress=?, last_touched=?, updated_at=? WHERE id=?",
      args: [Math.max(0, Math.min(1, progress)), ts, ts, id],
    });
  } else {
    await db.execute({ sql: "UPDATE skills SET last_touched=?, updated_at=? WHERE id=?", args: [ts, ts, id] });
  }
}

// ---------------------------------------------------------------- goals

// Goals are the ONE sanctioned accomplishment measure in this app, and they are
// quarantined: goal progress feeds nothing else — not adherence, not the streak, not
// the rings, not the coach. That isolation is what keeps "did I do what I said I'd do"
// from quietly becoming "how much did I finish".
//
// Progress is never STORED. It is derived from completed subgoal weights on read (see
// lib/goals.ts), so the stale goals.progress column can never drift out of step with the
// subgoals that define it. It already had: row 1 stored 0.0833 while deriving 0.

export async function recomputeGoalTx(tx: Exec, goalId: number, ts: string): Promise<void> {
  await tx.execute({ sql: "UPDATE goals SET updated_at=? WHERE id=?", args: [ts, goalId] });
}

export async function createGoal(
  db: Client,
  g: { pillar_id: number; title: string; target?: string | null }
): Promise<number> {
  const r = await db.execute({
    sql: "INSERT INTO goals (pillar_id,title,target) VALUES (?,?,?)",
    args: [g.pillar_id, g.title.trim(), g.target?.trim() || null],
  });
  return Number(r.lastInsertRowid);
}

export async function updateGoal(
  db: Client,
  id: number,
  patch: { title?: string; target?: string | null; status?: string }
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.target !== undefined) (sets.push("target=?"), args.push(patch.target?.trim() || null));
  if (patch.status !== undefined) (sets.push("status=?"), args.push(patch.status));
  if (!sets.length) return;
  sets.push("updated_at=?");
  args.push(now(), id);
  await db.execute({ sql: `UPDATE goals SET ${sets.join(", ")} WHERE id=?`, args });
}

/**
 * Soft, matching deleteHabit. Subgoals reference goal_id, and listGoals already filters
 * status != 'dropped', so this hides the goal without orphaning its history.
 */
export async function deleteGoal(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "UPDATE goals SET status='dropped', updated_at=? WHERE id=?", args: [now(), id] });
}

// ---------------------------------------------------------------- subgoals
//
// weight = 0 means AUTO — an equal share of whatever the explicit overrides leave.
// See src/lib/goals.ts for the derivation.

/** The column's CHECK is 0..1; clamp rather than throw so a stray value can never 500. */
function clampWeight(w: number | null | undefined): number {
  if (w == null || !Number.isFinite(w) || w <= 0) return 0;
  return Math.min(1, w);
}

export async function createSubgoal(
  db: Client,
  s: { goal_id: number; title: string; weight?: number }
): Promise<number> {
  const r = await db.execute({
    sql: `INSERT INTO subgoals (goal_id,title,weight,sort_order)
          VALUES (?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM subgoals WHERE goal_id=?))`,
    args: [s.goal_id, s.title.trim(), clampWeight(s.weight), s.goal_id],
  });
  return Number(r.lastInsertRowid);
}

export async function updateSubgoal(
  db: Client,
  id: number,
  patch: { title?: string; weight?: number | null }
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.weight !== undefined) (sets.push("weight=?"), args.push(clampWeight(patch.weight)));
  if (!sets.length) return;
  args.push(id);
  await db.execute({ sql: `UPDATE subgoals SET ${sets.join(", ")} WHERE id=?`, args });
}

/**
 * Tick or untick a subgoal. The goal is NEVER auto-completed when this reaches 100% —
 * marking a goal done is the owner's decision, and auto-completion is a progression
 * mechanic.
 */
export async function setSubgoalDone(db: Client, id: number, done: boolean): Promise<void> {
  await db.execute({ sql: "UPDATE subgoals SET done=? WHERE id=?", args: [done ? 1 : 0, id] });
}

/** Hard. subgoals has no `active` column and nothing references a subgoal id, so there
 *  is no history to orphan. The UI's confirm is the safeguard. */
export async function deleteSubgoal(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM subgoals WHERE id=?", args: [id] });
}

export async function reorderSubgoals(db: Client, goalId: number, ids: number[]): Promise<void> {
  const tx = await db.transaction("write");
  try {
    for (let i = 0; i < ids.length; i++) {
      await tx.execute({
        sql: "UPDATE subgoals SET sort_order=? WHERE id=? AND goal_id=?",
        args: [i + 1, ids[i], goalId],
      });
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------------------------------------------------------------- skill time
//
// The total of these minutes is a MEASUREMENT of time invested, never a reward. No
// levels, no thresholds, no milestones — the number only ever says how long you spent,
// which is a fact rather than a score.
//
// Kept as a log rather than a running total so a mistaken entry can be removed, which is
// exactly what undoSkillTime does.

export async function logSkillTime(
  db: Client,
  skillId: number,
  minutes: number,
  date: string,
  note?: string | null
): Promise<void> {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const ts = now();
  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: "INSERT INTO skill_time (skill_id,date,minutes,note) VALUES (?,?,?,?)",
      args: [skillId, date, Math.round(minutes), note ?? null],
    });
    await tx.execute({
      sql: "UPDATE skills SET last_touched=?, updated_at=? WHERE id=?",
      args: [ts, ts, skillId],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/**
 * Remove the most recent entry for (skill, date). Returns false when there was nothing
 * to undo, so the caller can hide the control rather than pretending it did something.
 *
 * last_touched is RECOMPUTED from the rows that remain rather than left as it was —
 * otherwise undoing the only session for a skill leaves it looking recently worked, and
 * the stalled-rotation prompt reads a lie.
 */
export async function undoSkillTime(db: Client, skillId: number, date: string): Promise<boolean> {
  const tx = await db.transaction("write");
  try {
    const last = await tx.execute({
      sql: "SELECT id FROM skill_time WHERE skill_id=? AND date=? ORDER BY id DESC LIMIT 1",
      args: [skillId, date],
    });
    if (!last.rows.length) {
      await tx.rollback();
      return false;
    }
    await tx.execute({ sql: "DELETE FROM skill_time WHERE id=?", args: [num(last.rows[0].id)] });
    const rest = await tx.execute({ sql: "SELECT MAX(date) AS d FROM skill_time WHERE skill_id=?", args: [skillId] });
    const d = rest.rows[0]?.d;
    await tx.execute({
      sql: "UPDATE skills SET last_touched=?, updated_at=? WHERE id=?",
      args: [d == null ? null : `${String(d)}T00:00:00.000Z`, now(), skillId],
    });
    await tx.commit();
    return true;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------------------------------------------------------------- gym
//
// One row per gym DAY. The unique index on date carries the per-day cap: two visits in a
// day is the same event, exactly as 15k steps is the same as 7k.

export type WorkoutKind = "strength" | "cardio" | "misc";

export async function setGymSession(
  db: Client,
  date: string,
  kind: WorkoutKind,
  on: boolean
): Promise<void> {
  if (on) {
    await db.execute({
      sql: "INSERT INTO gym_sessions (date,kind) VALUES (?,?) ON CONFLICT(date,kind) DO NOTHING",
      args: [date, kind],
    });
  } else {
    // Only removes a manually-toggled day. Imported rows carry a title; deleting one of
    // those would destroy rescued history, so they are left alone.
    await db.execute({
      sql: "DELETE FROM gym_sessions WHERE date=? AND kind=? AND title IS NULL",
      args: [date, kind],
    });
  }
}

/** Which kinds are logged for a date — drives the Log workout toggles. */
export async function workoutKindsOn(db: Client, date: string): Promise<WorkoutKind[]> {
  const r = await db.execute({ sql: "SELECT DISTINCT kind FROM gym_sessions WHERE date=?", args: [date] });
  return r.rows.map((x) => String(x.kind) as WorkoutKind);
}

// ---------------------------------------------------------------- streak

/**
 * The adherence streak counts DAYS YOU LOGGED HONESTLY — consecutive days on which at
 * least one block was marked or one non-negotiable ticked.
 *
 * Deliberately NOT "days above some adherence threshold". A performance streak gives
 * you a reason not to log a bad day, which is the one failure this app cannot absorb.
 * A 40% day still continues it: you showed up and told the truth.
 */
export async function getStreak(db: Client, date: string): Promise<{ count: number }> {
  const marks = await db.execute({
    sql: "SELECT DISTINCT date FROM block_marks WHERE date<=? AND state != 'dismissed'",
    args: [date],
  });
  const ticks = await db.execute({ sql: "SELECT DISTINCT date FROM habit_entries WHERE date<=?", args: [date] });
  const logged = new Set<string>([
    ...marks.rows.map((r) => String(r.date)),
    ...ticks.rows.map((r) => String(r.date)),
  ]);
  if (!logged.size) return { count: 0 };

  let count = 0;
  let cur = date;
  // Today not being logged YET is pending, not a break — otherwise the streak would
  // read zero every morning.
  if (!logged.has(cur) && cur === todayISO()) cur = addDays(cur, -1);
  while (logged.has(cur)) {
    count++;
    cur = addDays(cur, -1);
  }
  return { count };
}
