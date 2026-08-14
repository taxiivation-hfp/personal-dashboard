import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRICS,
  STEPS_FLOOR,
  WINDOW_DAYS,
  buildRings,
  metricFill,
  metricOverdrive,
  type RawCount,
  pillarCaption,
} from "./rings.ts";

const ok = (count: number): RawCount => ({ count, resolved: true });

/** All metrics resolved, with the given counts. */
function counts(over: Record<string, RawCount> = {}): Record<string, RawCount> {
  const base: Record<string, RawCount> = {};
  for (const m of METRICS) base[m.key] = ok(0);
  return { ...base, ...over };
}

const find = (
  rings: ReturnType<typeof buildRings>,
  pillar: string,
  key: string,
) =>
  rings.find((p) => p.pillar === pillar)!.metrics.find((m) => m.key === key)!;

// ---------------------------------------------------------------- the cap

test("fill caps at 1 — doing more than the threshold changes nothing", () => {
  assert.equal(metricFill(8, 8, true), 1);
  assert.equal(metricFill(20, 8, true), 1);
});

test("the true count survives the cap in the fact line", () => {
  const r = find(
    buildRings(counts({ strength: ok(11) }), WINDOW_DAYS),
    "physical",
    "strength",
  );
  assert.equal(r.fill, 1);
  assert.equal(r.count, 11);
  assert.equal(r.fact, "11 of 8 sessions");
});

test("partial fill is the plain ratio", () => {
  assert.equal(metricFill(4, 8, true), 0.5);
});

// ---------------------------------------------------------------- null, not zero

test("no source yields null, never 0 — the two must stay distinguishable", () => {
  assert.equal(metricFill(0, 8, false), null);
  assert.equal(metricFill(0, 8, true), 0);
});

test("a null required yields null rather than NaN or Infinity", () => {
  assert.equal(metricFill(3, null, true), null);
  assert.equal(metricFill(3, 0, true), null);
});

test("steps is a VOLUME: the fortnight's total against floor x window", () => {
  // The phone pushes to /api/health, so sourceReady is true and a resolved count fills
  // the ring like any other metric — at weight 0, as an outer lap.
  //
  // The count is now TOTAL STEPS, not qualifying days: 49,000 of 98,000 is half a
  // fortnight's walking however it was shaped. Under the old rule the same fortnight
  // could read anywhere from 0 to 100% depending only on which days it fell on.
  const r = find(
    buildRings(counts({ steps: ok(49_000) }), WINDOW_DAYS),
    "physical",
    "steps",
  );
  assert.equal(r.state, "scored");
  assert.equal(r.fill, 0.5);
  // Grouped, because a five-figure fact line is unreadable ungrouped.
  assert.equal(r.fact, "49,000 of 98,000 steps");
});

test("the steps target is DERIVED from the daily floor, never written twice", () => {
  // Retuning the floor must move the fortnight target with it. If these are ever written
  // as two independent numbers, the checklist row and the ring start disagreeing about
  // what a good day is, silently.
  const steps = METRICS.find((m) => m.key === "steps")!;
  assert.equal(steps.dailyThreshold, STEPS_FLOOR);
  assert.equal(steps.required, STEPS_FLOOR * WINDOW_DAYS);
});

test("a sourceless metric is EXCLUDED from its pillar mean, not counted as 0", () => {
  // Physical = strength + cardio (live) + steps (ghost). With both scored metrics met the
  // pillar must read exactly 1 — if steps counted as a zero it would be capped below full
  // forever, which no behaviour could fix.
  const physical = buildRings(
    counts({ strength: ok(8), cardio: ok(2) }),
    WINDOW_DAYS,
  ).find((p) => p.pillar === "physical")!;
  assert.equal(physical.fill, 1);
});

test("a pillar with no live metric is null, not NaN", () => {
  const c = counts();
  for (const k of ["strength", "cardio", "steps"])
    c[k] = { count: 0, resolved: false };
  const physical = buildRings(c, WINDOW_DAYS).find(
    (p) => p.pillar === "physical",
  )!;
  assert.equal(physical.fill, null);
});

test("an unresolved habit source is a ghost, not a zero", () => {
  const c = counts();
  c.outreach = { count: 0, resolved: false };
  const r = find(buildRings(c, WINDOW_DAYS), "social_capital", "outreach");
  assert.equal(r.fill, null);
});

