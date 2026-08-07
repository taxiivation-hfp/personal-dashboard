"use client";

import { useState } from "react";
import Link from "next/link";
import Ring, { SegmentedRing, toneColor, type RingSegment } from "./PillarRing";
import WorkoutLog, { type Workout } from "./WorkoutLog";
import type { GoalView, SkillView, PillarKey } from "@/lib/queries";
import type { MetricRing, PillarRingView, WorkoutKind } from "@/lib/rings";

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
  colors,
  workouts,
  date,
  onSubgoal,
  onLogTime,
  onUndoTime,
  onSaveWorkout,
  onDeleteWorkout,
}: {
  goals: GoalView[];
  skills: SkillView[];
  rings: PillarRingView[] | null;
  /** Owner-chosen hue per pillar, from the curated palette. */
  colors: Partial<Record<PillarKey, string | null>>;
  workouts: Workout[];
  date: string;
  onSubgoal: (id: number, done: boolean) => Promise<void>;
  onLogTime: (skillId: number, minutes: number) => Promise<void>;
  onUndoTime: (skillId: number) => Promise<void>;
  /** id null = log a NEW session; an id edits that one. */
  onSaveWorkout: (
    kind: WorkoutKind,
    note: string,
    id: number | null,
  ) => Promise<void>;
  onDeleteWorkout: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  /** Which pillar is expanded. One at a time, so the column never outgrows its window. */
  const [open, setOpen] = useState<PillarKey | null>(null);
  const [openSkill, setOpenSkill] = useState<number | null>(null);
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

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col">
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

        // A legend for the donut, and nothing more. Names, never counts: a collapsed pillar
        // is an invitation to open it, not a second place to read the numbers off.
        const legend = ring ? ring.metrics.map((m) => m.label).join(" · ") : "";

        // Three entries in one list rather than three stacked sections: a hairline between
        // pillars is separation enough once each collapses to a single row, and a ruled
        // heading per pillar would put three more rules on a column that now has three
        // headers. The rule sits on the section rather than as `divide-y` on the parent so
        // the workout dialog, a sibling below the loop, never inherits one.
        return (
          <section
            key={pk}
            className="border-t border-[var(--color-line)] first:border-t-0"
          >
            {/* The whole header is the control — a 76px donut beside its name is a large,
                obvious target at 11pm, and a separate chevron would be a smaller one for no
                gain. The heading stays an h2 so the column keeps a document outline. */}
            <h2>
              <button
                onClick={() => setOpen(expanded ? null : pk)}
                aria-expanded={expanded}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-lg px-2 py-3.5 text-left transition-colors hover:bg-[var(--color-panel)]"
              >
                <SegmentedRing
                  segments={segments}
                  outer={outer}
                  size={76}
                  stroke={9}
                  tone={pk}
                  color={colors[pk]}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">
                    {PILLAR_NAME[pk]}
                  </span>
                  {legend && (
                    <span className="mt-1 block text-micro text-[var(--color-muted)]">
                      {legend}
                    </span>
                  )}
                </span>
              </button>
            </h2>

            {expanded && (
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
          onSave={(note) => onSaveWorkout(openLog.kind, note, openLog.id)}
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
