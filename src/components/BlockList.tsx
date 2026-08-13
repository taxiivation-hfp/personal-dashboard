"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Block, BlockState } from "@/lib/adherence";
import { WORKED_STEP } from "@/lib/worked";

/**
 * Tap-as-you-go marking.
 *
 * The three states are shown as three plain words, always all three, always in the
 * same order. No traffic lights, no red, no ordering that implies a ranking from good
 * to bad — "drifted" sits between the others as an equal option, because the moment
 * logging honestly feels like confessing, the data stops being true.
 *
 * A DRIFT CAN BE PARTIAL. The slider that says how much of it was worked joins the reason
 * in the afterthought row — after the mark is already saved, never in front of it. Both are
 * optional, both are dismissible, and a drift is still completable in a single tap. That
 * ordering is the honest-logging rule applied to a second control: the moment recording
 * what happened costs more than recording something tidier, the data goes soft.
 */

/** Minutes between two "HH:MM" strings, or null if either is missing or the pair is not a
 *  forward span. Derived from what is already printed in the row's margin rather than from
 *  `Block.minutes`, which is marked FOR SCORING ONLY and stays that way. */
function spanMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const at = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const a = at(start);
  const b = at(end);
  if (a == null || b == null) return null;
  const d = b - a;
  return d > 0 ? d : null;
}

/** "45 min" · "2h" · "1h 12m". The real figure under the percentage — a share with no
 *  denominator beside it is the one thing this app's charts never print. */
function asSpan(mins: number): string {
  const m = Math.round(mins);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}
