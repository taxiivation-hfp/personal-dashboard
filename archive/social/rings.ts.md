# Social in the ring registry

Parked verbatim from `src/lib/rings.ts` at commit `c86f000` by the owner's ruling of 2026-09-18 (see README.md).
Each block below is an exact slice of that file; the heading gives its original line range.

## `src/lib/rings.ts:22-24` — PillarKey with social_capital

```ts
/** Also re-exported from queries.ts, so existing `@/lib/queries` imports keep working.
 *  It lives HERE because this module must stay import-free to be testable. */
export type PillarKey = "social_capital" | "physical" | "portfolio";
```

## `src/lib/rings.ts:48-53` — PILLAR_DEFAULT_VAR with the Social tone

```ts
/** The CSS variable each pillar falls back to when it has no chosen colour. */
export const PILLAR_DEFAULT_VAR: Record<PillarKey, string> = {
  social_capital: "var(--color-social)",
  physical: "var(--color-physical)",
  portfolio: "var(--color-portfolio)",
};
```

## `src/lib/rings.ts:66-72` — MetricSource with calendar_social

```ts
export type MetricSource =
  | "habit"
  | "gym"
  | "skill_session"
  | "health_steps"
  | "calendar_social"
  | "calendar_project_hours";
```

## `src/lib/rings.ts:150-161` — the outreach metric

```ts
  {
    key: "outreach",
    pillar: "social_capital",
    label: "Outreach",
    source: "habit",
    systemKey: "outreach",
    required: 2, // 1 / week
    unit: "days",
    perDayCapped: true, // a non-negotiable is ticked once
    weight: 1,
    sourceReady: true,
  },
```

## `src/lib/rings.ts:236-254` — the social_events metric

```ts
  {
    key: "social_events",
    pillar: "social_capital",
    // "Events", not "Social events": the label is printed at its own arc on the Social
    // donut, where the pillar name is already overhead and the longer form overran the box
    // by 16px. Shorter is also just better here — the context is never in doubt.
    label: "Events",
    source: "calendar_social",
    // Graphite in the calendar means a weekly-occurring social event — Church, a night
    // out. Counted from the calendar rather than ticked, because they are already
    // scheduled there and a second place to record them is a second place to forget.
    // ADHERED events only, since the marks pivot: an event on the calendar you drifted
    // from is not a social fortnight you had.
    required: 6, // ~6 / 14 days, the owner's revised minimum (was 2)
    unit: "sessions",
    perDayCapped: false,
    weight: 1,
    sourceReady: true,
  },
```

## `src/lib/rings.ts:315-315` — PILLAR_ORDER with Social first

```ts
const PILLAR_ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];
```

## `src/lib/rings.ts:502-560` — PillarFactInput (outreach, socialEvents) and pillarCaption with the Social branch

```ts
/**
 * What a pillar's fortnight actually held, in plain words, under its name.
 *
 * The counterpart to the ring above it, and deliberately a DIFFERENT KIND of statement. The
 * ring answers "how full", which is capped, weighted and bounded at a threshold; this
 * answers "what happened", which is raw and must never cap. A caption derived from the ring
 * would inherit the cap and print "8 sessions" on a fortnight of twenty.
 *
 * It is a count, not a verdict. No comparison with the last fortnight, no "up from", no
 * adjective — the same prohibition the coach runs under.
 *
 * PURE, so it is testable without a database, and so the wording lives beside the registry
 * rather than in a component where it would drift.
 */
export type PillarFactInput = {
  /** Portfolio: skill SESSIONS in the window. Was total minutes — skills stopped being
   *  measured in hours, so the caption counts the same thing the ring does. */
  skillSessions: number;
  /** Physical: gym_sessions ROWS in the window, all three kinds. */
  workoutSessions: number;
  /** Social: outreach non-negotiable ticks in the window. */
  outreach: number;
  /**
   * Social: graphite calendar events in the window.
   *
   * UNDEFINED when Google could not be reached, and that distinction is the whole reason
   * this is not a number. A zero would claim the fortnight held no social events, which is
   * a different and possibly false statement — the same rule the ghost ring runs under.
   */
  socialEvents?: number;
};

/** "90" -> "1.5", "120" -> "2", "0" -> "0". One decimal, no trailing zero. */
const asHours = (minutes: number): string =>
  String(Math.round((minutes / 60) * 10) / 10);

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function pillarCaption(
  pillar: PillarKey,
  f: PillarFactInput,
): string {
  if (pillar === "portfolio") {
    // "no sessions", not "0 sessions": the zero is true, and saying it as a word rather
    // than a figure keeps it from reading as a score of nought.
    if (f.skillSessions <= 0) return "no sessions logged past fortnight";
    return `${f.skillSessions} ${plural(f.skillSessions, "session", "sessions")} logged past fortnight`;
  }

  if (pillar === "physical") {
    if (f.workoutSessions <= 0) return "no sessions logged past fortnight";
    return `${f.workoutSessions} ${plural(f.workoutSessions, "session", "sessions")} logged past fortnight`;
  }

  const out = `${f.outreach} ${plural(f.outreach, "outreach", "outreaches")} sent`;
  // Say the calendar is unreachable rather than print a number that would be a guess.
  if (f.socialEvents == null) return `${out}, events unavailable`;
  return `${out}, ${f.socialEvents} ${plural(f.socialEvents, "event", "events")}`;
}
```
