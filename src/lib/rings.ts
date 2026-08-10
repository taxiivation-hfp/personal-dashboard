// Pillar sufficiency rings. PURE — no DB, no React, zero imports, so this runs under
// `node --test` with no dependencies.
//
// THE CORE RULE: a ring fills toward a SUFFICIENCY THRESHOLD and CAPS there. It cannot
// be improved by doing more — 8 strength sessions and 20 render identically, and 15k
// steps fills the steps ring exactly as much as 7k. That cap is the whole mechanism:
// because you cannot win by overdoing one pillar, the only board that looks good is a
// well-rounded one.
//
// A SECOND, INNER CAP applies to some metrics only: `perDayCapped` says whether a day can
// contribute more than once. Steps is capped by nature (15k ≡ 7k) and a habit can only be
// ticked once. Gym is NOT, by the owner's ruling — two lifts on a Tuesday are two things
// that happened. That ruling makes the Physical ring easier to fill than the days rule it
// replaced, and the threshold was deliberately left at 8 anyway.
//
// Thresholds are the owner's MINIMUMS, not stretch goals, and they are configured here
// on purpose so retuning is a one-line change.
//
// There is no progression here. No XP, no levels, no points, no streaks on rings, no
// fortnight-over-fortnight comparison. A thin ring means NEGLECTED, never failed.

/** Also re-exported from queries.ts, so existing `@/lib/queries` imports keep working.
 *  It lives HERE because this module must stay import-free to be testable. */
export type PillarKey = "social_capital" | "physical" | "portfolio";

/**
 * The pillar palette the owner may choose from.
 *
 * A CURATED set, not a hex picker. Every value is checked against the beige page for
 * contrast, so no choice can make the app unreadable. The amber accent, the ink and the
 * three block states stay fixed and are not offered here — one accent is what keeps the
 * page quiet, and the block states deliberately avoid a severity ramp.
 */
// Every value is verified at >=3:1 against the page (it is drawn as a ring stroke) AND
// >=4.5:1 with white on top (it is also a filled chip with white text). Moss was #4a8271,
// which measured 4.45 with white — a real fail, darkened to #467c6c.
export const PILLAR_PALETTE: { name: string; hex: string }[] = [
  { name: "Moss", hex: "#467c6c" },
  { name: "Olive", hex: "#6d7a45" },
  { name: "Clay", hex: "#8c7434" },
  { name: "Rust", hex: "#9a6448" },
  { name: "Plum", hex: "#7d5a72" },
  { name: "Iris", hex: "#67609b" },
  { name: "Slate", hex: "#5b6b7c" },
  { name: "Teal", hex: "#3f7d80" },
];

/** The CSS variable each pillar falls back to when it has no chosen colour. */
export const PILLAR_DEFAULT_VAR: Record<PillarKey, string> = {
  social_capital: "var(--color-social)",
  physical: "var(--color-physical)",
  portfolio: "var(--color-portfolio)",
};

export const isPaletteHex = (hex: string): boolean =>
  PILLAR_PALETTE.some((p) => p.hex === hex);

/** A skill's fallback hue when the owner has not chosen one: cycled from the palette by
 *  id, so it is STABLE — a skill keeps the same colour across sessions and screens until
 *  a choice is made, and two skills only collide once there are more than eight. */
export const skillDefaultHex = (id: number): string =>
  PILLAR_PALETTE[Math.abs(id) % PILLAR_PALETTE.length]!.hex;

export const WINDOW_DAYS = 14;

export type MetricSource =
  | "habit"
  | "gym"
  | "skill_session"
  | "health_steps"
  | "calendar_social";

/** Workout kinds. Misc is deliberately unscored — see METRICS. */
export type WorkoutKind = "strength" | "cardio" | "misc";
export const WORKOUT_KINDS: WorkoutKind[] = ["strength", "cardio", "misc"];