export default function BlockList({
  date,
  blocks,
  onChanged,
  /** Is this the real today? Only the words change — `due` is computed server-side against
   *  the real clock, so on a past day every block is due and "needs marking" is already the
   *  only branch that can be reached. */
  isToday = true,
}: {
  date: string;
  blocks: Block[];
  onChanged: () => void;
  isToday?: boolean;
}) {
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  /** The open row's worked fraction, 0..1. Follows the thumb; only committed on release. */
  const [worked, setWorked] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * What the server currently holds for the open row, so a release that moved nothing does
   * not write. A range input fires `change` on every pixel and this component listens on
   * pointerup, keyup AND blur to catch a drag that ends off the control — without this,
   * tapping Save after a drag would post the identical row twice.
   */
  const savedWorked = useRef(0);

  /** Returns the RESULTING state, which is not always the one asked for: a drift worked in
   *  full is stored as an adherence. Null if the write failed. */
  async function mark(
    b: Block,
    state: BlockState | null,
    extra?: { reason?: string | null; worked?: number | null },
  ): Promise<BlockState | null | undefined> {
    setBusy(b.event_id);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          event_id: b.event_id,
          state,
          title: b.title,
          time_start: b.time_start,
          time_end: b.time_end,
          // BOTH fields travel on EVERY write, deliberately. The row holds two independent
          // controls over one database row, and a write carrying only the one you touched
          // would have saving the slider erase a reason you had already typed.
          reason: extra?.reason ?? null,
          worked_fraction: extra?.worked ?? null,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        state?: BlockState | null;
      } | null;
      onChanged();
      return body?.state;
    } finally {
      setBusy(null);
    }
  }

  /** Open the afterthought row on a block already marked drifted, prefilled. */
  function openFor(b: Block) {
    setOpenReason(b.event_id);
    setReason(b.reason ?? "");
    setWorked(b.workedFraction ?? 0);
    savedWorked.current = b.workedFraction ?? 0;
  }

  function choose(b: Block, state: BlockState) {
    if (state === "drifted") {
      // Mark it immediately, THEN offer the reason and the slider. Neither must ever be a
      // gate standing between you and recording what actually happened.
      //
      // Opened BLANK rather than from the block, and that matches what was just written:
      // this path is only reachable from an unmarked row, and the mark above carries a null
      // reason and a null fraction. Seeding the controls from anything else would show two
      // values the database does not hold.
      void mark(b, "drifted");
      setOpenReason(b.event_id);
      setReason("");
      setWorked(0);
      savedWorked.current = 0;
      return;
    }
    setOpenReason(null);
    void mark(b, state);
  }

  /* Stepping to another day closes any open row. The mark it was attached to belongs to the
     day you left, and a slider left hanging over a different day's list is a control aimed
     at the wrong row — the same hazard the dated keys elsewhere in this app exist to close. */
  useEffect(() => setOpenReason(null), [date]);

  /**
   * Commit the slider — on release, never on drag.
   *
   * At the top of the range the server rewrites the mark as an adherence, because a drift
   * worked in full IS one. The row closes on THAT answer rather than on a check of its own:
   * the rule lives in engine.ts, and a screen that predicted it would eventually predict it
   * wrongly.
   */
  async function commitWorked(b: Block) {
    if (worked === savedWorked.current) return;
    // Advanced BEFORE the write, so the three listeners a single release can fire
    // (pointerup, keyup, blur) collapse into one POST — and rolled BACK if that write did
    // not land, so the next release retries instead of the value going quietly missing.
    const previous = savedWorked.current;
    savedWorked.current = worked;
    const state = await mark(b, "drifted", { reason, worked });
    if (state == null) {
      savedWorked.current = previous;
      return;
    }
    if (state !== "drifted") setOpenReason(null);
  }

  /** Save the reason and whatever the slider is currently showing, and close. */
  async function commitRow(b: Block) {
    savedWorked.current = worked;
    await mark(b, "drifted", { reason, worked });
    setOpenReason(null);
  }

  const live = blocks.filter((b) => b.state !== "dismissed");

  if (!live.length) {
    return (
      <p className="max-w-[42ch] py-6 text-body leading-relaxed text-[var(--color-muted)]">
        Nothing on the calendar{" "}
        {isToday
          ? "today"
          : `on ${new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}`}
        . Blocks come from Google Calendar — put something there and it shows up
        here to mark.
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
                      {s === "adhered"
                        ? "Adhered"
                        : s === "drifted"
                          ? "Drifted"
                          : "Skipped"}
                    </button>
                  ))}
                </div>
              )}

              {marked && b.state !== "dismissed" && (
                <div className="mt-2 flex items-baseline gap-2.5">
                  {/* Form, not severity: skipped is an outline where the other two are
                      fills. The fills carry a transparent border of the same width so all
                      three chips measure the same — a state must not be a different size
                      from its neighbours either.

                      On a DRIFT it is a button, and the only thing that changes is that it
                      can be pressed: a slider you cannot correct is worse than no slider,
                      and re-marking the block from scratch to move it by 5% is not a
                      correction, it is a punishment for a mis-drag. */}
                  {(() => {
                    const chip = (
                      <>
                        {b.state === "adhered"
                          ? "Adhered"
                          : b.state === "drifted"
                            ? "Drifted"
                            : "Skipped"}
                      </>
                    );
                    const cls = "shrink-0 rounded-full px-3 py-1 text-small";
                    const style: CSSProperties =
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
                            };
                    return b.state === "drifted" ? (
                      <button
                        type="button"
                        onClick={() => openFor(b)}
                        title="Adjust how much of it you worked"
                        className={`${cls} transition-opacity hover:opacity-90`}
                        style={style}
                      >
                        {chip}
                      </button>
                    ) : (
                      <span className={cls} style={style}>
                        {chip}
                      </span>
                    );
                  })()}
                  {/* Beside the chip, never inside it — all three chips must keep measuring
                      the same, and a percentage sewn into one of them would make the drift
                      chip permanently wider than its neighbours. Only shown when there is
                      something to show: a drift with the slider untouched reads exactly as
                      every drift did before it existed. */}
                  {b.state === "drifted" && (b.workedFraction ?? 0) > 0 && (
                    <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                      {Math.round((b.workedFraction ?? 0) * 100)}% worked
                    </span>
                  )}
                  {b.reason && (
                    <span className="min-w-0 truncate font-serif text-small text-[var(--color-muted)]">
                      {b.reason}
                    </span>
                  )}
                </div>
              )}

              {openReason === b.event_id && (
                <div className="mt-3">
                  {/* HOW MUCH OF IT WAS WORKED.
                      A question about time, never about whether you should have. The mark
                      is already saved above it, so this is an adjustment to a decision
                      already recorded — which is why leaving it at zero is a complete
                      answer and not an unfinished form. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor="worked-slider"
                      className="text-micro text-[var(--color-muted)]"
                    >
                      how much of it did you work?
                    </label>
                    <span className="shrink-0 text-small tabular-nums">
                      {Math.round(worked * 100)}%
                    </span>
                  </div>
                  <input
                    id="worked-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={Math.round(WORKED_STEP * 100)}
                    value={Math.round(worked * 100)}
                    /* Follows the thumb; writes on RELEASE. A range fires change on every
                       pixel, and one POST per pixel is a write storm on a phone. */
                    onChange={(e) => setWorked(Number(e.target.value) / 100)}
                    onPointerUp={() => void commitWorked(b)}
                    onKeyUp={() => void commitWorked(b)}
                    /* The backstop for a drag whose pointer left the control before it was
                       let go. commitWorked is a no-op when nothing moved. */
                    onBlur={() => void commitWorked(b)}
                    className="worked-range mt-1.5"
                    style={{ "--worked": worked } as CSSProperties}
                    aria-label={`How much of ${b.title} you worked, as a percentage`}
                  />
                  {(() => {
                    // The real figure under the share. A percentage with no denominator
                    // beside it is the one thing this app's charts never print — and here
                    // the denominator is the block itself. Omitted, never guessed, when the
                    // event has no usable span.
                    const total = spanMinutes(b.time_start, b.time_end);
                    if (total == null) return null;
                    return (
                      <p className="mt-1 text-micro tabular-nums text-[var(--color-muted)]">
                        {asSpan(total * worked)} of {asSpan(total)}
                      </p>
                    );
                  })()}

                  {/* A line, not a box. The mark is already saved by the time this appears,
                      so this is a note added in the margin of a decision already made — a
                      filled field would look like a form still waiting on you. Serif because
                      the sentence is the owner's, and it must match the reason as displayed
                      above: one string rendered in two faces reads as a bug. */}
                  <div className="mt-3 flex items-end gap-3">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRow(b);
                        if (e.key === "Escape") setOpenReason(null);
                      }}
                      autoFocus
                      placeholder="What happened instead? (optional)"
                      className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-small outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
                    />
                    <button
                      onClick={() => void commitRow(b)}
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
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
