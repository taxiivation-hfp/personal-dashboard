"use client";

import { useEffect, useState } from "react";
import { projectedColour } from "@/lib/eventColor";
import { nextBlockAfter, type Block } from "@/lib/adherence";

/**
 * What the day holds next, beside the day's title.
 *
 * The title is an INTENTION and this is the schedule, so they belong on one line: what you
 * meant today to be, and the next thing that is actually going to happen. The space to the
 * right of a short title was empty and this is the most useful thing that could go in it —
 * it answers the question you open the app to ask between blocks.
 *
 * It is not a countdown and not a reminder. No "in 20 minutes", no colour that changes as
 * the hour approaches, no notification. A clock time is a fact; a countdown is pressure, and
 * pressure is what makes people stop opening a thing.
 *
 * NOT SHOWN when the day is over. An app that says "nothing left" at 11pm is telling you
 * something you know, in the place a plan used to be.
 */

/** "14:30" -> "2:30pm", "10:00" -> "10am". Minutes only when they are not :00. */
function clock(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export default function NextUp({
  blocks,
  /** The day being viewed. "Next" only means anything on the real today. */
  date,
  today,
}: {
  blocks: Block[];
  date: string;
  today: string;
}) {
  // Re-derived every minute so the answer does not go stale on a tab left open all day.
  // A minute is the resolution of the thing being displayed; anything finer would repaint
  // for no visible change.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (date !== today || now == null) return null;

  // The selection lives in adherence.ts, pure and tested — all-day events excluded,
  // dismissed excluded, strictly after now. It was four clauses inline here, which is
  // exactly the amount of logic that quietly acquires a fifth wrong one.
  const upcoming = nextBlockAfter(blocks, now);
  if (!upcoming) return null;

  const accent = projectedColour(upcoming.colorId);

  return (
    // The CARD travels with the content, not with the slot: this component is null for
    // most of a day's life (day over, other day viewed), and a bordered card around an
    // absence would be furniture saying nothing. record-card is the house treatment the
    // owner asked this screen's pieces to wear.
    <div className="record-card min-w-0 max-w-[16rem] shrink-0 self-start text-right">
      <p className="text-micro text-[var(--color-muted)]">next</p>
      <p className="mt-0.5 flex items-baseline justify-end gap-2">
        <span className="shrink-0 text-small tabular-nums text-[var(--color-muted)]">
          {clock(upcoming.time_start!)}
        </span>
        {/* The event's own calendar colour, as a mark rather than as text — the same
            projection the strip and the calendar column use, so one event is one colour
            everywhere it appears. */}
        {accent && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: accent }}
          />
        )}
        <span className="min-w-0 truncate font-serif text-small">
          {upcoming.title}
        </span>
      </p>
    </div>
  );
}