/** How far past its threshold a ring may visibly run. Visual only — see metricOverdrive. */
export const OVERDRIVE_CAP = 2;

export type Metric = {
  key: string;
  pillar: PillarKey;
  label: string;
  source: MetricSource;
  /** Habit-sourced metrics only. Looked up by system_key, never by name — the owner can
   *  rename their non-negotiables. */
  systemKey?: string;
  /** A day qualifies at or above this. Carries the per-day cap: 15k steps ≡ 7k. */
  dailyThreshold?: number;
  /** Which workout row this metric counts. Only for source 'gym'. */
  workoutKind?: WorkoutKind;
  /**
   * Qualifying days/sessions needed to fill.
   *
   * null with a live source means TRACKED BUT NOT SCORED — the count is shown as a plain
   * fact, no ring is drawn, and it is excluded from the pillar mean. A thing you log that
   * is deliberately never a target.
   */
  required: number | null;
  /**
   * The noun printed in the fact line, and ONLY that.
   *
   * It used to double as the cap semantics, which was a trap: renaming a metric's noun
   * silently changed how it was counted and dropped it out of a test invariant. The cap
   * now lives in `perDayCapped`, and these two must be allowed to disagree — `misc` reads
   * "sessions" and always did, even while it was being counted by day.
   */
  unit: "days" | "sessions";
  /**
   * Whether one date can contribute at most once.
   *
   * TRUE for things capped by nature: a habit is ticked once, and 15k steps is the same
   * day as 7k. FALSE for gym and skills, where a second session is a second thing that
   * happened. This is what `queries.ts` switches COUNT(DISTINCT date) vs COUNT(*) on.
   */
  perDayCapped: boolean;
  /**
   * Share of the pillar's mean. Default 1 — an unweighted pillar behaves exactly as an
   * equal mean, so nothing else had to change when this was added.
   */
  weight: number;
  /** False when no writer for this source exists yet. NEVER inferred from row count —
   *  zero rows in the window is a real, meaningful zero. */
  sourceReady: boolean;
};

export const METRICS: Metric[] = [
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
  {
    key: "strength",
    pillar: "physical",
    label: "Strength",
    source: "gym",
    workoutKind: "strength",
    required: 8, // the owner's stated minimum, held at 8 across the days->sessions move
    unit: "sessions",
    perDayCapped: false, // two lifts on a Tuesday are two things that happened
    // Physical is a WEIGHTED mean, 0.8 strength / 0.2 cardio. Eight strength days and no
    // cardio reads 80%, not 50% — the bulk of the intent was met, and the empty cardio
    // ring still shows what was skipped.
    weight: 0.8,
    sourceReady: true,
  },
  {
    key: "cardio",
    pillar: "physical",
    label: "Cardio",
    source: "gym",
    workoutKind: "cardio",
    required: 2, // a floor, not a target
    unit: "sessions",
    perDayCapped: false,
    weight: 0.2,
    sourceReady: true,
  },
  {
    key: "misc",
    pillar: "physical",
    label: "Misc",
    source: "gym",
    workoutKind: "misc",
    // A FLOOR, and a VISUAL one. Misc has a threshold now — one session a fortnight — but
    // keeps weight 0, so it fills its own mark without ever entering the Physical mean.
    // It draws as a thin outer lap on the donut rather than a slice of it: bouldering and
    // calisthenic skills should be visible and should never become a quota.
    required: 1,
    unit: "sessions",
    // Was counted by DATE while declaring "sessions" — the label and the counter
    // disagreed. Fixed for free by the perDayCapped split.
    perDayCapped: false,
    weight: 0,
    sourceReady: true,
  },
  {
    key: "steps",
    pillar: "physical",
    label: "Steps",
    source: "health_steps",
    dailyThreshold: 7000,
    required: 12, // 7k / day
    unit: "days",
    perDayCapped: true, // 15k steps IS the same day as 7k
    weight: 0,
    // Dormant: nothing writes health_logs.steps yet. Config is valid and ready for the
    // day a source lands; until then this renders as a GHOST (not unscored — !sourceReady
    // is checked first) and is excluded from the Physical mean.
    sourceReady: false,
  },
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
  {
    key: "skills",
    pillar: "portfolio",
    label: "Skills",
    source: "skill_session",
    required: 4, // 4 sessions / 14 days
    // SESSIONS, not days, by the owner's ruling: several of these (ice skating,
    // badminton, dancing) are social activities, so three on one Saturday is three
    // things that happened, not cramming. The outer cap still bounds the ring.
    unit: "sessions",
    perDayCapped: false,
    weight: 1,
    sourceReady: true,
  },
];

