"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react";
import Link from "next/link";
import Ring, {
  SegmentedRing,
  segmentShade,
  toneColor,
  TONE_HEX,
} from "./PillarRing";
import WorkoutLog, { type Workout } from "./WorkoutLog";
import StepsLog from "./StepsLog";
import StatsLink from "./StatsLink";
import AdherenceTracker from "./AdherenceTracker";
import { addDays } from "@/lib/dates";
import { subtaskLine } from "@/lib/subtasks";
import { sessionTitle } from "@/lib/sessions";
import {
  PILLAR_NAME,
  PILLAR_ORDER,
  type CareerRingView,
  type HealthRingView,
  type PillarKey,
  type WorkoutKind,
} from "@/lib/rings";
import type { GoalView } from "@/lib/queries";
import GoalCount from "./GoalCount";

/** One column of the adherence tracker. Declared here because this is the component that
 *  passes it on; Today.tsx holds the state and AdherenceTracker draws it. */
export type TrackerDay = { date: string; pct: number; isToday: boolean };

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

/** Honours the OS setting for the one gesture here that is driven from JavaScript. The CSS
 *  half is nulled in globals.css; this half has to be asked. */
const wantsMotion = (): boolean =>
  typeof window === "undefined" ||
  typeof window.matchMedia !== "function" ||
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const WORKOUTS: { kind: WorkoutKind; label: string }[] = [
  { kind: "strength", label: "Strength" },
  { kind: "cardio", label: "Cardio" },
];

/**
 * THE RING SIZES ARE WRITTEN DOWN AGAIN, and that is the change.
 *
 * They used to be solved from the column: three labelled donuts stacked vertically could not
 * fit any window whatever the number, so the size came out of a ResizeObserver and two
 * clamps. Two donuts SIDE BY SIDE cost width instead of height, which this window has — and
 * the labels that made the old box wider than the ring are gone, so the SVG's own
 * `maxWidth: 100%` is the whole responsive story now: a 200px ring in a 150px column scales
 * down as one object rather than being re-solved. One less observer, one less feedback loop.
 *
 * 200 CLOSED AND 216 OPENED, BOTH UNDER THE HERO'S 240 — that is the rule, it is about
 * DIAMETER, and it is the one these must never break: spec §1 ("both pillar rings are
 * smaller than the hero adherence ring") and spec §4 ("it stays the largest ring on the
 * screen"). Opened used to be 240 with a 15px stroke, which is the hero's own diameter and
 * half again its weight — so for as long as a pillar was open the hero was neither the
 * largest nor the heaviest ring on screen, and this comment claimed the opposite.
 *
 * 216 is still a clearly visible growth from 200 for the FLIP to travel on. The stroke
 * tracks the ring at about 6% of it, and is deliberately NOT held under the hero's 10: the
 * hero is one continuous band where a pillar is five arcs with gaps between them, and arcs
 * thinner than that stop reading as segments at all. Weight is not the rule; size is.
 */
const RING_CLOSED = 200;
const STROKE_CLOSED = 12;
const RING_OPEN = 216;
const STROKE_OPEN = 13;

/**
 * THE RECENT WINDOW: two pillars, the adherence tracker, and the way through to the record.
 *
 * Health and Career sit side by side, each a segmented donut with its name under it and its
 * parts under the name. Tapping one OPENS it inside this window — the other ring, the
 * tracker and the record link unmount while it is open, and × brings them back (spec §4).
 *
 * Nothing on a closed ring is comparable between the two. A donut shows how much of a
 * pillar's own minimum has been met and caps there — it cannot be improved by doing more, so
 * two donuts side by side are not a league table.
 */
