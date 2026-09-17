# Social in the ring tests

Parked verbatim from `src/lib/rings.test.ts` at commit `c86f000` by the owner's ruling of 2026-09-18 (see README.md).
Each block below is an exact slice of that file; the heading gives its original line range.

## `src/lib/rings.test.ts:112-117` — outreach as the unresolved-habit ghost

```ts
test("an unresolved habit source is a ghost, not a zero", () => {
  const c = counts();
  c.outreach = { count: 0, resolved: false };
  const r = find(buildRings(c, WINDOW_DAYS), "social_capital", "outreach");
  assert.equal(r.fill, null);
});
```

## `src/lib/rings.test.ts:190-231` — outreach per-day cap, the perDayCapped map, three pillars in order, outreach threshold

```ts
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
```

## `src/lib/rings.test.ts:364-371` — social_events threshold

```ts
test("thresholds match the owner's stated minimums", () => {
  const by = Object.fromEntries(METRICS.map((m) => [m.key, m.required]));
  assert.equal(by.strength, 8);
  assert.equal(by.cardio, 2);
  // ALL adhered graphite events, standing and one-off alike. Counting only the recurring
  // kind made the ring unfillable by socialising — five events read as 1 of 6.
  assert.equal(by.social_events, 6);
});
```

## `src/lib/rings.test.ts:411-437` — the Social caption tests

```ts
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
```
