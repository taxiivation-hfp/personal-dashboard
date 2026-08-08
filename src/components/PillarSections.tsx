"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Ring, {
  SegmentedRing,
  toneColor,
  LABEL_PAD_Y,
  type RingSegment,
} from "./PillarRing";
import WorkoutLog, { type Workout } from "./WorkoutLog";
import StatsLink from "./StatsLink";
import type { GoalView, SkillView, PillarKey } from "@/lib/queries";
import {
  pillarCaption,
  type MetricRing,
  type PillarFactInput,
  type PillarRingView,
  type WorkoutKind,
} from "@/lib/rings";

/** 640 -> "10h 40m". Time is shown as time — an abstract number would invite reading it
 *  as a score, which is the one thing this figure is not. */
function asTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const PILLAR_NAME: Record<PillarKey, string> = {
  social_capital: "Social",
  physical: "Physical",
  portfolio: "Portfolio",
};

const ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];

/**
 * Two ring sizes, and they are literal constants rather than a viewport clamp.
 *
 * COLLAPSED the column shows nothing but three rings, so they take the room — 148px, which
 * is still under the 176px adherence hero and must stay so: a pillar ring that matched the
 * hero would claim the same authority, and these are secondary context by construction.
 *
 * OPEN, all three drop to 76px. The ruling was "shrink" rather than "push", and the
 * difference matters: pushing would have sent the third pillar below the fold the moment you
 * opened the first, which is the shape this column was rebuilt to escape.
 *
 * The box change is NOT animated. Transitioning width and height is forbidden outright, and
 * the honest alternative — a FLIP with an inverse scale — needs a measure/invalidate cycle
 * on three SVGs every toggle, on a surface opened dozens of times a day. What DOES animate
 * is the two rings you did not open, which scale to 0.94: that is the shrink you can see,
 * on transform alone.
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
 *     ring = (column height - the record link - three rows of furniture) / 3 - label room
 *
 * Clamped at both ends: below MIN a labelled donut is illegible, above MAX it stops being
 * secondary to the 176px adherence hero, which it must never rival.
 */
/** Matches .motion-exit in globals.css — how long the two you did not choose take to go. */
const FLY_MS = 260;

const RING_MIN = 76;
/** The open ring is big but not unbounded — past this it is a poster, not a chart. */
const OPEN_RING_MAX = 260;
/** Both label pads, so the open ring is measured against the room its labels also need. */
const LABEL_PAD_X_TOTAL = 160;
/** Name, caption and the metric list the open pillar shows beneath its ring. */
const OPEN_RESERVED = 230;
const RING_MAX = 168;
/**
 * Name, caption, gaps and row padding — everything in a collapsed row that is not the SVG.
 *
 * Measured at 28 in the browser and set to 34. A solver that lands exactly on the budget
 * overflows the moment a caption wraps or a font renders a pixel taller, and the failure
 * mode is the scroll this layout exists to prevent. Six pixels of insurance; more than that
 * and the ring pays for cowardice.
 */
const ROW_FURNITURE = 34;
/** The label's vertical room, top and bottom — taken FROM the ring rather than restated,
 *  so the two cannot disagree about how much space a label needs. */
const LABEL_ROOM = LABEL_PAD_Y * 2;
const RING_SMALL = 76;
const RING_STROKE = 9;
const QUICK_ADD = [15, 30, 60];

/** The first line of a note, for a chip that has to fit a 250px column. The line breaks
 *  ARE the log, so the first line is reliably the most identifying thing in it. */
const firstLine = (note: string | null): string =>
  (note ?? "").split(/\r?\n/)[0]!.trim();

