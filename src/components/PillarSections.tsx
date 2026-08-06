"use client";

import { useState } from "react";
import Link from "next/link";
import Ring, { toneColor } from "./PillarRing";
import WorkoutLog, { type Workout } from "./WorkoutLog";
import type { GoalView, SkillView, PillarKey } from "@/lib/queries";
import type { PillarRingView, WorkoutKind } from "@/lib/rings";

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

const WORKOUTS: { kind: WorkoutKind; label: string }[] = [
  { kind: "strength", label: "Strength" },
  { kind: "cardio", label: "Cardio" },
  { kind: "misc", label: "Misc" },
];

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
  onSaveWorkout: (kind: WorkoutKind, note: string) => Promise<void>;
  onDeleteWorkout: (kind: WorkoutKind) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [mins, setMins] = useState<Record<number, string>>({});
  const [openLog, setOpenLog] = useState<WorkoutKind | null>(null);

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
    <div className="flex flex-col gap-12">
      {ORDER.map((pk) => {
        const ring = rings?.find((r) => r.pillar === pk) ?? null;
        const mine = goals.filter((g) => g.pillar === pk && g.status !== "done");
        const myS = skills.filter((s) => s.pillar === pk);
        // A pillar with one metric shows its fact line on the parent; several metrics and
        // the subrings carry their own, because an averaged pillar has no single fact.
        const subrings = ring && ring.metrics.length > 1 ? ring.metrics : [];
        const soleFact = ring && ring.metrics.length === 1 ? ring.metrics[0].fact : null;
        const hue = toneColor(pk, colors[pk]);

        return (
          <section key={pk}>
            {/* The pillar name is the only ruled heading in the section. Goals, Skills and
                the workout chips sit under it as quiet labels rather than three more heads
                on three more rules — in a column this narrow that many rules stop reading
                as structure and start reading as noise. */}
            <div className="section-head">
              <h2 className="text-small font-semibold">{PILLAR_NAME[pk]}</h2>
            </div>

            {/* The ring hangs below its heading rather than beside the name: it is a mark
                on the page, not a bullet for the title. Its fact reads to the right, and
                the metric rings below share its left edge, so the section has one column
                of marks and one of words. Never a percentage — that belongs to the
                adherence ring alone, and the two species must stay unconfusable. */}
            <div className="mt-4 flex items-center gap-3.5">
              <Ring fill={ring?.fill ?? null} size={48} stroke={4} tone={pk} color={colors[pk]} />
              {soleFact && (
                <p className="text-micro tabular-nums text-[var(--color-muted)]">{soleFact}</p>
              )}
            </div>

            {/* A LIST, not a row of columns.
                Four metrics across a 250px column gave each ~88px, so every fact line
                wrapped to two ragged centred lines and the parent ring barely outsized its
                children. Reading down a left-aligned list also scales: a fifth metric costs
                a row, not a relayout.
                The facts stay at the right of each row rather than in the page margin —
                "11 of 8 days" does not fit 4.25rem, and a truth that wraps to two ragged
                lines is worse placed than one that simply sits at the end of its row. */}
            {subrings.length > 0 && (
              <ul className="mt-3 divide-y divide-[var(--color-line)]">
                {subrings.map((m) => (
                  <li key={m.key} className="flex items-center gap-3 py-3">
                    {m.state === "unscored" ? (
                      // No ring — there is nothing to fill toward. The count sits where a
                      // ring would, so the row still scans, but it is plainly not a gauge.
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-small tabular-nums text-[var(--color-muted)]">
                        {m.count}
                      </span>
                    ) : (
                      <Ring
                        fill={m.fill}
                        overdrive={m.overdrive}
                        size={28}
                        stroke={2.5}
                        tone={pk}
                        color={colors[pk]}
                      />
                    )}
                    <span className="min-w-0 flex-1 text-small">{m.label}</span>
                    <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                      {m.fact}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {pk === "physical" && (
              <div className="mt-6">
                <h3 className="text-micro">Log workout</h3>
                {/* Fill versus outline, the same way the block states separate: a logged
                    kind is filled in its pillar's hue, an unlogged one is a bare ring of
                    line. Form carries the state, so nothing here rides on hue alone.
                    White on the fill rather than --color-panel: every pillar hue in the
                    curated palette is verified at >=4.5:1 with WHITE on top, which is the
                    pairing the chip rule was measured against — panel is a surface. */}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {WORKOUTS.map((w) => {
                    const logged = workouts.find((x) => x.kind === w.kind);
                    return (
                      <button
                        key={w.kind}
                        onClick={() => setOpenLog(w.kind)}
                        aria-haspopup="dialog"
                        className="rounded-full border px-3.5 py-1.5 text-small transition-colors"
                        style={{
                          borderColor: logged ? hue : "var(--color-line-strong)",
                          background: logged ? hue : "transparent",
                          color: logged ? "#fff" : "inherit",
                        }}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>

                {openLog && (
                  <WorkoutLog
                    kind={openLog}
                    label={WORKOUTS.find((w) => w.kind === openLog)!.label}
                    date={date}
                    workout={workouts.find((x) => x.kind === openLog) ?? null}
                    hue={hue}
                    onSave={(note) => onSaveWorkout(openLog, note)}
                    onDelete={() => onDeleteWorkout(openLog)}
                    onClose={() => setOpenLog(null)}
                  />
                )}
              </div>
            )}

            {/* Goals keep their own label so a ring-led section never makes goal progress
                look like ring progress. The quarantine is a data rule; this is its visual
                counterpart. The percentage hangs in the page margin, which is also where
                it stops competing with the title for the line. */}
            <div className="mt-7">
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
                          --color-panel-2 sits two points off the page and the bar loses its
                          ground entirely.
                          scaleX, not width: transform is composited and skips layout
                          entirely. At this height the rounded caps distort by a fraction of
                          a pixel, which is invisible and worth the free frame. */}
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
                              onClick={() => run(`sg${s.id}`, () => onSubgoal(s.id, !s.done))}
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
                                    : { border: "1px solid var(--color-line-strong)" }
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
                        <p className="mt-2 text-micro leading-relaxed text-[var(--color-muted)]">No subgoals yet — add a few and this bar starts filling.</p>
                      )}
                      {/* Fires only when explicit overrides exceed 100% — an all-auto goal
                          is well-formed and must never warn. */}
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
                    . Subgoals split it evenly, and ticking them fills the bar.
                  </li>
                )}
              </ul>
            </div>

            {myS.length > 0 && (
              <div className="mt-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-micro">Skills</h3>
                  <span className="text-micro text-[var(--color-muted)]">last 14 days</span>
                </div>

                {/* The fortnight's time is genuine marginalia — it is a duration, and it
                    fits the margin where the ring facts did not. The owner's own name for
                    the skill sits on the line beside it. */}
                <ul className="mt-1 divide-y divide-[var(--color-line)]">
                  {myS.map((s) => (
                    <li key={s.id} className="page-margin py-3">
                      <div className="pt-2 text-right text-micro tabular-nums text-[var(--color-muted)]">
                        {asTime(s.minutes14)}
                      </div>

                      <div className="min-w-0">
                        <button
                          onClick={() => setOpen(open === s.id ? null : s.id)}
                          aria-expanded={open === s.id}
                          className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--color-panel)]"
                        >
                          <span className="flex items-baseline gap-2">
                            <span
                              className={`min-w-0 truncate font-serif text-body ${
                                s.state === "parked" ? "text-[var(--color-muted)]" : ""
                              }`}
                            >
                              {s.name}
                            </span>
                            {/* Outside the truncating span: at this column width the name
                                would eat the word before it ever showed.
                                A tint behind ink, not accent-coloured text — the accent
                                reads 4.02:1 as text on the page. It is a fill colour, and
                                this is what using it as one looks like. */}
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
                                // Parked reads as quiet, not as failed: the same muted ink
                                // the name already takes. --color-line-strong sat a point
                                // off the track and made the bar vanish rather than dim.
                                background:
                                  s.state === "parked" ? "var(--color-muted)" : hue,
                              }}
                            />
                          </div>
                        )}

                        {/* Quick-add sits on its OWN line, not inline with the name —
                            inline it overflows a phone. */}
                        {open === s.id && (
                          <div className="mt-2.5 flex flex-col gap-2">
                            {/* Any duration, not just the three shortcuts — 45 minutes is a
                                real number and used to be unloggable. */}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const n = Math.round(Number(mins[s.id]));
                                if (!Number.isFinite(n) || n < 1 || n > 600) return;
                                setMins({ ...mins, [s.id]: "" });
                                run(`st${s.id}`, () => onLogTime(s.id, n));
                              }}
                              className="flex items-center gap-2.5"
                            >
                              {/* A number written on a line. A filled pill here read as a
                                  form waiting on you; the rule is the field. */}
                              <input
                                type="number"
                                min={1}
                                max={600}
                                inputMode="numeric"
                                placeholder="mins"
                                aria-label={`Minutes on ${s.name}`}
                                value={mins[s.id] ?? ""}
                                onChange={(e) => setMins({ ...mins, [s.id]: e.target.value })}
                                className="w-[4rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-small tabular-nums outline-none transition-colors focus:border-[var(--color-accent)]"
                              />
                              <button
                                type="submit"
                                disabled={busy === `st${s.id}` || !(mins[s.id] ?? "").trim()}
                                className="rounded-full border border-[var(--color-line-strong)] px-3 py-1.5 text-small transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                              >
                                log
                              </button>
                              {s.sessions14 > 0 && (
                                <button
                                  type="button"
                                  onClick={() => run(`st${s.id}`, () => onUndoTime(s.id))}
                                  disabled={busy === `st${s.id}`}
                                  className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
                                >
                                  undo
                                </button>
                              )}
                            </form>
                            <div className="flex flex-wrap gap-2">
                              {QUICK_ADD.map((min) => (
                                <button
                                  key={min}
                                  onClick={() => run(`st${s.id}`, () => onLogTime(s.id, min))}
                                  disabled={busy === `st${s.id}`}
                                  className="rounded-full border border-[var(--color-line-strong)] px-3 py-1.5 text-small tabular-nums transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                                >
                                  +{min}m
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {!anyRecent && (
                  <p className="mt-3 text-micro leading-relaxed text-[var(--color-muted)]">
                    Nothing logged in the last 14 days. Lifetime totals stay listed, so everything
                    you&apos;ve put time into is still visible.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
