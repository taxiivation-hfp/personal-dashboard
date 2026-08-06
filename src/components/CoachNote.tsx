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
    <section className="mt-10 rounded-2xl bg-[var(--color-panel)] px-5 py-4">
      <p className="max-w-[62ch] font-serif text-body">{note}</p>
    </section>
  );
}
