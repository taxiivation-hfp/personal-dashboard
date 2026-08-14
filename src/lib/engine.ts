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
import { isPaletteHex } from "./rings";
import { FULLY_WORKED, normaliseFraction, type BlockState } from "./worked";

type Tx = Awaited<ReturnType<Client["transaction"]>>;
type Exec = Pick<Tx, "execute">;

// Re-exported so the many callers that import BlockState from here keep working. The union
// is DEFINED in worked.ts now, beside the function that says what each state is worth.
export type { BlockState };

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
    /** How much of a DRIFTED block was worked, 0..1. Ignored on every other state. */
    worked_fraction?: number | null;
  },
): Promise<BlockState> {
  const fraction = normaliseFraction(m.worked_fraction);

  /**
   * A DRIFT WORKED IN FULL IS AN ADHERENCE, so it is stored as one.
   *
   * At the top of the slider the arithmetic is already identical — same hours to the ring,
   * same points to the score, same lap on Portfolio — and the only thing left distinguishing
   * the two would be a chip reading "Drifted" over a block worked from end to end, and a
   * coach counting a drift pattern that did not happen. The record must not hold two names
   * for one fact.
   *
   * It lives HERE rather than in the client because that is this file's whole job: the
   * screen is one caller of several, and a rule enforced in a component is a rule the
   * coach's tools walk straight past.
   *
   * The reason clears as a CONSEQUENCE of the rule below rather than as a second special
   * case — there is no drift left to explain.
   */
  const state: BlockState =
    m.state === "drifted" && fraction != null && fraction >= FULLY_WORKED
      ? "adhered"
      : m.state;

  await db.execute({
    sql: `INSERT INTO block_marks (date,event_id,title,time_start,time_end,state,reason,worked_fraction,marked_at)
          VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(date,event_id) DO UPDATE SET
            state=excluded.state,
            reason=excluded.reason,
            worked_fraction=excluded.worked_fraction,
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
      state,
      // A reason only ever belongs to a drift. Carrying one onto "adhered" would be
      // a stale justification attached to the wrong event.
      state === "drifted" ? m.reason?.trim() || null : null,
      // The fraction inherits that rule exactly, and for the same reason: a partial figure
      // attached to a block that was adhered or skipped is a number about a question
      // nobody asked of it. Note this is UNCONDITIONAL on the update path — re-marking a
      // drift as adhered clears the old fraction rather than leaving it behind.
      state === "drifted" ? fraction : null,
      now(),
    ],
  });

  // The RESULTING state, not the requested one. The caller cannot know about the
  // conversion above, and a screen that assumes its own answer would draw a Drifted chip
  // over a row the database calls adhered.
  return state;
}

/** Undo a mark entirely — back to unmarked, which is distinct from "skipped". */
export async function unmarkBlock(
  db: Client,
  date: string,
  eventId: string,
): Promise<void> {
  await db.execute({
    sql: "DELETE FROM block_marks WHERE date=? AND event_id=?",
    args: [date, eventId],
  });
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
export async function setHabit(
  db: Client,
  habitId: number,
  date: string,
  done: boolean,
): Promise<void> {
  if (done) {
    await db.execute({
      sql: "INSERT INTO habit_entries (habit_id,date,value) VALUES (?,?,1) ON CONFLICT(habit_id,date) DO UPDATE SET value=1",
      args: [habitId, date],
    });
  } else {
    await db.execute({
      sql: "DELETE FROM habit_entries WHERE habit_id=? AND date=?",
      args: [habitId, date],
    });
  }
}

/**
 * A non-negotiable that takes a NUMBER rather than a tick — daily weight.
 *
 * The number lives in habit_entries.value, which is already a REAL, so adherence and the
 * rings need no special case: an entry exists or it does not. Passing null clears the
 * day, exactly like unticking.
 *
 * Guarded to a plausible human range. A stray keystroke should not silently become a
 * permanent 700kg data point in a chart you later trust.
 */
export async function setHabitValue(
  db: Client,
  habitId: number,
  date: string,
  value: number | null,
): Promise<void> {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    await db.execute({
      sql: "DELETE FROM habit_entries WHERE habit_id=? AND date=?",
      args: [habitId, date],
    });
    return;
  }
  const v = Math.min(999, Math.max(0.1, Math.round(value * 10) / 10));
  await db.execute({
    sql: "INSERT INTO habit_entries (habit_id,date,value) VALUES (?,?,?) ON CONFLICT(habit_id,date) DO UPDATE SET value=excluded.value",
    args: [habitId, date, v],
  });
}

export async function createHabit(
  db: Client,
  h: { name: string; pillar_id?: number | null; days_mask?: number },
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
  patch: {
    name?: string;
    days_mask?: number;
    pillar_id?: number | null;
    active?: boolean;
  },
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
  await db.execute({
    sql: `UPDATE habits SET ${sets.join(", ")} WHERE id=?`,
    args,
  });
}

/**
 * Deletion is SOFT. habit_entries reference habit_id, so a hard delete would orphan
 * real history — including ticks the owner made on days that already happened.
 */
export async function deleteHabit(db: Client, id: number): Promise<void> {
  await db.execute({
    sql: "UPDATE habits SET active=0, updated_at=? WHERE id=?",
    args: [now(), id],
  });
}

/**
 * Dress a habit differently for ONE date — a different name, a different pillar, or
 * both. The default row is never touched: this is an overlay, and clearing it (both
 * fields null, or clearHabitOverride) returns the day to the default with nothing to
 * undo. Upserted per (date, habit), so re-editing revises rather than stacks.
 */
export async function setHabitOverride(
  db: Client,
  date: string,
  habitId: number,
  o: { name?: string | null; pillarKey?: string | null },
): Promise<void> {
  const name = o.name?.trim() || null;
  let pillarId: number | null = null;
  if (o.pillarKey) {
    const p = await db.execute({
      sql: "SELECT id FROM pillars WHERE key=?",
      args: [o.pillarKey],
    });
    if (!p.rows.length) throw new Error("unknown pillar");
    pillarId = Number(p.rows[0]!.id);
  }
  // Both fields empty is not an override — it is the default wearing a row for no
  // reason, and a row that changes nothing still prints "tomorrow only" in the UI.
  if (name == null && pillarId == null) {
    await clearHabitOverride(db, date, habitId);
    return;
  }
  await db.execute({
    sql: `INSERT INTO habit_overrides (date,habit_id,name,pillar_id) VALUES (?,?,?,?)
          ON CONFLICT(date,habit_id) DO UPDATE SET name=excluded.name, pillar_id=excluded.pillar_id`,
    args: [date, habitId, name, pillarId],
  });
}

export async function clearHabitOverride(
  db: Client,
  date: string,
  habitId: number,
): Promise<void> {
  await db.execute({
    sql: "DELETE FROM habit_overrides WHERE date=? AND habit_id=?",
    args: [date, habitId],
  });
}

// ---------------------------------------------------------------- journal

/** Save a handwritten page and tick the Journal non-negotiable, atomically. */
export async function saveJournalEntry(
  db: Client,
  entry: {
    date: string;
    /** 'drawing' stores an image; 'text' stores words and image=''. Never test emptiness
     *  to tell them apart — `kind` is the discriminator. */
    kind?: "drawing" | "text";
    image: string;
    body?: string | null;
    width?: number | null;
    height?: number | null;
  },
): Promise<number> {
  const tx = await db.transaction("write");
  try {
    const r = await tx.execute({
      sql: "INSERT INTO journal_entries (date,kind,image,body,width,height) VALUES (?,?,?,?,?,?)",
      args: [
        entry.date,
        entry.kind ?? "drawing",
        entry.image,
        entry.body ?? null,
        entry.width ?? null,
        entry.height ?? null,
      ],
    });
    // Looked up by system_key, not by name — the owner can rename their habits.
    const h = await tx.execute(
      "SELECT id FROM habits WHERE system_key='journal' AND active=1",
    );
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

/**
 * Rewrite a page that already exists.
 *
 * A journal you can only add to is a journal that keeps its typos forever, and the owner
 * asked for the opposite: a typed page reopens with its words and you edit them, a
 * handwritten one reopens with its ink under the pen and you carry on.
 *
 * `kind` CANNOT CHANGE, and that is enforced here rather than trusted to the caller.
 * Turning a drawing into a text page would silently drop the only copy of some
 * handwriting; turning a text page into a drawing would leave words in a row nothing ever
 * reads again. So the update is matched against what the row already is, and a mismatch is
 * an error rather than a write — the same ruling the schema comment makes about `kind`
 * being the discriminator, applied to the one operation that could break it.
 *
 * No habit tick to do: a page already exists for the day, so the Journal non-negotiable is
 * already ticked and editing cannot be the thing that ticks it. Nothing is stamped either.
 * An "edited" mark would be the app looking over the owner's shoulder at their own diary.
 *
 * Returns false when there is no such row, so a caller can 404 rather than report a
 * successful write that touched nothing.
 */
export async function updateJournalEntry(
  db: Client,
  id: number,
  patch:
    | { kind: "text"; body: string }
    | { kind: "drawing"; image: string; width?: number | null; height?: number | null },
): Promise<boolean> {
  const tx = await db.transaction("write");
  try {
    const r = await tx.execute({
      sql: "SELECT kind FROM journal_entries WHERE id=?",
      args: [id],
    });
    if (!r.rows.length) {
      await tx.rollback();
      return false;
    }
    const kind = String(r.rows[0].kind ?? "drawing");
    if (kind !== patch.kind) {
      await tx.rollback();
      throw new Error(`page ${id} is a ${kind} page, not ${patch.kind}`);
    }

    if (patch.kind === "text") {
      await tx.execute({
        sql: "UPDATE journal_entries SET body=? WHERE id=?",
        args: [patch.body, id],
      });
    } else {
      await tx.execute({
        sql: "UPDATE journal_entries SET image=?, width=?, height=? WHERE id=?",
        args: [patch.image, patch.width ?? null, patch.height ?? null, id],
      });
    }
    await tx.commit();
    return true;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function deleteJournalEntry(
  db: Client,
  id: number,
): Promise<void> {
  const tx = await db.transaction("write");
  try {
    const e = await tx.execute({
      sql: "SELECT date FROM journal_entries WHERE id=?",
      args: [id],
    });
    if (!e.rows.length) {
      await tx.rollback();
      return;
    }
    const date = String(e.rows[0].date);
    await tx.execute({
      sql: "DELETE FROM journal_entries WHERE id=?",
      args: [id],
    });
    const left = await tx.execute({
      sql: "SELECT 1 FROM journal_entries WHERE date=? LIMIT 1",
      args: [date],
    });
    if (!left.rows.length) {
      const h = await tx.execute(
        "SELECT id FROM habits WHERE system_key='journal'",
      );
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

// ---------------------------------------------------------------- one-off tasks

/**
 * Add a task for a day. `due` is the day it is FOR — usually tomorrow.
 *
 * A single thing decided for a single day, as against a non-negotiable's standing weekday
 * rule. If it is not ticked it carries forward, and the carry is DERIVED on read rather
 * than written by a job — see src/lib/tasks.ts, which owns that rule and is tested.
 *
 * Nothing here touches adherence, the rings, the streak or the coach. That isolation is the
 * point: a backlog that joined adherence's fixed 30-point denominator would make every
 * non-negotiable quietly worth less for reasons nothing you did today caused.
 */
export async function createDayTask(
  db: Client,
  task: { title: string; due: string },
): Promise<number> {
  const title = task.title.trim();
  if (!title) throw new Error("a task needs a title");
  const r = await db.execute({
    sql: "INSERT INTO day_tasks (title, due) VALUES (?,?)",
    args: [title, task.due],
  });
  return Number(r.lastInsertRowid);
}

/**
 * Tick or untick a task.
 *
 * Ticking stamps the day it was done ON, which is what fixes a carrying task to a date —
 * and it is why reading last Tuesday back still shows what was actually ticked last
 * Tuesday. Unticking clears the stamp and the task resumes carrying from its original due
 * date; it does NOT become due today, because the day you decided to do it has not changed.
 */
export async function setDayTaskDone(
  db: Client,
  id: number,
  date: string,
  done: boolean,
): Promise<void> {
  await db.execute({
    sql: "UPDATE day_tasks SET done_on=? WHERE id=?",
    args: [done ? date : null, id],
  });
}

/** Rename a task, or move which day it is for. Both are ordinary — a plan is rewriteable. */
export async function updateDayTask(
  db: Client,
  id: number,
  patch: { title?: string; due?: string },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("a task needs a title");
    sets.push("title=?");
    args.push(t);
  }
  if (patch.due !== undefined) {
    sets.push("due=?");
    args.push(patch.due);
  }
  if (!sets.length) return;
  args.push(id);
  await db.execute({
    sql: `UPDATE day_tasks SET ${sets.join(", ")} WHERE id=?`,
    args,
  });
}

/** Drop a task. A thing you decided not to do is not a thing you failed — no tombstone. */
export async function deleteDayTask(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM day_tasks WHERE id=?", args: [id] });
}

// ---------------------------------------------------------------- day titles

/**
 * Name a day. An empty title clears it.
 *
 * An INTENTION, not a record — set in advance, rewriteable whenever, and connected to
 * nothing. It must never feed adherence, a ring or the score: the moment naming a day
 * becomes something you can fail at, it stops being a plan and becomes another verdict.
 */
export async function setDayTitle(
  db: Client,
  date: string,
  title: string,
): Promise<void> {
  const t = title.trim().slice(0, 80);
  if (!t) {
    await db.execute({
      sql: "DELETE FROM day_titles WHERE date=?",
      args: [date],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO day_titles (date,title) VALUES (?,?)
          ON CONFLICT(date) DO UPDATE SET title=excluded.title,
            updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    args: [date, t],
  });
}

// ---------------------------------------------------------------- calories
//
// A LOG, not a total. 400 in the morning and 800 later reads 1200, and the total is
// derived on read so it can never drift out of step with the entries that define it.
//
// Kept as entries rather than a running number for the same reason skill_time is: a
// mistyped 2000 is removed rather than corrected by arithmetic. In an ADDITIVE field that
// matters more than it did before — without a way back, a field you are afraid to touch
// is a field you stop using, which is the honest-logging failure the whole app avoids.
//
// Still no food database, no barcode, no estimation: an entry is one number.

/** Add to the day's running total. Returns the new entry's id so the caller can undo it. */
export async function addCalories(
  db: Client,
  date: string,
  kcal: number,
  note?: string | null,
): Promise<number> {
  const r = await db.execute({
    sql: "INSERT INTO calorie_entries (date,kcal,note) VALUES (?,?,?)",
    args: [date, Math.round(kcal), note?.trim() || null],
  });
  return Number(r.lastInsertRowid);
}

/** Remove ONE entry. False when nothing matched, so the caller can hide the control
 *  rather than pretend it did something — matching undoSkillTime. */
export async function deleteCalorieEntry(
  db: Client,
  id: number,
): Promise<boolean> {
  const r = await db.execute({
    sql: "DELETE FROM calorie_entries WHERE id=?",
    args: [id],
  });
  return r.rowsAffected > 0;
}

// ---------------------------------------------------------------- skills

export const MAX_ACTIVE_SKILLS = 2;

export class TooManyActiveSkills extends Error {
  constructor(public active: string[]) {
    super(
      `Already levelling ${active.length}: ${active.join(" and ")}. Park one before promoting another.`,
    );
    this.name = "TooManyActiveSkills";
  }
}

export async function setSkillState(
  db: Client,
  id: number,
  state: "always_on" | "active" | "parked",
): Promise<void> {
  const tx = await db.transaction("write");
  try {
    const cur = await tx.execute({
      sql: "SELECT state FROM skills WHERE id=?",
      args: [id],
    });
    if (!cur.rows.length) {
      await tx.rollback();
      throw new Error("skill not found");
    }
    if (state === "active" && String(cur.rows[0].state) !== "active") {
      const active = await tx.execute(
        "SELECT name FROM skills WHERE state='active' ORDER BY sort_order, id",
      );
      if (active.rows.length >= MAX_ACTIVE_SKILLS) {
        await tx.rollback();
        throw new TooManyActiveSkills(active.rows.map((r) => String(r.name)));
      }
    }
    await tx.execute({
      sql: "UPDATE skills SET state=?, updated_at=? WHERE id=?",
      args: [state, now(), id],
    });
    await tx.commit();
  } catch (e) {
    if (
      !(e instanceof TooManyActiveSkills) &&
      !(e instanceof Error && e.message === "skill not found")
    ) {
      await tx.rollback().catch(() => {});
    }
    throw e;
  }
}

export async function touchSkill(
  db: Client,
  id: number,
  progress?: number | null,
): Promise<void> {
  const ts = now();
  if (progress != null) {
    await db.execute({
      sql: "UPDATE skills SET progress=?, last_touched=?, updated_at=? WHERE id=?",
      args: [Math.max(0, Math.min(1, progress)), ts, ts, id],
    });
  } else {
    await db.execute({
      sql: "UPDATE skills SET last_touched=?, updated_at=? WHERE id=?",
      args: [ts, ts, id],
    });
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

export async function recomputeGoalTx(
  tx: Exec,
  goalId: number,
  ts: string,
): Promise<void> {
  await tx.execute({
    sql: "UPDATE goals SET updated_at=? WHERE id=?",
    args: [ts, goalId],
  });
}

export async function createGoal(
  db: Client,
  g: { pillar_id: number; title: string; target?: string | null },
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
  patch: { title?: string; target?: string | null; status?: string },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined)
    (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.target !== undefined)
    (sets.push("target=?"), args.push(patch.target?.trim() || null));
  if (patch.status !== undefined) {
    sets.push("status=?");
    args.push(patch.status);
    /**
     * WHEN it was finished, stamped here and nowhere else.
     *
     * The column has existed since the first schema and nothing has ever written to it, so
     * every goal ever completed lost its date. That is the wrong way round for an app whose
     * owner wants "a clear plan on what I have achieved": a finished goal with no date is a
     * fact with no place in a sequence.
     *
     * CLEARED on the way back out. Un-completing a goal and leaving the stamp behind would
     * leave a live goal claiming a completion date, which is worse than no date at all —
     * the archive would list something still in progress.
     */
    sets.push("completed_at=?");
    args.push(patch.status === "done" ? now() : null);
  }
  if (!sets.length) return;
  sets.push("updated_at=?");
  args.push(now(), id);
  await db.execute({
    sql: `UPDATE goals SET ${sets.join(", ")} WHERE id=?`,
    args,
  });
}

/**
 * Soft, matching deleteHabit. Subgoals reference goal_id, and listGoals already filters
 * status != 'dropped', so this hides the goal without orphaning its history.
 */
export async function deleteGoal(db: Client, id: number): Promise<void> {
  await db.execute({
    sql: "UPDATE goals SET status='dropped', updated_at=? WHERE id=?",
    args: [now(), id],
  });
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
  s: { goal_id: number; title: string; weight?: number },
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
  patch: { title?: string; weight?: number | null },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined)
    (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.weight !== undefined)
    (sets.push("weight=?"), args.push(clampWeight(patch.weight)));
  if (!sets.length) return;
  args.push(id);
  await db.execute({
    sql: `UPDATE subgoals SET ${sets.join(", ")} WHERE id=?`,
    args,
  });
}

/**
 * Tick or untick a subgoal. The goal is NEVER auto-completed when this reaches 100% —
 * marking a goal done is the owner's decision, and auto-completion is a progression
 * mechanic.
 */
export async function setSubgoalDone(
  db: Client,
  id: number,
  done: boolean,
): Promise<void> {
  await db.execute({
    sql: "UPDATE subgoals SET done=? WHERE id=?",
    args: [done ? 1 : 0, id],
  });
}

/** Hard. subgoals has no `active` column and nothing references a subgoal id, so there
 *  is no history to orphan. The UI's confirm is the safeguard. */
export async function deleteSubgoal(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM subgoals WHERE id=?", args: [id] });
}

export async function reorderSubgoals(
  db: Client,
  goalId: number,
  ids: number[],
): Promise<void> {
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
  note?: string | null,
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
export async function undoSkillTime(
  db: Client,
  skillId: number,
  date: string,
): Promise<boolean> {
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
    await tx.execute({
      sql: "DELETE FROM skill_time WHERE id=?",
      args: [num(last.rows[0].id)],
    });
    const rest = await tx.execute({
      sql: "SELECT MAX(date) AS d FROM skill_time WHERE skill_id=?",
      args: [skillId],
    });
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
// One row per SESSION. A day can hold two lifts and a run, and each is its own document.
//
// This used to be one row per (date, kind), enforced by a unique index that the writers
// leaned on via ON CONFLICT. The owner's ruling reversed it: two lifts on a Tuesday are
// two things that happened. The index is gone, so every writer here is addressed by ROW
// ID — there is no (date, kind) upsert left, and adding one back would throw.

export type WorkoutKind = "strength" | "cardio" | "misc";

export type Workout = {
  id: number;
  /**
   * The day it happened. Carried on EVERY session, including the ones read for a date the
   * caller already knows, because the dialog opens on the session's own day when editing —
   * and a session that does not know its date can only be opened on the screen's, which is
   * the bug saveWorkout's comment describes from the other end.
   */
  date: string;
  kind: WorkoutKind;
  title: string | null;
  note: string | null;
};

/** Every session logged for a date, with its note — drives the workout documents. */
export async function workoutsOn(db: Client, date: string): Promise<Workout[]> {
  const r = await db.execute({
    // Ordered by kind then id so a day's sessions read in a stable order and the second
    // lift always follows the first.
    sql: "SELECT id,date,kind,title,note FROM gym_sessions WHERE date=? ORDER BY kind, id",
    args: [date],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    date: String(x.date),
    kind: String(x.kind) as WorkoutKind,
    title: x.title == null ? null : String(x.title),
    note: x.note == null ? null : String(x.note),
  }));
}

/**
 * Write a workout document. No id means a NEW session; an id edits that one.
 *
 * Saving is what logs the session: there is no separate "did it" toggle to forget.
 *
 * THE DATE IS SET, NOT MATCHED, and that fix is the whole reason this comment was rewritten.
 *
 * It used to read `WHERE id=? AND date=? AND kind=?`, on the argument that a stale id from a
 * client left open across midnight must not rewrite a different day's note. The guard was
 * right about the danger and wrong about the remedy: an id that matched a real session whose
 * date simply differed also failed the WHERE, and the miss fell through to the INSERT below —
 * so editing a session logged on the 3rd from a screen showing the 12th did not move it and
 * did not fail. It wrote a SECOND row dated the 12th and left the first one sitting there.
 * Two sessions, one of them a ghost, and the Physical ring counting both.
 *
 * The date now travels in the SET, so changing it MOVES the session — which is what the
 * picker in the dialog has always looked like it did. A session written up on Sunday for
 * Thursday is the ordinary case in a log that exists to be caught up on.
 *
 * KIND STAYS IN THE WHERE. It is the half of the old guard that was never in tension with
 * editing: nothing in the app can change a session's kind, so an id arriving under the wrong
 * one is a genuinely stale id and still falls through to an insert. What the guard cannot do
 * is protect a note from a client that has the RIGHT id — and never could, because that is
 * simply what editing is.
 */
export async function saveWorkout(
  db: Client,
  w: { id?: number | null; date: string; kind: WorkoutKind; note: string },
): Promise<number> {
  const note = w.note.trim() || null;
  if (w.id) {
    const r = await db.execute({
      sql: "UPDATE gym_sessions SET note=?, date=? WHERE id=? AND kind=?",
      args: [note, w.date, w.id, w.kind],
    });
    if (r.rowsAffected > 0) return w.id;
  }
  const ins = await db.execute({
    sql: "INSERT INTO gym_sessions (date,kind,note) VALUES (?,?,?)",
    args: [w.date, w.kind, note],
  });
  return Number(ins.lastInsertRowid);
}

/** The last few sessions of a kind, most recent first — the history pane beside the one
 *  being written. Excludes the date being edited so "recent" never shows today back. */
export async function recentWorkouts(
  db: Client,
  kind: WorkoutKind,
  before: string,
  limit = 5,
): Promise<Workout[]> {
  const r = await db.execute({
    sql: `SELECT id,date,kind,title,note FROM gym_sessions
          WHERE kind=? AND date < ? AND COALESCE(note,'') <> ''
          ORDER BY date DESC, id DESC LIMIT ?`,
    args: [kind, before, Math.min(20, Math.max(1, limit))],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    date: String(x.date),
    kind: String(x.kind) as WorkoutKind,
    title: x.title == null ? null : String(x.title),
    note: x.note == null ? null : String(x.note),
  }));
}

/**
 * EVERY session, newest first. The whole log, not a window on it.
 *
 * Deliberately unpaginated. A workout log is text — a few hundred rows of it after years,
 * which is smaller than one screenshot — and the owner asked to see the lot. Paginating it
 * would add a control, a state and an off-by-one for a saving nobody would ever notice.
 *
 * Sessions with an EMPTY note are included here, unlike recentWorkouts. That function feeds
 * a reference pane where a blank entry would be noise; this is the record, and a session you
 * logged without writing anything still happened.
 */
export async function allWorkouts(
  db: Client,
  kind?: WorkoutKind,
): Promise<Workout[]> {
  const r = await db.execute(
    kind
      ? {
          sql: "SELECT id,date,kind,title,note FROM gym_sessions WHERE kind=? ORDER BY date DESC, id DESC",
          args: [kind],
        }
      : "SELECT id,date,kind,title,note FROM gym_sessions ORDER BY date DESC, id DESC",
  );
  return r.rows.map((x) => ({
    id: Number(x.id),
    date: String(x.date),
    kind: String(x.kind) as WorkoutKind,
    title: x.title == null ? null : String(x.title),
    note: x.note == null ? null : String(x.note),
  }));
}

/**
 * Remove ONE session by id. Returns false when nothing matched, so the caller can hide
 * the control rather than pretend it did something.
 *
 * Imported rows carry a title — that is rescued Discord history and is irreplaceable, so
 * they are left alone. The old by-(date,kind) delete removed every matching row at once,
 * which is now the wrong thing entirely.
 */
export async function deleteWorkout(db: Client, id: number): Promise<boolean> {
  const r = await db.execute({
    sql: "DELETE FROM gym_sessions WHERE id=? AND title IS NULL",
    args: [id],
  });
  return r.rowsAffected > 0;
}

// ---------------------------------------------------------------- pillar colour

/**
 * Set a pillar's hue, or clear it back to the CSS default with null.
 *
 * Guarded to the curated palette on purpose. A free hex field could make the app
 * unreadable, and the light-beige identity is a product decision rather than a
 * preference — see CLAUDE.md. Only PILLAR colours are editable at all.
 */
export async function setPillarColor(
  db: Client,
  key: string,
  hex: string | null,
): Promise<void> {
  if (hex !== null && !isPaletteHex(hex))
    throw new Error("colour must come from the palette");
  await db.execute({
    sql: "UPDATE pillars SET color=?, updated_at=? WHERE key=?",
    args: [hex, now(), key],
  });
}

/**
 * A new skill, born PARKED under Portfolio — every skill lives there by ruling, and
 * parked is the honest starting state: promoting it to active is its own decision,
 * gated by the pick-two cap, not a side effect of naming it.
 */
export async function createSkill(db: Client, name: string): Promise<number> {
  const n = name.trim();
  if (!n) throw new Error("name required");
  const ts = now();
  const r = await db.execute({
    sql: `INSERT INTO skills (name, pillar_id, state, sort_order, created_at, updated_at)
          VALUES (?, (SELECT id FROM pillars WHERE key='portfolio'),'parked',
                  (SELECT COALESCE(MAX(sort_order),0)+1 FROM skills), ?, ?)`,
    args: [n, ts, ts],
  });
  return Number(r.lastInsertRowid);
}

/** Rename only. The id is what skill_time hangs off, so a rename never orphans a minute
 *  of logged practice — the same reason habits rename by id. */
export async function renameSkill(
  db: Client,
  id: number,
  name: string,
): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error("name required");
  await db.execute({
    sql: "UPDATE skills SET name=?, updated_at=? WHERE id=?",
    args: [n, now(), id],
  });
}

/** A skill's segment hue on the Portfolio ring. Same rule as the pillars: the curated
 *  palette or nothing — null falls back to the stable default cycled by id. */
export async function setSkillColor(
  db: Client,
  id: number,
  hex: string | null,
): Promise<void> {
  if (hex !== null && !isPaletteHex(hex))
    throw new Error("colour must come from the palette");
  await db.execute({
    sql: "UPDATE skills SET color=?, updated_at=? WHERE id=?",
    args: [hex, now(), id],
  });
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
export async function getStreak(
  db: Client,
  date: string,
): Promise<{ count: number }> {
  const marks = await db.execute({
    sql: "SELECT DISTINCT date FROM block_marks WHERE date<=? AND state != 'dismissed'",
    args: [date],
  });
  const ticks = await db.execute({
    sql: "SELECT DISTINCT date FROM habit_entries WHERE date<=?",
    args: [date],
  });
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
