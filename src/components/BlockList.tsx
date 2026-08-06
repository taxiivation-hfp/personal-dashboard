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
      <p className="px-1 py-6 text-body leading-relaxed text-[var(--color-muted)]">
        Nothing on the calendar today. Blocks come from Google Calendar — put something there and it
        shows up here to mark.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {live.map((b) => {
        const marked = b.state != null;
        const needsMarking = b.due && !marked;
        return (
          <li
            key={b.event_id}
            className="rounded-2xl border bg-[var(--color-panel)] px-4 py-3.5 transition-colors"
            style={{
              borderColor: needsMarking ? "var(--color-line-strong)" : "var(--color-line)",
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-body font-serif">{b.title}</p>
                <p className="mt-0.5 text-small tabular-nums text-[var(--color-muted)]">
                  {b.time_start}
                  {b.time_end ? `–${b.time_end}` : ""}
                  {/* Never "overdue" or "missed" — the block is fine, it just needs a mark. */}
                  {needsMarking && " · needs marking"}
                  {!b.due && !marked && " · later today"}
                </p>
              </div>
              {marked && (
                <button
                  onClick={() => mark(b, null)}
                  className="shrink-0 text-small text-[var(--color-muted)] underline-offset-4 hover:underline"
                >
                  undo
                </button>
              )}
            </div>

            {!marked && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["adhered", "drifted", "skipped"] as const).map((s) => (
                  <button
                    key={s}
                    disabled={busy === b.event_id}
                    onClick={() => choose(b, s)}
                    className="rounded-full border px-3.5 py-1.5 text-small transition-colors disabled:opacity-40"
                    style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink)" }}
                  >
                    {s === "adhered" ? "Adhered" : s === "drifted" ? "Drifted" : "Skipped"}
                  </button>
                ))}
              </div>
            )}

            {marked && b.state !== "dismissed" && (
              <div className="mt-2.5 flex items-center gap-2">
                <span
                  className="rounded-full px-3 py-1 text-small"
                  style={
                    b.state === "adhered"
                      ? { background: "var(--color-adhered)", color: "#fff" }
                      : b.state === "drifted"
                        ? { background: "var(--color-drifted)", color: "#fff" }
                        : { border: "1px solid var(--color-skipped)", color: "var(--color-skipped)" }
                  }
                >
                  {b.state === "adhered" ? "Adhered" : b.state === "drifted" ? "Drifted" : "Skipped"}
                </span>
                {b.reason && <span className="truncate text-small text-[var(--color-muted)]">{b.reason}</span>}
              </div>
            )}

            {openReason === b.event_id && (
              <div className="mt-2.5 flex items-center gap-2">
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
                  className="min-w-0 flex-1 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-3 py-2 text-small outline-none placeholder:text-[var(--color-muted)]"
                />
                <button
                  onClick={() => {
                    void mark(b, "drifted", reason);
                    setOpenReason(null);
                  }}
                  className="shrink-0 rounded-xl bg-[var(--color-accent)] px-3.5 py-2 text-small text-white"
                >
                  Save
                </button>
                <button
                  onClick={() => setOpenReason(null)}
                  className="shrink-0 text-small text-[var(--color-muted)] underline-offset-4 hover:underline"
                >
                  skip
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
