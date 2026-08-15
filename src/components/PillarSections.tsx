"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import Ring, {
  SegmentedRing,
  bandsForPillar,
  segmentShade,
  toneColor,
  TONE_HEX,
  LABEL_PAD_X,
  LABEL_PAD_Y,
  type EventItem,
} from "./PillarRing";
import WorkoutLog, { type Workout } from "./WorkoutLog";
import SkillLog, { type SkillSession } from "./SkillLog";
import StatsLink from "./StatsLink";
import { addDays } from "@/lib/dates";
import { sessionTitle } from "@/lib/sessions";
import type {
  GoalView,
  SkillView,
  SkillSlice,
  PillarKey,
} from "@/lib/queries";
import {
  pillarCaption,
  skillDefaultHex,
  type MetricRing,
  type PillarFactInput,
  type PillarRingView,
  type WorkoutKind,
} from "@/lib/rings";

/**
 * 3 -> "3 sessions", 1 -> "1 session", 0 -> "—".
 *
 * Was asTime(minutes). Skills stopped being measured in hours by the owner's ruling: a
 * session is a document now, and turning up is the unit. The em dash for zero is the same
 * reticence the caption keeps — a bare "0" invites reading a count as a score, which is the
 * one thing this figure is not.
 */
function asSessions(n: number): string {
  if (n <= 0) return "—";
  return `${n} ${n === 1 ? "session" : "sessions"}`;
}

/**
 * A skill's own hue — the one its arc wears on the Portfolio ring.
 *
 * Resolved the same way PillarRing resolves it (`s.color ?? skillDefaultHex(s.id)`) so the
 * dialog and the segment it was opened from cannot show two different colours for one
 * skill. The slice list is the source when the skill appears in it; a skill with nothing
 * logged this fortnight is absent from it and falls back to the same stable default, which
 * is cycled from the palette by id rather than chosen, so it never moves between screens.
 */
function skillHue(id: number, slices: SkillSlice[] | null): string {
  const chosen = slices?.find((x) => x.id === id)?.color;
  return chosen ?? skillDefaultHex(id);
}

const PILLAR_NAME: Record<PillarKey, string> = {
  social_capital: "Social",
  physical: "Physical",
  portfolio: "Portfolio",
};

const ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];

/**
 * The box change is NOT animated. Transitioning width and height is forbidden outright, and
 * the honest alternative — a FLIP with an inverse scale — needs a measure/invalidate cycle
 * on three SVGs every toggle, on a surface opened dozens of times a day. What DOES animate
 * is the two rings you did not open, which leave on transform alone.
 *
 * The ruling on opening was "shrink" rather than "push": pushing would have sent the third
 * pillar below the fold the moment you opened the first, which is the shape this column was
 * rebuilt to escape.
 */
/**
 * The collapsed pillar lies DOWN rather than standing up, and its ring is MEASURED.
 *
 * Sized to the screen rather than to a spec. Three labelled donuts stacked vertically cannot
 * fit a 607px column whatever the ring size — the name, the caption and the label's own
 * vertical room cost ~116px a pillar before the ring is drawn at all, which leaves 65px for
 * the ring itself. A 65px donut carrying 11.5px labels is not a chart.
 *
 * Turned on its side the arithmetic inverts: the labels spend WIDTH, which this column has,
 * instead of HEIGHT, which it does not.
 *
 * THE SIZE IS COMPUTED FROM THE COLUMN, not written down. Every fixed number tried here was
 * right for exactly one window: 148 needed a 906px viewport, 116 and 104 both overflowed a
 * 730px laptop, and anything small enough to be safe there would be a stamp on a desktop
 * monitor. The owner uses a phone, a tablet, a laptop and a PC — "fill the entire space it
 * is given" is a different number on each, so it is solved rather than guessed:
 *
 *     ring = (column height - the record link) / 3 - a row of furniture
 *
 * NO LABEL ROOM in that line, and the omission is deliberate — a collapsed donut is drawn
 * plain, so it has no label pad to pay for. It used to be charged 40px a row anyway, which is
 * how three rings ended up at 89px in a column that could seat 129 and the difference ended
 * up as bare gold under the record link.
 *
 * And the column height has to BE the window's. `h-full` only resolves against a parent with
 * a definite one, and Today's pane wrapper sat in between without it — so this divided a
 * column that had already stopped at its own contents. See `pane` in Today.tsx.
 *
 * Clamped at both ends: below MIN a donut is illegible, above MAX it stops being secondary to
 * the 176px adherence hero, which it must never rival.
 */
/**
 * How long a ghost stays mounted, matching `.pillar-ghost`'s longest transition.
 *
 * It schedules an UNMOUNT rather than a swap, which is the difference between this and the
 * `FLY_MS` it replaced. That number gated the whole gesture: nothing could open until it had
 * elapsed, so a slow fade was also a slow app. This one gates nothing — the chosen pillar has
 * already opened and the ring is already travelling; all this decides is when two invisible
 * elements leave the tree. Overrun it and you keep a transparent node for an extra frame.
 *
 * A timeout rather than transitionend for the reason the old sequence gave: transitionend does
 * not fire in a hidden tab, and a ghost that never unmounts is a permanent invisible overlay.
 */
const GHOST_MS = 340;

const RING_MIN = 76;
/** The open ring is big but not unbounded — past this it is a poster, not a chart. */
const OPEN_RING_MAX = 260;
/**
 * Both label pads, so every ring is measured against the room its labels also need.
 *
 * Taken FROM the ring rather than restated — a bare copy here is exactly how two numbers
 * drift apart. Charged in BOTH states now: the labels ride the arcs in every view, so every
 * donut pays for them. That is the price of "the names are always there", and it is paid in
 * ring size — the collapsed donuts run smaller than the plain ones they replace.
 */
const LABEL_PAD_X_TOTAL = LABEL_PAD_X * 2;
/** Name, caption and the metric list the open pillar shows beneath its ring. */
const OPEN_RESERVED = 230;
const RING_MAX = 168;
/**
 * Row padding and a little insurance — everything in a collapsed row that is not the SVG
 * box or the text column. A solver that lands exactly on the budget overflows the moment a
 * caption wraps or a font renders a pixel taller, and the failure mode is the scroll this
 * layout exists to prevent.
 */
const ROW_FURNITURE = 10;
/**
 * The text column beside the collapsed donut: title, caption and the lead-metric line,
 * stacked. What the solver reserves before giving the rest to the ring; the column is
 * `flex-1`, so when the ring clamps at RING_MIN the text simply takes what is left instead.
 *
 * 92, down from 132 in two rounds of the owner's same ruling — the rings kept coming out
 * too small, and this reservation was the single biggest thing they were paying for. The
 * captions wrap a line more; the ring gets the width back, which matters more.
 */
const TEXT_COL = 92;
/** The gap between the donut and its text column, matching the row's `gap-2`. */
const RING_GAP = 8;
/** The label's vertical room, top and bottom — taken FROM the ring rather than restated,
 *  so the two cannot disagree about how much space a label needs. */
const LABEL_ROOM = LABEL_PAD_Y * 2;
const RING_STROKE = 9;

