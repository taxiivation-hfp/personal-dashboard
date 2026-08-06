"use client";

import { useState } from "react";
import type { Block, BlockState } from "@/lib/adherence";

/**
 * Tap-as-you-go marking.
 *
 * The three states are shown as three plain words, always all three, always in the
 * same order. No traffic lights, no red, no ordering that implies a ranking from good
 * to bad — "drifted" sits between the others as an equal option, because the moment
 * logging honestly feels like confessing, the data stops being true.
 */
export default function BlockList({
  date,
  blocks,
  onChanged,
}: {
  date: string;
  blocks: Block[];
  onChanged: () => void;
}) {
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function mark(b: Block, state: BlockState | null, withReason?: string) {
    setBusy(b.event_id);
    try {
      await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          event_id: b.event_id,
          state,
          title: b.title,
          time_start: b.time_start,
          time_end: b.time_end,
          reason: withReason ?? null,
        }),
      });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  function choose(b: Block, state: BlockState) {
    if (state === "drifted") {
      // Mark it immediately, THEN offer the reason. The reason must never be a gate
      // standing between you and recording what actually happened.
      void mark(b, "drifted");
      setOpenReason(b.event_id);
      setReason(b.reason ?? "");
      return;
    }
    setOpenReason(null);
    void mark(b, state);
  }

  const live = blocks.filter((b) => b.state !== "dismissed");

  if (!live.length) {
    return (
      <p className="max-w-[42ch] py-6 text-body leading-relaxed text-[var(--color-muted)]">
        Nothing on the calendar today. Blocks come from Google Calendar — put something there and it
        shows up here to mark.
      </p>
    );
  }

  return (
    /* Rows on hairlines, not a stack of rounded panels: a day is a list of entries, and
       eleven identical cards turned it into a dashboard. The clock times are the one piece
       of genuine marginalia this app has, so they hang in the page margin and the owner's
       own title sits on the line beside them. */
    <ul className="divide-y divide-[var(--color-line)]">
      {live.map((b) => {
        const marked = b.state != null;
        const needsMarking = b.due && !marked;
        return (
          <li key={b.event_id} className="page-margin py-3">
            {/* Stacked, not "09:00–10:30": the margin is 4.25rem and a full range will not
                fit it at this step. Start over end reads as a span the way a timetable does.
                An all-day block has no times and simply leaves the margin empty. */}
            <div className="pt-1.5 text-right text-micro tabular-nums text-[var(--color-muted)]">
              <span className="block">{b.time_start}</span>
              {b.time_end ? <span className="block">{b.time_end}</span> : null}
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-serif text-body">{b.title}</p>
                {marked && (
                  <button
                    onClick={() => mark(b, null)}
                    className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                  >
                    undo
                  </button>
                )}
              </div>

              {!marked && (
                <p className="mt-0.5 text-micro text-[var(--color-muted)]">
                  {/* Never "overdue" or "missed" — the block is fine, it just needs a mark.
                      It used to lean on a darker card border too; with the cards gone the
                      words carry it alone, which is the honest amount of emphasis. */}
                  {needsMarking ? "needs marking" : "later today"}
                </p>
              )}

              {!marked && (
                /* One class string for all three, deliberately. The instant one of them
                   gets a fill, a weight or a position that reads as the preferred answer,
                   marking honestly costs more than marking well and the data goes soft. */
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {(["adhered", "drifted", "skipped"] as const).map((s) => (
                    <button
                      key={s}
                      disabled={busy === b.event_id}
                      onClick={() => choose(b, s)}
                      className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small text-[var(--color-ink)] transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                    >
                      {s === "adhered" ? "Adhered" : s === "drifted" ? "Drifted" : "Skipped"}
                    </button>
                  ))}
                </div>
              )}

              {marked && b.state !== "dismissed" && (
                <div className="mt-2 flex items-baseline gap-2.5">
                  {/* Form, not severity: skipped is an outline where the other two are
                      fills. The fills carry a transparent border of the same width so all
                      three chips measure the same — a state must not be a different size
                      from its neighbours either. */}
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-small"
                    style={
                      b.state === "adhered"
                        ? {
                            background: "var(--color-adhered)",
                            color: "#fff",
                            border: "1px solid transparent",
                          }
                        : b.state === "drifted"
                          ? {
                              background: "var(--color-drifted)",
                              color: "#fff",
                              border: "1px solid transparent",
                            }
                          : {
                              border: "1px solid var(--color-skipped)",
                              color: "var(--color-skipped)",
                            }
                    }
                  >
                    {b.state === "adhered" ? "Adhered" : b.state === "drifted" ? "Drifted" : "Skipped"}
                  </span>
                  {b.reason && (
                    <span className="min-w-0 truncate font-serif text-small text-[var(--color-muted)]">
                      {b.reason}
                    </span>
                  )}
                </div>
              )}

              {openReason === b.event_id && (
                /* A line, not a box. The mark is already saved by the time this appears, so
                   this is a note added in the margin of a decision already made — a filled
                   field would look like a form still waiting on you. Serif because the
                   sentence is the owner's, and it must match the reason as displayed above:
                   one string rendered in two faces reads as a bug. */
                <div className="mt-2.5 flex items-end gap-3">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void mark(b, "drifted", reason);
                        setOpenReason(null);
                      }
                      if (e.key === "Escape") setOpenReason(null);
                    }}
                    autoFocus
                    placeholder="What happened instead? (optional)"
                    className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-small outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
                  />
                  <button
                    onClick={() => {
                      void mark(b, "drifted", reason);
                      setOpenReason(null);
                    }}
                    className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setOpenReason(null)}
                    className="shrink-0 pb-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                  >
                    skip
                  </button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
