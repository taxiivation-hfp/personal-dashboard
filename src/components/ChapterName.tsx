"use client";

import { useEffect, useRef, useState } from "react";

/**
 * THE EDITABLE HALF OF THE MASTHEAD — "The Book of Nero: August".
 *
 * A book has chapters, and the app's title said so without ever admitting one. This names
 * the month you are in, in the owner's own words: "Chapter 8", "August", "The Thesis Month".
 * It is a NAME rather than a number because none of those is derivable from a date, and
 * deriving one would have meant the app deciding what the eighth month of a life is called.
 *
 * IT FEEDS NOTHING — not adherence, not the rings, not the streak. The same isolation the
 * day's title has, and for the same reason: the moment naming a month is something you can
 * succeed or fail at, it stops being a name and becomes one more verdict.
 *
 * EDITED IN PLACE, not behind a dialog. It is one short line and the masthead is where it is
 * read; a modal to change three words would be more app than the thing it edits. Blur saves,
 * which is the app's own idiom for every other line you can rewrite — Escape abandons.
 */
export default function ChapterName({
  month,
  name,
  onSaved,
}: {
  /** 'YYYY-MM' — the month being named. */
  month: string;
  /** What it is called now, or null when unnamed. */
  name: string | null;
  onSaved: (chapters: Record<string, string>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? "");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Re-seeded when the month changes under it — the masthead outlives a midnight, and a
  // draft left over from August must not be offered as September's name.
  useEffect(() => {
    setDraft(name ?? "");
    setEditing(false);
  }, [month, name]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const save = async () => {
    const next = draft.trim();
    setEditing(false);
    if (next === (name ?? "")) return; // nothing to write; don't spend a request on it
    setBusy(true);
    try {
      const d = await fetch("/api/chapter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, name: next || null }),
      })
        .then((r) => r.json())
        .catch(() => null);
      if (d && !d.error) onSaved(d.chapters ?? {});
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            // Abandon, not save. Reset first so the blur that follows sees no change.
            setDraft(name ?? "");
            setEditing(false);
          }
        }}
        maxLength={80}
        aria-label="Name this month"
        placeholder="name this month"
        // Sized to its content so the masthead does not jump between reading and editing.
        size={Math.max(8, draft.length + 1)}
        className="border-b border-[var(--color-accent)] bg-transparent text-center font-serif text-heading outline-none placeholder:text-[var(--color-placeholder)]"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={busy}
      // An unnamed month says so in muted ink rather than showing nothing: a colon with
      // nothing after it reads as a rendering fault, and an invisible control is not one.
      className={`font-serif text-heading underline decoration-transparent decoration-1 underline-offset-[6px] transition-colors hover:decoration-[var(--color-line-strong)] disabled:opacity-40 ${
        name ? "" : "text-[var(--color-muted)]"
      }`}
    >
      {name || "name this month"}
    </button>
  );
}
