"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import HabitBox from "./HabitBox";

/**
 * TASKS, FLOATING IN THE SPACE AROUND THE HERO RING — the owner's ruling (spec §4).
 *
 * They used to be a full-width band under the checklist, which is a list's shape. A task is
 * not a list item here: it is one decision for one day, and there are usually two or three of
 * them. What the band actually did was spend a rule and a heading on a couple of sentences
 * while the whole area either side of a 240px ring stayed empty.
 *
 * So the band IS the hero row now. This component owns it: the ring and its caption arrive as
 * `children` and sit in the middle, and the cards are laid out on two rails either side.
 *
 * TWO KINDS OF CARD share the rails since 2026-10-15: the day's one-off tasks, and a goal's
 * DATED SUBTASKS from a week before their date (subtasks.ts). Today.tsx builds both into
 * one `FloatCard` list; this component does not know which is which beyond the goal name a
 * subtask card carries as its second line, so the two kinds are told apart on the card and
 * nowhere else.
 *
 * NOTHING IS DRAWN WHEN THERE ARE NO TASKS — no rails, no heading, no "nothing due" line. An
 * empty frame is furniture claiming a feature is in use; the honest drawing of an empty list
 * is a centred ring.
 *
 * NO `not scored` LABEL either, and that is a real loss taken deliberately. The flag exists
 * because a list that looks like the scored one and isn't is worse than no list — but these
 * are not a list any more, they carry no rule and no heading to hang the word off, and there
 * is nowhere honest to put it. It survives on /habits, which is where tasks are written and
 * where the question "does this count" is actually asked. Nothing about the contract moved:
 * a task still feeds no figure (src/lib/tasks.ts).
 */

/** Cards around the ring. Past this the band is a wall and the ring stops being the hero. */
const MAX_CARDS = 6;

/** The popover's own box, for the clamp below. `w-[15rem]` and `max-h-[18rem]` in the markup;
 *  the height is re-measured after mount, since a short list is shorter than its cap. */
const POP_W = 240;
const POP_H_FALLBACK = 288;
const GUTTER = 8;

/** One card's width. Two of these, a 240px ring and the band's two gaps come to 648px, which
 *  the Today window's ~717px of inner width holds with room to breathe. `max-w-full` on the
 *  card and `flex-1` on the rails are what happen on a narrower screen: the rail gives ground
 *  and the card follows it down, rather than a fixed 11.5rem overrunning the window. */
const CARD = "record-card w-[11.5rem] max-w-full p-2.5!";
// p-2.5 carries the `!` because `.record-card` is UNLAYERED CSS and Tailwind's utilities sit
// in `@layer utilities` — an unlayered rule beats every layer, so the card's own 1rem/1.25rem
// padding would otherwise win and a 184px card would give its title 116px of line. The bang
// is the narrow fix; the alternative was a second card class in globals.css for one padding.

/** One card on the rails — a one-off task, or a goal's dated subtask. */
export type FloatCard = {
  /** Unique across both kinds: `t<id>` for a task, `s<id>` for a subtask. */
  key: string;
  title: string;
  /** A subtask's goal, printed under the title. null for a one-off task. */
  sub: string | null;
  done: boolean;
  /** "carried 3d", "due in 3d", "late 2d" — a fact, never a penalty. null when nothing. */
  line: string | null;
  /** The card's urgency hue (due.ts): red today, yellow at three days, null for the default
   *  ink from four days out. Painted on the title and the line while the card is open. */
  tone: string | null;
  /** The day it is FOR — the slot order's first key. */
  due: string;
  /** The slot order's second key: the row id, which never changes. */
  order: number;
};

