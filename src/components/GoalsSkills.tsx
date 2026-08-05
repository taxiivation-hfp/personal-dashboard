"use client";

import type { GoalView, SkillView } from "@/lib/queries";

/** 640 -> "10h 40m". Time is shown as time — an abstract number would invite reading
 *  it as a score, which is the one thing this figure is not. */
function asTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function GoalsSkills({ goals, skills }: { goals: GoalView[]; skills: SkillView[] }) {
  const active = skills.filter((s) => s.state === "active");
  const rest = skills.filter((s) => s.state !== "active");
  const maxMinutes = Math.max(1, ...skills.map((s) => s.minutes));

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-[15px] font-semibold">Goals</h2>
        <ul className="mt-4 flex flex-col gap-4">
          {goals.map((g) => (
            <li key={g.id} className="rounded-2xl bg-[var(--color-panel)] px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px]">{g.title}</p>
                <span className="shrink-0 text-[14px] tabular-nums text-[var(--color-muted)]">
                  {Math.round(g.progress * 100)}%
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
                  style={{ width: `${Math.round(g.progress * 100)}%` }}
                />
              </div>

              <ul className="mt-3 flex flex-col gap-1.5">
                {g.subgoals.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
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
                      {Math.round(s.weight * 100)}%
                    </span>
                  </li>
                ))}
              </ul>

              {/* If the weights don't add up the progress bar is quietly wrong, so say so
                  rather than letting it look authoritative. */}
              {g.subgoals.length > 0 && Math.abs(g.weightSum - 1) > 0.001 && (
                <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                  weights total {Math.round(g.weightSum * 100)}%, not 100%
                </p>
              )}
            </li>
          ))}
          {goals.length === 0 && <li className="text-[14px] text-[var(--color-muted)]">No goals yet.</li>}
        </ul>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Skills</h2>
          <span className="text-[13px] text-[var(--color-muted)]">time logged</span>
        </div>

        <ul className="mt-4 flex flex-col gap-2.5">
          {[...active, ...rest].map((s) => (
            <li key={s.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={`truncate text-[14px] ${s.state === "parked" ? "text-[var(--color-muted)]" : ""}`}>
                  {s.name}
                  {s.state === "active" && (
                    <span className="ml-2 text-[12px] text-[var(--color-accent)]">active</span>
                  )}
                </p>
                <span className="shrink-0 text-[13px] tabular-nums text-[var(--color-muted)]">
                  {asTime(s.minutes)}
                </span>
              </div>
              {/* Bars are relative to the largest total, so they compare time spent.
                  There is no target and no full state — nothing here is completable. */}
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((s.minutes / maxMinutes) * 100)}%`,
                    background: s.state === "parked" ? "var(--color-line-strong)" : "var(--color-accent)",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-muted)]">
          Hours logged, nothing more — no levels and nothing to reach. Parked skills stay listed so
          everything you&apos;ve put time into is visible.
        </p>
      </section>
    </div>
  );
}
