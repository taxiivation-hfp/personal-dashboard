import { test } from "node:test";
import assert from "node:assert/strict";
import { METRICS, WINDOW_DAYS, buildRings, metricFill, type RawCount } from "./rings.ts";

const ok = (count: number): RawCount => ({ count, resolved: true });

/** All metrics resolved, with the given counts. */
function counts(over: Record<string, RawCount> = {}): Record<string, RawCount> {
  const base: Record<string, RawCount> = {};
  for (const m of METRICS) base[m.key] = ok(0);
  return { ...base, ...over };
}

const find = (rings: ReturnType<typeof buildRings>, pillar: string, key: string) =>
  rings.find((p) => p.pillar === pillar)!.metrics.find((m) => m.key === key)!;

// ---------------------------------------------------------------- the cap

test("fill caps at 1 — doing more than the threshold changes nothing", () => {
  assert.equal(metricFill(8, 8, true), 1);
  assert.equal(metricFill(20, 8, true), 1);
});

test("the true count survives the cap in the fact line", () => {
  const r = find(buildRings(counts({ gym: ok(11) }), WINDOW_DAYS), "physical", "gym");
  assert.equal(r.fill, 1);
  assert.equal(r.count, 11);
  assert.equal(r.fact, "11 of 8 days");
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

test("steps is dormant: sourceReady false, so it renders as a ghost", () => {
  const r = find(buildRings(counts(), WINDOW_DAYS), "physical", "steps");
  assert.equal(r.fill, null);
  assert.equal(r.fact, "no data source yet");
});

test("a sourceless metric is EXCLUDED from its pillar mean, not counted as 0", () => {
  // Physical = gym (live, full) + steps (ghost). If steps counted as 0 the pillar would
  // read 50% forever, which no behaviour could fix.
  const physical = buildRings(counts({ gym: ok(8) }), WINDOW_DAYS).find((p) => p.pillar === "physical")!;
  assert.equal(physical.fill, 1);
});

test("a pillar with no live metric is null, not NaN", () => {
  const c = counts();
  c.gym = { count: 0, resolved: false };
  const physical = buildRings(c, WINDOW_DAYS).find((p) => p.pillar === "physical")!;
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
  const r = find(buildRings(counts({ gym: ok(2) }), 3), "physical", "gym");
  assert.equal(r.fact, "2 of 8 days · day 3 of 14");
  assert.equal(r.fill, 0.25);
});

test("a fully observed window drops the day counter", () => {
  const r = find(buildRings(counts({ gym: ok(2) }), 14), "physical", "gym");
  assert.equal(r.fact, "2 of 8 days");
});

// ---------------------------------------------------------------- units

test("skill sessions are counted as sessions, not days", () => {
  const r = find(buildRings(counts({ skills: ok(3) }), WINDOW_DAYS), "portfolio", "skills");
  assert.equal(r.fact, "3 of 4 sessions");
});

// ---------------------------------------------------------------- registry invariants

test("every day-capped metric requires no more than the window allows", () => {
  for (const m of METRICS) {
    if (m.unit !== "days" || m.required == null) continue;
    assert.ok(m.required <= WINDOW_DAYS, `${m.key} requires ${m.required} of ${WINDOW_DAYS} days`);
  }
});

test("every pillar appears exactly once and metric keys are unique", () => {
  const rings = buildRings(counts(), WINDOW_DAYS);
  assert.deepEqual(
    rings.map((r) => r.pillar),
    ["social_capital", "physical", "portfolio"]
  );
  const keys = METRICS.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("thresholds match the owner's stated minimums", () => {
  const by = Object.fromEntries(METRICS.map((m) => [m.key, m.required]));
  assert.equal(by.outreach, 2); // 1 / week
  assert.equal(by.gym, 8); // 4x / week
  assert.equal(by.steps, 12); // 7k / day
  assert.equal(by.skills, 4); // 4 sessions / 14 days
});
