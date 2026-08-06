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
            <div className="flex items-center gap-3">
              <Ring fill={ring?.fill ?? null} size={44} stroke={4} tone={pk} color={colors[pk]} />
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold">{PILLAR_NAME[pk]}</h2>
                {soleFact && (
                  <p className="text-[12px] text-[var(--color-muted)]">{soleFact}</p>
                )}
              </div>
            </div>

            {subrings.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-3">
                {subrings.map((m) =>
                  // Unscored metrics draw NO ring — there is nothing to fill toward. A
                  // count and a plain statement that it isn't measured.
                  m.state === "unscored" ? (
                    <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                      <span className="text-[15px] tabular-nums">{m.count}</span>
                      <span className="text-[11px] text-[var(--color-muted)]">{m.label}</span>
                      <span className="text-center text-[10px] leading-tight text-[var(--color-muted)]">
                        not scored
                      </span>
                    </div>
                  ) : (
                    <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                      <Ring fill={m.fill} overdrive={m.overdrive} size={40} stroke={3} tone={pk} color={colors[pk]} />
                      <span className="text-[11px] text-[var(--color-muted)]">{m.label}</span>
                      <span className="text-center text-[10px] leading-tight text-[var(--color-muted)]">
                        {m.fact}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}

            {pk === "physical" && (
              <div className="mt-4">
                <h3 className="text-[13px] font-semibold text-[var(--color-muted)]">Log workout</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WORKOUTS.map((w) => {
                    const logged = workouts.find((x) => x.kind === w.kind);
                    return (
                      <button
                        key={w.kind}
                        onClick={() => setOpenLog(w.kind)}
                        aria-haspopup="dialog"
                        className="rounded-full border px-3 py-1.5 text-[12px] transition-colors"
                        style={{
                          borderColor: logged ? hue : "var(--color-line-strong)",
                          background: logged ? hue : "transparent",
                          color: logged ? "var(--color-panel)" : "inherit",
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

            {/* Goals keep their own heading so a ring-led section never makes goal
                progress look like ring progress. The quarantine is a data rule; this is
                its visual counterpart. */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-[var(--color-muted)]">Goals</h3>
                <Link
                  href="/goals"
                  className="text-[12px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
                >
                  edit
                </Link>
              </div>

              <ul className="mt-2.5 flex flex-col gap-3">
                {mine.map((g) => (
                  <li key={g.id} className="rounded-2xl bg-[var(--color-panel)] px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 text-[15px]">{g.title}</p>
                      <span className="shrink-0 text-[14px] tabular-nums text-[var(--color-muted)]">
                        {Math.round(g.progress * 100)}%
                      </span>
                    </div>

                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: `color-mix(in srgb, ${hue} 14%, var(--color-panel-2))` }}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
                        style={{ width: `${Math.round(g.progress * 100)}%` }}
                      />
                    </div>

                    <ul className="mt-3 flex flex-col gap-0.5">
                      {g.subgoals.map((s) => (
                        <li key={s.id}>
                          <button
                            onClick={() => run(`sg${s.id}`, () => onSubgoal(s.id, !s.done))}
                            aria-pressed={s.done}
                            disabled={busy === `sg${s.id}`}
                            className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-[var(--color-panel-2)] disabled:opacity-40"
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
                              className={`min-w-0 flex-1 truncate text-[13px] ${
                                s.done ? "text-[var(--color-muted)]" : ""
                              }`}
                            >
                              {s.title}
                            </span>
                            <span className="shrink-0 text-[12px] tabular-nums text-[var(--color-muted)]">
                              {Math.round(s.effectiveWeight * 100)}%
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>

                    {g.subgoals.length === 0 && (
                      <p className="mt-2 text-[12px] text-[var(--color-muted)]">No subgoals yet.</p>
                    )}
                    {/* Fires only when explicit overrides exceed 100% — an all-auto goal
                        is well-formed and must never warn. */}
                    {g.overAllocated && (
                      <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                        set weights total more than 100%
                      </p>
                    )}
                  </li>
                ))}
                {mine.length === 0 && (
                  <li className="text-[13px] text-[var(--color-muted)]">No goals here yet.</li>
                )}
              </ul>
            </div>

            {myS.length > 0 && (
              <div className="mt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[13px] font-semibold text-[var(--color-muted)]">Skills</h3>
                  <span className="text-[12px] text-[var(--color-muted)]">last 14 days</span>
                </div>

                <ul className="mt-2.5 flex flex-col gap-3">
                  {myS.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setOpen(open === s.id ? null : s.id)}
                        aria-expanded={open === s.id}
                        className="flex w-full items-baseline justify-between gap-3 text-left"
                      >
                        <span
                          className={`min-w-0 truncate text-[14px] ${
                            s.state === "parked" ? "text-[var(--color-muted)]" : ""
                          }`}
                        >
                          {s.name}
                          {s.state === "active" && (
                            <span className="ml-2 text-[12px] text-[var(--color-accent)]">active</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums">
                          {asTime(s.minutes14)}
                          <span className="ml-2 text-[12px] text-[var(--color-muted)]">
                            {asTime(s.minutes)} lifetime
                          </span>
                        </span>
                      </button>

                      {anyRecent && (
                        <div
                          className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
                          style={{ background: `color-mix(in srgb, ${hue} 12%, var(--color-panel-2))` }}
                        >
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{
                              width: `${Math.round((s.minutes14 / maxMinutes) * 100)}%`,
                              background: s.state === "parked" ? "var(--color-line-strong)" : hue,
                            }}
                          />
                        </div>
                      )}

                      {/* Quick-add sits on its OWN line, not inline with the name —
                          inline it overflows a phone. */}
                      {open === s.id && (
                        <div className="mt-2 flex flex-col gap-1.5">
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
                            className="flex items-center gap-1.5"
                          >
                            <input
                              type="number"
                              min={1}
                              max={600}
                              inputMode="numeric"
                              placeholder="mins"
                              aria-label={`Minutes on ${s.name}`}
                              value={mins[s.id] ?? ""}
                              onChange={(e) => setMins({ ...mins, [s.id]: e.target.value })}
                              className="w-[4.5rem] rounded-full bg-[var(--color-panel-2)] px-3 py-1 text-[12px] tabular-nums outline-none"
                            />
                            <button
                              type="submit"
                              disabled={busy === `st${s.id}` || !(mins[s.id] ?? "").trim()}
                              className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-[12px] transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                            >
                              log
                            </button>
                            {s.sessions14 > 0 && (
                              <button
                                type="button"
                                onClick={() => run(`st${s.id}`, () => onUndoTime(s.id))}
                                disabled={busy === `st${s.id}`}
                                className="rounded-full px-3 py-1 text-[12px] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                              >
                                undo
                              </button>
                            )}
                          </form>
                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_ADD.map((min) => (
                              <button
                                key={min}
                                onClick={() => run(`st${s.id}`, () => onLogTime(s.id, min))}
                                disabled={busy === `st${s.id}`}
                                className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-[12px] tabular-nums transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                              >
                                +{min}m
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {!anyRecent && (
                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
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
