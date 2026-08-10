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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Graphite. The owner's convention for a WEEKLY-OCCURRING social event in the calendar —
 * Church, a standing night out — so they count toward Social without being logged a
 * second time by hand.
 */
const SOCIAL_COLOR_ID = "8";
/**
 * Birch: the owner's colour for the social events that are NOT weekly occurring — a
 * farewell, a lunch. They ride the Social ring's outer band rather than the inner one.
 *
 * "4" is MEASURED, not assumed: the Google API only speaks legacy colour ids, the owner's
 * calendar UI speaks the new names, and the id their birch-coloured events actually arrive
 * as — "lunch w/ caitlyn", squarely this category — is 4. If birch events ever stop
 * counting, re-probe /api/calendar for the id their titles arrive under and retune this.
 */
const BIRCH_COLOR_ID = "4";

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
    // these lists, and the ring draws one segment per event. Graphite (weekly-occurring)
    // and birch (one-off) ride separate bands. Left undefined on a calendar failure, for
    // the same reason the count is.
    let socialEventList: { date: string; title: string }[] | undefined;
    let birchEventList: { date: string; title: string }[] | undefined;
    if (cal.connected) {
      socialEvents = 0;
      socialEventList = [];
      birchEventList = [];
      for (const [date, events] of cal.byDate) {
        for (const e of events) {
          const social = e.colorId === SOCIAL_COLOR_ID;
          const birch = e.colorId === BIRCH_COLOR_ID;
          if (!social && !birch) continue;
          if (!adhered.has(e.id)) continue;
          socialEvents += 1;
          (social ? socialEventList : birchEventList).push({
            date,
            title: e.summary,
          });
        }
      }
      socialEventList.sort((a, b) => b.date.localeCompare(a.date));
      birchEventList.sort((a, b) => b.date.localeCompare(a.date));
    }

    const [counts, observedDays, workouts, facts, skills14] = await Promise.all([
      // The METRIC (target 6) counts the weekly-occurring kind only — graphite. Birch is
      // the outer band's own story and never fills the inner ring.
      getRingCounts(db, from, anchor, {
        social_events: socialEventList?.length,
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
      // along from the calendar count above (graphite AND birch — both were social
      // fortnights you had) and stays UNDEFINED on a Google failure, so the caption can
      // say "events unavailable" rather than claim a zero.
      facts: { ...facts, socialEvents },
      socialEventList,
      birchEventList,
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
