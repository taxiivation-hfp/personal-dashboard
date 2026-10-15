import { test } from "node:test";
import assert from "node:assert/strict";
import { dueStep, dueTone, dueBold } from "./due.ts";

const D = "2026-10-15";

test("due today is step 0, and so is anything already late", () => {
  assert.equal(dueStep(D, D), 0);
  assert.equal(dueStep("2026-10-13", D), 0);
  // A week late is the same red as today: lateness is a fact the line states; the hue only
  // says "now".
  assert.equal(dueStep("2026-10-08", D), 0);
});

test("tomorrow and two days out are the steps between red and yellow", () => {
  assert.equal(dueStep("2026-10-16", D), 1);
  assert.equal(dueStep("2026-10-17", D), 2);
});

test("three days out is the last coloured step", () => {
  assert.equal(dueStep("2026-10-18", D), 3);
});

test("four days and beyond keep the default ink", () => {
  assert.equal(dueStep("2026-10-19", D), null);
  assert.equal(dueStep("2026-10-22", D), null);
});

test("the step follows the day being viewed, not the real today", () => {
  // Stepping back to the 12th, a card due on the 15th is three days out again.
  assert.equal(dueStep(D, "2026-10-12"), 3);
});

test("each step names its own token, and only today and tomorrow are bold", () => {
  assert.equal(dueTone(0), "var(--color-due-0)");
  assert.equal(dueTone(3), "var(--color-due-3)");
  assert.deepEqual([0, 1, 2, 3].map((s) => dueBold(s as 0 | 1 | 2 | 3)), [
    true,
    true,
    false,
    false,
  ]);
});