export default function PillarSections({
  health,
  career,
  workouts,
  goals,
  tracker,
  date,
  today,
  onGoals,
  onSaveWorkout,
  onDeleteWorkout,
  onOpenDay,
  onOpenRecord,
}: {
  /** null until /api/rings lands. */
  health: HealthRingView | null;
  /**
   * Derived client-side from `goals` by `buildCareerRing` — never null, and never read from
   * /api/rings on this screen. Ticking a subtask has to move the Career ring without a round
   * trip, and the route runs the same function, so the two can never disagree.
   */
  career: CareerRingView;
  /** Sessions logged ON the viewed day — the Log buttons' chips. */
  workouts: Workout[];
  /** Every non-dropped goal, for Career opened. [] before the first load. */
  goals: GoalView[];
  /** 8 days ending on the REAL today: 7 past, then today. [] until it lands. */
  tracker: TrackerDay[];
  /** The day the dashboard is standing on. */
  date: string;
  /** The real today — the workout dialog's date cap, and the tracker's anchor. */
  today?: string;
  /**
   * EVERY goal write goes through this one wire — Today's `mutateGoals`, which fetches,
   * reads the refreshed `goals` off the reply and sets them, so the Career ring is rebuilt
   * on this client the same beat the list changes. The routes (/api/goals, /api/subgoals)
   * all answer with the whole collection, which is what makes one wire enough.
   */
  onGoals: (url: string, init: RequestInit) => Promise<void>;
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
  /** A tracker dot tapped — the dashboard steps to that day (goToDay). */
  onOpenDay: (date: string) => void;
  /** The record — opens in place on desktop, expands to /stats on the phone. */
  onOpenRecord: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  /** The new-goal form, and each goal's "add a subtask" draft. Controlled, because a
   *  submit has to clear them; the edit fields on existing rows are uncontrolled and save
   *  on blur, the way the old /goals screen's did. */
  const [newGoal, setNewGoal] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newCount, setNewCount] = useState("");
  const [newSub, setNewSub] = useState<Record<number, string>>({});
  /** Which pillar is expanded. One at a time, so the column never outgrows its window. */
  const [open, setOpen] = useState<PillarKey | null>(null);
  /** The steps trend, raised from the Steps part row. A DIALOG rather than the inline
   *  drill-down the session rows use: behind steps is a series, and a chart does not belong
   *  in a column squeezed under its own label. */
  const [stepsOpen, setStepsOpen] = useState(false);
  /** Which session the log dialog is on. `id: null` opens a NEW one — the whole point of
   *  logging per session rather than per day is that a second lift on a Tuesday is a second
   *  session, so the Log button must never reopen the first. */
  const [openLog, setOpenLog] = useState<{
    kind: WorkoutKind;
    id: number | null;
  } | null>(null);
  /**
   * Which part row is opened into its fortnight — the sessions behind "2 of 8". One at a
   * time, because two open lists in this column is a page, and closed is the resting state
   * the count already serves.
   */
  const [openPart, setOpenPart] = useState<string | null>(null);
  /** The kick counter per pillar — each open buys the clicked ring one fast turn. */
  const [kick, setKick] = useState<{ pillar: PillarKey | null; n: number }>({
    pillar: null,
    n: 0,
  });

  /**
   * THE FLIP, and everything it needs to survive one commit.
   *
   * `flip` is written synchronously in the click handler and read once in the layout effect
   * below. A ref rather than state on purpose: it must be readable in the SAME commit that
   * changes the layout, and a state update would schedule another render after the move it is
   * supposed to describe had already been painted.
   *
   * TWO rectangles, not three: the ring and the name. The caption block was the third and the
   * caption is gone (`pillarCaption` went with the three-pillar column) — the parts list that
   * replaced it is not a shared element, because the closed and open lists are different
   * lists rather than one list in two places.
   *
   * No `fromSize` any more either. The ring's BOX used to be the diameter plus a constant
   * label pad on each side, so the two boxes had different aspect ratios and a width ratio
   * landed the circle ~60% too large on frame one. With the labels gone the box IS the
   * diameter, and the plain width ratio is the scale.
   */
  const flip = useRef<{
    pillar: PillarKey;
    rects: { ring: DOMRect | null; name: DOMRect | null };
  } | null>(null);
  /** The ring boxes and the name nodes, by pillar, so the FLIP can find what it measured. */
  const ringRefs = useRef(new Map<PillarKey, HTMLSpanElement>());
  const nameRefs = useRef(new Map<PillarKey, HTMLElement>());

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
   * The cached log after a write, because a session can be opened FROM it.
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

  /**
   * Toggle a pillar. The ring's rectangle is taken HERE, while the old layout is still on
   * screen and still measurable, and handed to the layout effect below; the layout effect
   * measures where it landed and releases the difference, so the ring travels rather than
   * two rings swapping.
   */
  const openPillar = (pk: PillarKey) => {
    const next = open === pk ? null : pk;

    // FIRST, in FLIP's sense: where the shared elements are right now. Both directions use
    // the pillar being TOUCHED — opening, the small donut and its name; closing, the big
    // ones about to become them again.
    flip.current = {
      pillar: pk,
      rects: {
        ring: ringRefs.current.get(pk)?.getBoundingClientRect() ?? null,
        name: nameRefs.current.get(pk)?.getBoundingClientRect() ?? null,
      },
    };

    // The flourish: one fast turn for the ring that was chosen. Opening only — a closing
    // ring is the system getting out of the way, and the way out never performs.
    if (next != null) setKick((k) => ({ pillar: pk, n: k.n + 1 }));
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
   *
   * The node does not have to be the SAME node it was before the toggle — the closed and open
   * layouts are different subtrees, so it is not. FLIP never needed one: what it needs is the
   * old rectangle, which was taken in the handler, and the new one, which is read here. React
   * detaches the old refs in the mutation phase and attaches the new ones before layout
   * effects run, so these maps already hold the nodes that were just mounted.
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
        const scale = fromRing.width / to.width;
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

    // The name: same type size in both layouts, so this is a pure translate — one "Health"
    // sliding from under a small donut to under a large one, not two strings swapped.
    const nameNode = nameRefs.current.get(pending.pillar);
    const fromName = pending.rects.name;
    if (nameNode && fromName && fromName.width) {
      const to = nameNode.getBoundingClientRect();
      if (to.width) {
        const dx = fromName.left + fromName.width / 2 - (to.left + to.width / 2);
        const dy = fromName.top + fromName.height / 2 - (to.top + to.height / 2);
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1)
          release(nameNode, `translate(${dx}px, ${dy}px)`);
      }
    }
  }, [open]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  /** One goal write: `key` names what is busy, `body` is JSON. */
  const goalWrite = (
    key: string,
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ) =>
    run(key, () =>
      onGoals(url, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  const ringOf = (pk: PillarKey): HealthRingView | CareerRingView | null =>
    pk === "physical" ? health : career;

  /** Career with nothing to measure — no calendar AND no goal that can be late — is an
   *  empty DASHED ghost, and the centre says "no goals" rather than "0%" (spec §1). Health
   *  never ghosts as a whole — a null fill there means the fetch has not landed, which is a
   *  different statement and draws a plain track. */
  const isGhost = (pk: PillarKey, ring: HealthRingView | CareerRingView | null) =>
    pk === "portfolio" && ring?.fill == null;

  const centreOf = (pk: PillarKey, ring: HealthRingView | CareerRingView | null) =>
    isGhost(pk, ring) ? (
      <span className="text-small text-[var(--color-muted)]">no goals</span>
    ) : ring == null ? (
      // The fetch has not landed. A plain empty track and no numeral — printing "0%" for a
      // fortnight nobody has read yet is the one thing a ring here must never do.
      null
    ) : (
      <span className="stat-hero text-heading">
        {Math.round((ring.fill ?? 0) * 100)}%
      </span>
    );

  const setRingRef = (pk: PillarKey) => (el: HTMLSpanElement | null) => {
    if (el) ringRefs.current.set(pk, el);
    else ringRefs.current.delete(pk);
  };
  const setNameRef = (pk: PillarKey) => (el: HTMLSpanElement | null) => {
    if (el) nameRefs.current.set(pk, el);
    else nameRefs.current.delete(pk);
  };

  /**
   * A CLOSED PILLAR: the donut, its name, and its parts listed under the name.
   *
   * A render FUNCTION rather than a nested component, deliberately. A component declared
   * inside this one is a new type on every render, so React would unmount and remount its
   * whole subtree every time anything changed — which would restart the ring's spin loop
   * sixty times a minute and break the kick counter's "seen" ref.
   */
  const pillarBlock = (pk: PillarKey) => {
    const ring = ringOf(pk);
    return (
      <button
        key={pk}
        onClick={() => openPillar(pk)}
        aria-expanded={false}
        className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-1 py-1"
      >
        {/* `max-w-full` is load-bearing, not tidying. SegmentedRing caps itself at
            `maxWidth: 100%` so a 200px ring scales down in a narrower column — but a
            percentage resolves against THIS span, and an `inline-flex` span shrink-wraps
            to its content, so without a cap here the span was 200px, the cap read 200px,
            and the two rings overlapped each other on a 390px phone. Capped, the span is
            min(ring, column) and the ring scales as one object, which is what the box
            being exactly size × size was for. */}
        <span ref={setRingRef(pk)} className="ring-flip inline-flex max-w-full">
          <SegmentedRing
            arcs={ring?.arcs ?? []}
            ghost={isGhost(pk, ring)}
            size={RING_CLOSED}
            stroke={STROKE_CLOSED}
            tone={pk}
            // The pillar's own lamp, in both layouts. Constant — see `glow` and The One
            // Lamp Rule; it carries the hue and never the fill.
            glow
            // Alive at rest, slowed under the pointer, one fast turn when chosen.
            spin
            kick={kick.pillar === pk ? kick.n : 0}
          >
            {centreOf(pk, ring)}
          </SegmentedRing>
        </span>

        <span
          ref={setNameRef(pk)}
          className="ring-flip block text-body font-semibold"
        >
          {PILLAR_NAME[pk]}
        </span>

        {/* THE PARTS, under the name. This is what the arc labels used to be — names riding
            their own arcs, fanned apart so they did not collide. A list says the same thing
            with the real number beside it and costs no geometry.
            SPANS, not ul/li: a button's content model is phrasing content, and the whole
            block IS the button (the donut and its name together are a large, obvious target
            at 11pm, and a separate chevron would be a smaller one for no gain). This is the
            same reason the text column beside the old collapsed donut was spans.

            HEALTH ONLY. CAREER PRINTS NOTHING HERE — the owner's ruling, 2026-09-22,
            removing the line-per-goal this used to draw.

            The two are not symmetrical and should not be: FIVE PARTS IS WHAT HEALTH IS.
            That list is a definition — the same five rows whatever the fortnight held, so a
            column can be sized for it and it never grows. A goal list is a BACKLOG, and a
            backlog is unbounded by nature: the career roadmap put nine dated goals in the
            ring and eighteen lines of them shoved the adherence tracker and the record link
            off the bottom of a window that is not allowed to scroll at rest. A list that
            breaks the layout at some number of goals was only ever working by accident.

            Nothing replaces it, not even a count: the ring's centre already prints the
            figure, and the goals themselves are one tap away in the drill-down. */}
        <span className="block w-full text-center">
          {ring?.key === "physical"
            ? ring.arcs.map((a) => (
                <span
                  key={a.key}
                  className="block text-micro tabular-nums text-[var(--color-muted)]"
                >
                  {/* A ghost part has no source to print. An em dash, never "0" — a broken
                      wire is not a fortnight of nothing. */}
                  {a.label} {a.fill == null ? "—" : a.fact}
                </span>
              ))
            : null}
        </span>
      </button>
    );
  };

  /** HEALTH opened: the five parts as rows, each with its own marker in its own arc's
   *  shade, the Log buttons, the fortnight drill-down and today's session chips. */
  const healthBody = () => {
    if (!health) return null;
    return (
      <>
        <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
          {health.arcs.map((arc, i) => {
            // Hoisted out of the JSX: TypeScript drops a property narrowing the moment it
            // crosses into a callback, and the onClick below is one.
            const kind = arc.workoutKind;
            const drilled = Boolean(kind) && openPart === arc.key;
            /**
             * STEPS OPENS ITS CHART, by the owner's ruling — and it is the one part here
             * whose fortnight is a SERIES rather than a list of things that happened. A
             * list of fourteen numbers would answer "how many" and not "what has the week
             * looked like", which is the only question worth asking of a step count. So it
             * raises the same StepsLog dialog the checklist row does: one chart, two ways in.
             */
            const opensChart = arc.key === "steps";
            // The fortnight behind the count, resolved here so the list below is pure
            // rendering. null = still loading.
            const fortnight =
              !drilled || !kind
                ? null
                : gymLog == null
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
                        title: sessionTitle(s) || "untitled session",
                        id: s.id,
                      }));

            return (
              <li
                key={arc.key}
                className="detail-enter flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5"
                style={
                  { "--enter-delay": `${(i + 1) * 45}ms` } as CSSProperties
                }
              >
                {/* THE ROW MARKER WEARS ITS OWN ARC'S COLOUR — resolved through the SAME
                    `segmentShade` the donut strokes with, at the same index, off the same
                    base. A legend that computes its own shades is a legend that eventually
                    disagrees with the chart. */}
                <span className="flex w-5 shrink-0 items-center justify-center">
                  <Ring
                    fill={arc.fill}
                    dashed={arc.fill == null}
                    size={18}
                    stroke={2.5}
                    tone="physical"
                    color={segmentShade(TONE_HEX.physical, i)}
                  />
                </span>

                {/* The NAME is the way into the fortnight behind the count. A button only
                    where there is something to open; elsewhere a plain span rather than a
                    dead control. */}
                {opensChart ? (
                  /* No ▸ — that mark means "this opens BELOW", and this opens a dialog. A
                     control that promises the wrong gesture is worse than one that
                     promises none. */
                  <button
                    onClick={() => setStepsOpen(true)}
                    aria-haspopup="dialog"
                    className="min-w-0 flex-1 truncate text-left text-small underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:decoration-[var(--color-line-strong)]"
                  >
                    {arc.label}
                  </button>
                ) : kind ? (
                  <button
                    onClick={() => {
                      wantGymLog();
                      setOpenPart(drilled ? null : arc.key);
                    }}
                    aria-expanded={drilled}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-small"
                  >
                    <span className="min-w-0 truncate">{arc.label}</span>
                    <span
                      aria-hidden
                      className={`shrink-0 text-micro text-[var(--color-muted)] transition-transform ${drilled ? "rotate-90" : ""}`}
                    >
                      ▸
                    </span>
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-small">
                    {arc.label}
                  </span>
                )}

                {/* An ACTION, not a state display — so it never fills in and never becomes
                    a checkbox. What was logged is already stated by the count on the line
                    below; a filled pill here would say it twice and turn a workout into
                    something you tick off. */}
                {kind && (
                  <button
                    onClick={() => setOpenLog({ kind, id: null })}
                    aria-haspopup="dialog"
                    aria-label={`Log ${arc.label}`}
                    className="shrink-0 rounded-full border border-[var(--color-line-strong)] px-2.5 py-1 text-micro transition-colors hover:bg-[var(--color-panel)]"
                  >
                    Log
                  </button>
                )}

                {/* Wraps to its own line, indented to the LABEL rather than the ring: the
                    fact belongs to the name above it. No "day x of 14" — the window SLIDES,
                    so there is no edge to cram against and nothing to wait for. */}
                <span className="w-full pl-[1.875rem] text-micro tabular-nums text-[var(--color-muted)]">
                  {arc.fact}
                </span>

                {/* THE FORTNIGHT BEHIND THE COUNT: each session by its first line, dated. A
                    record, not a score — nothing ranked, and the titles take the serif
                    because they are the owner's own words. */}
                {/* `kind` is redundant with `drilled` and is here for the narrowing: a
                    property narrowing is dropped the moment it crosses into a callback, and
                    the button below has one. */}
                {drilled && kind && (
                  <span className="w-full pl-[1.875rem]">
                    {fortnight == null ? (
                      <span className="block py-1 text-micro text-[var(--color-muted)]">
                        Loading…
                      </span>
                    ) : fortnight.length === 0 ? (
                      <span className="block py-1 text-micro text-[var(--color-muted)]">
                        Nothing this fortnight.
                      </span>
                    ) : (
                      <span className="block">
                        {fortnight.map((f) => (
                          /* THE TITLE IS THE WAY IN. A list of the fortnight's sessions
                             that you cannot open is a list you read and then go looking
                             for the real thing.
                             The width is NOT folded into the shared class, deliberately: a
                             bleeding row needs `-mx-1` paired with an explicit
                             `calc(100% + 0.5rem)` — with a plain `w-full` the box is
                             over-constrained, CSS discards the right margin in LTR, and the
                             row slides 4px left instead of growing 4px each side. */
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setOpenLog({ kind, id: f.id })}
                            aria-haspopup="dialog"
                            className="-mx-1 flex w-[calc(100%+0.5rem)] items-baseline gap-2 rounded border-t border-[var(--color-line)] px-1 py-1.5 text-left transition-colors first:border-t-0 hover:bg-[var(--color-panel)]"
                          >
                            <span className="w-16 shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                              {shortDay(f.date)}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-serif text-small">
                              {f.title}
                            </span>
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                )}

                {/* Today's sessions of this kind, one chip each, so a second lift is a
                    second thing you can open rather than the first one silently
                    overwritten. Labelled by the note's first line because that is what the
                    owner will recognise — a numbered chip is a thing you have to open to
                    identify. */}
                {kind && (
                  <ul className="flex w-full flex-wrap gap-1.5 pl-[1.875rem]">
                    {workouts
                      .filter((w) => w.kind === kind)
                      .map((w, wi) => (
                        <li key={w.id}>
                          <button
                            onClick={() => setOpenLog({ kind, id: w.id })}
                            aria-haspopup="dialog"
                            className="max-w-[11rem] truncate rounded-full border border-[var(--color-line)] px-2 py-0.5 text-micro text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
                          >
                            {sessionTitle(w) || `session ${wi + 1}`}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {/* The whole gym log, from the pillar that owns it. It was reachable only from
            inside the log dialog, which meant you had to be writing a session to go and
            read the old ones. */}
        <div
          className="detail-enter"
          style={
            {
              "--enter-delay": `${(health.arcs.length + 1) * 45}ms`,
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
      </>
    );
  };

  /** The field style every edit-in-place input here shares: the rule is invisible until
   *  focus, because a column of resting underlines would turn the list back into a form. */
  const FIELD =
    "min-w-0 border-b border-transparent bg-transparent pb-0.5 outline-none transition-colors focus:border-[var(--color-accent)]";
  /** A field whose rule is always drawn: the ones that hold a SETTING (a date, a weight)
   *  rather than the owner's own words. */
  const SETTING =
    "border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-micro tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]";
  const LINK_BTN =
    "shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40";

  /**
   * CAREER opened: the goals, EDITED IN PLACE. The /goals screen is gone (the owner's
   * ruling, 2026-10-15) and everything it did lives here: title, deadline, mark done, drop,
   * the subtasks with their weights, a new goal, and the finished ones with "reopen".
   *
   * EVERY GOAL IS A CAREER GOAL since the Health & Career pivot, so there is no pillar
   * picker. Weights: blank means AUTO — the subtask takes an equal share of whatever the
   * explicit ones leave behind (goals.ts) — and the auto share is shown as the field's
   * placeholder, so the column of numbers is always the real split. Progress has no field:
   * it is derived from the ticks, and letting it be typed is what let the stored column
   * drift from the subtasks that define it.
   *
   * The RING counts only the active goals with a deadline or a dated subtask — something
   * that can be late (career.ts). The LIST shows every active goal, because a goal with no
   * date is still a goal you are working on. An empty date field CLEARS a date (the routes
   * read "" as null), which is how a goal or a subtask stops being able to fail.
   *
   * THE HOURS HALF leads the list: the fortnight's Work Projects hours against the 48 that
   * fill it, from the same arc the donut draws. Each goal's line under its figure is its
   * arc's own fact — "on time", "on pace", or "late · item · Nd" — so the list and the
   * donut cannot disagree about why a slice is empty.
   */
  const careerBody = () => {
    const active = goals.filter((g) => g.status === "active");
    const finished = goals.filter((g) => g.status === "done");
    const hoursArc = career.arcs.find((a) => a.key === "hours");
    const arcOf = (goalId: number) =>
      career.arcs.find((a) => a.goalId === goalId) ?? null;

    /** Save a text field on blur — only if it changed and is not blank. */
    const saveTitle = (key: string, url: string, was: string) =>
      (e: FocusEvent<HTMLInputElement>) => {
        const v = e.target.value.trim();
        if (v && v !== was) void goalWrite(key, url, "PATCH", { title: v });
      };

    return (
      <>
        {/* The hours half, as a row of the same shape as a Health part: the marker in the
            arc's shade, the name, the real number. A ghost prints a dash — nobody measured. */}
        {hoursArc && (
          <div className="detail-enter flex items-center gap-x-2.5 border-t border-[var(--color-line)] py-2.5">
            <span className="flex w-5 shrink-0 items-center justify-center">
              <Ring
                fill={hoursArc.fill}
                dashed={hoursArc.fill == null}
                size={18}
                stroke={2.5}
                tone="portfolio"
                color={segmentShade(TONE_HEX.portfolio, 0)}
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-small">
              {hoursArc.label}
            </span>
            <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
              {hoursArc.fact}
            </span>
          </div>
        )}

        <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
          {active.map((g, i) => (
            <li
              key={g.id}
              className="detail-enter py-3"
              style={{ "--enter-delay": `${(i + 2) * 45}ms` } as CSSProperties}
            >
              {/* The owner's own title, serif, in the field it is edited in. */}
              <input
                defaultValue={g.title}
                aria-label="Goal title"
                onBlur={saveTitle(`gt${g.id}`, `/api/goals/${g.id}`, g.title)}
                className={`${FIELD} w-full font-serif text-body`}
              />

              {/* The deadline, the figure and the two decisions, on one muted line.
                  The date field is KEYED BY THE STORED VALUE: it is uncontrolled, and a
                  date the server normalised or refused would otherwise sit on screen as
                  if it had been saved. */}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-[var(--color-muted)]">
                <label className="flex items-center gap-1.5">
                  due
                  <input
                    key={`${g.id}-${g.deadline ?? ""}`}
                    type="date"
                    defaultValue={g.deadline ?? ""}
                    aria-label={`Deadline for ${g.title}`}
                    onBlur={(e) =>
                      (e.target.value || null) !== g.deadline &&
                      goalWrite(`gd${g.id}`, `/api/goals/${g.id}`, "PATCH", {
                        deadline: e.target.value || null,
                      })
                    }
                    className={SETTING}
                  />
                </label>
                <span className="tabular-nums">
                  {Math.round(g.progress * 100)}%
                </span>
                {/* The arc's own line, or why there is no arc. */}
                <span className="min-w-0 truncate">
                  · {arcOf(g.id)?.fact ?? "no dates"}
                </span>
                <span className="ml-auto flex items-center gap-3">
                  {/* Marking done is the OWNER's call — goals are never auto-completed
                      at 100%. The goal moves to the finished list below. */}
                  <button
                    type="button"
                    onClick={() =>
                      goalWrite(`gs${g.id}`, `/api/goals/${g.id}`, "PATCH", {
                        status: "done",
                      })
                    }
                    disabled={busy === `gs${g.id}`}
                    className={LINK_BTN}
                  >
                    mark done
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      confirm(`Drop "${g.title}"? Its subtasks are kept.`) &&
                      goalWrite(`gx${g.id}`, `/api/goals/${g.id}`, "DELETE")
                    }
                    disabled={busy === `gx${g.id}`}
                    className={LINK_BTN}
                  >
                    drop
                  </button>
                </span>
              </div>

              {/* The track is a rule, not a recessed slab: --color-panel-2 sits two points
                  off the page and the bar would lose its ground entirely.
                  scaleX, not width: transform is composited and skips layout. */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
                <div
                  className="motion-data h-full w-full origin-left rounded-full bg-[var(--color-accent)]"
                  style={{ transform: `scaleX(${g.progress})` }}
                />
              </div>

              {/* A COUNTED goal steps where a checklist would tick. Exclusive by rule
                  (goals.ts), so the card keeps one shape either way. */}
              {g.count ? (
                <GoalCount
                  done={g.count.done}
                  target={g.count.target}
                  busy={busy === `gc${g.id}`}
                  label={g.title}
                  onSet={(n) =>
                    goalWrite(`gc${g.id}`, `/api/goals/${g.id}`, "PATCH", {
                      count: n,
                    })
                  }
                />
              ) : (
                <>
                  <ul className="mt-2">
                    {g.subgoals.map((sg) => (
                      <li key={sg.id} className="py-1">
                        <div className="flex items-center gap-2">
                          {/* The tick is its own button, so the title beside it can be a
                              field — a control inside a control is not a thing. The tick
                              belongs to the day on screen (subtasks.ts, done_on). */}
                          <button
                            type="button"
                            onClick={() =>
                              goalWrite(
                                `sg${sg.id}`,
                                `/api/subgoals/${sg.id}`,
                                "PATCH",
                                { done: !sg.done, date },
                              )
                            }
                            aria-pressed={sg.done}
                            aria-label={`${sg.done ? "Untick" : "Tick"} ${sg.title}`}
                            disabled={busy === `sg${sg.id}`}
                            className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                          >
                            <span
                              aria-hidden
                              className="h-3.5 w-3.5 rounded-[4px] transition-colors"
                              style={
                                sg.done
                                  ? { background: "var(--color-accent)" }
                                  : { border: "1px solid var(--color-line-strong)" }
                              }
                            />
                          </button>
                          <input
                            defaultValue={sg.title}
                            aria-label="Subtask title"
                            onBlur={saveTitle(
                              `st${sg.id}`,
                              `/api/subgoals/${sg.id}`,
                              sg.title,
                            )}
                            className={`${FIELD} flex-1 font-serif text-small ${
                              sg.done ? "text-[var(--color-muted)]" : ""
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              confirm(`Delete "${sg.title}"?`) &&
                              goalWrite(
                                `sx${sg.id}`,
                                `/api/subgoals/${sg.id}`,
                                "DELETE",
                              )
                            }
                            disabled={busy === `sx${sg.id}`}
                            aria-label={`Delete ${sg.title}`}
                            className="shrink-0 px-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
                          >
                            ×
                          </button>
                        </div>

                        {/* ITS SETTINGS, on a line of their own under the title: the date
                            that makes it float and lets it be late, the weight, and where
                            it stands against the date. Both fields are KEYED BY THE STORED
                            VALUE for the reason the goal's date field is. Blank weight is
                            auto, and the placeholder prints what auto currently comes to. */}
                        <div className="ml-7 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-[var(--color-muted)]">
                          <label className="flex items-center gap-1.5">
                            due
                            <input
                              key={`${sg.id}-${sg.due ?? ""}`}
                              type="date"
                              defaultValue={sg.due ?? ""}
                              aria-label={`Date for ${sg.title}`}
                              onBlur={(e) =>
                                (e.target.value || null) !== sg.due &&
                                goalWrite(
                                  `sd${sg.id}`,
                                  `/api/subgoals/${sg.id}`,
                                  "PATCH",
                                  { due: e.target.value || null },
                                )
                              }
                              className={SETTING}
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              key={`${sg.id}-${sg.weight}`}
                              type="number"
                              min={0}
                              max={100}
                              placeholder={String(Math.round(sg.effectiveWeight * 100))}
                              aria-label={`Weight for ${sg.title}, percent, blank for auto`}
                              defaultValue={
                                sg.weight > 0 ? Math.round(sg.weight * 100) : ""
                              }
                              onBlur={(e) => {
                                const w =
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value) / 100;
                                if (w !== sg.weight)
                                  void goalWrite(
                                    `sw${sg.id}`,
                                    `/api/subgoals/${sg.id}`,
                                    "PATCH",
                                    { weight: w },
                                  );
                              }}
                              className={`${SETTING} w-9 text-right`}
                            />
                            %
                          </label>
                          {subtaskLine(sg, date) && (
                            <span className="tabular-nums">{subtaskLine(sg, date)}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Fires only when explicit overrides exceed 100% — an all-auto goal is
                      well-formed and must never warn. */}
                  {g.overAllocated && (
                    <p className="mt-1 text-micro text-[var(--color-muted)]">
                      set weights total more than 100%
                    </p>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const t = (newSub[g.id] ?? "").trim();
                      if (!t) return;
                      setNewSub({ ...newSub, [g.id]: "" });
                      void goalWrite(`sn${g.id}`, "/api/subgoals", "POST", {
                        goal_id: g.id,
                        title: t,
                      });
                    }}
                    className="mt-1.5"
                  >
                    <input
                      value={newSub[g.id] ?? ""}
                      onChange={(e) =>
                        setNewSub({ ...newSub, [g.id]: e.target.value })
                      }
                      placeholder="Add a subtask"
                      aria-label={`Add a subtask to ${g.title}`}
                      className={`${FIELD} w-full font-serif text-small placeholder:text-[var(--color-muted)]`}
                    />
                  </form>
                </>
              )}
            </li>
          ))}

          {active.length === 0 && (
            <li className="py-3 text-small text-[var(--color-muted)]">
              Nothing in flight.
            </li>
          )}
        </ul>

        {/* A NEW GOAL. Serif, because what gets typed here is a goal title — the same
            words that render serif the moment they are saved. The deadline and the count
            beside it are the app's own vocabulary, so they stay sans. All three clear on
            the one submit: a date left standing behind a title that has gone would quietly
            become the next goal's deadline. "of" is how many items a COUNTED goal has;
            blank means the goal takes subtasks instead, hence a dash and never a 0.

            THE "add" BUTTON IS LOAD-BEARING, not a convenience. A form with more than one
            text-like field and no submit button has no implicit submission — Enter in the
            title does nothing — so without it this form could not be sent at all. The
            subtask form below each goal is one field and submits on Enter without one. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = newGoal.trim();
            if (!t) return;
            setNewGoal("");
            setNewDeadline("");
            setNewCount("");
            void goalWrite("gn", "/api/goals", "POST", {
              title: t,
              deadline: newDeadline || null,
              targetCount: newCount === "" ? null : Number(newCount),
            });
          }}
          className="detail-enter mt-4"
          style={
            { "--enter-delay": `${(active.length + 1) * 45}ms` } as CSSProperties
          }
        >
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="New goal"
            aria-label="New goal"
            className={`${SETTING} w-full font-serif text-body tabular-nums`}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-[var(--color-muted)]">
            <label className="flex items-center gap-1.5">
              due
              <input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                className={SETTING}
              />
            </label>
            <label className="flex items-center gap-1.5">
              of
              <input
                type="number"
                min={1}
                value={newCount}
                onChange={(e) => setNewCount(e.target.value)}
                placeholder="—"
                aria-label="How many items, for a counted goal"
                className={`${SETTING} w-12`}
              />
            </label>
            <button
              type="submit"
              disabled={!newGoal.trim() || busy === "gn"}
              className="ml-auto shrink-0 rounded-full border border-[var(--color-line-strong)] px-2.5 py-1 text-micro transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
            >
              add
            </button>
          </div>
        </form>

        {/* THE FINISHED ONES, kept in sight: the surface that writes goals must not be
            the surface that loses them. Reopening clears completed_at server-side. A goal
            finished before the stamp existed is undated — an undated fact, not a missing
            one. Dropped goals are gone from every list, as before. */}
        {finished.length > 0 && (
          <div
            className="detail-enter mt-5"
            style={
              { "--enter-delay": `${(active.length + 2) * 45}ms` } as CSSProperties
            }
          >
            <div className="section-head">
              <h3 className="text-micro font-semibold">Finished</h3>
            </div>
            <ul className="divide-y divide-[var(--color-line)]">
              {finished.map((g) => (
                <li key={g.id} className="flex items-baseline gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-serif text-small text-[var(--color-muted)]">
                    {g.title}
                  </span>
                  <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                    {g.completedAt ? shortDay(g.completedAt) : "done"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      goalWrite(`gs${g.id}`, `/api/goals/${g.id}`, "PATCH", {
                        status: "active",
                      })
                    }
                    disabled={busy === `gs${g.id}`}
                    className={LINK_BTN}
                  >
                    reopen
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  };

  /** AN OPENED PILLAR. The other ring, the tracker and the record link are simply not
   *  rendered — spec §4: they hide while a pillar is open, and × returns. */
  const opened = (pk: PillarKey) => {
    const ring = ringOf(pk);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* THE WAY BACK, and it arrives WITH the detail rather than before it — same
            entrance, first in the stagger, so nothing on this surface simply appears. An ×
            because this is a window you opened, matching every other window in the app. */}
        <div className="detail-enter flex justify-end">
          <button
            // Through openPillar, not setOpen: this is the same toggle the ring is, so it
            // has to take the same measurement. Calling setOpen directly would leave the
            // FLIP with nothing to release and the big donut would snap back to a small one.
            onClick={() => openPillar(pk)}
            aria-label="Back to both pillars"
            className="-mr-1 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >
            ×
          </button>
        </div>

        <button
          onClick={() => openPillar(pk)}
          aria-expanded
          className="flex flex-col items-center gap-2"
        >
          {/* Same cap as the closed layout, for the same reason: the opened ring is 240px
              and the phone's pane is narrower than that once padding is taken. */}
          <span ref={setRingRef(pk)} className="ring-flip inline-flex max-w-full">
            <SegmentedRing
              arcs={ring?.arcs ?? []}
              ghost={isGhost(pk, ring)}
              size={RING_OPEN}
              stroke={STROKE_OPEN}
              tone={pk}
              glow
              spin
              kick={kick.pillar === pk ? kick.n : 0}
            >
              {centreOf(pk, ring)}
            </SegmentedRing>
          </span>
          <span
            ref={setNameRef(pk)}
            className="ring-flip block text-body font-semibold"
          >
            {PILLAR_NAME[pk]}
          </span>
        </button>

        {/* The one thing in this app allowed to scroll at rest-plus-one-tap: it is a window
            you opened, and the detail is what you came for. */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-6">
          {pk === "physical" ? healthBody() : careerBody()}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {open == null ? (
        <>
          {/* Order comes from PILLAR_ORDER so this screen and the record cannot disagree
              about which pillar leads. items-start, not stretch: the two part lists are
              different lengths and stretching would centre the shorter ring against the
              taller column. */}
          <div className="flex items-start justify-center gap-5">
            {PILLAR_ORDER.map((pk) => pillarBlock(pk))}
          </div>

          <AdherenceTracker days={tracker} viewing={date} onDay={onOpenDay} />

          {/* mt-auto pins the record link to the foot of the window: the rings and the
              tracker take what they need and the slack goes between them and this. */}
          <div className="mt-auto">
            <StatsLink onOpen={onOpenRecord} />
          </div>
        </>
      ) : (
        opened(open)
      )}

      {/* Mounted outside the branch: a dialog is not part of the row that opened it, and
          hanging it off an expanded pillar's body would unmount it the moment anything
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
              : // TODAY'S FIRST, THEN THE WHOLE LOG. The chips under a part are today's
                // sessions and resolve from `workouts`; the drill-down list is the
                // fortnight and resolves from `gymLog`. Looking only in the first would
                // hand the dialog a null for every session older than this morning — which
                // reads as "write a new one" and is how you lose an old session by
                // clicking on it.
                (workouts.find((x) => x.id === openLog.id) ??
                gymLog?.find((x) => x.id === openLog.id) ??
                null)
          }
          hue={toneColor("physical")}
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

      {/* The steps trend, raised from the Steps part row. Mounted only while open, so its
          series fetch never runs behind a closed pillar. */}
      {stepsOpen && <StepsLog date={date} onClose={() => setStepsOpen(false)} />}
    </div>
  );
}