// ---------------------------------------------------------------- day one

test("a partial window says so, so day one cannot read as a fortnight of neglect", () => {
  const r = find(
    buildRings(counts({ strength: ok(2) }), 3),
    "physical",
    "strength",
  );
  assert.equal(r.fact, "2 of 8 sessions");
  // Split out of `fact` so the row can place the two around the Log button.
  assert.equal(r.window, "day 3 of 14");
  assert.equal(r.fill, 0.25);
});

test("a fully observed window drops the day counter", () => {
  const r = find(
    buildRings(counts({ strength: ok(2) }), 14),
    "physical",
    "strength",
  );
  assert.equal(r.fact, "2 of 8 sessions");
  assert.equal(r.window, null);
});

// ---------------------------------------------------------------- units

test("skill sessions are counted as sessions, not days", () => {
  const r = find(
    buildRings(counts({ skills: ok(3) }), WINDOW_DAYS),
    "portfolio",
    "skills",
  );
  assert.equal(r.fact, "3 of 4 sessions");
});

// ---------------------------------------------------------------- registry invariants

test("every day-capped metric requires no more than the window allows", () => {
  for (const m of METRICS) {
    // perDayCapped, NOT unit. `unit` is only the printed noun now; keying this guard off
    // it meant renaming a noun silently dropped a metric out of the check.
    if (!m.perDayCapped || m.required == null) continue;
    assert.ok(
      m.required <= WINDOW_DAYS,
      `${m.key} requires ${m.required} of ${WINDOW_DAYS} days`,
    );
  }
});

test("the gym metrics count SESSIONS — a second lift on a Tuesday is a second thing", () => {
  for (const key of ["strength", "cardio"]) {
    const m = METRICS.find((x) => x.key === key)!;
    assert.equal(m.perDayCapped, false, `${key} is not per-day capped`);
    assert.equal(m.unit, "sessions", `${key} says so in its fact line`);
  }
});

test("MISC IS GONE from Physical — it was Calisthenics written twice", () => {
  // Removed by the owner's ruling: Misc held bouldering and calisthenic skills, and
  // Calisthenics is a Portfolio SKILL that logs sessions of its own. Two places to write
  // one session is one place to forget it.
  assert.equal(
    METRICS.find((m) => m.key === "misc"),
    undefined,
  );
  assert.deepEqual(
    METRICS.filter((m) => m.pillar === "physical").map((m) => m.key),
    ["strength", "cardio", "steps"],
  );
});

test("things capped by nature stay capped", () => {
  // A non-negotiable is ticked once. Steps is deliberately NOT here any more: it sums a
  // fortnight, and de-duplicating by date would discard every step after each day's first
  // row. If this ever flips back, the ring silently stops meaning what its threshold says.
  assert.equal(METRICS.find((x) => x.key === "outreach")!.perDayCapped, true);
  assert.equal(METRICS.find((x) => x.key === "steps")!.perDayCapped, false);
});

test("the printed noun and the counting rule are allowed to disagree, but not by accident", () => {
  // misc read "sessions" while being counted by date for its whole life. The two fields
  // are separate on purpose; this pins the intended pairing so a drift is loud.
  const expected: Record<string, boolean> = {
    social_events: false,
    outreach: true,
    strength: false,
    cardio: false,
    // Steps sums the fortnight now — see "things capped by nature stay capped".
    steps: false,
    skills: false,
    // Hours, and two blocks on one Tuesday are two blocks — nothing about a day caps them.
    project_hours: false,
  };
  for (const m of METRICS)
    assert.equal(m.perDayCapped, expected[m.key], `${m.key}`);
});

