"use client";

import { useState, type CSSProperties, type FocusEvent } from "react";
import { subtaskLine } from "@/lib/subtasks";
import type { GoalView } from "@/lib/queries";
import type { CareerRingView } from "@/lib/rings";
import GoalCount from "./GoalCount";

/** "2026-08-08" -> "Sat 8 Aug". Noon, never midnight: a bare ISO date parses as UTC and
 *  lands on the day before anywhere west of Greenwich. */
export const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/** The field style every edit-in-place input here shares: the rule is invisible until
 *  focus, because a column of resting underlines would turn the list back into a form. */
export const FIELD =
  "min-w-0 border-b border-transparent bg-transparent pb-0.5 outline-none transition-colors focus:border-[var(--color-accent)]";
/** A field whose rule is always drawn: the ones that hold a SETTING (a date, a weight)
 *  rather than the owner's own words. */
export const SETTING =
  "border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-micro tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]";
export const LINK_BTN =
  "shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40";

export type GoalListProps = {
  /** Every goal to show, any status: the list filters active/finished itself, so a caller
   *  can pass a pre-filtered subset (one month's goals). */
  goals: GoalView[];
  /** Today's mutateGoals: one write, and it refreshes `goals` off the reply. */
  onGoals: (url: string, init: RequestInit) => Promise<void>;
  /** The day on screen — a subtask tick belongs to it (subtasks.ts, done_on). */
  date: string;
  /** The Career ring's arcs. Each goal's line is its arc's own fact; absent, the line
   *  shows only the figure — there is no ring to agree with. */
  arcs?: CareerRingView["arcs"];
  /** The new-goal form. Default true. */
  showAdd?: boolean;
  /** YYYY-MM-DD the new-goal form starts with, and returns to after a submit. */
  defaultDeadline?: string;
  /** The finished list, with reopen. Default true. */
  showFinished?: boolean;
};

/**
 * The goals, EDITED IN PLACE: title, deadline, mark done, drop, the subtasks with their
 * weights, a new goal, and the finished ones with "reopen". Lifted out of PillarSections
 * so a month page can draw the same list without the ring. It owns its busy key and the
 * add-form drafts; every write goes through `onGoals`.
 */
export default function GoalList({
  goals,
  onGoals,
  date,
  arcs,
  showAdd = true,
  defaultDeadline = "",
  showFinished = true,
}: GoalListProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState("");
  const [newDeadline, setNewDeadline] = useState(defaultDeadline);
  const [newCount, setNewCount] = useState("");
  const [newSub, setNewSub] = useState<Record<number, string>>({});

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

  // Soonest deadline first, undated last, then oldest — the same order the ring draws
  // its goal arcs in, so the list and the donut read the same way round.
  const active = goals
    .filter((g) => g.status === "active")
    .sort(
      (a, b) =>
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.id - b.id,
    );
  const finished = goals.filter((g) => g.status === "done");
  const arcOf = (goalId: number) =>
    arcs?.find((a) => a.goalId === goalId) ?? null;

  /** Save a text field on blur — only if it changed and is not blank. */
  const saveTitle =
    (key: string, url: string, was: string) =>
    (e: FocusEvent<HTMLInputElement>) => {
      const v = e.target.value.trim();
      if (v && v !== was) void goalWrite(key, url, "PATCH", { title: v });
    };

  return (
    <>
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
              {arcs && (
                <span className="min-w-0 truncate">
                  · {arcOf(g.id)?.fact ?? "no dates"}
                </span>
              )}
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
                                : {
                                    border:
                                      "1px solid var(--color-line-strong)",
                                  }
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
                            placeholder={String(
                              Math.round(sg.effectiveWeight * 100),
                            )}
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
                          <span className="tabular-nums">
                            {subtaskLine(sg, date)}
                          </span>
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

      {showAdd && (
        <>
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
              setNewDeadline(defaultDeadline);
              setNewCount("");
              void goalWrite("gn", "/api/goals", "POST", {
                title: t,
                deadline: newDeadline || null,
                targetCount: newCount === "" ? null : Number(newCount),
              });
            }}
            className="detail-enter mt-4"
            style={
              {
                "--enter-delay": `${(active.length + 1) * 45}ms`,
              } as CSSProperties
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
        </>
      )}

      {showFinished && (
        <>
          {/* THE FINISHED ONES, kept in sight: the surface that writes goals must not be
            the surface that loses them. Reopening clears completed_at server-side. A goal
            finished before the stamp existed is undated — an undated fact, not a missing
            one. Dropped goals are gone from every list, as before. */}
          {finished.length > 0 && (
            <div
              className="detail-enter mt-5"
              style={
                {
                  "--enter-delay": `${(active.length + 2) * 45}ms`,
                } as CSSProperties
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
      )}
    </>
  );
}
