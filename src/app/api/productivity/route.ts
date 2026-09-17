import { getDb } from "@/lib/db/client";
import { getCalendarForDate } from "@/lib/google";
import { buildBlocks, type BlockState } from "@/lib/adherence";
import { isISODate, todayISO } from "@/lib/dates";
import {
  CATEGORY_ORDER,
  canonicalColor,
  categoryOf,
  hoursForDay,
  workedMinutes,
} from "@/lib/productivity";
import { workedFraction } from "@/lib/worked";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE DAY'S HOURS WORKED, WITH ITS WORKINGS — the breakdown the record's hours chart opens.
 *
 * MINUTES BY CATEGORY and the "didn't count" list. NO POINTS: the productivity score is gone
 * (the owner's ruling of 2026-09-18), and with it the per-hour rates, the flat gym figure
 * and the non-negotiable points. The route keeps its path because the drill-down already
 * calls it.
 *
 * WHAT DID NOT COUNT IS THE POINT OF IT. A day full of scheduled hours can hold no hours
 * worked — unmarked blocks, skipped and drifted ones, and colours that are not a category
 * all add nothing, and every one of those is invisible on a bar. So they are returned WITH
 * THEIR REASON. Graphite events are not in either list: they are not blocks at all
 * (buildBlocks drops them).
 *
 * Response:
 *   date, calendarConnected
 *   hours        DayHours | null   — { minutes, categories: [{ label, colorId, minutes }] };
 *                                    null when the calendar could not be reached
 *   categories   [{ label, colorId }] in stacking order, for a legend on an empty day
 *   ignored      [{ title, minutes, colorId, state, reason }] — the minutes that did not
 *                count (for a partial drift, only the part that went elsewhere)
 */

/**
 * Why a scheduled block added nothing — or, for a partial drift, why part of it did not.
 * The words the screen prints, decided here so the rule and its explanation cannot drift
 * apart.
 *
 * THE ORDER IS THE ARGUMENT, and the PARTIAL branch must come last. A block that adds
 * nothing at any fraction — no usable duration, or a colour that is not a category — must
 * say so rather than report which share of it went elsewhere, because that share is not why
 * it added nothing.
 */
function ignoredReason(
  state: BlockState | null,
  colorId: string | null,
  minutes: number | null,
  worked: number,
): string | null {
  if (worked <= 0)
    return state == null
      ? "not marked yet"
      : state === "drifted"
        ? "drifted — the time went elsewhere"
        : state === "skipped"
          ? "skipped — it did not happen"
          : "dismissed";
  if (!minutes) return "no duration";
  // Grape gets its own words: training is logged as sessions, and an hour under a bar is not
  // an hour of work — saying "not a category" would send the reader looking for a missing
  // row when nothing is missing.
  if (colorId === "3") return "gym is not counted as hours worked";
  if (categoryOf(colorId) == null) return "this colour is not an hours category";
  // A PARTIAL DRIFT IS IN BOTH HALVES OF THIS SCREEN, and that is correct: the minutes you
  // worked are in the categories, and the minutes you did not are explained here.
  if (worked < 1)
    return `drifted — the other ${Math.round((1 - worked) * 100)}% went elsewhere`;
  return null;
}

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();

    const db = await getDb();
    const cal = await getCalendarForDate(date);

    const markRows = await db.execute({
      sql: "SELECT event_id,state,reason,worked_fraction FROM block_marks WHERE date=?",
      args: [date],
    });
    const marks = new Map<
      string,
      { state: BlockState; reason: string | null; workedFraction: number | null }
    >(
      markRows.rows.map((r) => [
        String(r.event_id),
        {
          state: String(r.state) as BlockState,
          reason: r.reason == null ? null : String(r.reason),
          workedFraction:
            r.worked_fraction == null ? null : Number(r.worked_fraction),
        },
      ]),
    );

    const blocks = buildBlocks(date, cal.events, marks);
    const asWork = (b: (typeof blocks)[number]) => ({
      minutes: b.minutes ?? 0,
      colorId: b.colorId,
      state: b.state,
      workedFraction: b.workedFraction,
    });

    // null when Google could not be reached — the same gate /api/adherence applies: an
    // outage must read as "no data", not as a day with nothing worked.
    const hours = cal.connected ? hoursForDay(blocks.map(asWork)) : null;

    const ignored = blocks
      .filter((b) => b.state !== "dismissed")
      .map((b) => {
        const worked = workedFraction(b.state, b.workedFraction);
        // The share of the block that COUNTED — which is not the share you worked: a block
        // disqualified by its colour or its duration forfeits all of itself.
        const counted =
          b.minutes && b.minutes > 0 ? workedMinutes(asWork(b)) / b.minutes : 0;
        return {
          title: b.title,
          // THE MINUTES THAT DID NOT COUNT, not the minutes that were scheduled.
          minutes:
            b.minutes == null ? null : Math.round(b.minutes * (1 - counted)),
          colorId: b.colorId,
          state: b.state,
          reason: ignoredReason(b.state, b.colorId, b.minutes, worked),
        };
      })
      .filter((b) => b.reason != null);

    return Response.json({
      date,
      calendarConnected: cal.connected,
      hours,
      categories: CATEGORY_ORDER.map((label) => ({
        label,
        colorId: canonicalColor(label),
      })),
      ignored,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