const WORKOUTS: { kind: WorkoutKind; label: string }[] = [
  { kind: "strength", label: "Strength" },
  { kind: "cardio", label: "Cardio" },
  { kind: "misc", label: "Misc" },
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
  date,
  onSubgoal,
  onLogTime,
  onUndoTime,
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
  date: string;
  onSubgoal: (id: number, done: boolean) => Promise<void>;
  onLogTime: (skillId: number, minutes: number) => Promise<void>;
  onUndoTime: (skillId: number) => Promise<void>;
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
   * The pillar being opened, while the OTHER TWO are still flying out.
   *
   * Opening is a sequence, not a swap: the two you did not choose leave the window first, and
   * only once they are gone does the one you did take the space they were using. Doing both
   * at once reads as a reflow — three things changing size — where doing it in order reads as
   * two things leaving and one thing arriving, which is what actually happened.
   *
   * Held separately from the open state because during this phase all three are mounted: the
   * leavers need somewhere to fly to, and an unmounted element cannot travel.
   */
  const [leavingFor, setLeavingFor] = useState<PillarKey | null>(null);
  const [openSkill, setOpenSkill] = useState<number | null>(null);

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
   * limit is how wide the window is, not how many rings have to share it. This is the size at
   * which the arced labels finally have arc to sit on — the collapsed ring never will.
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
      const link = el.querySelector("[data-record-link]");
      const linkH = link ? link.getBoundingClientRect().height : 0;
      const budget = box.clientHeight - pad - linkH;
      const per = budget / 3 - ROW_FURNITURE - LABEL_ROOM;
      setRingSize(Math.round(Math.min(RING_MAX, Math.max(RING_MIN, per))));

      // The open ring is bounded by WIDTH: the box is the ring plus a label pad either side,
      // and the column cannot give it more than it has. Also capped by the height left after
      // the name, the caption and the metric list, so a tall thin column cannot produce a ring
      // taller than the window it lives in.
      const w = el.clientWidth - LABEL_PAD_X_TOTAL;
      const h = box.clientHeight - pad - OPEN_RESERVED;
      setOpenRingSize(
        Math.round(Math.max(RING_MIN, Math.min(OPEN_RING_MAX, w, h))),
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

  // Relative to the largest FORTNIGHT figure, so the bars compare where time went
  // recently. No target and no full state — nothing here is completable.
  const maxMinutes = Math.max(1, ...skills.map((s) => s.minutes14));
  const anyRecent = skills.some((s) => s.minutes14 > 0);

  /**
   * Open a pillar: the others leave, then it arrives.
   *
   * FLY_MS matches the .motion-exit transition in globals.css. It is a timeout rather than a
   * transitionend listener on purpose — transitionend does not fire in a hidden tab, and a
   * pillar that never opens because the tab was in the background is a worse bug than a
   * transition that occasionally finishes early.
   */
  const openPillar = (pk: PillarKey) => {
    if (open === pk) {
      setOpen(null);
      return;
    }
    setLeavingFor(pk);
    setTimeout(() => {
      setOpen(pk);
      setLeavingFor(null);
    }, FLY_MS);
  };

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
      className={`flex flex-col ${open ? "lg:min-h-full" : "lg:h-full"}`}
    >
      {ORDER.map((pk) => {
        const ring = rings?.find((r) => r.pillar === pk) ?? null;
        const mine = goals.filter(
          (g) => g.pillar === pk && g.status !== "done",
        );
        const myS = skills.filter((s) => s.pillar === pk);
        const hue = toneColor(pk, colors[pk]);
        const expanded = open === pk;

        // One slice per metric, arc length = weight. Steps carries weight 0 and gets a
        // fixed token slice from SegmentedRing, so a thing that is tracked-but-not-scored
        // still appears on the ring it is deliberately excluded from.
        //
        // Before the fetch lands there is one plain empty slice rather than a dashed one:
        // dashes mean "no source exists", and "not loaded yet" is a different statement.
        const asSegment = (m: MetricRing): RingSegment => ({
          key: m.key,
          label: m.label,
          fill: m.fill,
          weight: m.weight,
          ghost: m.state === "ghost",
          // The count, beside its own arc. This is what the donut was missing: the arcs are
          // all one hue by rule, so nothing but position could ever say which was which, and
          // position says nothing until something is written at it.
          short:
            m.state === "ghost"
              ? "—"
              : m.required != null
                ? `${m.count}/${m.required}`
                : String(m.count),
        });

        const segments: RingSegment[] = ring
          ? ring.metrics.filter((m) => !m.lap).map(asSegment)
          : [
              {
                key: "pending",
                label: PILLAR_NAME[pk],
                fill: null,
                weight: 1,
                ghost: false,
              },
            ];

        // Misc, and anything else with a floor of its own that must not move the pillar's
        // average. Around the donut rather than inside it — see SegmentedRing.
        const outer: RingSegment[] = ring
          ? ring.metrics.filter((m) => m.lap).map(asSegment)
          : [];

        // What the fortnight actually held, in plain words. A RAW count, deliberately not
        // derived from the ring above it: the ring caps at a threshold and this must not, or
        // a fortnight of twenty sessions would print as eight.
        const caption = facts ? pillarCaption(pk, facts) : "";

        // Three entries in one list rather than three stacked sections: a hairline between
        // pillars is separation enough once each collapses to a single row, and a ruled
        // heading per pillar would put three more rules on a column that now has three
        // headers. The rule sits on the section rather than as `divide-y` on the parent so
        // the workout dialog, a sibling below the loop, never inherits one.
        // While one pillar is being opened, the other two are ON THEIR WAY OUT: up if they
        // sit above it, down if below, so the column parts rather than collapsing to a point.
        const flying = leavingFor != null && leavingFor !== pk;
        const goesUp = flying && ORDER.indexOf(pk) < ORDER.indexOf(leavingFor!);

        // Once something is open the other two are gone entirely. Rendering them at zero
        // height would leave their headings in the tab order and their fetches in the tree.
        if (open && !expanded) return null;

        return (
          <section
            key={pk}
            // flex-1 + justify-center is what makes the three rings SPREAD rather than stack
            // at the top with dead space beneath. Slack becomes air inside each third, so the
            // last caption meets the bottom of the column instead of floating halfway up it.
            // Rules appear only once something is open, when the column becomes a list again.
            className={`${
              open
                ? "flex min-h-0 flex-1 flex-col"
                : "flex min-h-0 flex-1 flex-col justify-center"
            } ${flying ? "motion-exit pointer-events-none" : ""}`}
            style={
              flying
                ? {
                    transform: `translateY(${goesUp ? "-160%" : "160%"})`,
                    opacity: 0,
                  }
                : undefined
            }
          >
            {/* The whole header is the control — the donut and its name together are a large,
                obvious target at 11pm, and a separate chevron would be a smaller one for no
                gain. The heading stays an h2 so the column keeps a document outline. */}
            <h2>
              <button
                onClick={() => openPillar(pk)}
                aria-expanded={expanded}
                className={`-mx-2 flex w-[calc(100%+1rem)] rounded-lg px-2 transition-colors hover:bg-[var(--color-panel)] ${
                  expanded
                    ? "flex-col items-center gap-2 py-2 text-center"
                    : "items-center gap-3 py-2 text-left"
                }`}
              >
                {/* OPEN, the ring takes the window: it is the only thing left in the column,
                    so it is drawn at the width the column can actually give it and its labels
                    finally have the arc length to be read on. It arrives rather than resizes —
                    .motion-reveal, after the other two have gone. */}
                <span
                  className={expanded ? "motion-reveal inline-flex" : "inline-flex"}
                >
                  <SegmentedRing
                    segments={segments}
                    outer={outer}
                    size={expanded ? openRingSize : ringSize}
                    stroke={expanded ? RING_STROKE + 3 : RING_STROKE}
                    tone={pk}
                    color={colors[pk]}
                  />
                </span>
                <span
                  className={`min-w-0 ${expanded ? "text-body" : "flex-1 text-small"} font-semibold`}
                >
                  {PILLAR_NAME[pk]}
                </span>
              </button>
            </h2>

            {/* THE CAPTION SITS UNDER THE ROW, not beside the donut.
                Beside it, the caption and the donut's own labels were competing for the same
                ~140px and both lost: "no hours logged past fortnight" wrapped to three lines
                while "Outreach 0/2" was clipped at the box edge. Full width it is one line,
                and the donut gets the room its labels actually need.
                A fixed minimum height so a pillar whose caption has not arrived yet does not
                sit a line higher than the two beside it. */}
            <p
              className={`min-h-[1.35em] text-micro text-[var(--color-muted)] ${
                expanded ? "text-center" : "-mt-1 truncate pl-1"
              }`}
            >
              {caption}
            </p>

            {expanded && (
              // Settles in rather than appearing. The rings shrinking is the gesture; this
              // is the thing they made room for, and it should look like it arrived rather
              // than like it was always there behind them.
              <div className="motion-reveal pb-7">
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
                    {ring.metrics.map((m) => {
                      // Hoisted out of the JSX: TypeScript drops a property narrowing the
                      // moment it crosses into a callback, and the onClick below is one.
                      const kind = m.workoutKind;
                      return (
                        <li
                          key={m.key}
                          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5"
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
                                color={colors[pk]}
                              />
                            )}
                          </span>

                          <span className="min-w-0 flex-1 truncate text-small">
                            {m.label}
                          </span>

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
                          <span className="flex w-full items-baseline gap-1.5 pl-[1.875rem] text-micro tabular-nums text-[var(--color-muted)]">
                            <span>{m.fact}</span>
                            {m.window && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{m.window}</span>
                              </>
                            )}
                          </span>

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
                                      {firstLine(w.note) || `session ${i + 1}`}
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
                  <Link
                    href="/sessions"
                    className="mt-3 inline-flex items-center gap-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                  >
                    every session logged
                    <span aria-hidden>→</span>
                  </Link>
                )}

                {/* Goals keep their own label so a ring-led section never makes goal
                    progress look like ring progress. The quarantine is a data rule; this is
                    its visual counterpart. The percentage hangs in the page margin, which is
                    also where it stops competing with the title for the line. */}
                <div className="mt-6">
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
                  <div className="mt-7">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-micro">Skills</h3>
                      <span className="text-micro text-[var(--color-muted)]">
                        last 14 days
                      </span>
                    </div>

                    {/* The fortnight's time is genuine marginalia — it is a duration, and it
                        fits the margin where the ring facts did not. The owner's own name
                        for the skill sits on the line beside it. */}
                    <ul className="mt-1 divide-y divide-[var(--color-line)]">
                      {myS.map((s) => (
                        <li key={s.id} className="page-margin py-3">
                          <div className="pt-2 text-right text-micro tabular-nums text-[var(--color-muted)]">
                            {asTime(s.minutes14)}
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
                                {asTime(s.minutes)} lifetime
                              </span>
                            </button>

                            {anyRecent && (
                              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
                                <div
                                  className="motion-data h-full w-full origin-left rounded-full"
                                  style={{
                                    transform: `scaleX(${s.minutes14 / maxMinutes})`,
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
                            {openSkill === s.id && (
                              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                {QUICK_ADD.map((min) => (
                                  <button
                                    key={min}
                                    onClick={() =>
                                      run(`st${s.id}`, () =>
                                        onLogTime(s.id, min),
                                      )
                                    }
                                    disabled={busy === `st${s.id}`}
                                    className="rounded-full border border-[var(--color-line-strong)] px-3 py-1.5 text-small tabular-nums transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                                  >
                                    +{min}m
                                  </button>
                                ))}
                                {s.sessions14 > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      run(`st${s.id}`, () => onUndoTime(s.id))
                                    }
                                    disabled={busy === `st${s.id}`}
                                    className="ml-1 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
                                  >
                                    undo
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
          kind={openLog.kind}
          label={WORKOUTS.find((w) => w.kind === openLog.kind)!.label}
          date={date}
          workout={
            openLog.id == null
              ? null
              : (workouts.find((x) => x.id === openLog.id) ?? null)
          }
          hue={toneColor("physical", colors.physical)}
          onSave={(note, day) =>
            onSaveWorkout(openLog.kind, note, openLog.id, day)
          }
          onDelete={() =>
            openLog.id == null
              ? Promise.resolve()
              : onDeleteWorkout(openLog.id)
          }
          onClose={() => setOpenLog(null)}
        />
      )}
    </div>
  );
}
