import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALORIE_FLOOR,
  HEALTH_METRICS,
  PILLAR_DEFAULT_VAR,
  PILLAR_NAME,
  PILLAR_ORDER,
  STEPS_FLOOR,
  WINDOW_DAYS,
  buildHealthRing,
  compactThousands,
  isPillarKey,
  metricFill,
  weightedFill,
  type RawCount,
} from "./rings.ts";

const ok = (count: number): RawCount => ({ count, resolved: true });

/** Every Health part resolved, with the given counts. */
function counts(over: Record<string, RawCount> = {}): Record<string, RawCount> {
  const base: Record<string, RawCount> = {};
  for (const m of HEALTH_METRICS) base[m.key] = ok(0);
  return { ...base, ...over };
}

const metric = (key: string) => HEALTH_METRICS.find((m) => m.key === key)!;
const arc = (ring: ReturnType<typeof buildHealthRing>, key: string) =>
  ring.arcs.find((a) => a.key === key)!;
/** A part's share of the pillar, from the registry — tests are written against it. */
const share = (key: string) =>
  metric(key).weight / HEALTH_METRICS.reduce((s, m) => s + m.weight, 0);
/** Every part exactly at its threshold. */
const allMet = () =>
  counts(
    Object.fromEntries(HEALTH_METRICS.map((m) => [m.key, ok(m.required)])),
  );
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

// ---------------------------------------------------------------- two pillars

test("two pillars, Health then Career, and Social is not one of them", () => {
  assert.deepEqual([...PILLAR_ORDER], ["physical", "portfolio"]);
  assert.equal(isPillarKey("physical"), true);
  assert.equal(isPillarKey("portfolio"), true);
  // The row stays in the database; the key is simply not a pillar any more.
  assert.equal(isPillarKey("social_capital"), false);
  assert.equal(isPillarKey(undefined), false);
});

test("display names come from ONE map: Health and Career", () => {
  assert.deepEqual(PILLAR_NAME, { physical: "Health", portfolio: "Career" });
  assert.equal(buildHealthRing(counts()).name, PILLAR_NAME.physical);
  assert.equal(buildHealthRing(counts()).key, "physical");
});

test("every live pillar has a default colour, and only the live pillars do", () => {
  assert.deepEqual(Object.keys(PILLAR_DEFAULT_VAR).sort(), [...PILLAR_ORDER].sort());
});

// ---------------------------------------------------------------- the Health registry

test("Health is the owner's five parts, in order", () => {
  assert.deepEqual(
    HEALTH_METRICS.map((m) => m.key),
    ["strength", "cardio", "ascnd", "steps", "calories"],
  );
  assert.deepEqual(
    HEALTH_METRICS.map((m) => m.label),
    ["Strength", "Cardio", "ASC.ND routine", "Steps", "Calories"],
  );
});

test("the weights are 40 / 15 / 15 / 15 / 15 and make a whole", () => {
  const by = Object.fromEntries(HEALTH_METRICS.map((m) => [m.key, m.weight]));
  assert.deepEqual(by, {
    strength: 40,
    cardio: 15,
    ascnd: 15,
    steps: 15,
    calories: 15,
  });
  assert.equal(
    HEALTH_METRICS.reduce((s, m) => s + m.weight, 0),
    100,
  );
});

test("thresholds match the owner's stated minimums", () => {
  assert.equal(metric("strength").required, 8);
  assert.equal(metric("cardio").required, 2);
  assert.equal(metric("ascnd").required, WINDOW_DAYS);
  assert.equal(metric("steps").required, 98_000);
  assert.equal(metric("calories").required, 35_000);
});

// The daily floors are the source and the fortnight targets are DERIVED from them. Written
// as two independent numbers, the checklist row and the ring would start disagreeing about
// what a good day is, silently.
test("the steps and calorie targets are floor x window, never written twice", () => {
  assert.equal(STEPS_FLOOR, 7000);
  assert.equal(CALORIE_FLOOR, 2500);
  assert.equal(metric("steps").dailyThreshold, STEPS_FLOOR);
  assert.equal(metric("steps").required, STEPS_FLOOR * WINDOW_DAYS);
  assert.equal(metric("calories").dailyThreshold, CALORIE_FLOOR);
  assert.equal(metric("calories").required, CALORIE_FLOOR * WINDOW_DAYS);
});

test("every day-capped part requires no more than the window allows", () => {
  const capped = HEALTH_METRICS.filter((m) => m.perDayCapped);
  assert.ok(capped.length > 0, "the guard must guard something");
  for (const m of capped)
    assert.ok(
      m.required <= WINDOW_DAYS,
      `${m.key} requires ${m.required} of ${WINDOW_DAYS} days`,
    );
});

test("the counting rule per part is pinned: sessions and sums are not day-capped", () => {
  const expected: Record<string, boolean> = {
    // Two lifts on a Tuesday are two things that happened.
    strength: false,
    cardio: false,
    // A habit is ticked once a day.
    ascnd: true,
    // Fortnight totals: de-duplicating by date would discard every row after a day's first.
    steps: false,
    calories: false,
  };
  for (const m of HEALTH_METRICS)
    assert.equal(m.perDayCapped, expected[m.key], m.key);
});

test("the gym parts carry their workout kind; the others carry none", () => {
  const ring = buildHealthRing(counts());
  assert.equal(arc(ring, "strength").workoutKind, "strength");
  assert.equal(arc(ring, "cardio").workoutKind, "cardio");
  for (const k of ["ascnd", "steps", "calories"])
    assert.equal(arc(ring, k).workoutKind, null, k);
});

