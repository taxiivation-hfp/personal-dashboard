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
import { addDays, isISODate, todayISO } from "./dates";
import type { PillarKey } from "./rings";
import { isWindowTint, WINDOW_TEXT_MAX } from "./timeline";
import {
  dismissalWouldErase,
  FULLY_WORKED,
  normaliseFraction,
  type BlockState,
} from "./worked";

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
   * A DISMISSAL NEVER TAKES BACK WORKED TIME — the guard, not a state machine.
   *
   * Dismissing means "this was never part of my day", and adherence honours it by dropping
   * the block from both sides of the block share. On a row that earned hours that is the one
   * move that makes the climbing figure FALL (see `dismissalWouldErase` in worked.ts for the
   * arithmetic). Since the spec gives every row a dismiss control, including rows already
   * marked adhered, the prior mark is read first and kept when it is worth something.
   *
   * It costs nothing the spec asks for: dismissal is for invites and anything never meant to
   * be done — rows that earned nothing, which is exactly the case this lets through. The
   * unmarked, skipped and zero-fraction-drift rows all dismiss as before.
   *
   * The stored state is RETURNED, which is the contract this function already has: the caller
   * is told what the row now says rather than what it asked for, so the screen closes its row
   * on the answer instead of drawing a dismissal the database refused.
   */
  if (m.state === "dismissed") {
    const prior = await db.execute({
      sql: "SELECT state, worked_fraction FROM block_marks WHERE date=? AND event_id=?",
      args: [m.date, m.event_id],
    });
    const row = prior.rows[0] as Record<string, unknown> | undefined;
    if (row) {
      const was = String(row.state) as BlockState;
      const had = row.worked_fraction == null ? null : Number(row.worked_fraction);
      if (dismissalWouldErase({ state: was, workedFraction: had })) return was;
    }
  }

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
 * The DOCUMENT behind a non-negotiable — ASC.ND, today.
 *
 * SAVING IS LOGGING, exactly as it is for a workout or a skill session: writing the note
 * ticks the habit in the same statement, so there is no second "did it" toggle to forget.
 * That is the whole reason this is one upsert rather than a note-write plus a tick.
 *
 * CLEARING THE NOTE DOES NOT UNTICK. The two are different acts — a tick with nothing
 * written is a day you did it and said nothing about it, which is a perfectly good tick, and
 * deleting a sentence you no longer like must not quietly retract the day. Unticking is what
 * setHabit is for — reached from inside the same dialog now that the row's one control
 * opens it, and nowhere else.
 *
 * One row per (habit, date) by the table's own UNIQUE constraint — see HabitView.note.
 */
