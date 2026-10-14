// Pillar rings — HEALTH and CAREER. PURE — no DB, no React, zero imports, so this runs
// under `node --test` with no dependencies.
//
// TWO PILLARS, by the owner's ruling of 2026-09-18 (the Health & Career pivot). Social is
// gone from every screen and every calculation; its code is parked verbatim under
// archive/social/. The database keys stay `physical` and `portfolio` — renaming a live key
// is churn — and the names people read come from PILLAR_NAME below, and only from there.
//
// THE CORE RULE still holds: a part fills toward a threshold and CAPS there. Eight strength
// sessions and twenty fill Strength identically, and overdoing one part never fills another
// — the pillar is a weighted mean of CAPPED fills. What changed is the drawing: a ring is
// now a SEGMENTED DONUT of one thickness, split into arcs sized by weight, with no outer
// laps, no mid band and no overdrive. So the only things this module hands a screen are
// what that drawing needs: each arc's share of the circle, its capped fill, and the real,
// uncapped number printed beside it.
//
// HEALTH fills from five parts defined in HEALTH_METRICS. CAREER fills from goals and its
// maths lives in career.ts; both produce the same drawing-ready shape, PillarRingView.
//
// Thresholds are the owner's MINIMUMS, not stretch goals. There is no progression here: no
// XP, no levels, no points, no ring streaks, no fortnight-over-fortnight comparison. A thin
// ring means NEGLECTED, never failed.

/**
 * The two pillars, by their DATABASE keys. Also re-exported from queries.ts.
 *
 * `social_capital` is no longer a member. Its `pillars` row stays in the database (goals,
 * habits and tasks reference it), and every reader that turns a stored key into a
 * PillarKey goes through `isPillarKey`, so a row still filed under Social is filtered or
 * mapped rather than cast into a key this type does not have.
 */
export type PillarKey = "physical" | "portfolio";

/** The order pillars are listed and drawn in. */
export const PILLAR_ORDER: readonly PillarKey[] = ["physical", "portfolio"];

/**
 * THE display names — the single source. `pillars.name` in the database is kept in step by
 * the pivot migration, but nothing should print it: a name that lives in two places is a
 * name that eventually says two things.
 */
export const PILLAR_NAME: Record<PillarKey, string> = {
  physical: "Health",
  portfolio: "Career",
};

/** Is a stored key one of the two live pillars? The one gate between a database string and
 *  a PillarKey. */
export const isPillarKey = (k: unknown): k is PillarKey =>
  k === "physical" || k === "portfolio";

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
  physical: "var(--color-physical)",
  portfolio: "var(--color-portfolio)",
};

export const isPaletteHex = (hex: string): boolean =>
  PILLAR_PALETTE.some((p) => p.hex === hex);

/** The rolling window: 14 days ending on the day being viewed, both ends inclusive. */
export const WINDOW_DAYS = 14;

/**
 * Workout kinds.
 *
 * MISC IS GONE, by the owner's ruling: it held bouldering and calisthenic skills, which were
 * the same row written in two places. `gym_sessions.kind` still ACCEPTS 'misc' at the
 * database level; nothing writes it and no metric counts it, so any surviving row is inert.
 */
export type WorkoutKind = "strength" | "cardio";
export const WORKOUT_KINDS: WorkoutKind[] = ["strength", "cardio"];

/**
 * The daily STEP floor. The checklist row dashes against it, the chart draws its floor line
 * at it, adherence pays a fraction of a share toward it, and the Health ring's fortnight
 * target is derived from it. One number, four readers, no copies.
 */
export const STEPS_FLOOR = 7000;

/**
 * The daily CALORIE floor — a number to reach, never a ceiling to stay under. This is
 * someone training, for whom under-eating is the failure.
 *
 * It moved HERE from productivity.ts with the pivot, because rings.ts must stay import-free
 * and the Health ring now reads it. adherence.ts imports it from here (a fractional share
 * of the habit half), productivity.ts re-exports it for the calorie screens that already
 * import it from there. One constant, no copied numbers.
 */
export const CALORIE_FLOOR = 2500;

export type HealthMetricKey =
  | "strength"
  | "cardio"
  | "ascnd"
  | "steps"
  | "calories";

export type MetricSource = "gym" | "habit" | "health_steps" | "calories";

/**
 * How a part's real number is printed beside it. The owner's lines are the spec:
 *   count      "2 of 8"        — sessions against a threshold
 *   days       "11/14"         — days ticked against the window
 *   thousands  "84k of 98k"    — a fortnight's TOTAL, grouped to thousands
 */
export type FactStyle = "count" | "days" | "thousands";

