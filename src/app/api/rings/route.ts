import { getDb } from "@/lib/db/client";
import {
  getRingCounts,
  getObservedDays,
  getPillarFacts,
  adheredEventIds,
  skillSlices,
} from "@/lib/queries";
import { workoutsOn } from "@/lib/engine";
import { getCalendarRange } from "@/lib/google";
import { buildRings, WINDOW_DAYS } from "@/lib/rings";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import { CALENDAR_RATES } from "@/lib/productivity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GRAPHITE, AND IT IS THE WHOLE OF IT. Every social event in the calendar wears this one
 * colour — Church, a standing night out, a farewell, a lunch — so they count toward Social
 * without being logged a second time by hand.
 *
 * There used to be a second id here for the one-off kind, on the belief that the owner's
 * two calendar colours arrived as two ids. THEY DO NOT, and the belief was expensive: the
 * Events API reports only the eleven LEGACY colour ids, while the calendar UI's palette is
 * wider, so Graphite and the Birch beside it both come back as 8. Measured across 180 days
 * of the owner's calendar, id 8 held Church and Nathan's Farewell side by side, and the
 * only id 4 event in six months was titled "Gym". The second constant therefore matched
 * nothing social, the one-off band never drew, every one-off quietly filled the inner ring
 * instead, and a stray Gym block was one adhered mark away from counting as a night out.
 *
 * The split it was reaching for is RECURRENCE, which is what the colours were standing in
 * for all along and which the API states outright — see CalEvent.recurring. A colour cannot
 * carry this distinction; a repeat rule can, and cannot be fooled by a palette the API
 * does not speak.
 */
const SOCIAL_COLOR_ID = "8";

/**
 * Basil — the owner's colour for their own project work, and the one full-rate category in
 * productivity.ts. The Portfolio ring's outer lap counts the HOURS of it, so the two
 * readings of the same blocks stay in step: the same colour, the same adhered-only rule,
 * one priced per hour and one measured in them.
 *
 * Read from CALENDAR_RATES rather than written down again — the productivity table is
 * where a category's colour is decided, and a second literal here is how the two drift.
 */
const PROJECT_COLOR_ID =
  CALENDAR_RATES.find((c) => c.label === "Work Projects")?.id ?? null;

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    // Validated before it reaches addDays, which throws RangeError on malformed input.
    // Same guard pattern as /api/adherence.
    const anchor = isISODate(raw) ? raw : todayISO();
    const from = addDays(anchor, -(WINDOW_DAYS - 1));

    const db = await getDb();

    // Social events live only in Google, so they are counted here and handed to
    // getRingCounts rather than queried. `connected` matters: on a calendar failure the
    // count is left UNDEFINED, which resolves to an unresolved source and draws a ghost —
    // a zero would say the fortnight held no social events, which is a different and
    // possibly false claim.
    // ADHERED ONLY, and that is the pivot: an event on the calendar you drifted from is
    // not a social fortnight you had. The marks are the record; the ring reads the record.
    const adhered = await adheredEventIds(db, from, anchor);

    const cal = await getCalendarRange(from, anchor);
    let socialEvents: number | undefined;
    // The events THEMSELVES, not only their counts — the Events drill-down opens into
    // these lists, and the ring draws one segment per event. One COLOUR gets in; RECURRENCE
    // decides which band it rides. Left undefined on a calendar failure, for the same
    // reason the count is.
    let socialEventList: { date: string; title: string }[] | undefined;
    let oneOffEventList: { date: string; title: string }[] | undefined;
    /** Adhered project HOURS in the window — the Portfolio lap. Undefined on a calendar
     *  failure, for the same reason the event counts are. */
    let projectHours: number | undefined;
    if (cal.connected) {
      socialEvents = 0;
      socialEventList = [];
      oneOffEventList = [];
      let projectMinutes = 0;
      for (const [date, events] of cal.byDate) {
        for (const e of events) {
          if (!adhered.has(e.id)) continue;

          if (e.colorId === PROJECT_COLOR_ID) {
            // Minutes from the event's own span. An all-day block contributes nothing —
            // the same ruling adherence makes, and for the same reason: a day marked
            // "projects" is not fourteen hours of project work.
            if (e.start && e.end && !e.allDay) {
              const mins =
                (Date.parse(e.end) - Date.parse(e.start)) / 60_000;
              if (Number.isFinite(mins) && mins > 0) projectMinutes += mins;
            }
            continue;
          }

          if (e.colorId !== SOCIAL_COLOR_ID) continue;
          socialEvents += 1;
          // A standing commitment is an instance of a repeating series; a one-off is not.
          (e.recurring ? socialEventList : oneOffEventList).push({
            date,
            title: e.summary,
          });
        }
      }
      socialEventList.sort((a, b) => b.date.localeCompare(a.date));
      oneOffEventList.sort((a, b) => b.date.localeCompare(a.date));
      // One decimal: the fact line prints this verbatim, and "7.4 of 14 hours" is a figure
      // you can act on where "7.416666666666667" is a bug report.
      projectHours = Math.round((projectMinutes / 60) * 10) / 10;
    }

    const [counts, observedDays, workouts, facts, skills14] = await Promise.all([
      // The METRIC (target 6) counts the RECURRING kind only. A one-off is the outer
      // band's own story and never fills the inner ring: the six-a-fortnight minimum is
      // about standing commitments kept, and a farewell you happened to be invited to is
      // not evidence you kept one.
      getRingCounts(db, from, anchor, {
        social_events: socialEventList?.length,
        project_hours: projectHours,
      }),
      getObservedDays(db, anchor),
      // The workout metrics are 14-day counts, so they cannot tell the toggles what is
      // logged TODAY. One extra lookup rather than a second round trip from the client.
      workoutsOn(db, anchor),
      getPillarFacts(db, from, anchor),
      // Portfolio's ring is segmented PER SKILL now — who was worked, how much, in whose
      // colour. Only skills with a session in the window appear.
      skillSlices(db, from, anchor),
    ]);

    return Response.json({
      date: anchor,
      from,
      observedDays,
      workouts,
      // The plain-words fortnight printed under each pillar's name. socialEvents rides
      // along from the calendar count above (standing AND one-off — both were social
      // fortnights you had) and stays UNDEFINED on a Google failure, so the caption can
      // say "events unavailable" rather than claim a zero.
      facts: { ...facts, socialEvents },
      socialEventList,
      oneOffEventList,
      skills14,
      pillars: buildRings(counts, observedDays),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
