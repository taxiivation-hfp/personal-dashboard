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

export const WINDOW_DAYS = 14;

export type MetricSource = "habit" | "gym" | "skill_session" | "health_steps";

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
  /** Qualifying days/sessions needed to fill. null = not yet specified → ghost. */
  required: number | null;
  /** The noun in the fact line. Days are per-day capped; sessions are not. */
  unit: "days" | "sessions";
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
    sourceReady: true,
  },
  {
    key: "gym",
    pillar: "physical",
    label: "Gym",
    source: "gym",
    required: 8, // 4x / week
    unit: "days",
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
    // Dormant: nothing writes health_logs.steps yet. Config is valid and ready for the
    // day a source lands; until then this renders as a ghost and is excluded from the
    // Physical mean.
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
    sourceReady: true,
  },
];

const PILLAR_ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];

/** What a reader returns for one metric. `resolved` is whether the SOURCE wired up —
 *  independent of how many rows it found. */
export type RawCount = { count: number; resolved: boolean };

export type MetricRing = {
  key: string;
  pillar: PillarKey;
  label: string;
  count: number;
  required: number | null;
  /** 0..1, or null when there is no source. NEVER 0 to mean "no source". */
  fill: number | null;
  /** The line printed under the ring. The arc caps; this never does. */
  fact: string;
};

export type PillarRingView = {
  pillar: PillarKey;
  /** Mean of the fills that are not null. null when nothing in the pillar resolved. */
  fill: number | null;
  metrics: MetricRing[];
};

export function metricFill(count: number, required: number | null, hasSource: boolean): number | null {
  if (!hasSource) return null;
  if (required == null || required < 1) return null;
  return Math.min(1, count / required);
}

function factLine(m: Metric, count: number, fill: number | null, observedDays: number): string {
  if (fill == null) return "no data source yet";
  const base = `${count} of ${m.required} ${m.unit}`;
  // Day one must not read like a fortnight of neglect: while the window is still
  // filling, say so plainly rather than letting a thin ring imply failure.
  return observedDays < WINDOW_DAYS ? `${base} · day ${observedDays} of ${WINDOW_DAYS}` : base;
}

export function buildRings(counts: Record<string, RawCount>, observedDays: number): PillarRingView[] {
  return PILLAR_ORDER.map((pillar) => {
    const metrics: MetricRing[] = METRICS.filter((m) => m.pillar === pillar).map((m) => {
      const raw = counts[m.key] ?? { count: 0, resolved: false };
      const hasSource = m.sourceReady && raw.resolved;
      const fill = metricFill(raw.count, m.required, hasSource);
      return {
        key: m.key,
        pillar: m.pillar,
        label: m.label,
        count: raw.count,
        required: m.required,
        fill,
        fact: factLine(m, raw.count, fill, observedDays),
      };
    });

    // A metric with no source is EXCLUDED from the mean, never counted as 0. Counting
    // steps as zero would cap Physical at 50% permanently and read as a failure that no
    // behaviour could fix.
    const live = metrics.filter((m) => m.fill !== null);
    const fill = live.length ? live.reduce((s, m) => s + (m.fill as number), 0) / live.length : null;

    return { pillar, fill, metrics };
  });
}
