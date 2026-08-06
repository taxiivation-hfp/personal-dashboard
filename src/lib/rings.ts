// Pillar sufficiency rings. PURE — no DB, no React, zero imports, so this runs under
// `node --test` with no dependencies.
//
// THE CORE RULE: a ring fills toward a SUFFICIENCY THRESHOLD and CAPS there. It cannot
// be improved by doing more — 8 gym days and 20 gym days render identically, and 15k
// steps fills the steps ring exactly as much as 7k. That cap is the whole mechanism:
// because you cannot win by overdoing one pillar, the only board that looks good is a
// well-rounded one.
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

export const isPaletteHex = (hex: string): boolean => PILLAR_PALETTE.some((p) => p.hex === hex);

export const WINDOW_DAYS = 14;

export type MetricSource = "habit" | "gym" | "skill_session" | "health_steps";

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
  /** The noun in the fact line. Days are per-day capped; sessions are not. */
  unit: "days" | "sessions";
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
    weight: 1,
    sourceReady: true,
  },
  {
    key: "strength",
    pillar: "physical",
    label: "Strength",
    source: "gym",
    workoutKind: "strength",
    required: 8, // the owner's stated minimum
    unit: "days",
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
    unit: "days",
    weight: 0.2,
    sourceReady: true,
  },
  {
    key: "misc",
    pillar: "physical",
    label: "Misc",
    source: "gym",
    workoutKind: "misc",
    // TRACKED BUT NOT SCORED. Bouldering and calisthenic skills get recorded without ever
    // becoming a target — the constitution's "output is not scored" made literal.
    required: null,
    unit: "sessions",
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
    weight: 0,
    // Dormant: nothing writes health_logs.steps yet. Config is valid and ready for the
    // day a source lands; until then this renders as a GHOST (not unscored — !sourceReady
    // is checked first) and is excluded from the Physical mean.
    sourceReady: false,
  },
  {
    key: "skills",
    pillar: "portfolio",
    label: "Skill sessions",
    source: "skill_session",
    required: 4, // 4 sessions / 14 days
    // SESSIONS, not days, by the owner's ruling: several of these (ice skating,
    // badminton, dancing) are social activities, so three on one Saturday is three
    // things that happened, not cramming. The outer cap still bounds the ring.
    unit: "sessions",
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
  /** The line printed under the ring. The arc caps; this never does. */
  fact: string;
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

export function metricFill(count: number, required: number | null, hasSource: boolean): number | null {
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
export function metricOverdrive(count: number, required: number | null, hasSource: boolean): number | null {
  if (!hasSource || required == null || required < 1) return null;
  const ratio = count / required;
  if (ratio <= 1) return null;
  return Math.min(1, (ratio - 1) / (OVERDRIVE_CAP - 1));
}

function factLine(m: Metric, count: number, state: MetricState, observedDays: number): string {
  if (state === "ghost") return "no data source yet";
  // Unscored: a count, and an explicit statement that it is not being measured against
  // anything. Saying "no data source yet" here would be a lie — there IS data.
  if (state === "unscored") return `${count} ${m.unit} · not scored`;
  const base = `${count} of ${m.required} ${m.unit}`;
  // Day one must not read like a fortnight of neglect: while the window is still
  // filling, say so plainly rather than letting a thin ring imply failure.
  return observedDays < WINDOW_DAYS ? `${base} · day ${observedDays} of ${WINDOW_DAYS}` : base;
}

export function buildRings(counts: Record<string, RawCount>, observedDays: number): PillarRingView[] {
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
        fact: factLine(m, raw.count, state, observedDays),
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
      ? live.reduce((s, x) => s + (x.r.fill as number) * x.weight, 0) / totalWeight
      : null;

    return { pillar, fill, metrics };
  });
}
