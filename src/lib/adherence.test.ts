import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adherenceFor,
  habitsDueOn,
  type Block,
  type BlockState,
} from "./adherence.ts";

const block = (state: BlockState | null, due = true): Block => ({
  event_id: Math.random().toString(36).slice(2),
  title: "b",
  time_start: "09:00",
  time_end: "10:00",
  allDay: false,
  state,
  reason: null,
  due,
  // Adherence is blind to both of these — a block counts as one item whatever colour it
  // is and however long it runs. They exist for productivity.ts, which is a separate,
  // quarantined system. Fixed values here so nothing in this file can start depending
  // on them.
  colorId: null,
  minutes: 60,
});

// 21:00 Melbourne on 2026-08-06 as an epoch — the caller computes this via rfc3339.
const CUTOFF = Date.parse("2026-08-06T21:00:00+10:00");
const at = (hhmm: string) => Date.parse(`2026-08-06T${hhmm}:00+10:00`);

// ---------------------------------------------------------------- habitsDueOn

test("a past day is always due — it is over", () => {
  assert.equal(
    habitsDueOn("2026-08-05", "2026-08-06", at("08:00"), CUTOFF),
    true,
  );
});

test("a future day is never due", () => {
  assert.equal(
    habitsDueOn("2026-08-07", "2026-08-06", at("23:00"), CUTOFF),
    false,
  );
});

test("today turns due exactly at the cutoff, not before", () => {
  assert.equal(
    habitsDueOn("2026-08-06", "2026-08-06", at("20:59"), CUTOFF),
    false,
  );
  assert.equal(
    habitsDueOn("2026-08-06", "2026-08-06", at("21:00"), CUTOFF),
    true,
  );
  assert.equal(
    habitsDueOn("2026-08-06", "2026-08-06", at("23:30"), CUTOFF),
    true,
  );
});

// ---------------------------------------------------------------- blocks only

test("omitting habits leaves the old behaviour untouched", () => {
  const a = adherenceFor([block("adhered"), block("drifted")]);
  assert.equal(a.pct, 50);
  assert.equal(a.due, 2);
  assert.equal(a.habitsPending, 0);
});

test("nothing due at all is null, never 0", () => {
  assert.equal(adherenceFor([block(null, false)]).pct, null);
  assert.equal(adherenceFor([]).pct, null);
});

// ---------------------------------------------------------------- before the cutoff

test("before the cutoff, unticked habits are in NEITHER numerator nor denominator", () => {
  // 2 blocks (1 adhered) + 4 scheduled habits, 0 ticked -> still just the blocks.
  const a = adherenceFor([block("adhered"), block("skipped")], {
    due: false,
    scheduled: 4,
    done: 0,
  });
  assert.equal(a.due, 2);
  assert.equal(a.pct, 50);
  assert.equal(a.habitsPending, 4);
});

test("before the cutoff, a ticked habit counts in both — ticking must do something", () => {
  const a = adherenceFor([block("adhered"), block("skipped")], {
    due: false,
    scheduled: 4,
    done: 2,
  });
  assert.equal(a.due, 4); // 2 blocks + 2 ticked
  assert.equal(a.adhered, 3); // 1 block + 2 habits
  assert.equal(a.pct, 75);
  assert.equal(a.habitsPending, 2);
});

test("the optimistic morning: one tick, nothing else due, reads 100", () => {
  const a = adherenceFor([], { due: false, scheduled: 4, done: 1 });
  assert.equal(a.pct, 100);
  assert.equal(a.habitsPending, 3);
});

test("no blocks and no ticks before the cutoff is still null, not 0", () => {
  const a = adherenceFor([], { due: false, scheduled: 4, done: 0 });
  assert.equal(a.pct, null);
  assert.equal(a.habitsPending, 4);
});

// ---------------------------------------------------------------- after the cutoff

test("after the cutoff every scheduled habit joins the denominator", () => {
  const a = adherenceFor([block("adhered"), block("skipped")], {
    due: true,
    scheduled: 4,
    done: 2,
  });
  assert.equal(a.due, 6);
  assert.equal(a.adhered, 3);
  assert.equal(a.pct, 50);
  assert.equal(a.unmarked, 2); // the two unticked habits
  assert.equal(a.habitsPending, 0);
});

test("the number SETTLES DOWNWARD at the cutoff — same day, same ticks", () => {
  const before = adherenceFor([block("adhered")], {
    due: false,
    scheduled: 4,
    done: 1,
  });
  const after = adherenceFor([block("adhered")], {
    due: true,
    scheduled: 4,
    done: 1,
  });
  assert.equal(before.pct, 100);
  assert.equal(after.pct, 40);
  assert.ok(after.pct! < before.pct!, "the cutoff must not inflate the day");
});

test("one item is one item — a habit weighs the same as a block", () => {
  const a = adherenceFor([block("adhered")], {
    due: true,
    scheduled: 1,
    done: 0,
  });
  assert.equal(a.due, 2);
  assert.equal(a.pct, 50);
});

// ---------------------------------------------------------------- robustness

test("done above scheduled cannot push the rate over 100", () => {
  const a = adherenceFor([], { due: true, scheduled: 2, done: 5 });
  assert.equal(a.adhered, 2);
  assert.equal(a.pct, 100);
});

test("zero scheduled habits behaves exactly like blocks only", () => {
  const a = adherenceFor([block("adhered"), block("drifted")], {
    due: true,
    scheduled: 0,
    done: 0,
  });
  assert.equal(a.pct, 50);
  assert.equal(a.due, 2);
});
