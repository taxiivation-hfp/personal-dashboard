"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Block, BlockState } from "@/lib/adherence";
import DriftPopover from "./DriftPopover";

/**
 * Tap-as-you-go marking.
 *
 * The three states are shown as three plain words, always all three, always in the
 * same order. No traffic lights, no red, no ordering that implies a ranking from good
 * to bad — "drifted" sits between the others as an equal option, because the moment
 * logging honestly feels like confessing, the data stops being true.
 *
 * A DRIFT CAN BE PARTIAL. The slider that says how much of it was worked, and the reason
 * beside it, now open as a POPOVER next to the row (DriftPopover) rather than as an inline
 * expansion — after the mark is already saved, never in front of it. Both are optional,
 * both are dismissible, and a drift is still completable in a single tap. That ordering is
 * the honest-logging rule applied to a second control: the moment recording what happened
 * costs more than recording something tidier, the data goes soft.
 *
 * Every row also carries a DISMISS, because an invite you were never going to do is not a
 * block you skipped — it was never part of the day, and adherence drops dismissed rows
 * from both sides of the block share rather than counting them against you.
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

/**
 * A full three-line row at this type scale: the serif title, the state line, the chip row.
 *
 * MEASURED, not derived. Deriving it would mean measuring a row on a day whose blocks have
 * not arrived yet, and the answer is needed before the first paint to decide what to draw.
 * It is only ever compared against a height budget, so a few pixels out costs at worst one
 * row of slack — never a wrong row.
 */
const ROW_FULL = 86;

/** The gap left under the last row so a list that only just fits does not touch the
 *  window's bottom edge. */
const LIST_TAIL = 24;

/** `undo` and `dismiss` wear the same quiet treatment, deliberately: neither is a fourth
 *  state and neither is the preferred answer, they are both just ways to say the row was
 *  read wrong. One string so the full row and the collapsed one cannot drift apart. */
const QUIET =
  "shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline";

/**
 * The state as a chip. ONE class string and ONE style table, shared by the full row and the
 * collapsed one — form, not severity: skipped is an outline where the other two are fills,
 * and the fills carry a transparent border of the same width so all three chips measure the
 * same. A state must not be a different size from its neighbours.
 *
 * On a DRIFT it is a button, and the only thing that changes is that it can be pressed: a
 * slider you cannot correct is worse than no slider, and re-marking the block from scratch
 * to move it by 5% is not a correction, it is a punishment for a mis-drag.
 */
function StateChip({
  state,
  onOpen,
}: {
  state: BlockState;
  onOpen: () => void;
}) {
  const label =
    state === "adhered"
      ? "Adhered"
      : state === "drifted"
        ? "Drifted"
        : "Skipped";
  const cls = "shrink-0 rounded-full px-3 py-1 text-small";
  const style: CSSProperties =
    state === "adhered"
      ? {
          background: "var(--color-adhered)",
          color: "#fff",
          border: "1px solid transparent",
        }
      : state === "drifted"
        ? {
            background: "var(--color-drifted)",
            color: "#fff",
            border: "1px solid transparent",
          }
        : {
            border: "1px solid var(--color-skipped)",
            color: "var(--color-skipped)",
          };
  return state === "drifted" ? (
    <button
      type="button"
      onClick={onOpen}
      title="Adjust how much of it you worked"
      className={`${cls} transition-opacity hover:opacity-90`}
      style={style}
    >
      {label}
    </button>
  ) : (
    <span className={cls} style={style}>
      {label}
    </span>
  );
}