const PILLAR_ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];

/** What a reader returns for one metric. `resolved` is whether the SOURCE wired up —
 *  independent of how many rows it found. */
export type RawCount = { count: number; resolved: boolean };

/** How a metric is displayed. Derived, never declared — see the order of checks. */
export type MetricState = "scored" | "unscored" | "ghost";

export type MetricRing = {
  key: string;
  pillar: PillarKey;
  label: string;
  count: number;
  required: number | null;
  state: MetricState;
  /** 0..1, or null for unscored and ghost. NEVER 0 to mean "no source". */
  fill: number | null;
  /**
   * Work past the threshold, 0..1 as a fraction of one extra lap, or null.
   *
   * VISUAL ONLY. It never reaches the pillar mean — see buildRings.
   */
  overdrive: number | null;
  /** The count printed under the ring. The arc caps; this never does. */
  fact: string;
  /**
   * "day 9 of 14" while the window is still filling, else null.
   *
   * Split out of `fact` so the row can place the two independently — the Log button sits
   * between them. Day one must not read like a fortnight of neglect, which is why this
   * exists at all.
   */
  window: string | null;
  /** Which workout row this metric counts, when it counts one. Carried through so the UI
   *  can tell which rows get a Log button without re-deriving it from the key. */
  workoutKind?: WorkoutKind;
  /**
   * The metric's share of the pillar's mean, copied from the registry.
   *
   * Carried through so the segmented donut can give each metric an ARC LENGTH — Strength
   * owns most of Physical's circle and Cardio a fifth. Without it the view would have to
   * re-import METRICS and match on key, which is the registry leaking into the UI.
   *
   * It is the WEIGHT, not the value: what a metric is worth, never how well it went.
   */
  weight: number;
  /**
   * Draw this one as a thin lap OUTSIDE the donut instead of a slice of it.
   *
   * True for a metric with a floor of its own that must never move the pillar's average —
   * Misc, at one session a fortnight. Derived here rather than in the view so the registry
   * stays the only place that knows what a weight of 0 means; the alternative was the UI
   * re-importing METRICS and matching on key.
   *
   * A weight-0 metric with NO floor is not a lap — it has nothing to fill toward, so it
   * stays an unscored slice. Neither is a ghost: "no source yet" is a statement about the
   * app, and it belongs on the ring where the missing metric would have been.
   */
  lap: boolean;
};

export type PillarRingView = {
  pillar: PillarKey;
  /** Weighted mean of the scored fills. null when nothing in the pillar resolved. */
  fill: number | null;
  metrics: MetricRing[];
};

/** !sourceReady is checked FIRST: steps has required:12 but no writer, so it is a ghost,
 *  not unscored. The order of these two checks is load-bearing. */
export function metricState(m: Metric, hasSource: boolean): MetricState {
  if (!hasSource) return "ghost";
  return m.required == null || m.required < 1 ? "unscored" : "scored";
}

export function metricFill(
  count: number,
  required: number | null,
  hasSource: boolean,
): number | null {
  if (!hasSource) return null;
  if (required == null || required < 1) return null;
  return Math.min(1, count / required);
}