// The first line of a note is its TITLE — the rule this file invented for its chips and
// which now lives in src/lib/sessions.ts, shared with the log dialog, /sessions and the
// search. It was the only place in the app that read a session the way the owner writes one.

/** A dated session, as /api/gym/history returns it. Workout carries its own date now, so
 *  this is the same type — kept as a name because "past session" is what the list means. */
type PastSession = Workout;

/** "2026-08-08" -> "Sat 8 Aug". Noon, never midnight: a bare ISO date parses as UTC and
 *  lands on the day before anywhere west of Greenwich. */
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/** A pillar section held out of flow at the offset it already occupied, so it can be
 *  PUSHED AWAY from the expanding ring instead of vanishing. `top` and `height` are read
 *  from the live layout the instant before it changes; `dir` is which way it gives ground —
 *  up if it sat above the chosen pillar, down if below. */
type Ghost = { pillar: PillarKey; top: number; height: number; dir: -1 | 1 };

/** How far a leaving section is pushed, and how far a returning one arrives from. One
 *  number for both directions, so the gesture and its reverse are mirror images. */
const PUSH_PX = 44;

/** Honours the OS setting for the one gesture here that is driven from JavaScript. The CSS
 *  half is nulled in globals.css; this half has to be asked. */
const wantsMotion = (): boolean =>
  typeof window === "undefined" ||
  typeof window.matchMedia !== "function" ||
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Misc is gone: what it held was bouldering and calisthenic skills, and Calisthenics is a
// SKILL under Portfolio that now logs sessions of its own. One row, one place to write it.
const WORKOUTS: { kind: WorkoutKind; label: string }[] = [
  { kind: "strength", label: "Strength" },
  { kind: "cardio", label: "Cardio" },
];


/**
 * Three pillars, all visible at once, one open at a time.
 *
 * The column used to stack three full sections — a pillar ring, a row of metric rings,
 * workout chips, goals and skills, times three — which ran to several screens, so the
 * third pillar effectively did not exist. Here each pillar collapses to a single segmented
 * donut and its name, and opening one CLOSES the others. That the column fits without
 * scrolling is the entire point of the shape; anything added here has to keep that true.
 *
 * Nothing on a collapsed header is comparable between pillars. The donut shows how much of
 * a pillar's own minimum has been met and caps there — it cannot be improved by doing more,
 * so three donuts side by side are not a league table.
 */