export type Metric = {
  key: HealthMetricKey;
  /** What the part is called on screen. */
  label: string;
  source: MetricSource;
  /** Habit-sourced parts only. Looked up by system_key, never by name — the owner can
   *  rename their non-negotiables. */
  systemKey?: string;
  /** Which workout row this part counts. Only for source 'gym'. */
  workoutKind?: WorkoutKind;
  /** The daily floor a fortnight TOTAL is derived from. Steps and calories only. */
  dailyThreshold?: number;
  /** What fills the arc. Always a real threshold now — nothing in a ring is "tracked but
   *  not scored" any more. */
  required: number;
  /**
   * Whether one date can contribute at most once. TRUE for a habit (ticked once a day);
   * FALSE for gym, where a second session is a second thing that happened, and for the two
   * totals, which are sums. `queries.ts` switches COUNT(DISTINCT date) vs COUNT(*) on it.
   */
  perDayCapped: boolean;
  /** The part's share of the pillar, as the owner wrote it (a percentage). The view
   *  normalises it, so the arcs always make one whole circle. */
  weight: number;
  fact: FactStyle;
};

/**
 * HEALTH — the owner's five parts, 2026-09-18.
 *
 * | Part           | Weight | Fill                              |
 * | Strength       | 40     | strength sessions ÷ 8             |
 * | Cardio         | 15     | cardio sessions ÷ 2               |
 * | ASC.ND routine | 15     | days ticked ÷ 14                  |
 * | Steps          | 15     | SUM(steps) ÷ STEPS_FLOOR × 14     |
 * | Calories       | 15     | SUM(kcal) ÷ CALORIE_FLOOR × 14    |
 *
 * STEPS AND CALORIES ARE FORTNIGHT TOTALS — the owner's ruling, both. One big day covers
 * quiet ones, and an unlogged day adds 0. That is a real change of meaning from a
 * consistency measure, and it is why the DAILY floors stay drawn on the checklist rows and
 * the charts, where consistency is still the question. The targets are DERIVED as floor ×
 * window so retuning a daily line moves the fortnight with it.
 *
 * The cap is per part: a 40k-step Saturday can fill Steps and nothing else, and no amount of
 * strength reaches 100 while cardio sits empty.
 */
export const HEALTH_METRICS: Metric[] = [
  {
    key: "strength",
    label: "Strength",
    source: "gym",
    workoutKind: "strength",
    required: 8,
    // Two lifts on a Tuesday are two things that happened.
    perDayCapped: false,
    weight: 40,
    fact: "count",
  },
  {
    key: "cardio",
    label: "Cardio",
    source: "gym",
    workoutKind: "cardio",
    required: 2,
    perDayCapped: false,
    weight: 15,
    fact: "count",
  },
  {
    // The owner's daily stretching / skincare / posture routine — the ASC.ND document habit,
    // moved to Health by the pivot migration. Counted by system_key, so a rename changes
    // nothing.
    key: "ascnd",
    label: "ASC.ND routine",
    source: "habit",
    systemKey: "ascnd",
    required: WINDOW_DAYS,
    perDayCapped: true,
    weight: 15,
    fact: "days",
  },
  {
    key: "steps",
    label: "Steps",
    source: "health_steps",
    dailyThreshold: STEPS_FLOOR,
    required: STEPS_FLOOR * WINDOW_DAYS,
    // A SUM. De-duplicating by date would throw away every step after a day's first row.
    perDayCapped: false,
    weight: 15,
    fact: "thousands",
  },
  {
    key: "calories",
    label: "Calories",
    source: "calories",
    dailyThreshold: CALORIE_FLOOR,
    required: CALORIE_FLOOR * WINDOW_DAYS,
    // A SUM of calorie_entries.kcal. The log holds several entries a day by design.
    perDayCapped: false,
    weight: 15,
    fact: "thousands",
  },
];

/** What a reader returns for one metric. `resolved` is whether the SOURCE answered —
 *  independent of how many rows it found. Zero rows is a real zero. */
export type RawCount = { count: number; resolved: boolean };

// ---------------------------------------------------------------- the drawing-ready view

/**
 * ONE ARC of a segmented donut, and one line of the part list beside it.
 *
 * Everything a screen needs to draw the arc and print its line, with no arithmetic of its
 * own: the arc's length is `weight × circumference` (the weights of one ring sum to 1), the
 * lit part is `fill × arcLength`, and the line is `${label} ${fact}`.
 */
export type ArcView = {
  /** Stable React key: the metric key on Health, `goal-<id>` on Career. */
  key: string;
  /** "Strength" on Health; the goal's title on Career. */
  label: string;
  /** This arc's share of the circle, 0..1. The arcs of one ring sum to 1. */
  weight: number;
  /**
   * 0..1, CAPPED — or null for a GHOST arc (its source did not answer), drawn dashed and
   * left out of the pillar's mean. Null is never 0: a broken wire is not a fortnight of
   * nothing.
   */
  fill: number | null;
  /** The real number, never capped: "11 of 8", "11/14", "84k of 98k", "60% · due 30 Sep". */
  fact: string;
};

