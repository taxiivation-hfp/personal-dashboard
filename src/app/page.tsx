import { getDb } from "@/lib/db/client";
import { getDayView, listGoals } from "@/lib/queries";
import { getCalendarForDate } from "@/lib/google";
import { isISODate, todayISO } from "@/lib/dates";
import Today from "@/components/Today";

export const dynamic = "force-dynamic";

/**
 * `?date=` opens the screen on a PAST day.
 *
 * The screen carries its own day once it is running — the arrows and the week strip swap it
 * without a navigation — so this exists for the two cases a client state cannot serve: a
 * reload (the screen writes the day back into the address bar as you move) and a link in
 * from somewhere else, which today means the journal's "open that day".
 *
 * CLAMPED TO TODAY, and validated. There is nothing to log about a day that has not
 * happened, and a hand-typed `?date=2026-13-99` must land on today rather than on an error
 * page — this is the front door of a private app, not an API.
 */
export default async function Page({
  searchParams,
}: {
  // `string[]` is not paranoia — `?date=a&date=b` is a shape Next really hands over, and
  // isISODate rejects it on the type as well as the value.
  searchParams: Promise<{ date?: string | string[]; view?: string | string[] }>;
}) {
  const db = await getDb();
  const today = todayISO();
  const sp = await searchParams;
  const asked = sp.date;
  const date = isISODate(asked) && asked <= today ? asked : today;
  // `?view=timeline` reopens the screen already standing on the timeline — the state is
  // written back by replaceState as the gesture runs, same contract as `?date=`.
  const view = sp.view === "timeline" ? ("timeline" as const) : undefined;

  const cal = await getCalendarForDate(date);
  // Skills are HIDDEN, not deleted (spec §1), so nothing on this screen reads them any more
  // and the listSkills call went with the prop. The rows, their sessions and their colours
  // are all still in the database and queries.ts still knows how to read them.
  const [data, goals] = await Promise.all([
    getDayView(db, date, cal.events, cal.connected),
    listGoals(db),
  ]);
  // Goals live in the right column — there is no separate route.
  return (
    <Today initial={data} today={today} goals={goals} initialView={view} />
  );
}
