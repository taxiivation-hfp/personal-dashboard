"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { WORKED_STEP } from "@/lib/worked";

/**
 * THE DRIFTED EDITOR, BESIDE THE ROW RATHER THAN INSIDE IT.
 *
 * It was an inline expansion, which pushed every block under it down the list at the exact
 * moment the hand was working down that list — so the next row you meant to mark was no
 * longer where you looked. A list you are marking as you go must not move under you; the
 * controls come to the row instead.
 *
 * NOT a <dialog>, and not modal. A modal backdrop over a list you are working down is the
 * wrong contract for a mark-as-you-go control: the mark is ALREADY SAVED by the time this
 * opens (see BlockList.choose), so this is an adjustment to a decision already recorded,
 * never a form standing between you and recording it. Everything here is optional,
 * everything is dismissible, and dismissing COMMITS — a slider left at 40% and closed with
 * Escape must not lose the 40%.
 *
 * It owns no state but its own height. The fraction, the reason and every write live in
 * BlockList, which is where the block, the busy flag and the resulting-state contract
 * already are; two places holding one drift is how a screen starts disagreeing with the
 * row it is attached to.
 */

/** "45 min" · "2h" · "1h 12m". The real figure under the percentage — a share with no
 *  denominator beside it is the one thing this app's charts never print. Moved here with
 *  its one consumer when the editor left the row; BlockList keeps `spanMinutes`, which is
 *  what it still needs to hand over a span. */
function asSpan(mins: number): string {
  const m = Math.round(mins);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** The popover's own width, in step with `w-[20rem]` below. The placement maths needs a
 *  number before the box exists, so the one place it is written twice is here and there. */
const W = 320;
/** Breathing room from the row and from every viewport edge. */
const GUTTER = 8;
/** Stand-in height for the first paint, before the box has been measured. Close enough
 *  that the first frame lands where the second one does on any ordinary viewport. */
const H_GUESS = 240;

export default function DriftPopover({
  anchor,
  title,
  totalMinutes,
  worked,
  reason,
  onWorked,
  onCommitWorked,
  onReason,
  onSave,
  onClose,
}: {
  /** The row's own box in VIEWPORT coordinates — getBoundingClientRect() of the <li>. */
  anchor: DOMRect;
  title: string;
  /** The block's own span in minutes, for "48 min of 2h". null when it has no usable span. */
  totalMinutes: number | null;
  /** 0..1, follows the thumb. */
  worked: number;
  reason: string;
  onWorked: (v: number) => void;
  onCommitWorked: () => void;
  onReason: (v: string) => void;
  /** Save — commit then close. */
  onSave: () => void;
  /** Outside click / Escape / skip — COMMITS, then closes. */
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(H_GUESS);
  /** The slider's label needs a unique target: on the phone TWO BlockLists are mounted —
   *  the window's and the one inside Today — so a hand-written id would be on the page
   *  twice and `htmlFor` would point at whichever came first. */
  const sliderId = useId();

  /* Measured after paint rather than guessed, because the box is a different height with
     and without the span line, and the bottom clamp below needs the real figure. The
     equality guard is what stops the render/measure pair from looping. */
  useLayoutEffect(() => {
    const h = boxRef.current?.offsetHeight;
    if (h && h !== height) setHeight(h);
  });

  /* Escape, and a tap anywhere that is not inside this box. Pointerdown in the CAPTURE
     phase rather than click: the chip that opens a different row's popover must be able to
     close this one first, and a control that stops its own click (or one on a tablet that
     never takes focus) would otherwise leave two open at once. Both paths COMMIT. */
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.("[data-drift-popover]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  /**
   * PLACEMENT. To the right of the row, flipped to its left when it would leave the
   * viewport, then clamped — in that order, so the flip is the preferred answer and the
   * clamp only catches a window too narrow for either side.
   *
   * Read straight off `window` during render, which is safe HERE and nowhere near a
   * general rule: this component is only ever mounted by a click, so there is no server
   * render to crash and no first paint at a stale size. BlockList re-hands a fresh
   * `anchor` on resize, which is what re-runs this.
   */
  let left = anchor.right + GUTTER;
  if (left + W > window.innerWidth - GUTTER) left = anchor.left - W - GUTTER;
  if (left < GUTTER) left = GUTTER;
  const top = Math.min(
    Math.max(anchor.top, GUTTER),
    window.innerHeight - height - GUTTER,
  );

  return (
    /* `position` is set INLINE and not as a `fixed` utility: `.popover` is an unlayered
       class in globals.css and Tailwind's utilities live in @layer utilities, so the class
       wins whatever the order in this string, and its `position: relative` would drop the
       box back into the list. Left and top are inline anyway — the class deliberately sets
       no position of its own so each caller places its own popover. */
    <div
      ref={boxRef}
      data-drift-popover
      role="dialog"
      aria-label={`How much of ${title} you worked`}
      className="popover w-[20rem] p-3.5"
      style={{ position: "fixed", left, top }}
    >
      {/* Which row this belongs to. A popover standing beside a list of eleven blocks and
          naming none of them is a control you have to aim by memory. */}
      <p className="truncate text-micro text-[var(--color-muted)]">{title}</p>

      {/* HOW MUCH OF IT WAS WORKED.
          A question about time, never about whether you should have. The mark is already
          saved by the time this opens, so leaving it at zero is a complete answer and not
          an unfinished form. */}
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <label
          htmlFor={sliderId}
          className="text-micro text-[var(--color-muted)]"
        >
          how much of it did you work?
        </label>
        <span className="shrink-0 text-small tabular-nums">
          {Math.round(worked * 100)}%
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={100}
        step={Math.round(WORKED_STEP * 100)}
        value={Math.round(worked * 100)}
        /* Follows the thumb; writes on RELEASE. A range fires change on every pixel, and
           one POST per pixel is a write storm on a phone. */
        onChange={(e) => onWorked(Number(e.target.value) / 100)}
        onPointerUp={onCommitWorked}
        onKeyUp={onCommitWorked}
        /* The backstop for a drag whose pointer left the control before it was let go.
           The commit is a no-op when nothing moved. */
        onBlur={onCommitWorked}
        className="worked-range mt-1.5"
        style={{ "--worked": worked } as CSSProperties}
        aria-label={`How much of ${title} you worked, as a percentage`}
      />
      {totalMinutes != null && (
        /* The real figure under the share. A percentage with no denominator beside it is
           the one thing this app's charts never print — and here the denominator is the
           block itself. Omitted, never guessed, when the event has no usable span. */
        <p className="mt-1 text-micro tabular-nums text-[var(--color-muted)]">
          {asSpan(totalMinutes * worked)} of {asSpan(totalMinutes)}
        </p>
      )}

      {/* A line, not a box. The mark is already saved, so this is a note added in the
          margin of a decision already made — a filled field would look like a form still
          waiting on you. Serif because the sentence is the owner's, and it must match the
          reason as displayed on the row: one string rendered in two faces reads as a bug. */}
      <div className="mt-3 flex items-end gap-3">
        <input
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          onKeyDown={(e) => {
            /* Stopped here, or the document listener above fires the same key again — and
               since both paths COMMIT, one Escape would post the row twice. */
            if (e.key === "Enter") {
              e.stopPropagation();
              onSave();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
          autoFocus
          placeholder="What happened instead? (optional)"
          className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-small outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        <button
          onClick={onSave}
          className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="shrink-0 pb-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          skip
        </button>
      </div>
    </div>
  );
}