export default function BlockList({
  date,
  blocks,
  onChanged,
  /** Is this the real today? Only the words change — `due` is computed server-side against
   *  the real clock, so on a past day every block is due and "needs marking" is already the
   *  only branch that can be reached. */
  isToday = true,
  onMark,
}: {
  date: string;
  blocks: Block[];
  onChanged: () => void;
  isToday?: boolean;
  /**
   * Called the moment a mark is CHOSEN, before the write goes out, with what the row is
   * about to say. The owner of `blocks` uses it to draw the chip immediately; the refresh
   * that `onChanged` triggers then replaces the guess with the server's answer.
   */
  onMark?: (eventId: string, next: Partial<Block>) => void;
}) {
  const [openReason, setOpenReason] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  /** The open row's worked fraction, 0..1. Follows the thumb; only committed on release. */
  const [worked, setWorked] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  /** The open row's box in VIEWPORT coordinates, captured at the moment of the click. The
   *  popover is fixed to the viewport, so it is placed from this rather than from the DOM
   *  it is not inside. */
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  /**
   * What the server currently holds for the open row, so a release that moved nothing does
   * not write. A range input fires `change` on every pixel and this component listens on
   * pointerup, keyup AND blur to catch a drag that ends off the control — without this,
   * tapping Save after a drag would post the identical row twice.
   */
  const savedWorked = useRef(0);
  /** Every row's <li>, keyed by event id, so a click can hand the popover the row's box. */
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const listRef = useRef<HTMLUListElement>(null);

  const live = useMemo(
    () => blocks.filter((b) => b.state !== "dismissed"),
    [blocks],
  );
  const openBlock = live.find((b) => b.event_id === openReason) ?? null;

  /** Returns the RESULTING state, which is not always the one asked for: a drift worked in
   *  full is stored as an adherence. Null if the write failed. */
  async function mark(
    b: Block,
    state: BlockState | null,
    extra?: { reason?: string | null; worked?: number | null },
  ): Promise<BlockState | null | undefined> {
    setBusy(b.event_id);
    // The chip moves NOW. The round trip still happens and still has the last word — see
    // onMark — but a tap that waits a network hop before it shows reads as a tap that missed.
    onMark?.(b.event_id, {
      state,
      reason: state === "drifted" ? (extra?.reason ?? b.reason) : null,
      workedFraction: state === "drifted" ? (extra?.worked ?? b.workedFraction) : null,
    });
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

  /** The row's box now. Read at the moment of the click rather than held in a ref that
   *  updates on render: between a render and a click the window may have been resized, and
   *  a popover aimed at where the row used to be is worse than no popover. */
  function rectOf(b: Block): DOMRect | null {
    return rowRefs.current.get(b.event_id)?.getBoundingClientRect() ?? null;
  }

  /** Open the editor on a block already marked drifted, prefilled. */
  function openFor(b: Block) {
    setAnchor(rectOf(b));
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
      setAnchor(rectOf(b));
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
  useEffect(() => {
    setOpenReason(null);
    setAnchor(null);
  }, [date]);

  /**
   * Commit the slider — on release, never on drag.
   *
   * At the top of the range the server rewrites the mark as an adherence, because a drift
   * worked in full IS one. The popover closes on THAT answer rather than on a check of its
   * own: the rule lives in engine.ts, and a screen that predicted it would eventually
   * predict it wrongly.
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
    if (state !== "drifted") closeIfOpen(b);
  }

  /** Save the reason and whatever the slider is currently showing, and close. */
  async function commitRow(b: Block) {
    savedWorked.current = worked;
    await mark(b, "drifted", { reason, worked });
    closeIfOpen(b);
  }

  /** Clear the popover only if it is still THIS row's. Every close below fires its write
   *  without waiting for it, so by the time one lands the hand may already have opened
   *  another row — and an unconditional clear would shut the row you just tapped. */
  function closeIfOpen(b: Block) {
    setOpenReason((cur) => (cur === b.event_id ? null : cur));
  }

  /**
   * EVERY WAY OUT OF THE POPOVER COMMITS WHAT YOU CHANGED — outside click, Escape, skip, a
   * scroll. A slider left at 40% and dismissed must not lose the 40%: that is the
   * honest-logging rule applied to leaving, and the mark itself was saved the moment you
   * tapped Drifted.
   *
   * WHAT YOU CHANGED, and nothing else. It used to post unconditionally, which made every
   * Escape a second identical write of a row the server had just been told about — and the
   * popover's outside-click listener is capture-phase, so a tap on the SAME ROW's `undo`
   * closed the popover on the way down and unmarked the block on the way up: two writes for
   * one event id, one of them re-asserting the drift the other was taking back. Whichever
   * landed second won, so undo could quietly fail. Both controls sit on the row the popover
   * points at, so that is one ordinary hand movement and not a contrivance.
   *
   * The guard is exact rather than cautious: `choose()` seeds the controls at 0 and "" over
   * a row the server has just written as a bare drift, and `openFor()` seeds both from the
   * block, so "nothing moved" means there is genuinely nothing new to say.
   *
   * It does NOT wait for the write. A popover still standing a network round trip after you
   * pressed Escape reads as a control that ignored you, and the write has nothing left to
   * tell the screen — `mark` already refreshes the day when it lands.
   */
  function closeRow(b: Block) {
    if (worked !== savedWorked.current || reason !== (b.reason ?? ""))
      void commitRow(b);
    setOpenReason(null);
    setAnchor(null);
  }

  /** The latest close, for a listener that outlives a keystroke. The scroll listener below
   *  is subscribed once per open row while `reason` and `worked` change on every letter
   *  typed, and a listener holding the closure it was born with would commit a reason two
   *  letters old. */
  const closeOpenRow = useRef<() => void>(() => {});
  useEffect(() => {
    closeOpenRow.current = () => {
      if (openBlock) closeRow(openBlock);
    };
  });

  /**
   * The popover is fixed to the VIEWPORT while the row it points at is not, so anything
   * that moves one without the other has to be answered: a resize re-aims it, a scroll of
   * the window this list lives in closes it (committing, like every other way out).
   *
   * THE OWNING WINDOW, deliberately, and not every scroller on the page. The popover
   * autofocuses its reason field, and on a phone that focus scrolls the PAGE to make room
   * for the keyboard — a listener on the document would read its own arrival as a scroll
   * and shut the editor in the same breath it opened. What it costs is that a page scrolled
   * on the phone leaves the popover where it was; it is still the row's editor and still
   * commits, it has just stopped pointing.
   */
  useEffect(() => {
    if (openReason == null) return;
    const box = listRef.current?.closest(".window") ?? null;
    const reposition = () =>
      setAnchor(
        rowRefs.current.get(openReason)?.getBoundingClientRect() ?? null,
      );
    const away = () => closeOpenRow.current();
    window.addEventListener("resize", reposition);
    box?.addEventListener("scroll", away);
    return () => {
      window.removeEventListener("resize", reposition);
      box?.removeEventListener("scroll", away);
    };
  }, [openReason]);

  /**
   * THE OVERFLOW RULE. A day whose rows do not fit the window collapses the rows that are
   * already MARKED to one line; the unmarked ones stay full.
   *
   * Which way round that goes is the whole of it: an unmarked row carries the three action
   * chips, and shortening it would make marking cost more — the one thing the
   * honest-logging rule forbids. A marked row is a record, and a record reads fine as a
   * line. Nothing scrolls at rest (spec §4), so the list has to give way instead.
   *
   * Measured against the WINDOW rather than against the list, which is circular — the list
   * is as tall as its rows. The same `closest(".window")` idiom the pillar column uses.
   */
  const [collapse, setCollapse] = useState(false);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const box = list.closest(".window");
    const measure = () => {
      // Below lg the page scrolls and there is nothing to fit inside. This is also the
      // phone's SECOND instance of this list — Today's pane renders one too — and that one
      // is display:none, so every measurement it takes is zero.
      if (!window.matchMedia("(min-width: 64rem)").matches) {
        setCollapse(false);
        return;
      }
      if (!box) return;
      const avail =
        box.clientHeight -
        (list.getBoundingClientRect().top - box.getBoundingClientRect().top) -
        LIST_TAIL;
      // A hidden window measures zero and must not flip the flag for the visible one.
      if (avail <= 0) return;
      setCollapse(live.length * ROW_FULL > avail);
    };
    measure();
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [live]);

  /**
   * THE TWO WAYS TO TAKE A ROW BACK, drawn on EVERY row in BOTH variants.
   *
   * `mark(b, null)` is reachable from nowhere else, and `dismiss` is spec §2's "every block
   * row gets a dismiss control" — so the collapsed variant dropping them meant that on
   * exactly the days the overflow rule fires (nine rows or more), a block marked Adhered or
   * Skipped by mistake could not be un-marked at all. That is the same argument the drift
   * chip already makes: a mark you cannot correct is worse than no mark. They cost a row
   * nothing in height — micro type beside a chip — so there is no width to buy back by
   * hiding them behind a hover, which would also put them out of reach on a touch screen.
   */
  const undoDismiss = (b: Block, marked: boolean) => (
    <>
      {marked && (
        <button onClick={() => mark(b, null)} className={QUIET}>
          undo
        </button>
      )}
      {/* On EVERY row, marked or not: the row this exists for — an invite, a birthday,
          something never meant to be done — is usually one nobody ever marked. It is a
          statement that the row was never part of the day, not a fourth state.

          KNOWN AND ACCEPTED: engine.markBlock REFUSES a dismissal that would take back
          hours already earned and returns the prior state, so dismissing an adhered row is
          a no-op and the row stays. Not special-cased and no error is printed — `mark`
          already trusts the RESULTING state, and a row that does not change is the honest
          outcome. */}
      <button onClick={() => mark(b, "dismissed")} className={QUIET}>
        dismiss
      </button>
    </>
  );

  if (!live.length) {
    return (
      <p className="max-w-[42ch] py-6 text-body leading-relaxed text-[var(--color-muted)]">
        {/* TEXT IS DATA: this used to carry a second sentence explaining where blocks come
            from. Where they come from is Google Calendar, which the connect prompt above
            already says on the only day it matters. */}
        Nothing on the calendar{" "}
        {isToday
          ? "today"
          : `on ${new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}`}
        .
      </p>
    );
  }

  return (
    /* Rows on hairlines, not a stack of rounded panels: a day is a list of entries, and
       eleven identical cards turned it into a dashboard. The clock times are the one piece
       of genuine marginalia this app has, so they hang in the page margin and the owner's
       own title sits on the line beside them. */
    <>
      <ul ref={listRef} className="divide-y divide-[var(--color-line)]">
        {live.map((b) => {
          const marked = b.state != null;
          const needsMarking = b.due && !marked;
          const setRow = (el: HTMLLIElement | null) => {
            if (el) rowRefs.current.set(b.event_id, el);
            else rowRefs.current.delete(b.event_id);
          };

          /* COLLAPSED: time · title · state chip, on the same rail. The drift chip is still
             a button — the one control on this row you may need to correct. */
          if (collapse && b.state != null) {
            return (
              <li
                key={b.event_id}
                ref={setRow}
                className="page-margin py-1.5"
              >
                {/* The start only. The stacked start-over-end of a full row is two lines,
                    which is the thing this variant exists to give back. */}
                <div className="pt-1 text-right text-micro tabular-nums text-[var(--color-muted)]">
                  {b.time_start}
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className="truncate font-serif text-body">{b.title}</p>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {undoDismiss(b, true)}
                    <StateChip state={b.state} onOpen={() => openFor(b)} />
                  </div>
                </div>
              </li>
            );
          }

          return (
            <li key={b.event_id} ref={setRow} className="page-margin py-3">
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
                  <div className="flex shrink-0 items-baseline gap-2.5">
                    {undoDismiss(b, marked)}
                  </div>
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

                {b.state != null && (
                  <div className="mt-2 flex items-baseline gap-2.5">
                    <StateChip state={b.state} onOpen={() => openFor(b)} />
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
              </div>
            </li>
          );
        })}
      </ul>

      {/* ONE popover for the whole list, for whichever row is open. Mounted outside the
          <ul> so it is never a child of the row it points at: a list that reflows while you
          are marking must not take the control with it. */}
      {openBlock && anchor && (
        <DriftPopover
          anchor={anchor}
          title={openBlock.title}
          totalMinutes={spanMinutes(openBlock.time_start, openBlock.time_end)}
          worked={worked}
          reason={reason}
          onWorked={setWorked}
          onCommitWorked={() => void commitWorked(openBlock)}
          onReason={setReason}
          onSave={() => closeRow(openBlock)}
          onClose={() => closeRow(openBlock)}
        />
      )}
    </>
  );
}
