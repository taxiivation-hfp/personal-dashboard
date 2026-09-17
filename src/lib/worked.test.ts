import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FULLY_WORKED,
  WORKED_STEP,
  dismissalWouldErase,
  normaliseFraction,
  workedFraction,
  type BlockState,
} from "./worked.ts";

// This file is the ONE place the state table is asserted. adherence.test.ts and
// productivity.test.ts test their own arithmetic and take this rule as given — which is the
// whole point of the module existing, and the reason a sixth reader cannot quietly disagree
// with the other five.

// ---------------------------------------------------------------- the states

test("an adhered block is worked in full, whatever the column says", () => {
  assert.equal(workedFraction("adhered", null), 1);
  // A fraction can never survive onto an adhered mark — engine.markBlock nulls it — but if
  // one ever did, the state wins. Adhered means all of it.
  assert.equal(workedFraction("adhered", 0.4), 1);
  assert.equal(workedFraction("adhered", 0), 1);
});

test("skipped, dismissed and unmarked are worth nothing and take no fraction", () => {
  for (const s of ["skipped", "dismissed"] as BlockState[]) {
    assert.equal(workedFraction(s, null), 0);
    assert.equal(workedFraction(s, 0.8), 0, `${s} cannot be partly worked`);
  }
  assert.equal(workedFraction(null, null), 0);
  assert.equal(workedFraction(null, 0.8), 0, "an unmarked block is unknown, not partial");
});

// The behaviour every drift in the table had before the slider existed, and the reason the
// column is nullable rather than DEFAULT 0. If this ever changes, history changes with it.
test("a drift with no fraction is worth exactly nothing, as every old drift is", () => {
  assert.equal(workedFraction("drifted", null), 0);
  assert.equal(workedFraction("drifted", undefined), 0);
});

test("a drift is worth the part of it that was worked", () => {
  assert.equal(workedFraction("drifted", 0.4), 0.4);
  assert.equal(workedFraction("drifted", 0.05), 0.05);
  assert.equal(workedFraction("drifted", 1), 1);
});

// ---------------------------------------------------------------- the guard rails

// A fraction above 1 would let one block earn more of the day than it occupies; a negative
// one would make MARKING a block lower the figure, which is the one thing a number that
// only climbs must never do.
test("a stored fraction is clamped, never trusted", () => {
  assert.equal(workedFraction("drifted", 1.4), 1);
  assert.equal(workedFraction("drifted", -0.5), 0);
  assert.equal(workedFraction("drifted", Number.MAX_VALUE), 1);
});

test("rubbish from a REAL column or a JSON body reads as nothing, never as NaN", () => {
  for (const junk of [NaN, Infinity, -Infinity, "0.5", {}, [], true]) {
    const v = workedFraction("drifted", junk as number);
    assert.equal(v, 0, `${String(junk)} should read as 0`);
    assert.ok(Number.isFinite(v));
  }
});

// ---------------------------------------------------------------- on the way in

test("normalising keeps null distinct from zero", () => {
  assert.equal(normaliseFraction(null), null, "nobody was asked");
  assert.equal(normaliseFraction(undefined), null);
  assert.equal(normaliseFraction(NaN), null);
  assert.equal(normaliseFraction(0), 0, "you said none of it — a different fact");
});

test("normalising clamps the same way reading does", () => {
  assert.equal(normaliseFraction(1.4), 1);
  assert.equal(normaliseFraction(-2), 0);
  assert.equal(normaliseFraction(0.35), 0.35);
});

// The two must agree, or a value could be stored that reads back as something else.
test("anything normalisable reads back unchanged", () => {
  for (const v of [0, 0.05, 0.4, 0.95, 1, -3, 7]) {
    assert.equal(workedFraction("drifted", normaliseFraction(v)), workedFraction("drifted", v));
  }
});

// ---------------------------------------------------------------- dismissing a worked block

// Adherence drops a dismissed block from BOTH sides of the block share, so dismissing one
// that earned hours is the one tap that could make the climbing figure fall. Every row gets a
// dismiss control, so this is reachable from any marked row, not a corner case.

test("a dismissal is refused on a mark that earned hours", () => {
  assert.equal(dismissalWouldErase({ state: "adhered", workedFraction: null }), true);
  assert.equal(dismissalWouldErase({ state: "drifted", workedFraction: 0.05 }), true);
  assert.equal(dismissalWouldErase({ state: "drifted", workedFraction: 1 }), true);
});

test("a dismissal goes through on anything that earned nothing", () => {
  assert.equal(dismissalWouldErase(undefined), false, "an unmarked row");
  assert.equal(dismissalWouldErase(null), false);
  assert.equal(dismissalWouldErase({ state: null, workedFraction: null }), false);
  assert.equal(dismissalWouldErase({ state: "skipped", workedFraction: null }), false);
  assert.equal(dismissalWouldErase({ state: "dismissed", workedFraction: null }), false);
  // A drift nobody was asked about, and one answered with none of it: both earned nothing.
  assert.equal(dismissalWouldErase({ state: "drifted", workedFraction: null }), false);
  assert.equal(dismissalWouldErase({ state: "drifted", workedFraction: 0 }), false);
});

// It must not be a second copy of the state table: whatever a mark is worth to the day is
// exactly what it is worth here, junk in the column included.
test("what earns nothing dismisses, for every state and every stored fraction", () => {
  const states: (BlockState | null)[] = [null, "adhered", "drifted", "skipped", "dismissed"];
  for (const s of states)
    for (const f of [null, undefined, 0, 0.05, 1, -1, 2, NaN]) {
      assert.equal(
        dismissalWouldErase({ state: s, workedFraction: f }),
        workedFraction(s, f) > 0,
        `${String(s)} / ${String(f)}`,
      );
    }
});

// ---------------------------------------------------------------- the dials

test("the step divides the range evenly, so the top is reachable", () => {
  assert.equal(WORKED_STEP, 0.05);
  const steps = FULLY_WORKED / WORKED_STEP;
  assert.equal(steps, Math.round(steps), "the slider must be able to land on 100%");
});

test("full is 1 — the point at which a drift stops being one", () => {
  assert.equal(FULLY_WORKED, 1);
  assert.equal(workedFraction("drifted", FULLY_WORKED), workedFraction("adhered", null));
});