test("every pillar appears exactly once and metric keys are unique", () => {
  const rings = buildRings(counts(), WINDOW_DAYS);
  assert.deepEqual(
    rings.map((r) => r.pillar),
    ["social_capital", "physical", "portfolio"],
  );
  const keys = METRICS.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("thresholds match the owner's stated minimums", () => {
  const by = Object.fromEntries(METRICS.map((m) => [m.key, m.required]));
  assert.equal(by.outreach, 2); // 1 / week
  assert.equal(by.steps, 98_000); // 7k/day x 14 — the fortnight's walking, not its shape
  assert.equal(by.skills, 4); // 4 sessions / 14 days
});

// ================================================================ round two

test("Physical is a WEIGHTED mean: 8 strength, no cardio reads 80 not 50", () => {
  const p = buildRings(counts({ strength: ok(8) }), WINDOW_DAYS).find(
    (x) => x.pillar === "physical",
  )!;
  assert.equal(Math.round(p.fill! * 100), 80);
});

test("both met fills Physical exactly", () => {
  const p = buildRings(
    counts({ strength: ok(8), cardio: ok(2) }),
    WINDOW_DAYS,
  ).find((x) => x.pillar === "physical")!;
  assert.equal(p.fill, 1);
});

test("cardio alone moves Physical only a fifth", () => {
  const p = buildRings(counts({ cardio: ok(2) }), WINDOW_DAYS).find(
    (x) => x.pillar === "physical",
  )!;
  assert.equal(Math.round(p.fill! * 100), 20);
});

// ---------------------------------------------------------------- overdrive

test("overdrive is null at or below the threshold", () => {
  assert.equal(metricOverdrive(7, 8, true), null);
  assert.equal(metricOverdrive(8, 8, true), null);
});

test("overdrive grows past the threshold and caps at one extra lap", () => {
  assert.equal(metricOverdrive(12, 8, true), 0.5); // 1.5x -> half a lap
  assert.equal(metricOverdrive(16, 8, true), 1); // 2x -> full
  assert.equal(metricOverdrive(80, 8, true), 1); // 10x -> still full
});

test("overdrive is null without a source or a threshold", () => {
  assert.equal(metricOverdrive(5, 8, false), null);
  assert.equal(metricOverdrive(5, null, true), null);
});

// THE property this whole design turns on.
test("overdrive CANNOT rescue a neglected metric — 20 strength, 0 cardio is still 80", () => {
  const p = buildRings(counts({ strength: ok(20) }), WINDOW_DAYS).find(
    (x) => x.pillar === "physical",
  )!;
  assert.equal(Math.round(p.fill! * 100), 80);
  const s = find(
    buildRings(counts({ strength: ok(20) }), WINDOW_DAYS),
    "physical",
    "strength",
  );
  assert.equal(s.fill, 1, "fill must stay capped");
  assert.equal(s.overdrive, 1, "and the excess shows only as overdrive");
});

test("no amount of strength reaches 100 without cardio", () => {
  for (const n of [8, 16, 40, 400]) {
    const p = buildRings(counts({ strength: ok(n) }), WINDOW_DAYS).find(
      (x) => x.pillar === "physical",
    )!;
    assert.ok(p.fill! < 1, `${n} strength days must not fill Physical`);
  }
});

// ---------------------------------------------------------------- unscored

test("no amount of STEPS moves Physical", () => {
  // The property Misc used to pin, now carried by the metric that still needs it most: a
  // phone sensor must never be able to fill — or cap — a pillar about training. Steps is
  // weight 0 for exactly this reason, and summing a fortnight made the number it can reach
  // very much larger, so this matters more than it did.
  const withSteps = buildRings(
    counts({ strength: ok(4), steps: ok(200_000) }),
    WINDOW_DAYS,
  ).find((p) => p.pillar === "physical")!;
  const withoutSteps = buildRings(
    counts({ strength: ok(4) }),
    WINDOW_DAYS,
  ).find((p) => p.pillar === "physical")!;
  assert.equal(withSteps.fill, withoutSteps.fill);
  assert.ok(withSteps.fill !== null);
});

// The lap is what lets Misc have a floor without having a share. If a metric that carries
// weight ever ended up out here, its work would stop counting toward its own pillar while
// still looking like it was being drawn — the ring would be lying by omission.
test("only a floor-without-weight is drawn as an outer lap", () => {
  const all = buildRings(
    counts({ strength: ok(8), cardio: ok(2), steps: ok(98_000) }),
    WINDOW_DAYS,
  ).flatMap((p) => p.metrics);

  // TWO laps now that Misc is gone: steps on Physical, project hours on Portfolio. Each
  // carries a floor at weight 0, so each rides the thin outer band and neither can move
  // its pillar's mean — a phone sensor must not cap Physical, and blocked hours must not
  // fill Portfolio when nothing came of them.
  assert.deepEqual(
    all.filter((m) => m.lap).map((m) => m.key),
    ["steps", "project_hours"],
  );
  // Nothing that counts is ever moved off the donut.
  assert.ok(all.every((m) => !m.lap || m.weight === 0));
});

test("a ghost is never a lap — no source belongs on the ring, not around it", () => {
  // Steps with an UNRESOLVED count — the phone stopped pushing, say — must ghost on
  // the ring rather than orbit it as a lap.
  const steps = find(
    buildRings(counts({ steps: { count: 0, resolved: false } }), WINDOW_DAYS),
    "physical",
    "steps",
  );
  assert.equal(steps.weight, 0);
  assert.equal(steps.lap, false);
  assert.equal(steps.state, "ghost");
});

test("an unresolved count ghosts even when it carries a number", () => {
  // hasSource = sourceReady && resolved: the count is discarded when the source did not
  // actually answer, because a number nobody measured is worse than no number.
  const s = find(
    buildRings(counts({ steps: { count: 5, resolved: false } }), WINDOW_DAYS),
    "physical",
    "steps",
  );
  assert.equal(s.state, "ghost");
  assert.equal(s.fact, "no data source yet");
});

test("thresholds match the owner's stated minimums", () => {
  const by = Object.fromEntries(METRICS.map((m) => [m.key, m.required]));
  assert.equal(by.strength, 8);
  assert.equal(by.cardio, 2);
  // ALL adhered graphite events, standing and one-off alike. Counting only the recurring
  // kind made the ring unfillable by socialising — five events read as 1 of 6.
  assert.equal(by.social_events, 6);
});

// --- the plain-words fortnight ------------------------------------------------------------

test("portfolio counts SESSIONS, and a zero is a word rather than a figure", () => {
  // Hours until the owner's ruling: a skill session is a text document like a workout, so
  // the caption counts the same thing the ring does. "no sessions" rather than "0 sessions"
  // keeps a true zero from reading as a score of nought.
  const base = { skillSessions: 0, workoutSessions: 0, outreach: 0 };
  assert.equal(
    pillarCaption("portfolio", base),
    "no sessions logged past fortnight",
  );
  assert.equal(
    pillarCaption("portfolio", { ...base, skillSessions: 1 }),
    "1 session logged past fortnight",
  );
  assert.equal(
    pillarCaption("portfolio", { ...base, skillSessions: 6 }),
    "6 sessions logged past fortnight",
  );
});

test("physical counts SESSIONS, and never caps at the ring's threshold", () => {
  const base = { skillSessions: 0, workoutSessions: 0, outreach: 0 };
  assert.equal(
    pillarCaption("physical", base),
    "no sessions logged past fortnight",
  );
  assert.equal(
    pillarCaption("physical", { ...base, workoutSessions: 1 }),
    "1 session logged past fortnight",
  );
  // Strength's threshold is 8. The ring caps there; the caption must not.
  assert.equal(
    pillarCaption("physical", { ...base, workoutSessions: 23 }),
    "23 sessions logged past fortnight",
  );
});

test("social names both of its sources", () => {
  const base = { skillSessions: 0, workoutSessions: 0, outreach: 3 };
  assert.equal(
    pillarCaption("social_capital", { ...base, socialEvents: 2 }),
    "3 outreaches sent, 2 events",
  );
  assert.equal(
    pillarCaption("social_capital", { ...base, outreach: 1, socialEvents: 1 }),
    "1 outreach sent, 1 event",
  );
  assert.equal(
    pillarCaption("social_capital", { ...base, socialEvents: 0 }),
    "3 outreaches sent, 0 events",
  );
});

// The distinction the whole `socialEvents?: number` signature exists for. A Google outage
// must not be reported as a fortnight with no social life in it.
test("an unreachable calendar says so — it never prints a zero", () => {
  const c = pillarCaption("social_capital", {
    skillSessions: 0,
    workoutSessions: 0,
    outreach: 2,
  });
  assert.equal(c, "2 outreaches sent, events unavailable");
  assert.ok(!c.includes("0 events"));
});