export default function PillarSections({
  goals,
  skills,
  rings,
  facts,
  colors,
  workouts,
  socialEvents,
  oneOffEvents,
  skills14,
  date,
  today,
  onSubgoal,
  onLogSession,
  onDeleteSession,
  onSaveWorkout,
  onDeleteWorkout,
  onOpenRecord,
}: {
  goals: GoalView[];
  skills: SkillView[];
  rings: PillarRingView[] | null;
  /** The plain-words fortnight under each pillar's name. null until /api/rings lands. */
  facts: PillarFactInput | null;
  /** Owner-chosen hue per pillar, from the curated palette. */
  colors: Partial<Record<PillarKey, string | null>>;
  workouts: Workout[];
  /** The fortnight's ADHERED graphite events — the Social ring's inner band and the
   *  Events drill-down. null while loading or when Google could not be reached — those
   *  are different statements from an empty fortnight, and the ring goes ghost. */
  socialEvents: EventItem[] | null;
  /** The adhered ONE-OFF social events — the Social ring's mid band. Same graphite as
   *  the standing ones; what separates them is that these do not repeat. */
  oneOffEvents: EventItem[] | null;
  /** Per-skill sessions in the window, for the Portfolio ring's segments. */
  skills14: SkillSlice[] | null;
  date: string;
  /** The real today. Everything here is anchored to `date` — the fortnight, the ring
   *  window, the session list — and only the workout dialog's date picker needs to know
   *  where the calendar actually ends. */
  today?: string;
  onSubgoal: (id: number, done: boolean) => Promise<void>;
  /** Write a skill session. `id` present means edit; the date travels because the dialog
   *  may have moved it. */
  onLogSession: (
    skillId: number,
    note: string,
    day: string,
    id: number | null,
  ) => Promise<void>;
  onDeleteSession: (skillId: number, id: number) => Promise<void>;
  /**
   * id null = log a NEW session; an id edits that one.
   *
   * `date` comes back FROM the dialog rather than being read from the screen, because the
   * dialog is where it can be changed. Passing the viewed date instead would typecheck, do
   * nothing visible, and silently file every backdated session under today.
   */
  onSaveWorkout: (
    kind: WorkoutKind,
    note: string,
    id: number | null,
    date: string,
  ) => Promise<void>;
  onDeleteWorkout: (id: number) => Promise<void>;
  /** Open the record. Owned by Today, which holds the column this expands out of. */
  onOpenRecord: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  /** Which pillar is expanded. One at a time, so the column never outgrows its window. */
  const [open, setOpen] = useState<PillarKey | null>(null);
  /**
   * The pillars that are on their way out, pinned where they already were.
   *
   * Toggling a pillar changes which sections are in flow, and a section that simply stops
   * being rendered pops. These stay mounted for `GHOST_MS`, out of flow at the exact offset
   * they occupied, fading. Their measurements are taken in the click handler — the last moment
   * the old layout still exists — because after the commit there is nothing left to measure.
   */
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [openSkill, setOpenSkill] = useState<number | null>(null);
  /** Which skill's log dialog is open, and which of its sessions is being edited. `session:
   *  null` is a new one. Held as a pair so picking another session inside the dialog can
   *  re-key it, which is what re-seeds the textarea. */
  const [logSkill, setLogSkill] = useState<{
    id: number;
    session: SkillSession | null;
  } | null>(null);

  /**
   * The FLIP, and everything it needs to survive one commit.
   *
   * `flip` is written synchronously in the click handler and read once in the layout effect
   * below. A ref rather than state on purpose: it must be readable in the SAME commit that
   * changes the layout, and a state update would schedule another render after the move it is
   * supposed to describe had already been painted.
   *
   * It carries THREE rectangles now, not one: the ring, the title and the caption block are
   * all shared elements — one node each, surviving the toggle — and each travels from where
   * it was to where it lands. `fromSize` is the ring's logical diameter at click time,
   * because the box's aspect ratio is not the circle's (see the scale note in the effect).
   */
  const flip = useRef<{
    pillar: PillarKey;
    fromSize: number;
    rects: {
      ring: DOMRect | null;
      name: DOMRect | null;
      cap: DOMRect | null;
    };
  } | null>(null);
  /** The ring boxes, by pillar, so the FLIP can find the one it measured. */
  const ringRefs = useRef(new Map<PillarKey, HTMLSpanElement>());
  /** The title and caption-block nodes — the other two shared elements. */
  const nameRefs = useRef(new Map<PillarKey, HTMLElement>());
  const capRefs = useRef(new Map<PillarKey, HTMLElement>());
  /** The section boxes, so a leaving pillar can be pinned at its own offset. */
  const sectionRefs = useRef(new Map<PillarKey, HTMLElement>());
  /**
   * Which pillar a CLOSE is returning from, read at render time by the two re-mounting
   * sections so each arrives from the side it was pushed to. A ref, not state — it is set
   * in the same handler that triggers the re-render that consumes it, and it must never
   * itself cause one.
   */
  const enterFrom = useRef<PillarKey | null>(null);
  /** The kick counter per pillar — each open buys the clicked ring one fast turn. */
  const [kick, setKick] = useState<{ pillar: PillarKey | null; n: number }>({
    pillar: null,
    n: 0,
  });

  /**
   * The collapsed ring, sized to whatever column it finds itself in.
   *
   * Starts at the MIN rather than at a guess: if the observer never fires — a hidden tab, a
   * browser without ResizeObserver — the pillars are small but complete and legible, which
   * is the resting state a reveal is allowed to have. Growing into the space is the
   * enhancement.
   */
  const columnRef = useRef<HTMLDivElement>(null);
  const [ringSize, setRingSize] = useState(RING_MIN);
  /**
   * The OPEN ring, which has the whole column to itself.
   *
   * Measured from the column WIDTH rather than its height: once the other two have gone the
   * limit is how wide the window is, not how many rings have to share it.
   */
  const [openRingSize, setOpenRingSize] = useState(RING_MIN * 2);

  useEffect(() => {
    const el = columnRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      // The scroller is the .window this column sits in; its client height is the budget.
      const box = el.closest(".window") ?? el.parentElement;
      if (!box) return;
      const style = getComputedStyle(box);
      const pad =
        parseFloat(style.paddingTop || "0") +
        parseFloat(style.paddingBottom || "0");
      /**
       * The WINDOW's content width, and it must come from the window rather than from the
       * column div.
       *
       * `el.clientWidth` was circular: the column shrinks to its contents, its widest
       * content is the ring's own box, and the ring's size was being solved FROM that. Every
       * value satisfies `ring = (ring + pad) - pad`, so the loop had no single answer and
       * simply froze wherever it first landed — an 81px open ring in a 257px window, five
       * pixels bigger than the collapsed one it was supposed to grow out of.
       *
       * The window is laid out by the page and knows nothing about the ring, which is the
       * whole reason it can be measured against.
       */
      const avail =
        box.clientWidth -
        parseFloat(style.paddingLeft || "0") -
        parseFloat(style.paddingRight || "0");
      const link = el.querySelector("[data-record-link]");
      const linkH = link ? link.getBoundingClientRect().height : 0;
      const budget = box.clientHeight - pad - linkH;
      /**
       * LABEL_ROOM is back in the height budget, because the labels are back on every
       * donut: a collapsed ring's box is now the ring plus its label pads on both axes, so
       * both axes pay. The plain-donut era, when charging this was a bug, is over — the
       * names ride the arcs in every view.
       */
      const per = budget / 3 - ROW_FURNITURE - LABEL_ROOM;
      /**
       * Bounded by WIDTH as well as height: the collapsed row is [labelled SVG box] +
       * gap + [text column], and the ring gets what those two leave. When that solves
       * below RING_MIN the clamp wins and the SVG's own maxWidth:100% absorbs the
       * difference by scaling the whole chart — labels and all — rather than clipping it.
       */
      const wCap = avail - TEXT_COL - RING_GAP - LABEL_PAD_X_TOTAL;
      const collapsed = Math.round(
        Math.max(RING_MIN, Math.min(RING_MAX, wCap, per)),
      );
      setRingSize(collapsed);

      /**
       * The open ring: bounded by the width its labels leave it, capped by the height left
       * after the name, the caption and the metric list.
       *
       * FLOORED AT THE COLLAPSED SIZE, which is the invariant the old solve quietly broke:
       * opening a pillar is a reveal, and a reveal that returns a smaller object than the one
       * you tapped is not one. The FLIP would still animate it — it measures whatever it finds
       * — so the floor is what keeps that measurement from describing a shrink.
       */
      const w = avail - LABEL_PAD_X_TOTAL;
      const h = box.clientHeight - pad - OPEN_RESERVED - LABEL_ROOM;
      setOpenRingSize(
        Math.round(Math.max(collapsed, Math.min(OPEN_RING_MAX, w, h))),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el.closest(".window") ?? el);
    return () => ro.disconnect();
  }, [open]);
  /** Which session the log dialog is on. `id: null` opens a NEW one — the whole point of
   *  logging per session rather than per day is that a second lift on a Tuesday is a second
   *  session, so the Log button must never reopen the first. */
  const [openLog, setOpenLog] = useState<{
    kind: WorkoutKind;
    id: number | null;
  } | null>(null);

  /**
   * Which metric row is opened into its fortnight — the sessions behind "3 of 8", the
   * events behind "7 of 2". One at a time, because two open lists in a 250px column is a
   * page, and closed is the resting state the count already serves.
   */
  const [openMetric, setOpenMetric] = useState<string | null>(null);
  /**
   * The whole gym log, fetched LAZILY on the first drill-down and kept. /api/gym/history is
   * the same unpaginated read /sessions makes — a few hundred rows of text — and fetching it
   * once beats a bespoke windowed endpoint that would exist only for this list.
   */
  const [gymLog, setGymLog] = useState<PastSession[] | null>(null);
  const gymLogWanted = useRef(false);
  const pullGymLog = () =>
    fetch("/api/gym/history")
      .then((r) => r.json())
      .then((d) => setGymLog(d.error ? [] : (d.sessions ?? [])))
      .catch(() => setGymLog([]));
  const wantGymLog = () => {
    if (gymLogWanted.current) return;
    gymLogWanted.current = true;
    void pullGymLog();
  };
  /**
   * The cached log after a write, because a session can now be opened FROM it.
   *
   * `wantGymLog` latches so the fetch happens once; that was fine while the list was
   * read-only, and stops being fine the moment editing a session from it can change the very
   * text and date the list is drawn from. Re-pulled only if it was ever wanted — a save from
   * the Log button on a pillar that never opened a drill-down still costs nothing.
   */
  const refreshGymLog = () => {
    if (gymLogWanted.current) void pullGymLog();
  };
  /** The rolling window's first day — the same `addDays(anchor, -13)` the server uses. */
  const windowFrom = addDays(date, -13);

  // Relative to the largest FORTNIGHT figure, so the bars compare where time went
  // recently. No target and no full state — nothing here is completable.
  // The bar scales against the busiest skill's SESSIONS now, not its minutes. Same shape,
  // same meaning — relative attention across the fortnight — in the unit skills are logged
  // in. Math.max guards the divide when nothing has been logged at all.
  const maxSessions = Math.max(1, ...skills.map((s) => s.sessions14));
  const anyRecent = skills.some((s) => s.sessions14 > 0);

  /**
   * Toggle a pillar. Everything happens at once, and that is the change.
   *
   * The old version was a sequence: mark the other two as leaving, wait 390ms for them to fly
   * off, and only then set `open`. Two beats — the thing leaves, you wait, the thing arrives —
   * which is precisely why the ring read as two assets being swapped rather than as one ring
   * growing. There was no frame in which the small donut and the large one were the same
   * object, because they never existed at the same time.
   *
   * Now one commit does all of it. The ring's rectangle is taken HERE, while the old layout is
   * still on screen and still measurable, and handed to the layout effect below; the two
   * unchosen sections are pinned at their current offsets and fade from there. The ring
   * travels through them.
   */
  const openPillar = (pk: PillarKey) => {
    const next = open === pk ? null : pk;

    // FIRST, in FLIP's sense: where the shared elements are right now. Both directions use
    // the pillar being TOUCHED — opening, the collapsed donut and its text; closing, the
    // big ones about to become them again.
    const grab = (map: typeof ringRefs) =>
      map.current.get(pk)?.getBoundingClientRect() ?? null;
    flip.current = {
      pillar: pk,
      fromSize: open === pk ? openRingSize : ringSize,
      rects: {
        ring: grab(ringRefs),
        name: grab(nameRefs),
        cap: grab(capRefs),
      },
    };

    // Closing: remember which pillar the other two are returning FROM, so each arrives
    // back from the side it was pushed to. Opening clears it — the next mounts are the
    // expanded pillar's own children, which arrive by their own rules.
    enterFrom.current = next == null ? pk : null;
    // The flourish: one fast turn for the ring that was chosen. Opening only — a closing
    // ring is the system getting out of the way, and the way out never performs.
    if (next != null) setKick((k) => ({ pillar: pk, n: k.n + 1 }));

    // The sections that are about to leave the flow, pinned where they already sit and told
    // which way to give ground. Opening, that is the other two; closing, nothing leaves —
    // the two that were unmounted are coming back, and an element that does not exist yet
    // has no offset to hold.
    const column = columnRef.current;
    setGhosts(
      next == null
        ? []
        : (ORDER.filter((k) => k !== pk)
            .map((k) => {
              const el = sectionRefs.current.get(k);
              if (!el || !column) return null;
              return {
                pillar: k,
                top: el.offsetTop,
                height: el.offsetHeight,
                dir: (ORDER.indexOf(k) < ORDER.indexOf(pk) ? -1 : 1) as -1 | 1,
              };
            })
            .filter(Boolean) as Ghost[]),
    );
    setOpen(next);
  };

  /**
   * Release the FLIP, in the same synchronous pass that committed the new layout.
   *
   * `useLayoutEffect`, never `useEffect`: the from-transform has to be on the node before the
   * browser paints, and an effect that runs after paint shows one frame of the ring at its
   * destination — a flash of the answer before the move.
   *
   * NO requestAnimationFrame ANYWHERE, which is the constraint this file's CSS was written
   * around. rAF does not fire in a hidden tab, so a from-state applied in one frame and
   * released in the next would strand the ring mid-transform for anyone who opened the app in
   * a background tab. Here the set and the release are one synchronous block separated only by
   * a forced style flush: if the transition never runs, the node is already at `transform:
   * none`, which is the correct size in the correct place.
   */
  useLayoutEffect(() => {
    const pending = flip.current;
    flip.current = null;
    if (!pending || !wantsMotion()) return;

    /** Apply a from-transform and release it, one synchronous block, one style flush. */
    const release = (node: HTMLElement, transform: string) => {
      node.style.transition = "none";
      node.style.transform = transform;
      // Read back to flush the style above as its own computed value. Without this the
      // browser coalesces both writes into one and there is nothing to interpolate.
      void node.getBoundingClientRect();
      node.style.transition = `transform var(--dur-expand) var(--ease-expand)`;
      node.style.transform = "none";
    };

    const ringNode = ringRefs.current.get(pending.pillar);
    const fromRing = pending.rects.ring;
    if (ringNode && fromRing && fromRing.width) {
      const to = ringNode.getBoundingClientRect();
      if (to.width) {
        /**
         * The DIAMETERS carry the scale, never the boxes. Both boxes wear the same
         * CONSTANT label pad, so their aspect ratios differ with size — a width ratio
         * would land the circle ~60% too large on frame one and the "same ring" premise
         * dies in the first frame. Each diameter is recovered from the rendered box
         * (which maxWidth:100% may have squeezed) via the logical size it was drawn at.
         */
        const toSize = open === pending.pillar ? openRingSize : ringSize;
        const fromD =
          fromRing.width *
          (pending.fromSize / (pending.fromSize + LABEL_PAD_X_TOTAL));
        const toD = to.width * (toSize / (toSize + LABEL_PAD_X_TOTAL));
        const scale = toD > 0 ? fromD / toD : 1;
        // Centre to centre, so the scale and the travel share an origin and the ring
        // appears to grow out of itself rather than to drift while growing.
        const dx = fromRing.left + fromRing.width / 2 - (to.left + to.width / 2);
        const dy = fromRing.top + fromRing.height / 2 - (to.top + to.height / 2);
        // Sub-pixel moves are not moves. Skipping them avoids a pointless composite layer
        // on every re-render that happens to carry a stale measurement.
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1 || Math.abs(scale - 1) >= 0.01)
          release(ringNode, `translate(${dx}px, ${dy}px) scale(${scale})`);
      }
    }

    // The title and the caption block: same type size in both layouts, so these are pure
    // translates — one "Physical" sliding from beside the donut to beneath it, not two
    // strings swapped.
    for (const key of ["name", "cap"] as const) {
      const node = (key === "name" ? nameRefs : capRefs).current.get(
        pending.pillar,
      );
      const from = pending.rects[key];
      if (!node || !from || !from.width) continue;
      const to = node.getBoundingClientRect();
      if (!to.width) continue;
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      release(node, `translate(${dx}px, ${dy}px)`);
    }
  }, [open, openRingSize, ringSize]);

  /** Ghosts leave the tree once they are invisible. Nothing waits on this — see GHOST_MS. */
  useEffect(() => {
    if (ghosts.length === 0) return;
    const t = setTimeout(() => setGhosts([]), GHOST_MS);
    return () => clearTimeout(t);
  }, [ghosts]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  // h-full only while everything is closed: the three rings then divide the column between
  // them and the last caption lands on its bottom edge. Once something is open the column may
  // outgrow its box and scroll — the detail is what you came for.
  return (
    <div
      ref={columnRef}
      // `relative` is what the ghosts are pinned against. Without it they would leave the
      // flow and land on the nearest positioned ancestor — the window — which scrolls, so a
      // fading pillar would drift up the page as the record's own scroll moved beneath it.
      className={`relative flex flex-col ${open ? "lg:min-h-full" : "lg:h-full"}`}
    >
      {ORDER.map((pk) => {
        const ring = rings?.find((r) => r.pillar === pk) ?? null;
        const mine = goals.filter(
          (g) => g.pillar === pk && g.status !== "done",
        );
        const myS = skills.filter((s) => s.pillar === pk);
        const hue = toneColor(pk, colors[pk]);
        const expanded = open === pk;

        /**
         * THE BANDS, per pillar — three different rings now, honestly different because
         * the pillars ARE different. Built by bandsForPillar, which the record page also
         * uses, so the two surfaces cannot drift:
         *
         *   social     inner = adhered social events, one slot each against six, six slots
         *              flat; mid = the events past the sixth; outer thin = outreach
         *   portfolio  inner = active skills, arcs by session in each skill's own colour;
         *              mid = parked skills, same unit
         *   physical   the metric donut it always was, misc riding the thin lap
         */
        const {
          segments,
          mid: midBand,
          outer,
        } = bandsForPillar(
          pk,
          ring,
          { social: socialEvents, oneOff: oneOffEvents, skills: skills14 },
          PILLAR_NAME[pk],
        );

        // What the fortnight actually held, in plain words. A RAW count, deliberately not
        // derived from the ring above it: the ring caps at a threshold and this must not, or
        // a fortnight of twenty sessions would print as eight.
        const caption = facts ? pillarCaption(pk, facts) : "";

        // The second line: the pillar's WEIGHTIEST live metric, count against threshold.
        // Still a count, never a verdict — the same statement the metric list makes at
        // length, surfaced because the collapsed view had the room and said nothing with
        // it. The heaviest metric because that is the one the ring's circle mostly is.
        const lead = ring
          ? [...ring.metrics]
              .filter((m) => m.state === "scored" && !m.lap)
              .sort((a, b) => b.weight - a.weight)[0] ?? null
          : null;
        const secondary = lead ? `${lead.label} ${lead.fact}` : "";

        // Three entries in one list rather than three stacked sections: a hairline between
        // pillars is separation enough once each collapses to a single row, and a ruled
        // heading per pillar would put three more rules on a column that now has three
        // headers. The rule sits on the section rather than as `divide-y` on the parent so
        // the workout dialog, a sibling below the loop, never inherits one.

        // Once something is open the other two are out of the flow — but for GHOST_MS they
        // are still MOUNTED, pinned where they stood, being pushed away. Rendering them at
        // zero height would leave their headings in the tab order, so the ghost takes
        // pointer-events and aria-hidden instead and then genuinely leaves.
        const pin = open && !expanded ? ghosts.find((g) => g.pillar === pk) : null;
        if (open && !expanded && !pin) return null;

        // Closing: each returning section arrives from the side it was pushed to. Zero for
        // the surviving pillar and for a cold mount — @starting-style only fires on
        // insertion, so a stale var on a surviving node is inert by construction.
        const cameFrom = enterFrom.current;
        const enterDy =
          cameFrom && pk !== cameFrom
            ? (ORDER.indexOf(pk) < ORDER.indexOf(cameFrom) ? -1 : 1) * PUSH_PX
            : 0;

        return (
          <section
            key={pk}
            ref={(el) => {
              if (el) sectionRefs.current.set(pk, el);
              else sectionRefs.current.delete(pk);
            }}
            aria-hidden={pin ? true : undefined}
            // flex-1 + justify-center is what makes the three rings SPREAD rather than stack
            // at the top with dead space beneath. Slack becomes air inside each third, so the
            // last caption meets the bottom of the column instead of floating halfway up it.
            // Rules appear only once something is open, when the column becomes a list again.
            className={`${
              open
                ? "flex min-h-0 flex-1 flex-col"
                : "flex min-h-0 flex-1 flex-col justify-center"
            } ${pin ? "pillar-ghost" : "pillar-enter"}`}
            // The pin is the whole reason a ghost reads as pushed rather than as jumping:
            // it holds the box at the offset the live layout had for it one commit ago, and
            // --ghost-dy says which way it gives ground — away from the expanding ring.
            style={
              pin
                ? ({
                    top: pin.top,
                    height: pin.height,
                    "--ghost-dy": `${pin.dir * PUSH_PX}px`,
                  } as CSSProperties)
                : ({ "--enter-dy": `${enterDy}px` } as CSSProperties)
            }
          >
            {/* THE WAY BACK, and it only exists when there is somewhere to go back to.
                Open, the pillar owns the window and the other two are not merely hidden but
                unmounted — so without this the only route out is knowing that the ring is
                still a toggle, which is knowledge the screen does not offer anywhere. An ×
                because this is a window you opened, matching every other window in the app. */}
            {expanded && (
              // The way back arrives WITH the detail, not before it — same entrance, first
              // in the stagger, so nothing on this surface ever simply appears.
              <div className="detail-enter flex justify-end">
                <button
                  // Through openPillar, not setOpen: this is the same toggle the ring is, so
                  // it has to take the same measurement. Calling setOpen directly left the
                  // FLIP with nothing to release and the big donut snapped back to a small one.
                  onClick={() => openPillar(pk)}
                  aria-label="Back to all three pillars"
                  className="-mr-1 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
                >
                  ×
                </button>
              </div>
            )}

            {/* The whole header is the control — the donut and its name together are a large,
                obvious target at 11pm, and a separate chevron would be a smaller one for no
                gain. The heading stays an h2 so the column keeps a document outline.
                NO hover fill. A wash behind the row made the ring read as a boxed widget
                sitting on a panel; the hover feedback is the ring itself now — it slows its
                own turn under the pointer, which says "attended to" without drawing a box. */}
            <h2>
              <button
                onClick={() => openPillar(pk)}
                aria-expanded={expanded}
                className={`-mx-2 flex w-[calc(100%+1rem)] rounded-lg px-2 ${
                  expanded
                    ? "flex-col items-center gap-2 py-2"
                    : "items-center gap-2 py-2 text-left"
                }`}
              >
                {/* OPEN, the ring takes the window: it is the only thing left in the column,
                    so it is drawn at the width the column can actually give it.
                    It is the SAME ELEMENT in both layouts — deliberately NOT keyed.
                    A key made it remount, which is what let the old @starting-style grow fire,
                    and it is also what made the transition read as a swap: two nodes, one
                    replacing the other. One surviving node, measured before and after, is the
                    only arrangement in which a ring can be said to have travelled. */}
                <span
                  ref={(el) => {
                    if (el) ringRefs.current.set(pk, el);
                    else ringRefs.current.delete(pk);
                  }}
                  className="ring-flip inline-flex"
                >
                  <SegmentedRing
                    segments={segments}
                    mid={midBand}
                    outer={outer}
                    size={expanded ? openRingSize : ringSize}
                    stroke={expanded ? RING_STROKE + 3 : RING_STROKE}
                    tone={pk}
                    color={colors[pk]}
                    // The pillar's own lamp, in both layouts. Constant — see `glow` and The
                    // One Lamp Rule; it carries the hue and never the fill.
                    glow
                    // Alive at rest, slowed under the pointer, one fast turn when chosen.
                    spin
                    kick={kick.pillar === pk ? kick.n : 0}
                  />
                </span>

                {/* THE TEXT COLUMN: title, caption, and the lead metric's count, stacked —
                    the caption sits UNDER its title in both layouts, and all three are the
                    SAME NODES in both. Collapsed they stand beside the donut; open they drop
                    below it; the FLIP carries each from one place to the other, so one
                    "Physical" travels rather than two swapping.
                    The inner spans are inline-block so a measurement is a measurement of the
                    TEXT: a full-width block centres its box, not its glyphs, and the FLIP
                    would read dx=0 for a word that visibly moved. */}
                <span
                  className={`min-w-0 ${expanded ? "w-full text-center" : "flex-1 text-left"}`}
                >
                  <span className="block">
                    <span
                      ref={(el) => {
                        if (el) nameRefs.current.set(pk, el);
                        else nameRefs.current.delete(pk);
                      }}
                      className="ring-flip inline-block text-body font-semibold"
                    >
                      {PILLAR_NAME[pk]}
                    </span>
                  </span>
                  <span className="block">
                    <span
                      ref={(el) => {
                        if (el) capRefs.current.set(pk, el);
                        else capRefs.current.delete(pk);
                      }}
                      className={`ring-flip inline-block ${expanded ? "text-center" : "text-left"}`}
                    >
                      {/* A fixed minimum height so a pillar whose caption has not arrived
                          yet does not sit a line higher than the two beside it. */}
                      <span className="block min-h-[1.45em] text-small text-[var(--color-muted)]">
                        {caption}
                      </span>
                      {secondary && (
                        <span className="mt-0.5 block text-micro tabular-nums text-[var(--color-muted)]">
                          {secondary}
                        </span>
                      )}
                    </span>
                  </span>
                </span>
              </button>
            </h2>

            {expanded && (
              // Settles in rather than appearing — but per ITEM now, not as one slab. Each
              // block rises ~12px on its own small delay (see .detail-enter), so the detail
              // reads as arriving in reading order behind the ring's travel rather than as
              // one sheet faded on.
              <div className="pb-7">
                {/* A LIST, not a row of columns. Four metrics across a 250px column gave
                    each ~88px, so every fact line wrapped to two ragged centred lines.
                    Reading down a left-aligned list also scales: a fifth metric costs a
                    row, not a relayout.

                    Two lines per row, in the order the eye needs them: what it is and what
                    you can do about it first, then what has happened. The facts hang under
                    the name rather than at the end of the line — "3 of 8 sessions · day 9
                    of 14" does not share 250px with a label and a button. */}
                {ring && ring.metrics.length > 0 && (
                  <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
                    {ring.metrics.map((m, mi) => {
                      /**
                       * THE ROW MARKER WEARS ITS OWN ARC'S COLOUR.
                       *
                       * Every one of these 18px rings used to be handed `colors[pk]` — the
                       * flat pillar hue — so a pillar with three metrics drew three
                       * identical markers beside a donut of three different shades, and
                       * there was no way to tell which label belonged to which arc. The
                       * legend was the same colour as itself.
                       *
                       * Resolved through the SAME `segmentShade` the donut strokes with, at
                       * the same index, off the same TONE_HEX base. A legend that computes
                       * its own shades is a legend that eventually disagrees with the chart.
                       *
                       * Two exceptions, both honest. Portfolio's donut is SKILLS, not
                       * metrics, so "Skills" and "Projects" have no arc of their own to
                       * match and keep the plain hue — the skill colours are shown per skill
                       * in the drill-down instead. And a lap is a thin outer band rather
                       * than a slice, so it is not in the donut's index at all.
                       */
                      const donutIdx = ring.metrics
                        .filter((x) => !x.lap)
                        .findIndex((x) => x.key === m.key);
                      const markerHue =
                        pk === "portfolio" || donutIdx < 0
                          ? hue
                          : segmentShade(colors[pk] ?? TONE_HEX[pk], donutIdx);
                      // Hoisted out of the JSX: TypeScript drops a property narrowing the
                      // moment it crosses into a callback, and the onClick below is one.
                      const kind = m.workoutKind;
                      // Which rows open into their fortnight: the three session kinds and
                      // the calendar's events. Outreach and skills are ticks and minutes —
                      // there is no document behind them to show.
                      const drills = Boolean(kind) || m.key === "social_events";
                      const drilled = drills && openMetric === m.key;
                      // The fortnight behind the count, resolved here so the list below is
                      // pure rendering. null = still loading / unreachable.
                      //
                      // `id` is what makes an entry OPENABLE. A session has one and a
                      // calendar event does not, which is exactly the distinction the list
                      // needs: the log is ours to open, the calendar is not.
                      const fortnight:
                        | { key: string; date: string; title: string; id: number | null }[]
                        | null =
                        !drilled
                          ? null
                          : kind
                            ? gymLog == null
                              ? null
                              : gymLog
                                  .filter(
                                    (s) =>
                                      s.kind === kind &&
                                      s.date >= windowFrom &&
                                      s.date <= date,
                                  )
                                  .map((s) => ({
                                    key: `s${s.id}`,
                                    date: s.date,
                                    title:
                                      sessionTitle(s) || "untitled session",
                                    id: s.id,
                                  }))
                            : socialEvents == null
                              ? null
                              : [
                                  ...socialEvents,
                                  ...(oneOffEvents ?? []),
                                ]
                                  .sort((a, b) => b.date.localeCompare(a.date))
                                  .map((e, i) => ({
                                    key: `e${i}`,
                                    date: e.date,
                                    title: e.title,
                                    id: null,
                                  }));
                      return (
                        <li
                          key={m.key}
                          className="detail-enter flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5"
                          style={
                            {
                              "--enter-delay": `${(mi + 1) * 45}ms`,
                            } as CSSProperties
                          }
                        >
                          <span className="flex w-5 shrink-0 items-center justify-center">
                            {m.state === "unscored" ? (
                              // No ring — there is nothing to fill toward. A plain dot
                              // holds the row's left edge without pretending to be a gauge.
                              <span
                                aria-hidden
                                className="h-1.5 w-1.5 rounded-full bg-[var(--color-line-strong)]"
                              />
                            ) : (
                              <Ring
                                fill={m.fill}
                                overdrive={m.overdrive}
                                dashed={m.state === "ghost"}
                                size={18}
                                stroke={2.5}
                                tone={pk}
                                color={markerHue}
                              />
                            )}
                          </span>

                          {/* The NAME is the way into the fortnight behind the count —
                              tapping "Strength" lists the sessions, "Events" the calendar
                              entries. A button only where there is something to open;
                              elsewhere it stays a plain span rather than a dead control. */}
                          {drills ? (
                            <button
                              onClick={() => {
                                if (kind) wantGymLog();
                                setOpenMetric(drilled ? null : m.key);
                              }}
                              aria-expanded={drilled}
                              className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-small"
                            >
                              <span className="min-w-0 truncate">{m.label}</span>
                              <span
                                aria-hidden
                                className={`shrink-0 text-micro text-[var(--color-muted)] transition-transform ${drilled ? "rotate-90" : ""}`}
                              >
                                ▸
                              </span>
                            </button>
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-small">
                              {m.label}
                            </span>
                          )}

                          {/* An ACTION, not a state display — so it never fills in and
                              never becomes a checkbox. What was logged is already stated by
                              the count on the line below; a filled pill here would say it
                              twice and turn a workout into something you tick off. */}
                          {kind && (
                            <button
                              onClick={() => setOpenLog({ kind, id: null })}
                              aria-haspopup="dialog"
                              aria-label={`Log ${m.label}`}
                              className="shrink-0 rounded-full border border-[var(--color-line-strong)] px-2.5 py-1 text-micro transition-colors hover:bg-[var(--color-panel)]"
                            >
                              Log
                            </button>
                          )}

                          {/* Wraps to its own line, indented to the LABEL rather than the
                              ring: the facts belong to the name above them, and three items
                              plus a button never shared 250px. */}
                          {/* The fact alone — no "day x of 14". The window SLIDES: every
                              count here is simply the last fourteen days from today, no
                              blocks, no resets, no fresh starts to wait for and nothing to
                              cram against before an edge that does not exist. A filling-up
                              label implied a cycle, which is the reading the owner asked
                              this app to stop suggesting. */}
                          <span className="flex w-full items-baseline gap-1.5 pl-[1.875rem] text-micro tabular-nums text-[var(--color-muted)]">
                            <span>{m.fact}</span>
                          </span>

                          {/* THE FORTNIGHT BEHIND THE COUNT. What the arc actually was:
                              each session by its first line, each event by its calendar
                              title, dated. A record, not a score — newest first, nothing
                              ranked, and the titles take the serif because they are the
                              owner's own words. */}
                          {drilled && (
                            <span className="w-full pl-[1.875rem]">
                              {fortnight == null ? (
                                <span className="block py-1 text-micro text-[var(--color-muted)]">
                                  {kind ? "Loading…" : "Couldn't read the calendar."}
                                </span>
                              ) : fortnight.length === 0 ? (
                                <span className="block py-1 text-micro text-[var(--color-muted)]">
                                  Nothing this fortnight.
                                </span>
                              ) : (
                                <span className="block">
                                  {fortnight.map((f) => {
                                    const row = (
                                      <>
                                        <span className="w-16 shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                                          {shortDay(f.date)}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate font-serif text-small">
                                          {f.title}
                                        </span>
                                      </>
                                    );
                                    /* The width is NOT in here, deliberately. A bleeding
                                       row needs `-mx-1` paired with an explicit
                                       `calc(100% + 0.5rem)`: with a plain `w-full` the box
                                       is over-constrained, CSS discards the right margin in
                                       LTR, and the row slides 4px left instead of growing
                                       4px each side. Same paired idiom as every other
                                       bleeding control in this file. */
                                    const line =
                                      "flex items-baseline gap-2 border-t border-[var(--color-line)] py-1.5 first:border-t-0";
                                    /* THE TITLE IS THE WAY IN. A list of the fortnight's
                                       sessions that you cannot open is a list you read and
                                       then go looking for the real thing — so each session
                                       opens its own document, in place, over the pillar you
                                       already had open. A calendar event has no document
                                       here and stays a plain line rather than a dead
                                       control. */
                                    return f.id != null && kind ? (
                                      <button
                                        key={f.key}
                                        type="button"
                                        onClick={() => {
                                          setOpenLog({ kind, id: f.id! });
                                        }}
                                        aria-haspopup="dialog"
                                        className={`${line} -mx-1 w-[calc(100%+0.5rem)] rounded px-1 text-left transition-colors hover:bg-[var(--color-panel)]`}
                                      >
                                        {row}
                                      </button>
                                    ) : (
                                      <span key={f.key} className={`${line} w-full`}>
                                        {row}
                                      </span>
                                    );
                                  })}
                                </span>
                              )}
                            </span>
                          )}

                          {/* Today's sessions of this kind, one chip each, so a second
                              lift is a second thing you can open rather than the first one
                              silently overwritten. Labelled by the note's first line
                              because that is what the owner will recognise — a numbered
                              chip is a thing you have to open to identify. */}
                          {kind && (
                            <ul className="flex w-full flex-wrap gap-1.5 pl-[1.875rem]">
                              {workouts
                                .filter((w) => w.kind === kind)
                                .map((w, i) => (
                                  <li key={w.id}>
                                    <button
                                      onClick={() => setOpenLog({ kind, id: w.id })}
                                      aria-haspopup="dialog"
                                      className="max-w-[11rem] truncate rounded-full border border-[var(--color-line)] px-2 py-0.5 text-micro text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
                                    >
                                      {sessionTitle(w) || `session ${i + 1}`}
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* The whole gym log, from the pillar that owns it. It was reachable only
                    from inside the log dialog, which meant you had to be writing a session
                    to go and read the old ones. */}
                {pk === "physical" && (
                  <div
                    className="detail-enter"
                    style={
                      {
                        "--enter-delay": `${((ring?.metrics.length ?? 0) + 1) * 45}ms`,
                      } as CSSProperties
                    }
                  >
                    <Link
                      href="/sessions"
                      className="mt-3 inline-flex items-center gap-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                    >
                      every session logged
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                )}

                {/* Goals keep their own label so a ring-led section never makes goal
                    progress look like ring progress. The quarantine is a data rule; this is
                    its visual counterpart. The percentage hangs in the page margin, which is
                    also where it stops competing with the title for the line. */}
                <div
                  className="detail-enter mt-6"
                  style={
                    {
                      "--enter-delay": `${((ring?.metrics.length ?? 0) + 2) * 45}ms`,
                    } as CSSProperties
                  }
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-micro">Goals</h3>
                    <Link
                      href="/goals"
                      className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                    >
                      edit
                    </Link>
                  </div>

                  <ul className="mt-1 divide-y divide-[var(--color-line)]">
                    {mine.map((g) => (
                      <li key={g.id} className="page-margin py-3">
                        <div className="pt-1.5 text-right text-micro tabular-nums text-[var(--color-muted)]">
                          {Math.round(g.progress * 100)}%
                        </div>

                        <div className="min-w-0">
                          <p className="font-serif text-body">{g.title}</p>

                          {/* The track is a rule, not a recessed slab: with the cards gone,
                              --color-panel-2 sits two points off the page and the bar loses
                              its ground entirely.
                              scaleX, not width: transform is composited and skips layout
                              entirely. At this height the rounded caps distort by a fraction
                              of a pixel, which is invisible and worth the free frame. */}
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
                            <div
                              className="motion-data h-full w-full origin-left rounded-full bg-[var(--color-accent)]"
                              style={{ transform: `scaleX(${g.progress})` }}
                            />
                          </div>

                          <ul className="mt-2.5">
                            {g.subgoals.map((s) => (
                              <li key={s.id}>
                                <button
                                  onClick={() =>
                                    run(`sg${s.id}`, () =>
                                      onSubgoal(s.id, !s.done),
                                    )
                                  }
                                  aria-pressed={s.done}
                                  disabled={busy === `sg${s.id}`}
                                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                                >
                                  <span
                                    aria-hidden
                                    className="h-3.5 w-3.5 shrink-0 rounded-[4px] transition-colors"
                                    style={
                                      s.done
                                        ? { background: "var(--color-accent)" }
                                        : {
                                            border:
                                              "1px solid var(--color-line-strong)",
                                          }
                                    }
                                  />
                                  <span
                                    className={`min-w-0 flex-1 truncate font-serif text-small ${
                                      s.done ? "text-[var(--color-muted)]" : ""
                                    }`}
                                  >
                                    {s.title}
                                  </span>
                                  <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                                    {Math.round(s.effectiveWeight * 100)}%
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>

                          {g.subgoals.length === 0 && (
                            <p className="mt-2 text-micro leading-relaxed text-[var(--color-muted)]">
                              No subgoals yet — add a few and this bar starts
                              filling.
                            </p>
                          )}
                          {/* Fires only when explicit overrides exceed 100% — an all-auto
                              goal is well-formed and must never warn. */}
                          {g.overAllocated && (
                            <p className="mt-2 text-micro text-[var(--color-muted)]">
                              set weights total more than 100%
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                    {mine.length === 0 && (
                      <li className="py-3 text-small leading-relaxed text-[var(--color-muted)]">
                        Nothing here yet — add one from{" "}
                        <Link
                          href="/goals"
                          className="text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-accent)]"
                        >
                          the goals screen
                        </Link>
                        . Subgoals split it evenly, and ticking them fills the
                        bar.
                      </li>
                    )}
                  </ul>
                </div>

                {myS.length > 0 && (
                  <div
                    className="detail-enter mt-7"
                    style={
                      {
                        "--enter-delay": `${((ring?.metrics.length ?? 0) + 3) * 45}ms`,
                      } as CSSProperties
                    }
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-micro">Skills</h3>
                      <span className="flex items-baseline gap-3">
                        <span className="text-micro text-[var(--color-muted)]">
                          last 14 days
                        </span>
                        {/* The same way in Goals has — rename or add on the deeper
                            screen, not in a 250px column. */}
                        <Link
                          href="/skills"
                          className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                        >
                          edit
                        </Link>
                      </span>
                    </div>

                    {/* The fortnight's time is genuine marginalia — it is a duration, and it
                        fits the margin where the ring facts did not. The owner's own name
                        for the skill sits on the line beside it. */}
                    <ul className="mt-1 divide-y divide-[var(--color-line)]">
                      {myS.map((s) => (
                        <li key={s.id} className="page-margin py-3">
                          <div className="pt-2 text-right text-micro tabular-nums text-[var(--color-muted)]">
                            {asSessions(s.sessions14)}
                          </div>

                          <div className="min-w-0">
                            <button
                              onClick={() =>
                                setOpenSkill(openSkill === s.id ? null : s.id)
                              }
                              aria-expanded={openSkill === s.id}
                              className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--color-panel)]"
                            >
                              <span className="flex items-baseline gap-2">
                                <span
                                  className={`min-w-0 truncate font-serif text-body ${
                                    s.state === "parked"
                                      ? "text-[var(--color-muted)]"
                                      : ""
                                  }`}
                                >
                                  {s.name}
                                </span>
                                {/* Outside the truncating span: at this column width the
                                    name would eat the word before it ever showed.
                                    A tint behind ink, not accent-coloured text — the accent
                                    reads 4.02:1 as text on the page. It is a fill colour,
                                    and this is what using it as one looks like. */}
                                {s.state === "active" && (
                                  <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-1.5 text-micro text-[var(--color-ink)]">
                                    active
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-micro tabular-nums text-[var(--color-muted)]">
                                {asSessions(s.sessions)} lifetime
                              </span>
                            </button>

                            {anyRecent && (
                              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
                                <div
                                  className="motion-data h-full w-full origin-left rounded-full"
                                  style={{
                                    transform: `scaleX(${s.sessions14 / maxSessions})`,
                                    // Parked reads as quiet, not as failed: the same muted
                                    // ink the name already takes. --color-line-strong sat a
                                    // point off the track and made the bar vanish rather
                                    // than dim.
                                    background:
                                      s.state === "parked"
                                        ? "var(--color-muted)"
                                        : hue,
                                  }}
                                />
                              </div>
                            )}

                            {/* Quick-add sits on its OWN line, not inline with the name —
                                inline it overflows a phone. Undo rides at the end of the
                                same row: it belongs to the tap that just happened, and it
                                is quiet type rather than a fourth chip so it cannot be hit
                                by accident while reaching for +60m. */}
                            {/* One control where three quick-add chips used to be. The
                                chips could only say HOW LONG, which is the thing this
                                pillar stopped measuring; what is worth recording is what
                                you worked on, and that needs a document. The fortnight's
                                sessions open from inside the dialog rather than listing
                                here — a 250px column is not where a log is read. */}
                            {openSkill === s.id && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLogSkill({ id: s.id, session: null })
                                  }
                                  className="rounded-full border border-[var(--color-line-strong)] px-3 py-1.5 text-small transition-colors hover:bg-[var(--color-panel)]"
                                >
                                  Log a session
                                </button>
                                {s.recent.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLogSkill({
                                        id: s.id,
                                        session: s.recent[0],
                                      })
                                    }
                                    className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                                  >
                                    last: {sessionTitle({ note: s.recent[0].note, title: null }) || "untitled"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {!anyRecent && (
                      <p className="mt-3 text-micro leading-relaxed text-[var(--color-muted)]">
                        Nothing logged in the last 14 days. Lifetime totals stay
                        listed, so everything you&apos;ve put time into is still
                        visible.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* The way through to the history, under the three rings it summarises. shrink-0 so
          it never takes room from them — the rings divide whatever is left after this. */}
      <StatsLink date={date} onOpen={onOpenRecord} />

      {/* Mounted outside the pillar loop: a modal is not part of the row that opened it,
          and hanging it off Physical's expanded body would unmount it the moment anything
          collapsed the section underneath. */}
      {openLog && (
        <WorkoutLog
          /* One dialog per SESSION. `note` and `day` are seeded from props into state, so
             swapping which session this instance is about without remounting would leave the
             previous one's text and date in the controls. The modal makes that unreachable
             today; the key makes it unreachable regardless. */
          key={openLog.id ?? "new"}
          kind={openLog.kind}
          label={WORKOUTS.find((w) => w.kind === openLog.kind)!.label}
          date={date}
          today={today}
          workout={
            openLog.id == null
              ? null
              : // TODAY'S FIRST, THEN THE WHOLE LOG. The chips under a metric are today's
                // sessions and resolve from `workouts`; the drill-down list is the
                // fortnight and resolves from `gymLog`. Looking only in the first would
                // hand the dialog a null for every session older than this morning — which
                // reads as "write a new one" and is how you lose an old session by
                // clicking on it.
                (workouts.find((x) => x.id === openLog.id) ??
                gymLog?.find((x) => x.id === openLog.id) ??
                null)
          }
          hue={toneColor("physical", colors.physical)}
          onSave={async (note, day) => {
            await onSaveWorkout(openLog.kind, note, openLog.id, day);
            refreshGymLog();
          }}
          onDelete={async () => {
            if (openLog.id == null) return;
            await onDeleteWorkout(openLog.id);
            refreshGymLog();
          }}
          onClose={() => setOpenLog(null)}
        />
      )}

      {/* The skill log, same contract as the workout one above it. Keyed by session id for
          the same reason: the textarea and the date are seeded from props into state, so
          swapping which session the instance is about without remounting would leave the
          previous one's words in a box now claiming another day. */}
      {logSkill &&
        (() => {
          const sk = skills.find((x) => x.id === logSkill.id);
          if (!sk) return null;
          return (
            <SkillLog
              key={logSkill.session?.id ?? "new"}
              name={sk.name}
              date={date}
              today={today}
              session={logSkill.session}
              recent={sk.recent}
              hue={skillHue(sk.id, skills14)}
              onSave={async (note, day) => {
                await onLogSession(
                  sk.id,
                  note,
                  day,
                  logSkill.session?.id ?? null,
                );
              }}
              onDelete={async () => {
                if (!logSkill.session) return;
                await onDeleteSession(sk.id, logSkill.session.id);
              }}
              onPick={(s) => setLogSkill({ id: sk.id, session: s })}
              onClose={() => setLogSkill(null)}
            />
          );
        })()}
    </div>
  );
}