test("the ASC.ND part reads the habit by system_key, never by name", () => {
  assert.equal(metric("ascnd").source, "habit");
  assert.equal(metric("ascnd").systemKey, "ascnd");
});

// ---------------------------------------------------------------- the cap

test("fill caps at 1 — doing more than the threshold changes nothing", () => {
  assert.equal(metricFill(8, 8, true), 1);
  assert.equal(metricFill(20, 8, true), 1);
  assert.equal(metricFill(4, 8, true), 0.5);
});

test("no source yields null, never 0 — and never NaN", () => {
  assert.equal(metricFill(0, 8, false), null);
  assert.equal(metricFill(0, 8, true), 0);
  assert.equal(metricFill(3, 0, true), null);
  assert.equal(metricFill(NaN, 8, true), null);
});

test("the true count survives the cap in the fact", () => {
  const s = arc(buildHealthRing(counts({ strength: ok(11) })), "strength");
  assert.equal(s.fill, 1);
  assert.equal(s.count, 11);
  assert.equal(s.fact, "11 of 8");
});

// ---------------------------------------------------------------- the owner's lines

test("the part lines read exactly as the owner wrote them", () => {
  const ring = buildHealthRing(
    counts({
      strength: ok(2),
      cardio: ok(2),
      ascnd: ok(11),
      steps: ok(84_300),
      calories: ok(29_050),
    }),
  );
  assert.deepEqual(
    ring.arcs.map((a) => `${a.label} ${a.fact}`),
    [
      "Strength 2 of 8",
      "Cardio 2 of 2",
      "ASC.ND routine 11/14",
      "Steps 84k of 98k",
      "Calories 29k of 35k",
    ],
  );
});

test("thousands are FLOORED, so a line never claims more than the ring shows", () => {
  assert.equal(compactThousands(97_999), "97k");
  assert.equal(compactThousands(98_000), "98k");
  assert.equal(compactThousands(7_450), "7.4k");
  assert.equal(compactThousands(7_000), "7k");
  assert.equal(compactThousands(999), "999");
  assert.equal(compactThousands(0), "0");
  assert.equal(compactThousands(-40), "0");
  assert.equal(compactThousands(NaN), "0");
  assert.equal(compactThousands(212_000), "212k");
});

// ---------------------------------------------------------------- the drawing

test("arc weights are the registry's shares and make one whole circle", () => {
  const ring = buildHealthRing(counts());
  for (const a of ring.arcs) close(a.weight, share(a.key));
  close(
    ring.arcs.reduce((s, a) => s + a.weight, 0),
    1,
  );
});

test("everything met fills Health exactly", () => {
  const ring = buildHealthRing(allMet());
  assert.equal(ring.fill, 1);
  for (const a of ring.arcs) assert.equal(a.fill, 1, a.key);
});

test("an untouched fortnight is a real 0, not a ghost", () => {
  assert.equal(buildHealthRing(counts()).fill, 0);
});

test("Health is a WEIGHTED mean: strength alone is strength's share", () => {
  const ring = buildHealthRing(counts({ strength: ok(8) }));
  close(ring.fill!, share("strength"));
});

// THE property the cap exists for: overdoing one part never fills another.
test("no amount of any one part fills Health on its own", () => {
  for (const m of HEALTH_METRICS)
    for (const mult of [1, 2, 10, 100]) {
      const ring = buildHealthRing(counts({ [m.key]: ok(m.required * mult) }));
      close(ring.fill!, share(m.key));
      assert.ok(ring.fill! < 1, `${m.key} x${mult} must not fill Health`);
    }
});

test("no amount of strength reaches 100 while cardio sits empty", () => {
  const all = allMet();
  const ring = buildHealthRing({ ...all, strength: ok(400), cardio: ok(0) });
  close(ring.fill!, 1 - share("cardio"));
});

// Steps and calories are fortnight TOTALS — the owner's ruling. One big day covers quiet
// ones; the ring cannot tell 49k spread evenly from 49k in two days.
test("steps and calories fill from the fortnight's TOTAL", () => {
  const ring = buildHealthRing(
    counts({ steps: ok(49_000), calories: ok(17_500) }),
  );
  assert.equal(arc(ring, "steps").fill, 0.5);
  assert.equal(arc(ring, "calories").fill, 0.5);
});

// ---------------------------------------------------------------- null, not zero

test("a ghost part is EXCLUDED from the mean, not counted as 0", () => {
  // The ASC.ND habit retired, say: the other four all met must still read full.
  const ring = buildHealthRing({
    ...allMet(),
    ascnd: { count: 0, resolved: false },
  });
  assert.equal(arc(ring, "ascnd").fill, null);
  assert.equal(ring.fill, 1);
});

test("a ghost prints a dash, never a zero nobody measured", () => {
  const a = arc(
    buildHealthRing({ ...counts(), ascnd: { count: 9, resolved: false } }),
    "ascnd",
  );
  assert.equal(a.fact, "—");
  assert.equal(a.count, 0, "an unresolved count is discarded");
});

test("a missing key is a ghost, not a zero", () => {
  const ring = buildHealthRing({});
  assert.ok(ring.arcs.every((a) => a.fill === null));
  assert.equal(ring.fill, null);
});

test("weightedFill ignores ghosts and weightless arcs, and is null with nothing live", () => {
  assert.equal(weightedFill([]), null);
  assert.equal(weightedFill([{ weight: 1, fill: null }]), null);
  assert.equal(
    weightedFill([
      { weight: 3, fill: 1 },
      { weight: 1, fill: 0 },
      { weight: 5, fill: null },
      { weight: 0, fill: 0 },
    ]),
    0.75,
  );
});
