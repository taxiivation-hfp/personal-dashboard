"use client";

import { useEffect, useState } from "react";

/**
 * One quiet observation a day.
 *
 * Deliberately not a chat box on the main screen. The coach's job here is
 * pattern-spotting on drift, and it speaks roughly once a day — a panel that invites
 * conversation would pull the screen away from the one number it exists to show.
 */
export default function CoachNote({ date }: { date: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/coach/note?date=${date}`)
      .then((r) => r.json())
      .then((d) => alive && setNote(d.note ?? null))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date]);

  if (loading || !note) return null;

  return (
    // THE ONE PANEL LEFT ON THIS SCREEN, and the exception that defines the rule. Every
    // other section now sits directly on the page under a hairline, because wrapping
    // eleven different kinds of thing in eleven identical rounded rectangles made a
    // dashboard out of a notebook. This earns its lift: it is not the owner's own record
    // but a second voice arriving once a day, so it should look like something laid on
    // the page rather than written into it.
    //
    // The tonal step alone does that. No border and no shadow — either one would turn it
    // straight back into the card that was just deleted everywhere else.
    <section className="rounded-2xl bg-[var(--color-panel)] px-5 py-4">
      {/* Capped measure: an observation is prose, and prose set the full width of a
          desktop column stops being read after the first week. */}
      <p className="max-w-[62ch] font-serif text-body">{note}</p>
    </section>
  );
}