export default function FloatingTasks({
  cards,
  onToggle,
  children,
}: {
  cards: FloatCard[];
  onToggle: (card: FloatCard, done: boolean) => void;
  /** The hero block — the ring and its caption. This component owns the BAND and lays the
   *  rails out either side of this. */
  children: ReactNode;
}) {
  /** The `+N more` popover's anchor, in viewport coordinates. null = closed. */
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  /**
   * THE BAND'S OWN ORDER, and it is NOT the order the list arrives in.
   *
   * `tasksFor` (src/lib/tasks.ts) sorts done tasks LAST, which is the right order for a
   * list you scroll and the wrong one for a fixed band of six slots: ticking a task calls
   * `refresh()`, the server hands back the same tasks re-sorted, and every card behind the
   * one you ticked shifts a slot. Past six that means the card you just ticked leaves the
   * band entirely and reappears inside the `+N more` popover while a previously hidden task
   * takes its place — the exact hazard DriftPopover was written against: a list you are
   * marking as you go must not move under you.
   *
   * So the slots are cut on the keys that DON'T move when `done` flips — the day it was
   * first for, then its id. A tick then reads as confirmation, in place, which is what the
   * gesture is for. Done-last survives where it belongs: /habits, and the popover's own
   * list, both of which are lists rather than slots.
   */
  const ordered = useMemo(
    () =>
      [...cards].sort((a, b) =>
        a.due === b.due
          ? a.order - b.order || a.key.localeCompare(b.key)
          : a.due < b.due
            ? -1
            : 1,
      ),
    [cards],
  );

  /** The popover is aimed at a card that may stop existing: the day can be stepped from the
   *  keyboard (which fires no pointerdown), and a task can be added or finished elsewhere.
   *  Keyed on the ID SET rather than on `tasks`, deliberately — a refresh caused by ticking
   *  a task INSIDE the popover must leave it open, because "clear three of these" is one
   *  gesture and not three. */
  const ids = ordered.map((t) => t.key).join(",");
  useEffect(() => setAnchor(null), [ids]);

  /**
   * A fixed box pointing at a card that is not fixed: anything moving one without the other
   * has to be answered, exactly as BlockList answers it for the drift editor. A resize
   * re-aims; a scroll of the window this band lives in closes, because the Today window
   * scrolls on desktop and no pointerdown is fired by a wheel.
   */
  const open = anchor != null;
  useEffect(() => {
    if (!open) return;
    const box = moreRef.current?.closest(".window") ?? null;
    const reposition = () =>
      setAnchor(moreRef.current?.getBoundingClientRect() ?? null);
    const away = () => setAnchor(null);
    window.addEventListener("resize", reposition);
    box?.addEventListener("scroll", away);
    return () => {
      window.removeEventListener("resize", reposition);
      box?.removeEventListener("scroll", away);
    };
  }, [open]);

  if (cards.length === 0)
    return <div className="flex justify-center">{children}</div>;

  // Six slots. A seventh task does not get a seventh card — the sixth becomes the way to the
  // rest, so the band's height is the same whether the day holds six tasks or twenty.
  const overflow = ordered.length > MAX_CARDS;
  const shown = ordered.slice(0, overflow ? MAX_CARDS - 1 : MAX_CARDS);
  const rest = ordered.slice(MAX_CARDS - 1);

  /** Slot index -> which rail. Even LEFT, odd right, so the first task lands on the side the
   *  eye reaches first and a single task never sits alone on the right. */
  const slots: (FloatCard | "more")[] = overflow ? [...shown, "more"] : shown;
  /** The rail's members WITH their slot index, which the card needs: below `lg` the rails
   *  stop being boxes and the index becomes the card's `order` in one column. */
  const rail = (side: 0 | 1) =>
    slots
      .map((s, i) => [s, i] as const)
      .filter(([, i]) => i % 2 === side);

  const card = (t: FloatCard, slot: number) => (
    <li key={t.key} className={CARD} style={{ order: slot + 1 }}>
      <button
        onClick={() => onToggle(t, !t.done)}
        aria-pressed={t.done}
        className="flex w-full items-start gap-2.5 text-left"
      >
        {/* INK, not a pillar hue — a task belongs to no pillar, and borrowing one would file
            it under a category it does not feed. The same rule the old band ran under. */}
        <span className="mt-0.5">
          <HabitBox done={t.done} tone="var(--color-ink)" />
        </span>
        <span className="min-w-0 flex-1">
          {/* NO `block` BESIDE `line-clamp-2`. They both set `display`, at the same
              specificity, and Tailwind emits `.block` LATER in the sheet than
              `.line-clamp-2` — so `display: block` quietly replaced the clamp's
              `-webkit-box` and a three-line title drew three lines with no warning. The
              clamp's own display is already block-level, so dropping `block` changes the
              box and nothing else. */}
          {/* THE HUE SAYS HOW SOON (due.ts): red today, yellow at three days, the default
              ink from four days out — the owner's ruling, 2026-10-15. On the title and the
              line, never the box: a filled box means done. A finished card is muted and
              struck through whatever its date was, so the tone is dropped with `done`. */}
          <span
            className={`line-clamp-2 font-serif text-small leading-snug ${t.done ? "text-[var(--color-muted)] line-through decoration-[var(--color-line-strong)]" : ""}`}
            style={!t.done && t.tone ? { color: t.tone } : undefined}
          >
            {t.title}
          </span>
          {/* The goal a subtask belongs to — the one mark that tells the two kinds apart. */}
          {t.sub && (
            <span className="mt-0.5 block truncate text-micro text-[var(--color-muted)]">
              {t.sub}
            </span>
          )}
          {/* How long it has waited, or how long it has: stated plainly, in the same hue
              as the title. No "overdue", no escalating weight — the words stay a fact. */}
          {!t.done && t.line && (
            <span
              className="mt-0.5 block text-micro text-[var(--color-muted)]"
              style={t.tone ? { color: t.tone } : undefined}
            >
              {t.line}
            </span>
          )}
        </span>
      </button>
    </li>
  );

  const more = (slot: number) => (
    <li key="more" className={CARD} style={{ order: slot + 1 }}>
      <button
        ref={moreRef}
        type="button"
        onClick={() =>
          setAnchor((a) =>
            a ? null : (moreRef.current?.getBoundingClientRect() ?? null),
          )
        }
        aria-haspopup="dialog"
        aria-expanded={anchor != null}
        className="w-full text-left text-small text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        +{ordered.length - (MAX_CARDS - 1)} more
      </button>
    </li>
  );

  const draw = ([slot, i]: readonly [FloatCard | "more", number]) =>
    slot === "more" ? more(i) : card(slot, i);

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      {/* TWO RAILS AT `lg`, ONE COLUMN BELOW IT — and the change below `lg` is that the
          rails stop being boxes at all (`display: contents`), so their cards become items
          of this band and sort themselves back into slot order by the `order` each carries.
          The alternating-sides rule is a statement about the space either side of the ring;
          stacked it has nothing left to balance and it only interleaves the day — three
          tasks read 1st, 3rd, 2nd, and a completed one could sit above two outstanding
          ones. One markup, two layouts, nothing rendered twice: a second copy of the band
          would put a second `+N more` button in the DOM, and the ref that aims its popover
          would end up on whichever copy is display:none.
          An EMPTY rail costs nothing in either layout — `contents` generates no box, so it
          cannot spend the band's gap, and at `lg` it is what keeps the ring in the middle
          of the band rather than shoved left by its own neighbour. */}
      <ul
        role="list"
        className="contents lg:order-1 lg:flex lg:min-w-0 lg:flex-1 lg:basis-0 lg:flex-col lg:items-end lg:justify-center lg:gap-2.5"
      >
        {rail(0).map(draw)}
      </ul>
      {/* Order 0, so it leads the column on the phone; `basis-full` there gives it a line of
          its own rather than letting a card ride up beside it on a wide tablet. */}
      <div className="order-none shrink-0 max-lg:flex max-lg:basis-full max-lg:justify-center lg:order-2">
        {children}
      </div>
      <ul
        role="list"
        className="contents lg:order-3 lg:flex lg:min-w-0 lg:flex-1 lg:basis-0 lg:flex-col lg:items-start lg:justify-center lg:gap-2.5"
      >
        {rail(1).map(draw)}
      </ul>

      {/* `overflow &&`, not `anchor` alone: the card this is anchored to must still exist.
          Without it a day that drops to six tasks or fewer — stepped with the keyboard, or
          refreshed — unmounted the `+N more` card and left the popover standing over an
          empty rectangle. */}
      {overflow && anchor && (
        <MorePopover
          anchor={anchor}
          trigger={moreRef}
          cards={rest}
          onToggle={onToggle}
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  );
}

/**
 * The rest of the day's tasks, beside the card that opened them.
 *
 * `position: fixed` and clamped to the viewport rather than absolutely positioned inside the
 * band: the band lives in a window that scrolls on desktop, and a popover laid out in that
 * window's content box would be positioned against the scrolled origin rather than against
 * the card you tapped.
 *
 * NOT a <dialog>. A modal backdrop over the checklist you are working down is the wrong
 * contract for a tick-as-you-go control — ticking inside here works in place and deliberately
 * does NOT close, because "clear three of these" is one gesture and not three.
 */
function MorePopover({
  anchor,
  trigger,
  cards,
  onToggle,
  onClose,
}: {
  anchor: DOMRect;
  /** The card that opened this. Excluded from the outside-click close, or that close and the
   *  button's own toggle would fight: the capture-phase handler would shut the popover on the
   *  way down and the click would reopen it on the way up. */
  trigger: RefObject<HTMLButtonElement | null>;
  cards: FloatCard[];
  onToggle: (card: FloatCard, done: boolean) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(POP_H_FALLBACK);

  // Measured after mount, before paint: a three-task popover is 120px tall, and clamping it
  // against the 288px cap would push a popover near the bottom of the screen further up than
  // it needs to go — which reads as the popover not knowing where its card is.
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (r?.height) setH(r.height);
  }, [cards.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture, so a tick inside the popover is not read as an outside click on its way up.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || trigger.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose, trigger]);

  // Beside the card, flipped to its other side when there is no room, then clamped. The flip
  // comes before the clamp deliberately: a popover shoved back into the viewport while still
  // on the crowded side would sit ON the card it belongs to.
  let left = anchor.right + GUTTER;
  if (left + POP_W > window.innerWidth - GUTTER)
    left = anchor.left - POP_W - GUTTER;
  if (left < GUTTER) left = GUTTER;
  const top = Math.min(
    Math.max(anchor.top, GUTTER),
    Math.max(GUTTER, window.innerHeight - h - GUTTER),
  );

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="The rest of today's tasks"
      className="popover max-h-[18rem] w-[15rem] overflow-y-auto p-3"
      /* `position` is INLINE, not the `fixed` utility. `.popover` is unlayered CSS in
         globals.css while Tailwind's utilities sit in @layer utilities, and an unlayered
         rule beats every layer whatever the class order — so `.popover`'s own
         `position: relative` won, and this box laid out INSIDE the rail: it took a column's
         width off the cards and added its own height to the page. Left and top were already
         inline; the class sets no position deliberately, so placing one is the caller's job.
         DriftPopover carries the same note for the same reason. */
      style={{ position: "fixed", left, top }}
    >
      <ul>
        {cards.map((t) => (
          <li
            key={t.key}
            className="border-t border-[var(--color-line)] first:border-t-0"
          >
            <button
              onClick={() => onToggle(t, !t.done)}
              aria-pressed={t.done}
              className="flex w-full items-start gap-2.5 py-2 text-left"
            >
              <span className="mt-0.5">
                <HabitBox done={t.done} tone="var(--color-ink)" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-serif text-small leading-snug ${t.done ? "text-[var(--color-muted)] line-through decoration-[var(--color-line-strong)]" : ""}`}
                  style={!t.done && t.tone ? { color: t.tone } : undefined}
                >
                  {t.title}
                </span>
                {t.sub && (
                  <span className="mt-0.5 block truncate text-micro text-[var(--color-muted)]">
                    {t.sub}
                  </span>
                )}
                {!t.done && t.line && (
                  <span
                    className="mt-0.5 block text-micro text-[var(--color-muted)]"
                    style={t.tone ? { color: t.tone } : undefined}
                  >
                    {t.line}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