/** A Health arc: the metric's own facts ride along for the Log buttons and dialogs. */
export type HealthArc = ArcView & {
  key: HealthMetricKey;
  /** The raw count behind `fact` (sessions, days, steps, kcal). */
  count: number;
  required: number;
  /** Strength / cardio rows carry their kind, so a screen knows which get a Log button
   *  without matching on the key. null on the other three. */
  workoutKind: WorkoutKind | null;
};

/** A Career arc: one counted goal. Built in career.ts. */
export type CareerArc = ArcView & {
  goalId: number;
  /** YYYY-MM-DD. Every counted goal has one — a goal without a deadline is not in the ring. */
  deadline: string;
  /** The goal's real progress, 0..1 (goals.ts). `fill` is progress against pace, not this. */
  progress: number;
  /** How much of the goal the calendar expects done by the viewed day, 0..1. */
  expected: number;
};

export type HealthRingView = {
  key: "physical";
  name: string;
  /** Weighted mean of the capped arc fills, 0..1; null only if every arc is a ghost. */
  fill: number | null;
  arcs: HealthArc[];
};

export type CareerRingView = {
  key: "portfolio";
  name: string;
  /**
   * Mean of the arc fills, 0..1 — or null when NO goal counts, which is drawn as an empty
   * dashed ghost labelled "no goals", never as "0%".
   */
  fill: number | null;
  /** One EQUAL arc per counted goal, soonest deadline first. Empty when fill is null. */
  arcs: CareerArc[];
};

/** The one shape both pillar rings are drawn from, discriminated by `key`. */
export type PillarRingView = HealthRingView | CareerRingView;

// ---------------------------------------------------------------- the maths

/** min(1, count / required), or null when the source did not answer. Never NaN. */
export function metricFill(
  count: number,
  required: number,
  resolved: boolean,
): number | null {
  if (!resolved) return null;
  if (!(required > 0) || !Number.isFinite(count)) return null;
  return Math.min(1, Math.max(0, count / required));
}

/**
 * The weighted mean of CAPPED fills, over the arcs that have one. Ghosts are EXCLUDED, never
 * counted as 0 — a part with no source would otherwise cap the pillar below full forever,
 * which no behaviour could fix. null when nothing has a fill.
 *
 * It consumes `fill`, which is capped at 1, and that is load-bearing: an uncapped strength
 * fill could cancel an empty cardio arc, and the cap is what keeps a well-rounded fortnight
 * the only full ring.
 */
export function weightedFill(
  arcs: { weight: number; fill: number | null }[],
): number | null {
  let total = 0;
  let sum = 0;
  for (const a of arcs) {
    if (a.fill == null || !(a.weight > 0)) continue;
    total += a.weight;
    sum += a.fill * a.weight;
  }
  return total > 0 ? sum / total : null;
}

/**
 * 84,512 -> "84k", 7,450 -> "7.4k", 850 -> "850".
 *
 * FLOORED, never rounded: a line reading "98k of 98k" over an arc that is not full would be
 * the text claiming more than the ring does. Written out rather than `toLocaleString` so
 * this module's output never depends on the ICU build.
 */
export function compactThousands(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  if (v < 1000) return String(v);
  if (v < 10_000) return `${Math.floor(v / 100) / 10}k`;
  return `${Math.floor(v / 1000)}k`;
}

/** The printed number for one part, in the owner's own formats. The arc caps; this never
 *  does — "11 of 8" is a true sentence. */
export function factFor(m: Metric, count: number): string {
  if (m.fact === "days") return `${count}/${m.required}`;
  if (m.fact === "thousands")
    return `${compactThousands(count)} of ${compactThousands(m.required)}`;
  return `${count} of ${m.required}`;
}

/**
 * The HEALTH ring from raw counts keyed by metric key. A key that is absent is treated as an
 * unresolved source (a ghost), never as a zero.
 */
export function buildHealthRing(
  counts: Record<string, RawCount>,
): HealthRingView {
  const totalWeight = HEALTH_METRICS.reduce((s, m) => s + m.weight, 0);
  const arcs: HealthArc[] = HEALTH_METRICS.map((m) => {
    const raw = counts[m.key] ?? { count: 0, resolved: false };
    const count = raw.resolved ? raw.count : 0;
    return {
      key: m.key,
      label: m.label,
      weight: totalWeight > 0 ? m.weight / totalWeight : 0,
      fill: metricFill(count, m.required, raw.resolved),
      // A ghost prints a dash, the app's word for "nobody measured" — never "0 of 14",
      // which would be a zero the source did not say.
      fact: raw.resolved ? factFor(m, count) : "—",
      count,
      required: m.required,
      workoutKind: m.workoutKind ?? null,
    };
  });
  return {
    key: "physical",
    name: PILLAR_NAME.physical,
    fill: weightedFill(arcs),
    arcs,
  };
}