/**
 * The fraction of a second lap, 0..1, or null when there is nothing past the threshold.
 *
 * This exists so extra work is ACKNOWLEDGED without being REWARDED. It is deliberately
 * kept out of the pillar mean: with Strength weighted 0.8, an uncapped fill of 1.25 would
 * give 0.8 × 1.25 + 0.2 × 0 = 100%, so ten strength days and zero cardio would fill
 * Physical completely and overdoing one thing would exactly cancel neglecting another.
 * That is the failure the cap exists to prevent, so the cap stays in the maths and the
 * acknowledgement lives in the pixels.
 */
export function metricOverdrive(
  count: number,
  required: number | null,
  hasSource: boolean,
): number | null {
  if (!hasSource || required == null || required < 1) return null;
  const ratio = count / required;
  if (ratio <= 1) return null;
  return Math.min(1, (ratio - 1) / (OVERDRIVE_CAP - 1));
}

function factLine(m: Metric, count: number, state: MetricState): string {
  if (state === "ghost") return "no data source yet";
  // Unscored: a count, and an explicit statement that it is not being measured against
  // anything. Saying "no data source yet" here would be a lie — there IS data.
  if (state === "unscored") return `${count} ${m.unit} · not scored`;
  return `${count} of ${m.required} ${m.unit}`;
}

/** Day one must not read like a fortnight of neglect: while the window is still filling,
 *  say so plainly rather than letting a thin ring imply failure. Null once it is full. */
function windowLine(state: MetricState, observedDays: number): string | null {
  if (state !== "scored" || observedDays >= WINDOW_DAYS) return null;
  return `day ${observedDays} of ${WINDOW_DAYS}`;
}

export function buildRings(
  counts: Record<string, RawCount>,
  observedDays: number,
): PillarRingView[] {
  return PILLAR_ORDER.map((pillar) => {
    const mine = METRICS.filter((m) => m.pillar === pillar);

    const metrics: MetricRing[] = mine.map((m) => {
      const raw = counts[m.key] ?? { count: 0, resolved: false };
      const hasSource = m.sourceReady && raw.resolved;
      const state = metricState(m, hasSource);
      return {
        key: m.key,
        pillar: m.pillar,
        label: m.label,
        count: raw.count,
        required: m.required,
        state,
        fill: metricFill(raw.count, m.required, hasSource),
        overdrive: metricOverdrive(raw.count, m.required, hasSource),
        fact: factLine(m, raw.count, state),
        window: windowLine(state, observedDays),
        workoutKind: m.workoutKind,
        weight: m.weight,
        lap: state === "scored" && m.weight <= 0,
      };
    });

    // WEIGHTED mean over scored metrics only. A metric with no source, or one that is
    // tracked but not scored, is EXCLUDED — never counted as 0. Counting steps as zero
    // would cap Physical permanently and read as a failure no behaviour could fix.
    //
    // Note this consumes `fill`, which is capped at 1. Overdrive is deliberately absent:
    // letting it in would mean extra strength could cancel absent cardio.
    const live = metrics
      .map((r, i) => ({ r, weight: mine[i].weight }))
      .filter((x) => x.r.fill !== null && x.weight > 0);

    const totalWeight = live.reduce((s, x) => s + x.weight, 0);
    const fill = totalWeight
      ? live.reduce((s, x) => s + (x.r.fill as number) * x.weight, 0) /
        totalWeight
      : null;

    return { pillar, fill, metrics };
  });
}

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
  /** Portfolio: total minutes across every skill in the window. */
  skillMinutes: number;
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
    const h = asHours(f.skillMinutes);
    // "no hours", not "0 hours": the zero is true, and saying it as a word rather than a
    // figure keeps it from reading as a score of nought.
    if (f.skillMinutes <= 0) return "no hours logged past fortnight";
    return `${h} ${plural(Number(h), "hour", "hours")} logged past fortnight`;
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
