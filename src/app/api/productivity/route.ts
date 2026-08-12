import { getDb } from "@/lib/db/client";
import { getCalendarForDate } from "@/lib/google";
import { buildBlocks, type BlockState } from "@/lib/adherence";
import { caloriesForDate } from "@/lib/queries";
import { weekdayBit, workoutsOn } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";
import {
  CALENDAR_RATES,
  CALORIE_FLOOR,
  COUNTED_STATES,
  POINTS_PER_HABIT,
  POINTS_PER_HOUR,
  POINTS_PER_SESSION,
  rateFor,
  scoreDay,
} from "@/lib/productivity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE DAY'S PRODUCTIVITY, WITH ITS WORKINGS.
 *
 * The strip draws the score as a height and prints no number, deliberately — an uncapped
 * figure with no ceiling beside it invites a comparison it cannot support. This is the
 * other half of that bargain: the bar stays a shape, and the arithmetic behind it is one
 * tap away for anyone who wants to audit it. An explanation you open on purpose is not a
 * scoreboard; a number sitting on a chart is.
 *
 * WHAT DID NOT COUNT IS THE POINT OF IT. A day full of scheduled hours can score nothing —
 * unmarked blocks pay nothing, skipped and drifted pay nothing, and a colour the table has
 * never been taught pays nothing. Every one of those is invisible on the bar, which is
 * exactly the shape of "my gym is not in there and I cannot see why". So the ignored blocks
 * are returned WITH THEIR REASON, and they are the honest half of the answer.
 *
 * A route of its own rather than more fields on /api/adherence: that endpoint answers for
 * up to 366 days at a time and this is a drill-down into one. It also stays off DayView,
 * which is what keeps the score structurally invisible to the coach — see CLAUDE.md.
 */

/** Why a scheduled block earned nothing. The words the screen prints, decided here so the
 *  rule and its explanation cannot drift apart. */
function ignoredReason(
  state: BlockState | null,
  colorId: string | null,
  minutes: number | null,
): string | null {
  if (!COUNTED_STATES.includes(state))
    return state == null
      ? "not marked yet"
      : state === "drifted"
        ? "drifted — the time went elsewhere"
        : state === "skipped"
          ? "skipped — it did not happen"
          : "dismissed";
  if (!minutes) return "no duration — an all-day event is not eight hours of work";
  // GRAPE GETS ITS OWN SENTENCE. It is unlisted like any other unscored colour, but saying
  // so would send the reader looking for a missing rate when nothing is missing: gym is
  // priced per logged session on purpose, so the block is not where its points live. A
  // reason that points at the wrong fix is worse than a vague one.
  if (colorId === "3")
    return "gym is scored from the logged session, not from the block";
  if (rateFor(colorId) <= 0)
    return "this colour is not in the table, so it scores nothing";
  return null;
}

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();

    const db = await getDb();
    const cal = await getCalendarForDate(date);

    const markRows = await db.execute({
      sql: "SELECT event_id,state,reason FROM block_marks WHERE date=?",
      args: [date],
    });
    const marks = new Map<string, { state: BlockState; reason: string | null }>(
      markRows.rows.map((r) => [
        String(r.event_id),
        {
          state: String(r.state) as BlockState,
          reason: r.reason == null ? null : String(r.reason),
        },
      ]),
    );

    const blocks = buildBlocks(date, cal.events, marks);

    // The same tally adherence uses, so the non-negotiable count on this screen is the one
    // the ring counted. Habit config is read as it is NOW — the schedule is not versioned.
    const habitRows = await db.execute(
      "SELECT id, days_mask FROM habits WHERE active=1",
    );
    const bit = weekdayBit(date);
    const scheduled = habitRows.rows
      .map((r) => ({ id: Number(r.id), mask: Number(r.days_mask) }))
      .filter((h) => (h.mask & bit) !== 0);
    const tickRows = await db.execute({
      sql: "SELECT habit_id FROM habit_entries WHERE date=? AND value > 0",
      args: [date],
    });
    const ticked = new Set(tickRows.rows.map((r) => Number(r.habit_id)));
    const habitsDone = scheduled.filter((h) => ticked.has(h.id)).length;

    const cal_ = await caloriesForDate(db, date);
    // The logged sessions themselves, not just a count — the breakdown names each one, and
    // "Strength, Cardio" is the answer to "which 100 points is that".
    const gym = await workoutsOn(db, date);

    // null when Google could not be reached — the same gate /api/adherence applies, and for
    // the same reason: a score built from non-negotiables alone while every scheduled hour
    // silently counted as zero would be a wrong number rather than an absent one.
    const score = cal.connected
      ? scoreDay({
          blocks: blocks.map((b) => ({
            minutes: b.minutes ?? 0,
            colorId: b.colorId,
            state: b.state,
          })),
          habitsDone,
          calories: cal_.total,
          workouts: gym.length,
        })
      : null;

    const ignored = blocks
      .filter((b) => b.state !== "dismissed")
      .map((b) => ({
        title: b.title,
        minutes: b.minutes,
        colorId: b.colorId,
        state: b.state,
        reason: ignoredReason(b.state, b.colorId, b.minutes),
      }))
      .filter((b) => b.reason != null);

    return Response.json({
      date,
      calendarConnected: cal.connected,
      score,
      // The label each colour carries in the score, so the screen never invents one — the
      // strip's legend and this breakdown read the same table.
      rates: CALENDAR_RATES,
      ignored,
      habits: {
        done: habitsDone,
        scheduled: scheduled.length,
        points: habitsDone * POINTS_PER_HABIT,
        // The floor scores one more ticked thing, and joins the same grey slab.
        calories: cal_.total,
        calorieFloor: CALORIE_FLOOR,
        calorieCounted: (cal_.total ?? 0) >= CALORIE_FLOOR,
      },
      // The logged sessions by kind, so the breakdown can name what it is paying for.
      sessions: gym.map((w) => w.kind),
      constants: {
        perHour: POINTS_PER_HOUR,
        perHabit: POINTS_PER_HABIT,
        perSession: POINTS_PER_SESSION,
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