export async function setHabitNote(
  db: Client,
  habitId: number,
  date: string,
  note: string | null,
): Promise<void> {
  const text = note == null || !note.trim() ? null : note.trim();
  await db.execute({
    sql: `INSERT INTO habit_entries (habit_id,date,value,note) VALUES (?,?,1,?)
          ON CONFLICT(habit_id,date) DO UPDATE SET
            note = excluded.note,
            -- The tick is only ever RAISED here, never lowered: a row that already exists
            -- was already a yes, and rewriting its note is not a statement about whether the
            -- day happened.
            value = MAX(habit_entries.value, 1)`,
    args: [habitId, date, text],
  });
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

// HABIT OVERRIDES — the write path is GONE, by the owner's ruling (2026-08-21): "Tomorrow,
// specifically" stopped being a place to edit the standing non-negotiables and became a
// place to ADD a one-off one (below). The habit_overrides table and habitsForDate's
// COALESCE read both stay, so every day that was dressed while the feature lived still
// reads back wearing what it wore.

// ---------------------------------------------------------------- one-off non-negotiables

/**
 * A non-negotiable for ONE day — "Tomorrow, specifically". It joins its day's checklist
 * beside the standing items and earns an equal share of HABIT_SHARE; see one_off_habits
 * in the schema.
 *
 * THE DATE MUST BE AHEAD OF THE REAL TODAY, and this guard is the rule that makes the
 * feature safe rather than a formality: adherence divides by items scheduled, so an item
 * added to a day already being lived would grow the denominator mid-day and the figure
 * could FALL — the one thing the climbing number must never do. Added the evening before,
 * it is part of what the morning already knows, exactly like the standing list.
 */
export async function createOneOffHabit(
  db: Client,
  o: { title: string; date: string },
): Promise<number> {
  const title = o.title.trim();
  if (!title) throw new Error("a one-off non-negotiable needs a title");
  if (o.date <= todayISO())
    throw new Error("a one-off non-negotiable is added for a day ahead");
  const r = await db.execute({
    sql: "INSERT INTO one_off_habits (title, date) VALUES (?,?)",
    args: [title, o.date],
  });
  return Number(r.lastInsertRowid);
}

/** Tick or untick a one-off. Binary, exactly like the standing checklist — no states, no
 *  reasons. The row already knows its day, so no date travels. */
export async function setOneOffHabitDone(
  db: Client,
  id: number,
  done: boolean,
): Promise<void> {
  await db.execute({
    sql: "UPDATE one_off_habits SET done=? WHERE id=?",
    args: [done ? 1 : 0, id],
  });
}

/**
 * Remove a one-off — WHILE IT IS STILL A PLAN, and only then. Once its day arrives it is
 * part of that day's denominator; pulling it back out would rewrite a lived day's record,
 * and deleting a TICKED item can even lower a day's figure ((done-1)/(items-1) < done/items).
 * Returns false when nothing matched — a past-day row, or a stale id — so the caller can
 * say so rather than pretend.
 */
export async function deleteOneOffHabit(
  db: Client,
  id: number,
): Promise<boolean> {
  const r = await db.execute({
    sql: "DELETE FROM one_off_habits WHERE id=? AND date > ?",
    args: [id, todayISO()],
  });
  return r.rowsAffected > 0;
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
    // Thrown, not rolled back and then thrown: the catch below rolls back ONCE. The local
    // sqlite3 client throws TRANSACTION_CLOSED on a second rollback, and that error — not
    // this one — is what the route would report. (Turso's hrana client returns silently
    // from the second call, which is why the pattern never showed in production.)
    if (kind !== patch.kind)
      throw new Error(`page ${id} is a ${kind} page, not ${patch.kind}`);

    if (patch.kind === "text") {
      await tx.execute({
        sql: "UPDATE journal_entries SET body=? WHERE id=?",
        args: [patch.body, id],
      });
    } else {
      // This IS sheet 0's write path — the same columns saveJournalSheet(…, 0, …) writes.
      // Later sheets (journal_sheets) are untouched: rewriting the first sheet of a scroll
      // says nothing about the rest of it.
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

/**
 * How many sheets a page has: 1 + the rows in journal_sheets for a drawing, 0 for a text
 * page. Sheets are contiguous by construction (saveJournalSheet refuses a gap), so the
 * COUNT is the whole answer and no reader needs to know which seqs exist.
 *
 * Takes a db OR an open transaction, because the writer below needs the same figure inside
 * its own transaction and a second copy of a one-line rule is still a second copy.
 * Returns 0 for a missing row as well — "no sheets" is true of a page that does not exist,
 * and every caller that cares about existence has already asked.
 */
export async function journalSheetCount(
  db: Exec,
  id: number,
): Promise<number> {
  const r = await db.execute({
    sql: `SELECT j.kind, (SELECT COUNT(*) FROM journal_sheets s WHERE s.entry_id = j.id) AS extra
            FROM journal_entries j WHERE j.id=?`,
    args: [id],
  });
  if (!r.rows.length) return 0;
  if (String(r.rows[0].kind ?? "drawing") === "text") return 0;
  return 1 + num(r.rows[0].extra);
}

/**
 * Write ONE SHEET of a handwritten page — the scroll's unit of saving (see sheets.ts).
 *
 * Sheet 0 is the row itself: `journal_entries.image/width/height`, the same columns
 * updateJournalEntry's drawing branch writes, so a one-sheet page saved either way is the
 * same record. Sheets 1.. upsert into journal_sheets on (entry_id, seq), which is what lets
 * the canvas re-send only the sheets it touched and leave the rest of a long page alone.
 *
 * Three refusals, all thrown rather than returned, because each is a caller bug and not a
 * state of the record:
 *  - a TEXT page: it has no sheets, and writing one would leave a PNG in a row nothing
 *    reads as a drawing — the same rule updateJournalEntry enforces about `kind`.
 *  - seq < 0: no such sheet.
 *  - seq > 1 + existing: a GAP. The scroll is contiguous by construction, and the client
 *    saves sequentially precisely so this can never be reached by a correct caller.
 *
 * Returns false when there is no such page, so the route can 404 rather than report a
 * write that touched nothing. No habit tick: the page already exists, so the day is already
 * ticked, and adding a sheet cannot be the thing that ticks it.
 */
export async function saveJournalSheet(
  db: Client,
  id: number,
  seq: number,
  sheet: { image: string; width?: number | null; height?: number | null },
): Promise<boolean> {
  if (!Number.isInteger(seq) || seq < 0)
    throw new Error(`sheet ${seq} is not a sheet`);
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
    // Both refusals THROW and leave the rollback to the catch below, which runs it once.
    // Rolling back here and again in the catch is not harmless: the local sqlite3 client
    // throws TRANSACTION_CLOSED on the second call, and that error — not this one — is
    // what the route would see, turning a 409 with a reason into a 500 without one.
    // (Turso's hrana client returns silently, which is why the pattern never showed in
    // production.) The route tells the two apart by their wording; keep it.
    if (String(r.rows[0].kind ?? "drawing") === "text")
      throw new Error(`page ${id} is a text page and has no sheets`);
    const count = await journalSheetCount(tx, id);
    if (seq > count)
      throw new Error(
        `sheet ${seq} would leave a gap: page ${id} has ${count} sheet${count === 1 ? "" : "s"}`,
      );

    if (seq === 0) {
      await tx.execute({
        sql: "UPDATE journal_entries SET image=?, width=?, height=? WHERE id=?",
        args: [sheet.image, sheet.width ?? null, sheet.height ?? null, id],
      });
    } else {
      await tx.execute({
        sql: `INSERT INTO journal_sheets (entry_id, seq, image, width, height) VALUES (?,?,?,?,?)
              ON CONFLICT(entry_id, seq) DO UPDATE SET image=excluded.image, width=excluded.width, height=excluded.height`,
        args: [id, seq, sheet.image, sheet.width ?? null, sheet.height ?? null],
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
    // The page's later sheets go first and explicitly. The schema's ON DELETE CASCADE would
    // do this too while foreign_keys is on — but a pragma is a session setting, not a
    // promise, and a scroll's sheets outliving its page would be handwriting nothing can
    // reach. Ordered before the parent so the FK never has to be relied on at all.
    await tx.execute({
      sql: "DELETE FROM journal_sheets WHERE entry_id=?",
      args: [id],
    });
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

// ---------------------------------------------------------------- goals

// Goals are the ONE sanctioned accomplishment measure in this app, and they are
// quarantined: goal progress feeds nothing else — not adherence, not the streak, not
// the rings, not the coach. That isolation is what keeps "did I do what I said I'd do"
// from quietly becoming "how much did I finish".
//
// Progress is never STORED. It is derived from completed subgoal weights on read (see
// lib/goals.ts), so the stale goals.progress column can never drift out of step with the
// subgoals that define it. It already had: row 1 stored 0.0833 while deriving 0.

/** The statuses a goal may hold — the schema's CHECK, stated once for the engine. */
export const GOAL_STATUSES = ["active", "done", "paused", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const isGoalStatus = (s: unknown): s is GoalStatus =>
  typeof s === "string" && (GOAL_STATUSES as readonly string[]).includes(s);

/**
 * A deadline as it may be written: a real 'YYYY-MM-DD' date, or null to clear it. Anything
 * else is REFUSED rather than coerced — a deadline decides whether a goal is in the Career
 * ring and how full its arc is, so a guessed one is worse than none. `undefined` is not a
 * deadline; the callers use it to mean "leave it alone".
 */
function checkDeadline(d: string | null): string | null {
  if (d === null) return null;
  if (!isISODate(d))
    throw new Error("a goal's deadline must be a YYYY-MM-DD date");
  return d;
}

/**
 * A counted goal's size. A target must be a positive whole number or absent — 0 and a
 * fraction are both refused rather than coerced, because `target_count` is the flag that
 * says "this goal counts", and a goal that silently stopped counting would show 0% with no
 * way on screen to tell why.
 */
function checkTargetCount(n: number | null): number | null {
  if (n === null) return null;
  if (!Number.isInteger(n) || n <= 0)
    throw new Error("a goal's target count must be a whole number above 0");
  return n;
}

/** 0..target, whole. See setGoalCount for why the clamp lives here and not in a client. */
function clampCount(done: number, target: number | null): number {
  if (target == null || !Number.isFinite(done)) return 0;
  return Math.min(target, Math.max(0, Math.round(done)));
}

/** The pillar every new goal is filed under — see createGoal. */
const GOAL_PILLAR: PillarKey = "portfolio";

/**
 * Create a goal. EVERY GOAL IS A CAREER GOAL since the Health & Career pivot, so it is
 * filed under `portfolio` — always, and here rather than in a client, so a screen that still
 * sends a pillar cannot file one anywhere else. The deadline is optional: a goal without one
 * lists under Career, but takes no arc of the ring until it has one.
 */
export async function createGoal(
  db: Client,
  g: {
    title: string;
    target?: string | null;
    deadline?: string | null;
    /** A COUNTED goal's size — 150 for "NeetCode, 150 problems". Omit for a goal whose
     *  progress comes from subtasks; the two are exclusive (goals.ts). */
    targetCount?: number | null;
    /** How many are already done at creation. A roadmap is written down partway through
     *  more often than not, and a goal that must start at 0 is a goal that lies on day one. */
    doneCount?: number | null;
  },
): Promise<number> {
  const title = g.title.trim();
  if (!title) throw new Error("a goal needs a title");
  const pillar = GOAL_PILLAR;
  const deadline = checkDeadline(g.deadline ?? null);
  const targetCount = checkTargetCount(g.targetCount ?? null);
  const doneCount = clampCount(g.doneCount ?? 0, targetCount);
  const r = await db.execute({
    sql: `INSERT INTO goals (pillar_id,title,target,deadline,target_count,done_count)
          SELECT id,?,?,?,?,? FROM pillars WHERE key=?`,
    args: [
      title,
      g.target?.trim() || null,
      deadline,
      targetCount,
      doneCount,
      pillar,
    ],
  });
  if (!r.rowsAffected) throw new Error(`pillar '${pillar}' is missing`);
  return Number(r.lastInsertRowid);
}

/**
 * A goal's COUNT — the owner's ruling, 2026-09-20. Set ABSOLUTELY, never as a delta: a
 * retried tap, a double-fired pointer or a replayed request must not advance the tally
 * twice. That is the same reasoning day_tasks runs under — reading a task twice cannot
 * move it twice — applied to the one number in this app a client increments.
 *
 * CLAMPED to 0..target here rather than trusted to the client, because the column's CHECK
 * only catches the negative half and a goal at 151 of 150 would print a percentage over
 * 100 on three screens.
 */
export async function setGoalCount(
  db: Client,
  id: number,
  done: number,
): Promise<void> {
  const cur = await db.execute({
    sql: "SELECT target_count FROM goals WHERE id=?",
    args: [id],
  });
  if (!cur.rows.length) throw new Error("no such goal");
  const target = cur.rows[0]!.target_count;
  if (target == null) throw new Error("that goal is not counted");
  await db.execute({
    sql: "UPDATE goals SET done_count=?, updated_at=? WHERE id=?",
    args: [clampCount(done, Number(target)), now(), id],
  });
}

export async function updateGoal(
  db: Client,
  id: number,
  patch: {
    title?: string;
    target?: string | null;
    status?: GoalStatus;
    /** A 'YYYY-MM-DD' to set, null to CLEAR, undefined to leave as it is. */
    deadline?: string | null;
    /** A positive whole number to make the goal COUNTED, null to return it to its
     *  subtasks, undefined to leave it. Clearing keeps done_count where it was rather
     *  than zeroing it: the tally is a thing the owner counted, and a goal switched back
     *  and forth must not forget it. */
    targetCount?: number | null;
  },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined)
    (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.targetCount !== undefined) {
    const t = checkTargetCount(patch.targetCount);
    sets.push("target_count=?");
    args.push(t);
    // A target that SHRANK below the tally would leave the goal reading over 100% until
    // the next tap. Pull the count down with it; growing one leaves the tally alone.
    if (t !== null) {
      sets.push("done_count=MIN(done_count,?)");
      args.push(t);
    }
  }
  if (patch.target !== undefined)
    (sets.push("target=?"), args.push(patch.target?.trim() || null));
  if (patch.deadline !== undefined)
    (sets.push("deadline=?"), args.push(checkDeadline(patch.deadline)));
  if (patch.status !== undefined) {
    if (!isGoalStatus(patch.status))
      throw new Error(`unknown goal status '${String(patch.status)}'`);
    /**
     * WHEN it was finished, stamped here and nowhere else — as the LOCAL DAY it was marked
     * done, 'YYYY-MM-DD', which is what the timeline's note prints beside its tick.
     *
     * A finished goal with no date is a fact with no place in a sequence, and the owner
     * wants "a clear plan on what I have achieved".
     *
     * KEPT if the goal was already done: re-marking a done goal done (a second tap, a retry)
     * must not move the day it was finished to today. CLEARED on the way back out:
     * un-completing a goal and leaving the stamp behind would leave a live goal claiming a
     * completion date, which is worse than no date at all.
     *
     * The status is written in the same statement, so the CASE reads the row's status
     * BEFORE this update — SQLite evaluates every SET expression against the old row.
     */
    sets.push("status=?");
    args.push(patch.status);
    if (patch.status === "done") {
      sets.push(
        "completed_at=CASE WHEN status='done' AND completed_at IS NOT NULL THEN completed_at ELSE ? END",
      );
      args.push(todayISO());
    } else {
      sets.push("completed_at=NULL");
    }
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

/**
 * Edit a subtask: any of `{ title, weight, due }`; an absent field is left alone. `due`
 * null CLEARS the date, which is how a subtask stops floating and can no longer be late.
 * The route validates the date; here it is trusted.
 */
export async function updateSubgoal(
  db: Client,
  id: number,
  patch: { title?: string; weight?: number | null; due?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined)
    (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.weight !== undefined)
    (sets.push("weight=?"), args.push(clampWeight(patch.weight)));
  if (patch.due !== undefined) (sets.push("due=?"), args.push(patch.due));
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
 *
 * `doneOn` is the day the tick belongs to — the day on screen, which is today unless the
 * owner is marking a past day up — and it is cleared on an untick. See subtasks.ts for why
 * the day is recorded at all.
 */
export async function setSubgoalDone(
  db: Client,
  id: number,
  done: boolean,
  doneOn: string = todayISO(),
): Promise<void> {
  await db.execute({
    sql: "UPDATE subgoals SET done=?, done_on=? WHERE id=?",
    args: [done ? 1 : 0, done ? doneOn : null, id],
  });
}

/** Hard. subgoals has no `active` column and nothing references a subgoal id, so there
 *  is no history to orphan. The UI's confirm is the safeguard. */
export async function deleteSubgoal(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM subgoals WHERE id=?", args: [id] });
}

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
  const [marks, ticks] = await Promise.all([
    db.execute({
      sql: "SELECT DISTINCT date FROM block_marks WHERE date<=? AND state != 'dismissed'",
      args: [date],
    }),
    db.execute({
      sql: "SELECT DISTINCT date FROM habit_entries WHERE date<=?",
      args: [date],
    }),
  ]);
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

/**
 * Name a month, or clear its name.
 *
 * An empty name DELETES the row rather than storing "", so "unnamed" has exactly one
 * representation — the same ruling setHabitValue makes about clearing a number. A month with
 * an empty-string chapter would print "The Book of Nero: " with nothing after the colon.
 *
 * It feeds nothing. See the chapters table.
 */
export async function setChapter(
  db: Client,
  month: string,
  name: string | null,
): Promise<void> {
  const text = name == null ? "" : name.trim();
  if (!text) {
    await db.execute({
      sql: "DELETE FROM chapters WHERE month=?",
      args: [month],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO chapters (month,name,updated_at) VALUES (?,?,?)
          ON CONFLICT(month) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
    args: [month, text.slice(0, 80), now()],
  });
}

/**
 * A timeline month's note, or a timeline group's name — two stores, one contract, the
 * chapter's own: an empty write DELETES the row, so "unwritten" has one representation
 * and the derived default (the month bare, the term's generated name) simply shows again.
 *
 * They feed nothing. The timeline is a place to look, not a thing that scores.
 */
export async function setTimelineText(
  db: Client,
  kind: "note" | "group",
  month: string,
  text: string | null,
): Promise<void> {
  const table = kind === "note" ? "timeline_notes" : "timeline_groups";
  const col = kind === "note" ? "text" : "name";
  const key = kind === "note" ? "month" : "start";
  const value = text == null ? "" : text.trim();
  if (!value) {
    await db.execute({ sql: `DELETE FROM ${table} WHERE ${key}=?`, args: [month] });
    return;
  }
  await db.execute({
    sql: `INSERT INTO ${table} (${key},${col},updated_at) VALUES (?,?,?)
          ON CONFLICT(${key}) DO UPDATE SET ${col}=excluded.${col}, updated_at=excluded.updated_at`,
    args: [month, value.slice(0, 120), now()],
  });
}

/**
 * THE FLOATING WINDOWS — a goal placed on the timeline, or a text note with a tint. The
 * owner's revision, 2026-09-03, replacing setTimelinePosition (every goal was placed
 * whether wanted or not; now a goal is on the timeline only while it has a window).
 *
 * Coordinates are the world's own pixels from a FIXED origin (Jul 2025), so nothing here
 * ever needs re-anchoring as months roll in on the right. Clamped rather than refused: a
 * drag that ends a pixel out of bounds is the owner placing a window, not an attack, and
 * the render clamps again anyway.
 *
 * None of it feeds anything. The timeline is a place to look, not a thing that scores.
 */
const clampXY = (x: number, y: number): { x: number; y: number } => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("position must be finite");
  }
  return {
    x: Math.round(Math.max(0, Math.min(x, 1_000_000)) * 10) / 10,
    y: Math.round(Math.max(0, Math.min(y, 100_000)) * 10) / 10,
  };
};

/**
 * A new window. A GOAL window needs a goal that exists and is not already placed — the
 * partial unique index would refuse the second copy anyway, but with a worse message; a
 * TEXT window opens empty, since the owner writes into it on screen. Returns the new id
 * so the screen can address the window it just made.
 */
export async function addTimelineWindow(
  db: Client,
  w:
    | { kind: "goal"; goalId: number; x: number; y: number }
    | { kind: "text"; x: number; y: number },
): Promise<number> {
  const at = clampXY(w.x, w.y);
  if (w.kind === "goal") {
    const g = await db.execute({ sql: "SELECT 1 FROM goals WHERE id=?", args: [w.goalId] });
    if (!g.rows.length) throw new Error("no such goal");
    const dup = await db.execute({
      sql: "SELECT 1 FROM timeline_windows WHERE goal_id=?",
      args: [w.goalId],
    });
    if (dup.rows.length) throw new Error("that goal is already on the timeline");
    const r = await db.execute({
      sql: `INSERT INTO timeline_windows (kind,goal_id,x,y,created_at,updated_at)
            VALUES ('goal',?,?,?,?,?)`,
      args: [w.goalId, at.x, at.y, now(), now()],
    });
    return Number(r.lastInsertRowid);
  }
  const r = await db.execute({
    sql: `INSERT INTO timeline_windows (kind,x,y,created_at,updated_at) VALUES ('text',?,?,?,?)`,
    args: [at.x, at.y, now(), now()],
  });
  return Number(r.lastInsertRowid);
}

/**
 * Move, rewrite or recolour a window. Three optional fields on one contract: undefined
 * LEAVES a field — a move must never eat a note, and a recolour must never move a card.
 * `color` takes a WINDOW_TINTS key or null (paper); anything else is refused. Text is
 * trimmed and capped at WINDOW_TEXT_MAX — a sticky
 * note, not a page — and an empty text is stored as '', not deleted: an empty window is
 * still a window the owner put there, and removing one is its own, explicit verb.
 */
export async function updateTimelineWindow(
  db: Client,
  id: number,
  patch: { x?: number; y?: number; text?: string; color?: string | null },
): Promise<void> {
  const cur = await db.execute({
    sql: "SELECT x, y FROM timeline_windows WHERE id=?",
    args: [id],
  });
  if (!cur.rows.length) throw new Error("no such window");
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.x !== undefined || patch.y !== undefined) {
    const at = clampXY(
      patch.x === undefined ? Number(cur.rows[0]!.x) : patch.x,
      patch.y === undefined ? Number(cur.rows[0]!.y) : patch.y,
    );
    sets.push("x=?", "y=?");
    args.push(at.x, at.y);
  }
  if (patch.text !== undefined) {
    sets.push("text=?");
    args.push(patch.text.trim().slice(0, WINDOW_TEXT_MAX));
  }
  if (patch.color !== undefined) {
    if (patch.color !== null && !isWindowTint(patch.color)) {
      throw new Error("colour must be one of the timeline tints");
    }
    sets.push("color=?");
    args.push(patch.color);
  }
  if (!sets.length) return;
  sets.push("updated_at=?");
  args.push(now(), id);
  await db.execute({
    sql: `UPDATE timeline_windows SET ${sets.join(", ")} WHERE id=?`,
    args,
  });
}

/** Take a window off the timeline. For a goal window this forgets only the placement —
 *  the goal itself is untouched; for a text window the words go with it, which is why the
 *  screen asks first. */
export async function removeTimelineWindow(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM timeline_windows WHERE id=?", args: [id] });
}
